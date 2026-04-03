from app.db.database import SessionLocal
from app.models.scheduled_post import ScheduledPost
from datetime import datetime
import time


def publish_post(post_id: int, tenant_id: str):
    db = SessionLocal()

    post = db.query(ScheduledPost).filter_by(
        id=post_id,
        tenant_id=tenant_id
    ).first()

    if not post:
        db.close()
        return

    if post.status == "cancelled":
        db.close()
        return

    try:
        post.status = "processing"
        post.error_message = None
        post.updated_at = datetime.utcnow()
        db.commit()

        # simulate API call
        time.sleep(3)

        post.status = "posted"
        post.posted_at = datetime.utcnow()
        post.platform_post_id = "demo_123"
        post.updated_at = datetime.utcnow()

    except Exception as e:
        post.retry_count += 1
        post.error_message = str(e)
        post.updated_at = datetime.utcnow()

        if post.retry_count >= post.max_retries:
            post.status = "failed"
        else:
            post.status = "queued"

    db.commit()
    db.close()
