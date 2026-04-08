from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.schemas.post import PostCreate
from app.crud.post import create_post
from app.utils.deps import get_db, get_tenant
from app.worker.tasks import publish_post_task   # ✅ move here

router = APIRouter()

@router.post("/")
def create(
    data: PostCreate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant),
):
    post = create_post(db, tenant_id, data)

    # send to celery
    publish_post_task.delay(post.id, tenant_id)

    return {"post_id": post.id}