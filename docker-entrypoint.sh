#!/bin/sh
set -eu

# Extract hostname from DATABASE_URL
DB_HOST=$(echo $DATABASE_URL | sed -n 's|.*://[^@]*@\([^:]*\).*|\1|p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's|.*://[^@]*@[^:]*:\([0-9]*\).*|\1|p')
DB_PORT=${DB_PORT:-5432}

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."

# Wait for database
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if nc -z ${DB_HOST:-db} ${DB_PORT}; then
        echo "Postgres is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for Postgres... attempt $RETRY_COUNT/$MAX_RETRIES"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: Could not connect to Postgres after $MAX_RETRIES attempts"
    exit 1
fi

# Only run migrations if RUN_MIGRATIONS is set to "true"
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "Running Alembic migrations..."
    uv run alembic upgrade head
    echo "Migrations complete"
else
    echo "Skipping migrations (RUN_MIGRATIONS=false)"
fi

exec "$@"
