# Production Architecture Research
**Project:** Groupio — City MVP Launch  
**Focus:** Infrastructure patterns for marketplace with payments, real-time WebSocket, AI agents, and multi-DB  
**Date:** 2026-05-06

---

## Production Component Map

### System Boundaries and Responsibilities

```
┌─────────────────────── PUBLIC INTERNET ─────────────────────────┐
│                                                                   │
│  apps/web (Vercel Edge)      apps/admin (Vercel Edge)            │
│  groupio.co.il :443          admin.groupio.co.il :443            │
│  apps/mobile (Expo / EAS)                                        │
│                                                                   │
└─────────────────────┬─────────────────────────────────────────────┘
                      │ HTTPS / WSS
                      ▼
┌─────────────────── LOAD BALANCER / REVERSE PROXY ───────────────┐
│  Nginx (or Caddy)                                                │
│  - TLS termination                                               │
│  - WebSocket upgrade passthrough (/api/v1/ws/*)                  │
│  - Upstream: api:8000 (round-robin across 4 Uvicorn workers)     │
│  - Rate limiting at ingress layer (per-IP before app sees it)    │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP (internal)
                       ▼
┌─────────────────── FASTAPI API SERVER ──────────────────────────┐
│  src/api/main.py — Uvicorn 4 workers, port 8000                  │
│                                                                  │
│  Middleware stack (outer → inner):                               │
│    CORS → SecurityHeaders → RequestLogging → CacheControl        │
│                                                                  │
│  Route modules (17): auth, offers, contractors, buildings,       │
│    payments, escalations, agents, admin, uploads, webhooks,      │
│    activity, onboarding, conversations, graph_features,          │
│    enrichment, websocket                                         │
│                                                                  │
│  WebSocket: /api/v1/ws/admin — ConnectionManager (in-process,   │
│    not cross-worker — see WebSocket Scaling section)             │
│                                                                  │
│  Lifespan: init_monitoring, vector collections verify, payment  │
│    provider fail-closed probe, graceful DB/Redis/Graph shutdown  │
└──────┬─────────┬──────────┬──────────┬───────────────────────────┘
       │         │          │          │
       ▼         ▼          ▼          ▼
┌────────┐ ┌─────────┐ ┌────────┐ ┌────────┐
│Postgres│ │  Redis  │ │ Qdrant │ │ Neo4j  │
│(asyncpg│ │  7 AOF  │ │ gRPC   │ │ 5 CE   │
│pool    │ │  LRU    │ │ prefer │ │ APOC   │
│min5    │ │  maxmem │ │ grpc   │ │ pool50 │
│max25   │ │ :6379   │ │ :6333  │ │ :7687  │
└────────┘ └────┬────┘ └────────┘ └────────┘
                │ BRPOP
                ▼
┌─────────────────── BACKGROUND WORKERS ──────────────────────────┐
│                                                                  │
│  agent_worker      — Redis BRPOP queue, RouterAgent entry        │
│  scheduler         — Redis-lock cron (offer expiry, reminders)   │
│  outbox_dispatcher — polls outbox_events → RabbitMQ publish      │
│  worker_notifications — RabbitMQ consumer → WhatsApp/FCM/SMTP   │
│  worker_payments   — RabbitMQ consumer → payment lifecycle       │
│  worker_crm_sync   — RabbitMQ consumer → EspoCRM sync           │
│                                                                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ AMQP
                       ▼
┌─────────────────── RABBITMQ ────────────────────────────────────┐
│  rabbitmq:3-management-alpine                                    │
│  Exchange: groupio.events (topic)                                │
│  Outbox pattern: outbox_dispatcher polls PG → publishes here     │
│  Feature-flagged: ENABLE_RABBITMQ=false disables all consumers  │
│  ENABLE_OUTBOX=false disables outbox dispatcher                  │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────── EXTERNAL SERVICES ───────────────────────────┐
│  Stripe PaymentIntents + webhooks (→ /api/v1/payments/webhook)  │
│  WhatsApp Cloud API (Meta Business)                              │
│  Anthropic Claude claude-sonnet-4-6 (primary LLM)               │
│  OpenAI GPT-4o (LLM fallback, embeddings: text-embedding-3-large│
│  Firebase Cloud Messaging (push notifications)                   │
│  SMTP / aiosmtplib (transactional email)                         │
│  data.gov.il CKAN API (address normalization)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Direction (explicit)

```
WRITE PATH (resident joins offer):
  Browser → POST /offers/{id}/join
  → auth middleware (JWT validate)
  → offers route
  → offers service (business logic, tier price calculation)
  → postgres.py (asyncpg pool) INSERT offer_participants
  → audit_logs INSERT
  → redis PUBLISH (offer:update channel)
  → outbox_events INSERT (payment trigger)
  ← 201 response

