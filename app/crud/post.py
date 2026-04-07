from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models.media_asset import MediaAsset
from app.models.scheduled_post import ScheduledPost
from app.models.post_media import PostMedia
from app.models.social_account import SocialAccount


def _is_future_timestamp(value):
    if not value:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value > datetime.now(timezone.utc)


def _reload_post(db: Session, tenant_id: str, post_id: int):
    return (
        db.query(ScheduledPost)
        .filter(
            ScheduledPost.id == post_id,
            ScheduledPost.tenant_id == tenant_id,
        )
        .first()
    )


def _validate_media_ids(db: Session, tenant_id: str, media_ids):
    media_ids = media_ids or []
    if not media_ids:
        return []

    valid_media_ids = {
        media.id
        for media in (
            db.query(MediaAsset)
            .filter(MediaAsset.tenant_id == tenant_id, MediaAsset.id.in_(media_ids))
            .all()
        )
    }
    missing_media = [media_id for media_id in media_ids if media_id not in valid_media_ids]
    if missing_media:
        raise ValueError(f"Invalid media IDs: {missing_media}")
    return media_ids


def create_post(db: Session, tenant_id: str, data):
    account = db.query(SocialAccount).filter_by(
        id=data.social_account_id,
        tenant_id=tenant_id
    ).first()

    if not account:
        raise ValueError("Invalid account")

    media_ids = _validate_media_ids(db, tenant_id, data.media_ids or [])

    desired_status = "scheduled" if _is_future_timestamp(data.scheduled_at) else "queued"

    post = ScheduledPost(
        tenant_id=tenant_id,
        social_account_id=data.social_account_id,
        platform=account.platform,
        content=data.content,
        platform_options=data.platform_options,
        scheduled_at=data.scheduled_at,
    )

    db.add(post)
    db.flush()
    post_id = post.id
    for index, media_id in enumerate(media_ids):
        db.add(
            PostMedia(
                tenant_id=tenant_id,
                post_id=post_id,
                media_asset_id=media_id,
                display_order=index,
            )
        )
    post.status = desired_status
    db.commit()
    post.media_ids = media_ids
    return post


def list_posts(db: Session, tenant_id: str):
    posts = (
        db.query(ScheduledPost)
        .filter(ScheduledPost.tenant_id == tenant_id)
        .order_by(ScheduledPost.created_at.desc(), ScheduledPost.id.desc())
        .all()
    )
    _attach_media_ids(db, posts)
    return posts


def get_post(db: Session, tenant_id: str, post_id: int):
    post = (
        db.query(ScheduledPost)
        .filter(
            ScheduledPost.id == post_id,
            ScheduledPost.tenant_id == tenant_id,
        )
        .first()
    )
    if post:
        _attach_media_ids(db, [post])
    return post


def update_post(db: Session, tenant_id: str, post_id: int, data):
    post = get_post(db, tenant_id, post_id)
    if not post:
        return None

    if post.status in {"processing", "posted", "cancelled"}:
        raise ValueError(f"Post cannot be edited while in '{post.status}' status")

    if "content" in data.model_fields_set:
        post.content = data.content
    if "platform_options" in data.model_fields_set:
        post.platform_options = data.platform_options
    if "scheduled_at" in data.model_fields_set:
        post.scheduled_at = data.scheduled_at

    desired_status = "scheduled" if _is_future_timestamp(post.scheduled_at) else "queued"
    post.status = desired_status
    post.error_message = None
    post.updated_at = datetime.utcnow()
    post_id = post.id
    db.commit()

    if "media_ids" in data.model_fields_set:
        media_ids = _replace_post_media(db, tenant_id, post_id, data.media_ids)
        post.media_ids = media_ids
    else:
        _attach_media_ids(db, [post])
    return post


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
    _attach_media_ids(db, [post])
    return post


def _replace_post_media(db: Session, tenant_id: str, post_id: int, media_ids):
    media_ids = _validate_media_ids(db, tenant_id, media_ids)

    db.query(PostMedia).filter(
        PostMedia.post_id == post_id,
        PostMedia.tenant_id == tenant_id,
    ).delete()

    for index, media_id in enumerate(media_ids):
        db.add(
            PostMedia(
                tenant_id=tenant_id,
                post_id=post_id,
                media_asset_id=media_id,
                display_order=index,
            )
        )

    db.commit()
    return media_ids


def _attach_media_ids(db: Session, posts):
    posts = [post for post in (posts or []) if post is not None]
    if not posts:
        return

    post_ids = [post.id for post in posts]
    media_links = (
        db.query(PostMedia)
        .filter(PostMedia.post_id.in_(post_ids))
        .order_by(PostMedia.post_id.asc(), PostMedia.display_order.asc(), PostMedia.id.asc())
        .all()
    )

    media_map = {post_id: [] for post_id in post_ids}
    for link in media_links:
        media_map.setdefault(link.post_id, []).append(link.media_asset_id)

    for post in posts:
        post.media_ids = media_map.get(post.id, [])
