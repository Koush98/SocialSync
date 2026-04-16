#!/bin/sh

# Extract hostname from DATABASE_URL
# Handles formats like: postgresql://user:pass@host:port/dbname
DB_HOST=$(echo $DATABASE_URL | sed -n 's|.*://[^@]*@\([^:]*\).*|\1|p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's|.*://[^@]*@[^:]*:\([0-9]*\).*|\1|p')

# Default to port 5432 if not found
DB_PORT=${DB_PORT:-5432}

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."

# Use nc (netcat) to test TCP connection - works in both Docker and Railway
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if nc -z ${DB_HOST} ${DB_PORT} 2>/dev/null; then
        echo "Postgres is ready!"
        exec "$@"
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for Postgres... attempt $RETRY_COUNT/$MAX_RETRIES"
    sleep 2
done

echo "ERROR: Could not connect to Postgres after $MAX_RETRIES attempts"
echo "DATABASE_URL: ${DATABASE_URL:0:30}..."
echo "DB_HOST: ${DB_HOST}"
echo "DB_PORT: ${DB_PORT}"
exit 1
