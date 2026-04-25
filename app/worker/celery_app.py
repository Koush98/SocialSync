import os

from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.worker.tasks"],
)

celery_app.conf.task_default_queue = "default"
celery_app.conf.task_routes = {
    "app.worker.tasks.*": {"queue": "default"}
}

# Enable task events for Flower monitoring
celery_app.conf.worker_send_task_events = True
celery_app.conf.task_send_sent_event = True
celery_app.conf.event_queue_expires = 60  # Expire event queues after 60 seconds

# Worker startup configuration
celery_app.conf.update(
    task_acks_late=True,  # Acknowledge tasks after completion
    worker_prefetch_multiplier=1,  # Process one task at a time
    task_reject_on_worker_lost=True,  # Requeue if worker dies
)

import app.worker.tasks  # noqa: E402,F401

# Print startup info
print(f"✓ Celery app configured with Redis: {REDIS_URL[:30]}...")
print(f"✓ Task queue: default")
print(f"✓ Worker will process: app.worker.tasks.*")
