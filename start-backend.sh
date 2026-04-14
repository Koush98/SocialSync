#!/bin/bash
# Railway backend startup script
set -e

# Use Railway's PORT env var, default to 8000
export PORT=${PORT:-8000}

echo "=================================="
echo "Starting SocialSync Backend"
echo "=================================="
echo "Port: $PORT"
echo "DATABASE_URL set: ${DATABASE_URL:+yes}"
echo "REDIS_URL set: ${REDIS_URL:+yes}"
echo "=================================="

# Run migrations first
echo ""
echo "Running database migrations..."
uv run alembic upgrade head
echo "Migrations complete!"

# Start the backend
echo ""
echo "Starting FastAPI server on port $PORT..."
echo "Server will be ready shortly..."
echo "=================================="
exec uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
