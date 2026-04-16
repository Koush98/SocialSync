#!/bin/sh

# Extract hostname from DATABASE_URL
# Handles formats like: postgresql://user:pass@host:port/dbname
DB_HOST=$(echo $DATABASE_URL | sed -n 's|.*://[^@]*@\([^:]*\).*|\1|p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's|.*://[^@]*@[^:]*:\([0-9]*\).*|\1|p')

# Default to port 5432 if not found
DB_PORT=${DB_PORT:-5432}

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."

# Check if we're running in Railway (has RAILWAY_SERVICE_NAME)
if [ -n "$RAILWAY_SERVICE_NAME" ]; then
    echo "Detected Railway environment"
    # Railway services should use DATABASE_URL directly from environment
    # Just verify connectivity
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if python -c "
import psycopg2
import sys
try:
    conn = psycopg2.connect('$DATABASE_URL', connect_timeout=5)
    conn.close()
    sys.exit(0)
except:
    sys.exit(1)
" 2>/dev/null; then
            echo "Postgres is ready!"
            exec "$@"
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "Waiting for Postgres... attempt $RETRY_COUNT/$MAX_RETRIES"
        sleep 2
    done
    echo "ERROR: Could not connect to Postgres after $MAX_RETRIES attempts"
    exit 1
else
    # Docker Compose or local environment
    while ! nc -z ${DB_HOST} ${DB_PORT}; do
      sleep 1
    done
    echo "Postgres started"
    exec "$@"
fi
