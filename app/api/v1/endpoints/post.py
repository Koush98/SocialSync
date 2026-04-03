from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.schemas.post import PostCreate, PostCreateResponse, PostRead
from app.crud.post import create_post, get_post, list_posts, update_post_status
from app.utils.deps import get_db, get_tenant

router = APIRouter()


@router.post("/", response_model=PostCreateResponse, status_code=status.HTTP_201_CREATED)
def create(
    data: PostCreate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    post = create_post(db, tenant_id, data)
    task = None

    if post.scheduled_at and post.scheduled_at > datetime.utcnow():
        task = publish_post_task.apply_async(args=[post.id, tenant_id], eta=post.scheduled_at)
    else:
        task = publish_post_task.delay(post.id, tenant_id)

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

    update_post_status(db, tenant_id, post_id, "queued", None)
    task = publish_post_task.delay(post.id, tenant_id)
    return {"post_id": post.id, "status": "queued", "task_id": task.id}


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

    update_post_status(db, tenant_id, post_id, "cancelled", None)
    return {"post_id": post.id, "status": "cancelled", "task_id": None}


from app.worker.tasks import publish_post_task