ASYNC PATH (payment triggered):
  outbox_dispatcher polls outbox_events (PG)
  → publishes to RabbitMQ groupio.events exchange
  → worker_payments consumes → POST /payments/initiate (internal)
  → StripePaymentProvider.create_charge()
  → Stripe webhook → POST /api/v1/payments/webhook/stripe
  → signature verify → status update → audit_log

AI AGENT PATH (user sends chat message):
  Browser → POST /api/v1/message
  → rate limit check (Redis)
  → orchestrator.run()
  → RouterAgent (LangGraph StateGraph)
  → specialist agent (pricing/matching/support/vetting/etc.)
  → Qdrant semantic search (contractor/knowledge_base collections)
  → Neo4j graph query (contractor reputation, relationships)
  → LLM call (Anthropic primary, OpenAI fallback on timeout)
  → response + background log_conversation (PG)

WEBSOCKET PATH (real-time admin notifications):
  Admin browser → WSS /api/v1/ws/admin?token=...
  → JWT validate → role check (admin/super_admin/buildings_manager)
  → ConnectionManager.connect()
  → broadcast on DB events (in-process manager)
```

### Build Order for Launch Prep

The inter-service dependency graph determines what must be healthy before what:

```
1. PostgreSQL        → everything depends on it (migrations must pass first)
2. Redis             → API rate limiting, session tokens, scheduler locks
3. Qdrant            → agent_worker cannot serve AI requests without it
4. Neo4j             → contractor matching degrades without it (non-fatal)
5. RabbitMQ          → notification/payment workers (feature-flagged, can defer)
6. API (4 workers)   → depends on 1-4 being healthy (fail-closed startup probe)
7. agent_worker      → depends on API db schema being migrated
8. scheduler         → depends on Redis only
9. outbox_dispatcher → depends on PG + RabbitMQ (only if ENABLE_OUTBOX=true)
10. workers (notif, payments, CRM) → depend on RabbitMQ
11. Frontends (Vercel CDN) → depend on API being reachable
```

**Critical path for city MVP:** PostgreSQL → Redis → Qdrant → API → Frontends.  
RabbitMQ-dependent workers can be enabled incrementally after core flows validate.

---

## Monitoring Strategy

### What Exists (already instrumented)

The codebase has a production-grade monitoring stack already in place:

| Component | Implementation | Location |
|-----------|---------------|----------|
| Metrics scraping | Prometheus 2.51 + prometheus-fastapi-instrumentator | `monitoring/prometheus.yml` |
| Dashboards | Grafana 10.4 | docker-compose, port 3010 |
| Alerting | Alertmanager 0.27 → Slack | `monitoring/alertmanager.yml` |
| Structured logging | structlog (JSON in prod, colored console in dev) | `src/utils/monitoring.py` |
| Custom metrics | Counter/Gauge/Histogram via prometheus_client | `src/utils/monitoring.py` |
| Health probes | `/api/v1/health/live`, `/api/v1/health`, `/api/v1/health/db` | `src/api/main.py` |

### Existing Alert Rules (in `monitoring/alerts.yml`)

| Alert | Trigger | Severity |
|-------|---------|----------|
| `PaymentWebhookFailed` | Any 4xx/5xx on payment webhook | critical |
| `HighErrorRate` | API error rate > 5% for 2 min | critical |
| `LLMLatencyHigh` | Agent P95 > 30s for 5 min | critical |
| `EscalationSurge` | > 5 escalations/10 min | critical |
| `DatabasePoolExhausted` | < 2 free connections | critical |
| `HighRateLimitHits` | > 10 req/s hitting 429 | warning |
| `RedisConnectionFailed` | redis_connected == 0 | warning |
| `LowDiskSpace` | Root filesystem < 15% free | warning |
| `BackupMissed` | No backup in 25 hours | warning |

### What Is Missing (add before launch)

The prometheus.yml explicitly comments out scrape jobs that need sidecars added to docker-compose:

| Missing exporter | Metric gap | Priority |
|-----------------|-----------|----------|
| `redis_exporter` (oliver006/redis_exporter:9121) | Redis memory pressure, eviction rate, connected clients | HIGH |
| `node_exporter` (:9100) | Host CPU, memory, disk I/O — the `LowDiskSpace` alert depends on `node_filesystem_*` metrics which only appear when node_exporter is running | HIGH |
| `postgres_exporter` (:9187) | PG connection count, slow queries, table bloat, replication lag (if using read replicas) | HIGH |
| `next.js /api/metrics` | Frontend error rate, core web vitals | MEDIUM |

To activate: add the sidecar service to `docker/docker-compose.yml`, then uncomment the corresponding scrape job in `monitoring/prometheus.yml`.

### Self-Hosted vs Managed Monitoring

**Recommendation for small-team city MVP: keep self-hosted Prometheus + Grafana.**

Rationale:
- Already implemented and tested — no migration cost.
- All alerting wired to Slack via Alertmanager.
- Managed alternatives (Datadog, New Relic, Grafana Cloud) cost $200-$600/month at MVP scale and require SDK swaps.
- The monitoring stack runs inside Docker Compose on the same host — acceptable for MVP. Upgrade to a dedicated monitoring host or Grafana Cloud when monthly API/DB bills justify it.

**Operational floor for city MVP:**
- Grafana dashboards: API error rate, agent latency, payment webhook success, DB pool usage, Redis memory.
- PagerDuty or direct Slack alerting for critical severity only — a small team cannot respond to warning-level alerts at 3am.

---

## Scaling Considerations

### WebSocket Scaling

**Current implementation:** `ConnectionManager` is a plain Python list held in-process (`src/api/routes/websocket.py`). With 4 Uvicorn workers, a WebSocket connection to worker 0 cannot receive broadcasts from workers 1-3. This is a **production blocker** once load balancing across multiple processes is active.

**Solutions (in order of implementation complexity):**

1. **Sticky sessions at the load balancer (fastest to implement).** Nginx `ip_hash` or a cookie-based affinity directive routes a given client to the same worker. Adequate for < 50 concurrent admin WebSocket connections at city-MVP scale. Downside: uneven load distribution.

2. **Redis Pub/Sub fan-out (correct for production).** Each Uvicorn worker subscribes to a Redis channel (e.g., `admin:broadcast`). When any worker wants to broadcast, it publishes to Redis; all workers receive and relay to their local connections. Implementation: replace `manager.broadcast()` with a Redis PUBLISH and add a background task in each worker that subscribes and relays.

3. **Managed WebSocket service** (e.g., Pusher, Ably, AWS API Gateway WebSocket): highest cost, lowest operational burden. Not recommended at MVP — adds per-message billing and a third-party dependency for a feature that has a clean Redis solution.

**For city MVP:** Implement Redis Pub/Sub fan-out for WebSocket. At 4 workers and expected admin concurrency, sticky sessions alone will work but sets a trap for future horizontal scaling.

### Database Connection Pooling in Production

**PostgreSQL (asyncpg):**
- Current: min 5, max 25 per process. With 4 Uvicorn workers: 4 × 25 = 100 max connections against PostgreSQL.
- Supabase free/pro tiers cap connections (25-60 direct). Use Supabase Transaction Pooler (PgBouncer) URI in `DATABASE_URL` when hitting that cap.
- For self-hosted PostgreSQL: `max_connections=200` in `postgresql.conf` is the default. 100 app connections is safe, leaving headroom for admin tools and background workers.
- Add PgBouncer as a sidecar if total connections exceed 150: `docker run pgbouncer/pgbouncer` with `pool_mode=transaction`.
- The `DB_STATEMENT_TIMEOUT_MS=30000` setting is correct for production — prevents runaway queries.

**Redis:**
- `max_connections=20` per RedisClient instance. With 4 workers + agent_worker + scheduler + 3 consumer workers = ~8 processes × 20 = 160 max connections.
- Redis 7 default `maxclients=10000` — no near-term risk.
- Enable `appendonly yes` (AOF) for durability — already set in docker-compose.

**Qdrant:**
- `prefer_grpc=True` already set in `vector_store.py` — gRPC is faster than HTTP for vector queries.
- Timeout=30s per call — adequate for 1536-dimension embeddings.
- For production: enable Qdrant's built-in quantization (scalar quantization) on the `contractors` and `knowledge_base` collections to reduce memory pressure by 4x with minimal recall loss. Configure in collection params, not in application code.

**Neo4j:**
- `max_connection_pool_size=50, connection_acquisition_timeout=30s` — reasonable.
- Neo4j Community Edition does not support clustering. For city MVP this is acceptable. Upgrade to Enterprise for read replicas if graph query latency becomes measurable.

### RabbitMQ vs Managed Queue

**Current state:** RabbitMQ is feature-flagged off by default (`ENABLE_RABBITMQ=false`). The outbox pattern is implemented but not active at launch.

**Trade-offs:**

| Dimension | Self-hosted RabbitMQ | CloudAMQP (managed) | Redis Streams (alternative) |
|-----------|---------------------|--------------------|-----------------------------|
| Operational burden | Medium (needs disk monitoring, memory limits) | Low (managed) | Low (already in stack) |
| Cost | Infra only | $0-$85/month | $0 (already paying for Redis) |
| Features | Full AMQP, DLQ, shovel, federation | Same | Less mature, no DLQ natively |
| Failure mode | Single point of failure without cluster | Provider SLA | Redis failure = rate limiting also down |
| Israeli-hosted option | Yes (run on your VPS) | Limited EU regions | Yes |

**Recommendation for city MVP:**
- Enable self-hosted RabbitMQ (already in docker-compose) with a 256MB memory limit and persistent volumes.
- Set `ENABLE_RABBITMQ=true` and `ENABLE_OUTBOX=true` only after baseline load testing confirms the async workers don't overwhelm the DB.
- Defer CloudAMQP to Phase 2 if RabbitMQ operational monitoring proves burdensome.
- The Redis-based scheduler (`scheduler.py`) already handles time-based jobs without RabbitMQ — not everything needs to go through the broker.

### Qdrant in Production

**What Qdrant stores:** contractors, buildings, knowledge_base, conversations — 4 collections at 1536 dimensions each.

**Production configuration checklist:**
- Enable `QDRANT_API_KEY` — currently optional in `settings.py`, should be required in production.
- Use named Docker volume with host-path backup (not just Docker-managed volume) so vector data survives container replacement.
- Qdrant Cloud (managed): $25/month for 1M vectors — worth considering if the self-hosted instance becomes an operational distraction. The `VECTOR_DB_PROVIDER` setting already has a Pinecone escape hatch; Qdrant Cloud uses the same Qdrant client.
- Memory requirement: ~1536 dimensions × 4 bytes × N vectors. At 10,000 contractors: ~60MB. At city scale (100K conversations): ~600MB. Size accordingly.
- Enable snapshotting for backup: `POST /collections/{name}/snapshots` via Qdrant's REST API, triggered by the scheduler or a cron.

---

## Zero-Downtime Deployment

### Current Deployment Architecture

- **Frontends (web + admin):** Vercel — zero-downtime by design (atomic deployments, instant rollback via Vercel dashboard).
- **Backend:** Docker on a single host, deployed via SSH + `docker compose pull && docker compose up -d`.
- **Migrations:** Run as a separate CI job after backend deploy (`alembic upgrade head`).
- **Mobile:** EAS build and submit — App Store review gates it (not instantaneous).

### Problem: Current Backend Deploy Has Downtime

The SSH deploy script does `docker compose up -d` which restarts the API container, causing 5-15s downtime during container startup + 60s health check `start_period`.

### Solutions (small team, city MVP)

**Option A: Rolling restart with Nginx upstream management (recommended for single host).**

Before container replacement: tell Nginx to drain the old container. After new container is healthy, swap upstream. Steps:
```bash
# 1. Pull new image
docker compose pull api

