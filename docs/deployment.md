# Deployment Guide

## Local Development

### Prerequisites

- Python 3.11+
- Docker and Docker Compose
- API keys: Anthropic, OpenAI

### Quick Start

1. **Clone and set up environment**:
   ```bash
   cd groupio-agents
   cp docker/.env.example .env
   # Edit .env with your API keys
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -e ".[dev]"
   ```

3. **Start infrastructure services**:
   ```bash
   docker compose -f docker/docker-compose.yml up -d qdrant neo4j redis
   ```

4. **Initialize databases**:
   ```bash
   python scripts/setup_vector_db.py
   python scripts/setup_graph_db.py
   python scripts/seed_data.py
   ```

5. **Run the API server**:
   ```bash
   uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
   ```

6. **Run tests**:
   ```bash
   pytest tests/ -v
   ```

### Docker Compose (Full Stack)

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts:
- API server on port 8000
- Qdrant on port 6333
- Neo4j on ports 7474 (HTTP) and 7687 (Bolt)
- Redis on port 6379

---

## Production Deployment

### Environment Variables

All configuration is via environment variables. See `docker/.env.example` for the full list.

Critical variables:
- `ANTHROPIC_API_KEY`: Claude API key
- `OPENAI_API_KEY`: For embeddings
- `QDRANT_URL`: Vector DB endpoint
- `NEO4J_URI`: Graph DB endpoint
- `SUPABASE_URL` / `SUPABASE_KEY`: PostgreSQL
- `REDIS_URL`: Cache endpoint

### Health Checks

- `GET /api/v1/health` - Checks all service connections
- Monitor Prometheus metrics at `/api/v1/admin/metrics`

### Scaling

- API server: Scale horizontally behind a load balancer
- Qdrant: Supports clustering for large datasets
- Redis: Use Redis Sentinel or Cluster for HA
- Neo4j: Use Neo4j Aura for managed graph DB

### Monitoring

- Prometheus metrics exported by the API
- Sentry integration via `SENTRY_DSN` environment variable
- Structured logging with request ID tracking
