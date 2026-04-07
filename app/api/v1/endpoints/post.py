from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.logging import get_logger, log_event
from app.schemas.post import PostCreate, PostCreateResponse, PostRead, PostUpdate
from app.crud.post import create_post, get_post, list_posts, update_post, update_post_status
from app.utils.deps import get_db, get_tenant
from app.worker.celery_app import celery_app

router = APIRouter()
logger = get_logger("app.api.post")


def _is_future_timestamp(value):
    if not value:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value > datetime.now(timezone.utc)


@router.post("/", response_model=PostCreateResponse, status_code=status.HTTP_201_CREATED)
def create(
    request: Request,
    data: PostCreate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    # Extract request_id from middleware
    request_id = getattr(request.state, "request_id", "N/A")
    
    # Get platform from social account
    from app.models.social_account import SocialAccount
    account = db.query(SocialAccount).filter_by(
        id=data.social_account_id,
        tenant_id=tenant_id
    ).first()
    platform = account.platform if account else "unknown"
    
    log_event(
        logger, "info", "post.create_request",
        request_id=request_id,
        step="api_endpoint",
        extra={
            "platform": platform,
            "content_preview": data.content[:50] if data.content else "",
            "scheduled_at": str(data.scheduled_at) if data.scheduled_at else "immediate",
            "account_id": data.social_account_id,
        }
    )
    
    try:
        post = create_post(db, tenant_id, data)
    except ValueError as exc:
        log_event(
            logger, "error", "post.create_failed",
            request_id=request_id,
            step="validation_error",
            extra={"error": str(exc)},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    task = None

    if _is_future_timestamp(post.scheduled_at):
        task = celery_app.send_task(
            "app.worker.tasks.publish_post_task",
            args=[post.id, tenant_id],
            kwargs={"request_id": request_id},  # Pass request_id to task
            eta=post.scheduled_at,
        )
        log_event(
            logger, "info", "post.scheduled",
            request_id=request_id,
            step="celery_task_scheduled",
            extra={
                "post_id": post.id,
                "task_id": task.id,
                "scheduled_at": str(post.scheduled_at),
            }
        )
    else:
        task = celery_app.send_task(
            "app.worker.tasks.publish_post_task",
            args=[post.id, tenant_id],
            kwargs={"request_id": request_id},  # Pass request_id to task
        )
        log_event(
            logger, "info", "post.queued_immediate",
            request_id=request_id,
            step="celery_task_queued",
            extra={"post_id": post.id, "task_id": task.id}
        )

    log_event(
        logger, "info", "post.create_success",
        request_id=request_id,
        step="api_response",
        extra={"post_id": post.id, "task_id": task.id if task else None}
    )

    return {"post_id": post.id, "status": post.status, "task_id": task.id if task else None}


@router.get("/", response_model=list[PostRead])
def list_all_posts(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    return list_posts(db, tenant_id)


@router.get("/{post_id}", response_model=PostRead)
def get_single_post(
    post_id: int,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    post = get_post(db, tenant_id, post_id)
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )
    return post


@router.patch("/{post_id}", response_model=PostCreateResponse)
def edit_post(
    post_id: int,
    data: PostUpdate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    post = get_post(db, tenant_id, post_id)
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    try:
        post = update_post(db, tenant_id, post_id, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    task = None
    if post.status == "scheduled":
        task = celery_app.send_task(
            "app.worker.tasks.publish_post_task",
            args=[post.id, tenant_id],
            eta=post.scheduled_at,
        )
    elif post.status == "queued":
        task = celery_app.send_task(
            "app.worker.tasks.publish_post_task",
            args=[post.id, tenant_id],
        )

    return {"post_id": post.id, "status": post.status, "task_id": task.id if task else None}


@router.post("/{post_id}/publish-now", response_model=PostCreateResponse)
def publish_now(
    post_id: int,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    post = get_post(db, tenant_id, post_id)
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    updated_post = update_post_status(db, tenant_id, post_id, "queued", None)
    task = celery_app.send_task(
        "app.worker.tasks.publish_post_task",
        args=[post_id, tenant_id],
    )
    return {"post_id": post_id, "status": updated_post.status if updated_post else "queued", "task_id": task.id}


@router.post("/{post_id}/cancel", response_model=PostCreateResponse)
def cancel_post(
    post_id: int,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    post = get_post(db, tenant_id, post_id)
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Post not found",
        )

    updated_post = update_post_status(db, tenant_id, post_id, "cancelled", None)
    return {"post_id": post_id, "status": updated_post.status if updated_post else "cancelled", "task_id": None}