# 2. Start new container on alternate port (8001)
docker run -d --name api_green -p 8001:8000 ... groupio-backend:new

# 3. Wait for health check
until curl -sf http://localhost:8001/api/v1/health/live; do sleep 2; done

# 4. Run migrations against live DB (migrations must be backward-compatible)
docker exec api_green alembic upgrade head

# 5. Swap Nginx upstream to 8001
nginx -s reload  # atomic upstream swap

# 6. Stop old container
docker stop api_blue && docker rm api_blue
```

**Option B: Multiple replicas behind Nginx (better but needs more RAM).** Run 2 API containers. Update one at a time. Nginx `max_fails` handles the unhealthy one gracefully.

**Option C: Use a PaaS that handles it** (Fly.io, Railway, Render) — managed rolling deploys, no custom scripting. Adds $50-$150/month at MVP scale. Good option if the team lacks DevOps bandwidth.

### Migration Safety During Zero-Downtime Deploy

The most dangerous moment is when old API and new API run simultaneously against the same DB schema. Rules:
1. **Migrations must be backward-compatible** — additive only (add columns with defaults, never rename or drop in the same release as the code change).
2. **Deploy pattern:** New DB schema → Old code runs fine (new nullable columns ignored) → Deploy new code → New code uses new columns.
3. Run `alembic upgrade head` on the green container before swapping Nginx — not after.
4. The `alembic.ini` / `alembic.docker.ini` split already exists — use the correct one in CI.

### WebSocket Connection Handling During Deploy

- Old WebSocket connections to the blue container will drop when it stops.
- Clients must implement reconnect logic with exponential backoff.
- Add a `reconnect` handler in the admin WebSocket client that retries with 1s → 2s → 4s → 8s backoff and a max of 5 attempts before showing a "connection lost" banner.

---

## Disaster Recovery Basics

### What Needs Backing Up

| Data store | Content | Recovery priority |
|-----------|---------|------------------|
| PostgreSQL | All transactional data: users, offers, payments, audit_logs, invoices | P0 — cannot operate without it |
| Redis | Rate limit counters, session tokens, scheduler locks | P1 — loses only active sessions; rebuilds on restart |
| Qdrant | Vector embeddings for contractors/buildings/conversations | P1 — can be rebuilt by re-embedding from PG data |
| Neo4j | Contractor reputation graph, invite chains | P2 — can be rebuilt from PG data + re-running graph ingestion |
| RabbitMQ | In-flight messages | P2 — at-least-once outbox pattern in PG means messages survive restart |

### PostgreSQL Backup Strategy

**Minimum for city MVP (3 steps):**

1. **Continuous WAL archiving** (if self-hosted): configure `archive_mode=on` and ship WAL segments to S3/object-storage. Recovery point objective (RPO): near-zero.

2. **Daily pg_dump to S3** (easier for Supabase or managed PG):
   ```bash
   pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://groupio-backups/$(date +%Y%m%d).sql.gz
   ```
   The `BackupMissed` alert in `alerts.yml` already fires if `groupio_last_backup_timestamp_seconds` is > 25 hours stale. Wire a backup script to update this gauge after success.

3. **Weekly restore test**: restore the backup to a throwaway container and run `alembic current` + a spot-check query. Untested backups are not backups.

**Target RPO/RTO for city MVP:**
- RPO: 24 hours maximum (daily backup). Accept losing up to one day of new sign-ups in a worst-case scenario.
- RTO: 2-4 hours (restore from backup, apply pending migrations, redeploy).

### Qdrant Backup

```bash
# Snapshot all collections via Qdrant REST API
for collection in contractors buildings knowledge_base conversations; do
  curl -X POST http://localhost:6333/collections/$collection/snapshots
