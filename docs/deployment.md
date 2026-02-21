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

### Pre-deployment Checklist

Before deploying to production, verify the following:

- [ ] All secrets in `.env` are **real, unique values** (not defaults from `.env.example`)
- [ ] `ENVIRONMENT=production` is set
- [ ] `JWT_SECRET_KEY` is a strong 64+ character hex string (`python -c "import secrets; print(secrets.token_hex(32))"`)
- [ ] `API_KEYS` contains securely generated service-to-service keys
- [ ] `DATABASE_URL` points to a production PostgreSQL instance
- [ ] `CORS_ORIGINS` is restricted to your actual domains (no localhost)
- [ ] `SENTRY_DSN` is configured for error tracking
- [ ] Database migrations are up to date: `alembic upgrade head`
- [ ] Payment provider is configured (see Payment section below)

### Environment Variables

All configuration is via environment variables. See `docker/.env.example` for the full list with descriptions.

**Required in production:**

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key for AI agents |
| `OPENAI_API_KEY` | OpenAI key for embeddings |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `QDRANT_URL` + `QDRANT_API_KEY` | Vector DB endpoint |
| `NEO4J_URI` + `NEO4J_PASSWORD` | Graph DB endpoint |
| `JWT_SECRET_KEY` | JWT signing secret (min 32 chars) |
| `API_KEYS` | JSON array of service-to-service API keys |
| `ENVIRONMENT` | Must be `production` |

**Optional but recommended:**

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Error tracking |
| `SMTP_*` | Email notifications |
| `WHATSAPP_*` | WhatsApp Business API |
| `PAYMENT_PROVIDER` | Set to `mock` only for demos |

### Startup Validation

The application automatically validates configuration at startup in production:

- **JWT secret**: Must be at least 32 characters and not a known insecure default
- **LLM API keys**: At least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` must be set
- **API keys**: `API_KEYS` must be configured
- **Database URL**: Must not contain placeholder values
- **Payment provider**: `MockPaymentProvider` is **blocked** in production unless `PAYMENT_PROVIDER=mock` is explicitly set

If any validation fails, the application will refuse to start with a clear error message.

### Payment Provider

By default, the system uses `MockPaymentProvider` which approves all payments instantly. This is **blocked in production**.

To use mock payments in staging/demo environments, set `PAYMENT_PROVIDER=mock` explicitly.

For production, integrate a real payment service provider (Stripe, PayPlus, etc.) by implementing the `PaymentProvider` protocol in `src/services/payment.py`.

### Database Migrations

Run migrations before starting the application:

```bash
alembic upgrade head
```

Migration files are in `alembic/versions/`. The schema includes:
- `001_initial_schema.py` — Users, buildings, contractors, offers
- `002_conversation_logs.py` — Conversation logging
- `003_file_uploads.py` — File uploads
- `004_admin_and_payments.py` — Admin, invoices, payments, escrow

### Docker Production Deployment

```bash
# Set required environment variables
cp docker/.env.example .env
# Edit .env with REAL production values

# Start all services
docker compose -f docker/docker-compose.yml up -d

# Run migrations
docker compose -f docker/docker-compose.yml exec api alembic upgrade head

# Seed initial data (optional)
docker compose -f docker/docker-compose.yml exec api python scripts/seed_data.py
```

The `docker-compose.yml` requires `POSTGRES_PASSWORD` and `NEO4J_PASSWORD` to be set — it will fail to start if they are missing.

### Frontend Apps Deployment

**Admin Dashboard** (`apps/admin`):
```bash
cd apps/admin
pnpm install && pnpm build
# Deploy .next/ output to Vercel, Netlify, or any Node.js hosting
```

**Web App** (`apps/web`):
```bash
cd apps/web
pnpm install && pnpm build
# Deploy .next/ output
```

**Mobile App** (`apps/mobile`):
```bash
cd apps/mobile
npx eas build --platform all
# Submit to App Store / Play Store via EAS Submit
```

Set `NEXT_PUBLIC_API_URL` to point to your production API server.

### Health Checks

- `GET /api/v1/health` — Checks all service connections (PostgreSQL, Redis, Qdrant, Neo4j)
- `GET /api/v1/admin/metrics` — Agent and RAG pipeline metrics (requires admin auth)
- `GET /api/v1/admin/status` — Detailed system status (requires admin auth)

### Scaling

| Component | Strategy |
|-----------|----------|
| API server | Scale horizontally behind a load balancer (stateless) |
| PostgreSQL | Use managed service (Supabase, RDS, Cloud SQL) with read replicas |
| Redis | Redis Sentinel or Cluster for HA |
| Qdrant | Supports clustering for large vector datasets |
| Neo4j | Neo4j Aura for managed graph DB |
| Frontend | Deploy to CDN-backed hosting (Vercel, Cloudflare Pages) |

### Monitoring

- **Error tracking**: Sentry integration via `SENTRY_DSN` (10% sample rate default)
- **Structured logging**: JSON logs with request ID tracking and PII redaction
- **Request logging**: All requests logged with timing, status, and redacted body
- **Rate limiting**: Redis-based per-user rate limiting (default: 60 req/min)

### Security

- **CORS**: Configurable via `CORS_ORIGINS`, restricted to specific domains
- **Security headers**: HSTS, CSP, X-Frame-Options, X-Content-Type-Options added automatically
- **JWT authentication**: Access tokens (30 min default) + refresh tokens (7 days)
- **Rate limiting**: Per-user sliding window via Redis
- **PII redaction**: Sensitive fields redacted in logs
- **2FA**: TOTP-based two-factor authentication for admin accounts
