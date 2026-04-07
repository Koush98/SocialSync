
from app.services.publisher import publish_post
from app.worker.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3)
def publish_post_task(self, post_id, tenant_id):
    try:
        publish_post(post_id, tenant_id)
    except Exception as e:
        raise self.retry(exc=e, countdown=5)