done
# Copy snapshot files from Docker volume to S3
```

The scheduler worker is the right place to trigger this weekly.

### Neo4j Backup

Neo4j Community Edition supports online backup via `neo4j-admin database dump` (requires stopping the DB for a consistent snapshot). For MVP, accept a maintenance window once per week for Neo4j backup.

### Incident Response (Small Team)

```
Tier 1 — automated self-healing (no human needed):
  - API container crash → Docker restart: unless-stopped
  - Redis reconnect → tenacity retry (3 attempts, exponential backoff)
  - LLM primary timeout → automatic fallback to OpenAI GPT-4o (already implemented)
  - DB pool exhausted → requests queue then fail with 503

Tier 2 — on-call response (Slack alert → human):
  - PaymentWebhookFailed critical → check Stripe signature config, check PAYMENT_WEBHOOK_SECRET
  - DatabasePoolExhausted → check for connection leaks, restart worker if needed
  - HighErrorRate 5%+ → check recent deploy, rollback via `docker compose pull api:previous && docker compose up -d`

Tier 3 — incident (all hands):
  - PostgreSQL unreachable → verify volume integrity, restore from backup
  - Data loss scenario → engage Supabase support (if managed) or restore from pg_dump
```

---

## Small-Team Operations

### Operational Complexity Audit

| Component | Who maintains it | Automation level | Risk |
|-----------|----------------|-----------------|------|
| PostgreSQL (Supabase managed) | Supabase | HIGH — PG updates, backups, scaling managed | LOW |
| PostgreSQL (self-hosted) | Your team | LOW — manual backups, PG tuning required | HIGH |
| Redis (self-hosted Docker) | Your team | MEDIUM — Docker restart, AOF persistence | LOW |
| Qdrant (self-hosted Docker) | Your team | MEDIUM — snapshot backups needed | MEDIUM |
| Neo4j Community (self-hosted) | Your team | LOW — no online backup in CE | MEDIUM |
| RabbitMQ (self-hosted Docker) | Your team | MEDIUM — management UI helpful | LOW |
| Prometheus + Grafana | Your team | HIGH — dashboards auto-load | LOW |
| Frontends | Vercel | HIGH — zero-touch deploys | LOW |
| Backend CI/CD | GitHub Actions | HIGH — automated | LOW |

### Recommendation: Maximize Managed Services at MVP

For a small team where agents handle 90%+ of operations, minimize the number of services requiring manual intervention:

1. **Use Supabase managed PostgreSQL** (not self-hosted). Automated backups, PG upgrades, connection pooler, built-in RLS support. The codebase already has the Supabase client path.

2. **Use Qdrant Cloud** for vector search ($25/month) instead of self-hosted Qdrant. Eliminates snapshot management, version upgrades, and memory sizing.

3. **Keep Redis self-hosted** — simple container, AOF persistence, low ops burden. Redis Sentinel for HA is overkill at city-MVP scale.

4. **Keep RabbitMQ self-hosted** — already feature-flagged; management UI at :15672 is sufficient for monitoring queue depth.

5. **Keep Neo4j self-hosted** (Community) — graph data is rebuildable from PG. Acceptable failure mode.

### Runbook Shortcuts for Common Operations

```bash
# Roll back backend to previous image
docker pull groupio-backend:previous
docker compose up -d api

