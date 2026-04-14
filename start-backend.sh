#!/bin/bash
# Railway backend startup script

# Use Railway's PORT env var, default to 8000
export PORT=${PORT:-8000}

echo "Starting backend on port $PORT..."
echo "DATABASE_URL: ${DATABASE_URL:0:20}..."
echo "REDIS_URL: ${REDIS_URL:0:20}..."

# Run migrations first
echo "Running database migrations..."
uv run alembic upgrade head

# Start the backend
echo "Starting FastAPI server..."
uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
