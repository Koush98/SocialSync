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

# Ensure alembic is available
RUN uv pip install alembic

# Make wait script executable
COPY wait-for-db.sh .
RUN chmod +x wait-for-db.sh

EXPOSE 8000

# Auto run migration + start server (Best Practice)
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]