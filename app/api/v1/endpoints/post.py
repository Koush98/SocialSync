from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.schemas.post import (
    PostAnalyticsSummary,
    PostCreate,
    PostCreateResponse,
    PostFailureRead,
    PostLiveMetricsResponse,
    PostPlatformAnalytics,
    PostRead,
    PostUpdate,
)
from app.crud.post import (
    create_post,
    get_post,
    get_post_analytics_by_platform,
    get_post_analytics_summary,
    list_posts,
    list_recent_post_failures,
    update_post,
    update_post_status,
)
from app.utils.deps import get_db, get_tenant
from app.models.social_account import SocialAccount
from app.services.provider_publishers import PublishError, UnsupportedPublishError, fetch_provider_live_metrics
from app.worker.celery_app import celery_app
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger("app.api.posts")

def _is_future_timestamp(value):
    if not value:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value > datetime.now(timezone.utc)


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "N/A")


def _dispatch_publish(post_id: int, tenant_id: str, request_id: str, eta=None):
    try:
        # Require at least one reachable worker to avoid silently accepting
        # posts that will never be consumed from the queue.
        worker_heartbeats = celery_app.control.ping(timeout=3.0)
        if not worker_heartbeats:
            logger.error(
                "publish.worker_ping_empty post_id=%s request_id=%s; aborting enqueue",
                post_id,
                request_id,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "No background workers are online. "
                    "Start/redeploy worker service and retry."
                ),
            )
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        logger.warning(
            "publish.queue_healthcheck_failed request_id=%s error=%s; continuing to enqueue",
            request_id,
            str(exc),
        )

    kwargs = {"args": [post_id, tenant_id, request_id]}
    if eta is not None:
        kwargs["eta"] = eta
    try:
        return celery_app.send_task("app.worker.tasks.publish_post_task", **kwargs)
    except Exception as exc:
        logger.exception("publish.queue_dispatch_failed post_id=%s request_id=%s", post_id, request_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Failed to enqueue publish job. "
                "Please ensure queue services are running and retry."
            ),
        ) from exc


@router.get("/analytics/summary", response_model=PostAnalyticsSummary)
def analytics_summary(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    return get_post_analytics_summary(db, tenant_id)


@router.get("/analytics/platforms", response_model=list[PostPlatformAnalytics])
def analytics_platforms(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    return get_post_analytics_by_platform(db, tenant_id)


@router.get("/analytics/recent-failures", response_model=list[PostFailureRead])
def analytics_recent_failures(
    limit: int = 10,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    safe_limit = max(1, min(limit, 50))
    return list_recent_post_failures(db, tenant_id, safe_limit)


@router.post("/", response_model=PostCreateResponse, status_code=status.HTTP_201_CREATED)
def create(
    data: PostCreate,
    request: Request,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    try:
        post = create_post(db, tenant_id, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    request_id = _request_id(request)
    if _is_future_timestamp(post.scheduled_at):
        task = _dispatch_publish(post.id, tenant_id, request_id, eta=post.scheduled_at)
    else:
        task = _dispatch_publish(post.id, tenant_id, request_id)

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


@router.get("/{post_id}/metrics", response_model=PostLiveMetricsResponse)
def get_live_metrics(
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

    account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.id == post.social_account_id,
            SocialAccount.tenant_id == tenant_id,
        )
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connected account not found",
        )

    try:
        metrics = fetch_provider_live_metrics(post, account)
        return {
            "post_id": post.id,
            "platform": post.platform,
            "provider_post_id": post.platform_post_id,
            "available": True,
            "fetched_at": datetime.utcnow(),
            "metrics": metrics,
            "message": None,
        }
    except (UnsupportedPublishError, PublishError) as exc:
        return {
            "post_id": post.id,
            "platform": post.platform,
            "provider_post_id": post.platform_post_id,
            "available": False,
            "fetched_at": datetime.utcnow(),
            "metrics": {},
            "message": str(exc),
        }


@router.patch("/{post_id}", response_model=PostCreateResponse)
def edit_post(
    post_id: int,
    data: PostUpdate,
    request: Request,
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
    request_id = _request_id(request)
    if post.status == "scheduled":
        task = _dispatch_publish(post.id, tenant_id, request_id, eta=post.scheduled_at)
    elif post.status == "queued":
        task = _dispatch_publish(post.id, tenant_id, request_id)

    return {"post_id": post.id, "status": post.status, "task_id": task.id if task else None}


@router.post("/{post_id}/publish-now", response_model=PostCreateResponse)
def publish_now(
    post_id: int,
    request: Request,
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
    task = _dispatch_publish(post_id, tenant_id, _request_id(request))
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
