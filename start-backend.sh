#!/bin/bash
# Railway backend startup script
set -e

# Use Railway's PORT env var, default to 8000
export PORT=${PORT:-8000}

# Enable migrations for backend service
export RUN_MIGRATIONS=true

echo "=================================="
echo "Starting SocialSync Backend"
echo "=================================="
echo "Port: $PORT"
echo "DATABASE_URL set: ${DATABASE_URL:+yes}"
echo "REDIS_URL set: ${REDIS_URL:+yes}"
echo "=================================="

# Wait for database and run migrations
./wait-for-db.sh

# Start the backend
echo ""
echo "Starting FastAPI server on port $PORT..."
echo "Server will be ready shortly..."
echo "=================================="
exec uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