# Check current DB pool usage
curl -H "X-API-Key: $API_KEY" https://api.groupio.co.il/api/v1/health/db

# Force-clear Redis rate limit for a user (e.g., after false positive)
docker exec groupio_redis_1 redis-cli DEL "rl:user:<user_id>"

# Manually trigger outbox dispatch (if dispatcher is behind)
docker restart groupio_outbox_dispatcher_1

# Apply migrations manually
docker exec groupio_api_1 alembic upgrade head

# Export audit logs for a payment dispute
docker exec groupio_postgres_1 psql -U postgres -d groupio \
  -c "SELECT * FROM audit_logs WHERE action LIKE 'payment%' AND created_at > NOW() - INTERVAL '7 days';"

# Check agent worker queue depth
docker exec groupio_redis_1 redis-cli LLEN "agent:queue"
```

### Metrics Dashboard Priority for City Launch

Build (or configure in Grafana) in this order:

1. **Payment health board**: webhook success rate, Stripe callback latency, escrow transition counts. This is the commercial heartbeat.
2. **API error rate by route**: identify which endpoint is breaking, not just that errors exist.
3. **AI agent latency P50/P95**: users notice when agent responses take > 5s.
4. **DB pool saturation**: `db_pool_available_connections` gauge — alert at < 5 (not just < 2).
5. **Queue depth**: RabbitMQ message backlog per queue — notification delay is visible to users.

### Feature Flags as an Ops Safety Net

The codebase already has `ENABLE_RABBITMQ`, `ENABLE_OUTBOX`, `ENABLE_CRM_SYNC` flags. Use these as circuit breakers:

- If RabbitMQ has issues: set `ENABLE_RABBITMQ=false` — notification workers stop consuming but core API flows continue.
- If outbox is causing DB pressure: set `ENABLE_OUTBOX=false` — events stop dispatching but are preserved in `outbox_events` table for later replay.
- Roll-forward by re-enabling the flag — no code deploy needed.

This is a small-team superpower: degraded-mode operation without an emergency deploy.

---

*Research grounded in: `docker/docker-compose.yml`, `monitoring/prometheus.yml`, `monitoring/alerts.yml`, `monitoring/alertmanager.yml`, `src/api/main.py`, `src/databases/postgres.py`, `src/databases/redis_client.py`, `src/databases/vector_store.py`, `src/databases/graph_store.py`, `src/api/routes/websocket.py`, `src/orchestration/graph.py`, `src/workers/`, `src/config/settings.py`, `.github/workflows/deploy.yml`, `design-system/BACKEND.md`, `design-system/DATABASE.md`*
