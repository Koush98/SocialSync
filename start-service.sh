#!/bin/bash
# Unified Railway startup script for backend/worker/beat services.
set -e

SERVICE_NAME_RAW="${SERVICE_ROLE:-${RAILWAY_SERVICE_NAME:-backend}}"
SERVICE_NAME="$(echo "$SERVICE_NAME_RAW" | tr '[:upper:]' '[:lower:]')"

echo "=================================="
echo "SocialSync service bootstrap"
echo "Detected service: $SERVICE_NAME_RAW"
echo "DATABASE_URL set: ${DATABASE_URL:+yes}"
echo "REDIS_URL set: ${REDIS_URL:+yes}"
echo "=================================="

case "$SERVICE_NAME" in
  *worker*)
    exec ./start-worker.sh
    ;;
  *beat*|*scheduler*)
    exec ./start-beat.sh
    ;;
  *backend*|*api*|*web*)
    exec ./start-backend.sh
    ;;
  *)
    echo "Unknown service role '$SERVICE_NAME_RAW'. Defaulting to backend startup."
    exec ./start-backend.sh
    ;;
esac

