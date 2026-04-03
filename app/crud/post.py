from datetime import datetime

from sqlalchemy.orm import Session
from app.models.scheduled_post import ScheduledPost
from app.models.post_media import PostMedia
from app.models.social_account import SocialAccount


def create_post(db: Session, tenant_id: str, data):
    account = db.query(SocialAccount).filter_by(
        id=data.social_account_id,
        tenant_id=tenant_id
    ).first()

    if not account:
        raise Exception("Invalid account")

    post = ScheduledPost(
        tenant_id=tenant_id,
        social_account_id=data.social_account_id,
        platform=account.platform,
        content=data.content,
        platform_options=data.platform_options,
        scheduled_at=data.scheduled_at,
        status="scheduled" if data.scheduled_at and data.scheduled_at > datetime.utcnow() else "queued",
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    # attach media
    for i, media_id in enumerate(data.media_ids or []):
        pm = PostMedia(
            post_id=post.id,
            media_asset_id=media_id,
            display_order=i
        )
        db.add(pm)

    db.commit()

    return post


def list_posts(db: Session, tenant_id: str):
    return (
        db.query(ScheduledPost)
        .filter(ScheduledPost.tenant_id == tenant_id)
        .order_by(ScheduledPost.created_at.desc(), ScheduledPost.id.desc())
        .all()
    )


def get_post(db: Session, tenant_id: str, post_id: int):
    return (
        db.query(ScheduledPost)
        .filter(
            ScheduledPost.id == post_id,
            ScheduledPost.tenant_id == tenant_id,
        )
        .first()
    )


def update_post_status(
    db: Session,
    tenant_id: str,
    post_id: int,
    status: str,
    error_message: str = None,
):
    post = get_post(db, tenant_id, post_id)
    if not post:
        return None

    post.status = status
    post.error_message = error_message
    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(post)
    return post
