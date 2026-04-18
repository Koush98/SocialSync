#!/bin/sh

# Extract hostname from DATABASE_URL
# Handles formats like: postgresql://user:pass@host:port/dbname
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*://[^@]*@\([^:]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*://[^@]*@[^:]*:\([0-9]*\).*|\1|p')

# Default to port 5432 if not found
DB_PORT=${DB_PORT:-5432}

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."

# Wait for TCP connection first
MAX_RETRIES=60
RETRY_COUNT=0
DB_READY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ $DB_READY -eq 0 ]; do
    if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
        echo "TCP connection successful, verifying PostgreSQL..."
        # Give PostgreSQL a moment to fully initialize
        sleep 3
        
        # Test actual PostgreSQL connection using Python in the uv environment
        if uv run python -c "
import sys
try:
    import psycopg2
    conn = psycopg2.connect('$DATABASE_URL', connect_timeout=5)
    conn.close()
    print('PostgreSQL connection verified!')
    sys.exit(0)
except Exception as e:
    print(f'PostgreSQL not ready: {e}')
    sys.exit(1)
" 2>&1; then
            echo "Postgres is ready!"
            DB_READY=1
        else
            echo "PostgreSQL port open but not accepting connections yet..."
        fi
    fi
    
    if [ $DB_READY -eq 0 ]; then
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "Waiting for Postgres... attempt $RETRY_COUNT/$MAX_RETRIES"
        sleep 2
    fi
done

if [ $DB_READY -eq 0 ]; then
    echo "ERROR: Could not connect to Postgres after $MAX_RETRIES attempts"
    DB_URL_PREFIX=$(echo "$DATABASE_URL" | cut -c1-30)
    echo "DATABASE_URL: ${DB_URL_PREFIX}..."
    echo "DB_HOST: ${DB_HOST}"
    echo "DB_PORT: ${DB_PORT}"
    exit 1
fi

# Continue with the rest of the command when provided
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

exit 0
