#!/bin/bash
# Railway beat startup script

# Use Railway's PORT env var if set
export PORT=${PORT:-8000}

echo "Starting Celery Beat..."
echo "REDIS_URL: ${REDIS_URL:0:20}..."
echo "DATABASE_URL: ${DATABASE_URL:0:20}..."

# Wait for database to be ready
./wait-for-db.sh

# Start Celery beat scheduler
uv run celery -A app.worker.celery_app.celery_app beat --loglevel=info
