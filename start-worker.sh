#!/bin/bash
# Railway worker startup script

# Use Railway's PORT env var if set
export PORT=${PORT:-8000}

# Worker service should NOT run migrations
export RUN_MIGRATIONS=false

echo "Starting Celery Worker..."
echo "REDIS_URL: ${REDIS_URL:0:20}..."
echo "DATABASE_URL: ${DATABASE_URL:0:20}..."

# Wait for database to be ready (without running migrations)
./wait-for-db.sh

# Start Celery worker
uv run celery -A app.worker.celery_app.celery_app worker --loglevel=info -E -Q default
