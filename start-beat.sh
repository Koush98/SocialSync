#!/bin/bash
# Railway beat startup script
set -e

# Use Railway's PORT env var if set
export PORT=${PORT:-8000}

# Beat service should NOT run migrations
export RUN_MIGRATIONS=false

echo "Starting Celery Beat..."
echo "REDIS_URL set: ${REDIS_URL:+yes}"
echo "DATABASE_URL set: ${DATABASE_URL:+yes}"

# Wait for database to be ready (without running migrations)
./wait-for-db.sh

# Start Celery beat scheduler
exec uv run celery -A app.worker.celery_app.celery_app beat --loglevel=info
