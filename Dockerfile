FROM python:3.9.6-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    netcat-openbsd \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Copy project files
COPY . .

# Install dependencies
RUN uv sync --frozen --no-dev

# Make scripts executable
COPY wait-for-db.sh .
RUN chmod +x wait-for-db.sh
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh
COPY start-backend.sh .
RUN chmod +x start-backend.sh
COPY start-worker.sh .
RUN chmod +x start-worker.sh
COPY start-beat.sh .
RUN chmod +x start-beat.sh
COPY start-service.sh .
RUN chmod +x start-service.sh

EXPOSE 8000

# Default command auto-detects backend/worker/beat service role.
CMD ["./start-service.sh"]
