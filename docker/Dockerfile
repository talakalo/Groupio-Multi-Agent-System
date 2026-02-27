# Multi-stage build keeps runtime image smaller (no build-essential, no dev deps).
# Build context is trimmed via .dockerignore (e.g. exclude node_modules, venv).
# Rebuild with: docker compose -f docker/docker-compose.yml build --no-cache api worker
# -- Stage 1: Build dependencies (prod only = smaller image) --
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements-prod.txt \
    && find /install -type d -name __pycache__ -print0 | xargs -0 rm -rf 2>/dev/null || true \
    && find /install -name "*.pyc" -delete 2>/dev/null || true \
    && find /install -type d -name "tests" -print0 | xargs -0 rm -rf 2>/dev/null || true \
    && find /install -type d -name "test" -print0 | xargs -0 rm -rf 2>/dev/null || true \
    && find /install -type d -name "examples" -print0 | xargs -0 rm -rf 2>/dev/null || true \
    && rm -rf /install/lib/python3.11/site-packages/pip* /install/lib/python3.11/site-packages/setuptools* \
       /install/lib/python3.11/site-packages/wheel* /install/lib/python3.11/site-packages/pkg_resources* \
       /install/bin/pip* /install/bin/pip3* /install/bin/easy_install* 2>/dev/null || true

# -- Stage 2: Runtime image --
FROM python:3.11-slim

# Create non-root user
RUN adduser --disabled-password --gecos '' --uid 1000 appuser

WORKDIR /app

# Copy installed dependencies from builder
COPY --from=builder /install /usr/local

# Copy only necessary source code
COPY src/ ./src/
COPY pyproject.toml ./

# Set ownership to non-root user
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health/live')" || exit 1

# Production: 4 workers for multi-core utilisation.
# Uvicorn supports --workers natively (v0.21+); each worker is a separate
# process — verify GroupioOrchestrator holds no inter-process shared state.
# Use UVICORN_WORKERS env var to override (e.g. --env UVICORN_WORKERS=8).
CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-4}"]
