# Groupio Multi-Agent System — Production Readiness Audit

**Date:** 2026-02-27
**Auditor:** Principal Software Architect / DevOps Lead / Security Engineer
**Scope:** Full codebase, CI/CD, infra, security, observability, data layer
**Verdict:** ❌ NOT PRODUCTION READY — ~51% ready score

---

## STEP 1 — System Discovery

### Architecture Diagram (Text)

```
┌──────────────────────────────────────────────────────────────────┐
│                          Client Layer                             │
│  Next.js 14 Web (Vercel)  │  Next.js 14 Admin (Vercel)  │ Expo  │
│  Tailwind + Zustand        │  Tailwind + Zustand          │ RN    │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTPS + WebSocket
┌──────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend (Python 3.11)               │
│  CORSMiddleware │ SecurityHeadersMiddleware │ RequestLogging      │
│  ───────────────────────────────────────────────────────────     │
│  /api/v1/auth  │ /api/v1/offers  │ /api/v1/contractors          │
│  /api/v1/buildings │ /api/v1/payments │ /api/v1/uploads          │
│  /api/v1/agents │ /api/v1/admin │ /api/v1/webhooks              │
│  /api/v1/ws (WebSocket)  │ /api/v1/message (NO AUTH!)           │
│  /metrics (NO AUTH!)                                             │
└──────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────┐
│                LangGraph Orchestration Layer                       │
│  RouterAgent → SpecialistAgent (conditional edges)               │
│  Support │ Matching │ Pricing │ Vetting │ Outreach               │
│  Analytics │ Architecture │ Payment                              │
└──────────────────────────────────────────────────────────────────┘
         │                   │                    │                │
┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐
│ PostgreSQL  │  │  Redis 7     │  │ Qdrant       │  │ Neo4j 5  │
│ (Supabase   │  │  - Sessions  │  │ - Vector RAG │  │ - Graph  │
│  or local   │  │  - Rate Limit│  │ - Embeddings │  │   Store  │
│  asyncpg)   │  │  - Conv Mem  │  │              │  │          │
└─────────────┘  └──────────────┘  └──────────────┘  └──────────┘
         │                                                    │
┌─────────────┐                                   ┌──────────────┐
│ LLM APIs    │                                   │  WhatsApp    │
│ Anthropic   │                                   │  (STUB ONLY) │
│ OpenAI      │                                   └──────────────┘
└─────────────┘
```

### Tech Stack Breakdown

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend Framework | FastAPI | ≥0.104 |
| Backend Language | Python | 3.11 |
| ASGI Server | Uvicorn | ≥0.24 |
| AI Orchestration | LangGraph | ≥0.0.30 |
| LLM | Anthropic Claude + OpenAI GPT-4o | latest |
| Web Frontend | Next.js 14 (App Router) | 14.x |
| Admin Frontend | Next.js 14 (App Router) | 14.x |
| Mobile | Expo (React Native) | latest |
| UI Library | Tailwind CSS + custom @groupio/ui | – |
| State Management | Zustand | – |
| Primary DB | PostgreSQL 15 (Supabase / asyncpg) | 15 |
| Cache / Session | Redis 7 | 7 |
| Vector DB | Qdrant | ≥1.7 |
| Graph DB | Neo4j 5 Community | 5 |
| File Storage | Supabase Storage / local FS fallback | – |
| Auth | JWT (HS256) + bcrypt + HTTP-only cookies | – |
| Migrations | Alembic | ≥1.13 |
| Monorepo Tool | Turborepo + pnpm | 9 |
| CI/CD | GitHub Actions | – |
| Container | Docker (multi-stage build) | – |
| Frontend Hosting | Vercel | – |
| Backend Hosting | Custom VPS via SSH + Docker Compose | – |
| Mobile Distribution | EAS / Expo | – |
| Observability | Sentry + Prometheus + structlog | – |

### Dependency Map

```
apps/web          → @groupio/types, @groupio/ui, @groupio/api-client, @groupio/utils
apps/admin        → @groupio/types, @groupio/ui, @groupio/utils
apps/mobile       → @groupio/types, @groupio/utils
packages/api-client → @groupio/types
packages/ui       → React (peer)
src (backend)     → PostgreSQL, Redis, Qdrant, Neo4j, Anthropic, OpenAI, LangGraph
```

### Environment Separation Model

| Aspect | Dev | Staging | Prod |
|--------|-----|---------|------|
| DB | Local PostgreSQL (Docker) | Supabase | Supabase |
| Redis | Local Docker | Remote Redis | Remote Redis |
| LLM | Mock keys allowed | Real keys | Real keys |
| Payment | MockPaymentProvider | MockPaymentProvider | ⚠️ MockPaymentProvider (NO real PSP) |
| JWT Secret | Auto-generated (insecure OK) | Validated | Validated |
| CORS | localhost + prod origins | prod origins | prod origins |
| Security Headers | Partial | Full | Full |
| E2E Tests | Manual | Branch deploys | Skipped (continue-on-error) |

---

## STEP 2 — Production Readiness Audit

### 1. Architecture Scalability

**Status: PARTIAL**
**Risk: HIGH**

- **Single Uvicorn worker** — Dockerfile CMD: `uvicorn src.api.main:app --host 0.0.0.0 --port 8000` — no `--workers` flag. Under load, a single event loop handles all LLM calls (which are slow). Should use `--workers 4` or Gunicorn workers behind Uvicorn.
- **GroupioOrchestrator is a singleton** — `_orchestrator = GroupioOrchestrator()` globally. Not thread-safe across multiple processes. With multiple workers, each gets its own in-memory orchestrator (OK), but no distributed state coordination.
- **Redis pool max_connections=20** — set in `redis_client.py:22`. With multiple Uvicorn workers, total connections = 20 × workers. Fine for now, but not documented as a scaling constraint.
- **No horizontal scaling story** — No Kubernetes, no service mesh, no load balancer documented. VPS with Docker Compose is fundamentally single-node.
- **LangGraph workflow compiled at startup** — `self.graph = self._build_graph()` — compilation is cheap but stateless. Fine.
- **Missing**: Auto-scaling policy, load balancer config, CDN for static assets.

---

### 2. Security (Auth, RLS, Secrets, Headers, Rate Limiting)

**Status: PARTIAL (critical gaps)**
**Risk: CRITICAL**

#### CRITICAL: `/api/v1/message` Has No Authentication

```python
# src/api/main.py:171-220
@app.post("/api/v1/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    background_tasks: BackgroundTasks,
) -> MessageResponse:
    # No Depends(get_current_user) — user_id comes from request body
```

Any unauthenticated caller can send a message impersonating any user by providing their `user_id`. The orchestrator then loads that user's profile and processes the request as them. **The rate limit uses the body-supplied `user_id`**, which can be forged.

#### CRITICAL: Payment Webhook Has No Signature Verification

```python
# src/api/routes/payments.py:300-348
@router.post("/webhook")
async def payment_webhook(request: Request) -> dict:
    """...No authentication required — the provider authenticates via
    signature headers which should be verified in production."""
    body = await request.json()
    # NO signature verification implemented
    transaction_id = body.get("transaction_id")
```

An attacker who knows a `transaction_id` (visible in receipts or API responses) can POST to `/api/v1/payments/webhook` with `{"transaction_id": "<real_id>", "event_type": "payment.succeeded"}` and mark any payment as succeeded without paying. **This is an active fraud vector.**

#### HIGH: `/metrics` Endpoint Has No Authentication

```python
# src/api/main.py:274-282
@app.get("/metrics")
async def prometheus_metrics() -> Response:
    """Expose Prometheus metrics."""
```

Exposes agent request counts, error rates, active conversations, token usage, and escalation data publicly. This leaks business intelligence.

#### HIGH: `/webhooks/contractor-update` Has No Authentication

```python
# src/api/routes/webhooks.py:117-148
@router.post("/contractor-update")
async def contractor_update_webhook(payload: dict[str, Any]) -> dict[str, str]:
    # No auth check
```

Anyone can trigger contractor re-vetting by POSTing any `contractor_id`. This could be used to DoS the vetting agent or manipulate contractor scores.

#### HIGH: JWT Secret Regenerated on Every Restart

```python
# src/config/settings.py:85
JWT_SECRET_KEY: str = secrets.token_urlsafe(32)
```

If `JWT_SECRET_KEY` is not set in the environment, a new secret is generated at startup. Every restart invalidates all existing access tokens. In a multi-instance deployment, each pod has a different secret — tokens from one pod won't validate on another.

#### MEDIUM: Rate Limit Has TOCTOU Race Condition

```python
# src/databases/redis_client.py:85-95
current = await self._redis.get(key)
if current is None:
    await self._redis.set(key, 1, ex=window)
    return True
if int(current) >= limit:
    return False
await self._redis.incr(key)
return True
```

Between `get` (line 85) and `incr` (line 94), concurrent requests can all read `None` and all be allowed, bypassing the limit. Should use a Lua script or `INCR` + `EXPIRE` atomically.

#### MEDIUM: WhatsApp Webhook Skips Verification if Secret Not Set

```python
# src/api/routes/webhooks.py:25-35
if not secret:
    logger.warning("WHATSAPP_WEBHOOK_SECRET not set — skipping signature check")
    return True  # Allow in dev
```

If `WHATSAPP_WEBHOOK_SECRET` is not configured in production, the webhook accepts all payloads without verification.

#### LOW: CSP Allows `unsafe-inline` for Styles

```python
# src/api/middleware/security.py:47
"style-src 'self' 'unsafe-inline'; "
```

`unsafe-inline` for styles weakens XSS protection. Should use nonces instead.

#### LOW: CORS Hardcodes Dev Origins in Production Code

```python
# src/api/main.py:104-112
_dev_origins = ["http://localhost:3000", "http://localhost:3001", ...]
for origin in _dev_origins:
    if origin not in cors_origins:
        cors_origins.append(origin)
```

Localhost origins are always appended to CORS. In production, this means `http://localhost:3000` is a valid CORS origin, potentially allowing CSRF from tools running locally.

---

### 3. Error Handling & Observability

**Status: PARTIAL**
**Risk: MEDIUM**

- Global exception handler properly masks details in production (`show_detail = settings.ENVIRONMENT == "development"`) ✅
- Per-agent error catching with transient vs permanent error classification ✅
- **Missing**: Structured error codes (all errors use plain `detail` strings)
- **Missing**: Error correlation ID propagated to Sentry events
- Request IDs are tracked via `X-Request-ID` headers ✅
- `_run_agent_safe` wraps agent failures gracefully ✅
- Background task failures (conversation logging) are silently swallowed with only a warning ⚠️

---

### 4. Logging Strategy

**Status: PARTIAL**
**Risk: MEDIUM**

- PII redaction middleware in `RequestLoggingMiddleware` — emails, phones, Israeli IDs, JWTs, credit cards are redacted ✅
- Request/response metadata logged with timing ✅
- `structlog` is in requirements but not actually used — `logging.basicConfig()` is used instead ⚠️
- No log aggregation configured (no ELK, no Loki, no CloudWatch)
- Log format is plain text, not JSON — makes machine parsing harder
- No log rotation configured in Uvicorn/Docker
- Sentry initialized when `SENTRY_DSN` is set ✅

---

### 5. Monitoring Readiness

**Status: PARTIAL**
**Risk: HIGH**

- Prometheus metrics exposed at `/metrics` (agent requests, durations, token usage, errors, escalations) ✅
- Sentry integration for error tracking ✅
- **No Grafana dashboard** documented or configured
- **No alerting rules** (no Prometheus alert rules, no PagerDuty/OpsGenie)
- **No SLO/SLA definitions**
- **No uptime monitoring** (no external ping/health check service)
- `/api/v1/health` readiness probe checks all 4 backends ✅
- `/api/v1/health/live` liveness probe ✅
- Healthcheck in Dockerfile ✅
- **`/metrics` has no authentication** — anyone can scrape it

---

### 6. Performance Optimization

**Status: NOT READY**
**Risk: HIGH**

- **Single Uvicorn worker** — no `--workers` flag in Dockerfile CMD
- **Full file read into memory** before validation: `data = await file.read()` in `uploads.py:32`. With 20MB max file size and concurrent uploads, this can exhaust memory.
- **No HTTP response caching** — contractor listings, building data, offer listings are fetched fresh on every request
- **RAG retrieval blocks the request** — `self._rag.retrieve()` in `graph.py:399` is called synchronously in the LangGraph graph with `top_k=5`. No caching of embeddings.
- **No CDN** configured for frontend static assets
- **No connection pooling docs** for Supabase (PostgREST uses HTTP, not persistent connections)
- asyncpg pool not configured with explicit `min_size`/`max_size`
- No database query result caching (Redis cache is defined but usage is scattered)

---

### 7. Database Indexing & Constraints

**Status: PARTIAL**
**Risk: HIGH**

Present indexes (from `001_initial_schema.py`):
- `ix_users_email`, `ix_users_phone` ✅
- `ix_buildings_city`, `ix_buildings_region` ✅
- `ix_contractors_verification_status`, `ix_contractors_trust_score` ✅
- `ix_offers_building_id`, `ix_offers_status`, `ix_offers_category` ✅
- `ix_chat_messages_conversation_id`, `ix_chat_messages_user_id` ✅
- `ix_escalations_status`, `ix_escalations_priority`, `ix_escalations_assigned_to` ✅
- `ix_agent_metrics_agent_name`, `ix_agent_metrics_recorded_at` ✅

**Missing indexes (critical for query performance):**
- `building_residents.building_id` — used in `is_user_in_building()` join queries, no index
- `building_residents.user_id` — no index
- `offer_participants.offer_id` — frequently queried, no index
- `offer_participants.user_id` — no index
- `contractor_reviews.contractor_id` — no index
- `escalation_messages.escalation_id` — no index

**Schema issues:**
- All PKs use `sa.Column('id', sa.String(36))` instead of `sa.Column('id', postgresql.UUID())` — no DB-level UUID format validation
- `buildings.resident_count`, `buildings.active_offers`, `buildings.completed_offers` are denormalized counters with no trigger/constraint to keep them in sync
- No `CHECK` constraints on enum-like string columns (e.g., `role`, `status`, `verification_status`)
- `chat_messages` and `agent_metrics` tables will grow unboundedly — no partition strategy or TTL

---

### 8. CI/CD Robustness

**Status: PARTIAL**
**Risk: HIGH**

**Strengths:**
- CI runs: backend lint (Ruff), frontend lint (ESLint), TypeScript type check, Trivy security scan, GitLeaks secret scan, backend unit + integration tests, frontend tests, Docker build ✅
- Pinned SHA hashes for all actions in `ci.yml` ✅
- Concurrency groups with cancel-in-progress ✅
- CI must pass before deploy ✅

**Weaknesses:**
- **E2E tests are `continue-on-error: true`** — failures don't block merge or deploy
- **E2E only runs on `main`/`dev` branches**, not on PRs — regressions reach branches before detection
- **`deploy.yml` uses unpinned actions** (`actions/checkout@v4` not pinned to SHA)
- **`pnpm install` without `--frozen-lockfile`** in deploy job — could install different deps than tested in CI
- **Coverage threshold is 45%** — far too low for production (`addopts = "--cov-fail-under=45"`)
- **No smoke test step after deploy** — deploy is declared success before verifying the new version is healthy
- **Mypy is installed but never run in CI** — no mypy job in `ci.yml`
- DB migrations run after backend deploy (correct order) but there's no rollback migration step on failure

---

### 9. Deployment Reliability

**Status: PARTIAL**
**Risk: HIGH**

- Backend: Docker Compose on VPS via SSH `docker compose pull backend && docker compose up -d backend` — this replaces the running container with zero downtime attempt but no health check gate
- **No blue/green or canary deploy** — old container is replaced immediately
- **`docker system prune -f`** runs after deploy — could remove images still needed by fallback
- **Source code is volume-mounted in `docker-compose.yml`**: `- ../src:/app/src` with `--reload` — this is dev mode; if the production server uses the same compose file, it's serving unbuilt code
- No deploy verification: workflow reports "success" whether or not the new container is healthy
- Vercel deploys are atomic and rollback-capable ✅ (for frontends)

---

### 10. Rollback Strategy

**Status: NOT READY**
**Risk: HIGH**

- **No documented rollback procedure**
- Backend: Would require manually running `docker compose up -d --no-deps backend` with a previous image tag — not scripted
- Database: Alembic `downgrade` scripts exist (all migrations have `downgrade()`) ✅ but no automation
- Frontend: Vercel has instant rollback via dashboard ✅
- **No previous-image tagging strategy** — `latest` tag is overwritten on every deploy; previous SHA tags exist in registry but no tooling to revert

---

### 11. Feature Flag Strategy

**Status: PARTIAL**
**Risk: LOW**

- Feature flags defined in settings:
  ```python
  ENABLE_WEB_SEARCH: bool = True
  ENABLE_GRAPH_QUERIES: bool = True
  ENABLE_PREDICTIVE_MODELS: bool = False
  ```
- Frontend feature flags in `.env.example`:
  ```
  NEXT_PUBLIC_ENABLE_REALTIME=true
  NEXT_PUBLIC_ENABLE_CHAT=true
  NEXT_PUBLIC_ENABLE_ANALYTICS=false
  ```
- **No runtime feature flag system** (no LaunchDarkly, no database-driven flags)
- Flags require full redeploy to change
- No per-user or per-building feature targeting

---

### 12. Testing Coverage

**Status: PARTIAL**
**Risk: HIGH**

Backend:
- Unit tests: 30 test files covering all agents, routes, services, utilities ✅
- Integration tests: 7 files (API routes, payment, upload, WebSocket, E2E) ✅
- Coverage threshold: **45%** — critically low
- Mypy is available but **not run in CI**
- No contract tests between backend API and frontend client

Frontend:
- Unit tests via Vitest: web app (11 files), admin (8 files), mobile (3 files) ✅
- E2E: Playwright (3 spec files: resident-flow, contractor-flow, architecture-flow)
- E2E failures are **non-blocking** (`continue-on-error: true`)
- No visual regression tests
- No load/stress tests

---

### 13. Code Quality & Duplication

**Status: PARTIAL**
**Risk: MEDIUM**

- Ruff linting enforced in CI ✅
- Prettier enforced ✅
- **Duplicate model files**: `src/models/contractor.py` AND `src/models/contractors.py`, `src/models/offer.py` AND `src/models/offers.py`, `src/models/residents.py` — likely dead code or merge artifacts
- **Settings has duplicate field definitions**:
  ```python
  # src/config/settings.py:65-69
  SENTIMENT_ESCALATION_THRESHOLD: float = -0.5
  MAX_SUPPORT_ATTEMPTS_BEFORE_ESCALATION: int = 3
  HUMAN_ESCALATION_ENABLED: bool = True
  SENTIMENT_ESCALATION_THRESHOLD: float = -0.5  # DUPLICATE
  MAX_SUPPORT_ATTEMPTS_BEFORE_ESCALATION: int = 3  # DUPLICATE
  ```
- Login logic duplicated across `login()` and `login_json()` in `auth.py` — same validation logic copy-pasted
- `PostgresClient` has dual Supabase/asyncpg path — every method must implement both branches, leading to maintenance burden
- Cursor rules in `.cursor/` reference token optimization — indicates context window issues during development

---

### 14. Technical Debt

**Status: PARTIAL**
**Risk: MEDIUM**

- **WhatsApp sending is a stub** — `_send_whatsapp_reply()` only logs; no actual API call
- **Payment provider is mock-only** — `MockPaymentProvider` is the only implementation; no Stripe/PayPlus
- **`validate_sql_query()`** exists but SQL injection is still possible in `execute_query()` calls in admin payment routes (raw SQL strings built and passed directly)
- `tasks/todo.md` and `tasks/lessons.md` contain in-progress work items indicating unfinished features
- Multiple `.cursor/` configuration files suggest AI-assisted development that may have introduced inconsistencies
- `aiosmtplib` is in `requirements.txt` and used in `services/email.py` but **missing from `requirements-prod.txt`** — production email will fail with `ImportError`

---

### 15. Data Validation

**Status: GOOD**
**Risk: LOW**

- Pydantic v2 models for all API request/response schemas ✅
- `validate_message_request()` validates user_id, message, channel before processing ✅
- `sanitize_input()` strips control characters, truncates to 5000 chars ✅
- Phone validation with Israeli format regex ✅
- File type and size validation in `StorageService.validate_file()` ✅
- SQL query validation with keyword blocklist ✅
- `Field(..., min_length=..., max_length=...)` constraints on Pydantic models ✅
- Password minimum length enforced at 8 characters ✅

---

### 16. Edge Cases & Failure Scenarios

**Status: PARTIAL**
**Risk: HIGH**

- DB connection failure returns 503 (handled in `_is_db_connection_error()`) ✅
- All agent errors caught by `_run_agent_safe()` ✅
- Redis retry with exponential backoff (tenacity) ✅
- Lifespan cleanup closes DB/Redis/Graph connections on shutdown ✅
- **No circuit breaker** for LLM API calls — if Anthropic is down, all message requests will queue/fail
- **No LLM fallback logic** — `FALLBACK_MODEL` is defined but no actual failover code in `llm_client.py`
- **No timeout on LLM calls** — a slow Claude response will block the async worker indefinitely
- **No queue for background jobs** — `offer_lifecycle.py` worker uses polling, not a proper job queue (no retry, no dead-letter queue)
- **Orchestrator singleton** — if orchestrator crashes, it's re-initialized silently but in-flight conversations are lost
- **No handling of Qdrant/Neo4j being down** — errors are caught but no degraded mode for RAG queries

---

### 17. API Contract Stability

**Status: PARTIAL**
**Risk: MEDIUM**

- OpenAPI docs auto-generated by FastAPI ✅
- **No API versioning enforcement** — all routes under `/api/v1/` but nothing prevents breaking changes
- **No API client generation** from OpenAPI spec — `packages/api-client/src/client.ts` is hand-written and can drift from backend
- `@groupio/types` package provides shared types but requires manual sync
- No API changelog or deprecation policy
- Response schema for `send_message` endpoint: `response` field is `dict[str, Any]` — no strict typing

---

### 18. Secrets Management

**Status: PARTIAL**
**Risk: HIGH**

- GitHub Secrets used for deployment credentials ✅
- `.gitignore` excludes `.env` files ✅
- GitLeaks scanning in CI ✅
- `.gitleaks.toml` configured ✅
- **No secrets rotation mechanism**
- **No Vault/AWS Secrets Manager/GCP Secret Manager** — secrets live in environment variables only
- **`JWT_SECRET_KEY` defaults to `secrets.token_urlsafe(32)` at startup** — if env var not set, a new secret is generated per-process-start (sessions invalidated on every restart/scale event)
- API keys stored in list in env var (`API_KEYS: list[str]`) — no per-service API key scoping
- `PAYMENT_PROVIDER` defaults to `"mock"` — no alert if forgotten in production

---

### 19. CORS & Headers

**Status: GOOD (minor issues)**
**Risk: LOW**

- HSTS with preload in production ✅
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: DENY` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Permissions-Policy` restricts camera/mic/geo/payment ✅
- `Cache-Control: no-store` on API responses ✅
- CSP: `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` ✅
- **Issue**: `style-src 'self' 'unsafe-inline'` weakens XSS protection
- **Issue**: localhost CORS origins hardcoded in production code path (not just dev)
- Refresh token cookie: `httponly=True, secure=True, samesite="lax"` ✅

---

### 20. GDPR / Privacy Readiness

**Status: PARTIAL**
**Risk: HIGH**

- PII redaction in logs (emails, phones, IDs, JWTs, credit cards) ✅
- `src/utils/pii.py` compiled regex patterns ✅
- **No right-to-erasure endpoint** — no `DELETE /api/v1/users/me` implementation
- **No data export endpoint** (Art. 20 GDPR — data portability)
- **No privacy policy** documented in code/API
- **No cookie consent mechanism** documented
- User data (chat history, building data) has no retention policy
- `chat_messages` table grows unboundedly
- Israeli user data governed by PDPL (Privacy Protection Law) — likely needs a DPA

---

## STEP 3 — Gap Analysis

| Area | Current State | Missing | Risk | Priority | Est. Effort |
|------|--------------|---------|------|----------|-------------|
| Payment webhook auth | No signature verification | HMAC-SHA256 signature check from PSP | CRITICAL | P0 | S |
| Real payment provider | MockPaymentProvider only | Stripe or PayPlus integration | CRITICAL | P0 | XL |
| `/api/v1/message` auth | No authentication | `Depends(get_current_user)` | CRITICAL | P0 | S |
| JWT secret stability | Regenerated on restart if not set | Force-require env var; document rotation | CRITICAL | P0 | S |
| Rate limiting race | TOCTOU in Redis check | Lua script / atomic INCR+EXPIRE | HIGH | P1 | S |
| Unauthenticated `/metrics` | Public Prometheus endpoint | Bearer token or IP allowlist | HIGH | P1 | S |
| Unauthenticated contractor webhook | No auth on POST /webhooks/contractor-update | API key validation | HIGH | P1 | S |
| WhatsApp sending stub | Logs only, no actual send | WhatsApp Business API integration | HIGH | P1 | L |
| Invoice HTML XSS | Description interpolated unsanitized | HTML escape all user-controlled values | HIGH | P1 | S |
| `aiosmtplib` missing from prod deps | Will ImportError in production | Add to `requirements-prod.txt` | HIGH | P0 | XS |
| Single Uvicorn worker | No `--workers` flag | `--workers 4` or Gunicorn in Dockerfile | HIGH | P1 | XS |
| CORS localhost in prod | localhost added unconditionally | Conditionally add only in dev | MEDIUM | P2 | XS |
| E2E `continue-on-error` | Failures don't block deploy | Remove `continue-on-error: true` | MEDIUM | P2 | XS |
| Missing FK indexes | 6 FK columns without indexes | Alembic migration adding indexes | HIGH | P1 | S |
| Duplicate model files | contractor.py + contractors.py, etc. | Consolidate and remove dead code | MEDIUM | P3 | M |
| Duplicate settings fields | 2 fields defined twice | Remove duplicates | LOW | P3 | XS |
| No rollback procedure | No documented process | Scripted rollback + image tagging | HIGH | P1 | M |
| No smoke test post-deploy | Deploy declared success blindly | Health check gate after deploy | MEDIUM | P2 | S |
| Deploy uses unfrozen `pnpm install` | Potential dep drift | Use `--frozen-lockfile` | MEDIUM | P2 | XS |
| Mypy not in CI | Type errors undetected | Add mypy job to CI | MEDIUM | P2 | S |
| Coverage threshold 45% | Too low | Raise to ≥70% over time | MEDIUM | P2 | L |
| No circuit breaker for LLM | LLM slowness blocks workers | Add timeout + fallback | HIGH | P1 | M |
| No LLM failover | FALLBACK_MODEL defined but unused | Implement retry with fallback model | HIGH | P1 | M |
| Redis unauthenticated | No password on Redis | `requirepass` in production | MEDIUM | P1 | S |
| No GDPR erasure | No DELETE /users/me | Data deletion endpoint | HIGH | P1 | M |
| No backup strategy | No automated backups | PostgreSQL pg_dump to S3, Redis RDB | HIGH | P1 | M |
| Unbounded `chat_messages` table | Will grow forever | Partition by month or TTL cleanup job | MEDIUM | P2 | M |
| String(36) PKs not UUID type | No DB validation | Migrate to `postgresql.UUID()` (optional) | LOW | P3 | L |
| Denormalized building counters | No sync mechanism | Triggers or application-level consistency | MEDIUM | P2 | M |
| No alerting rules | No Prometheus alerts | AlertManager rules + PagerDuty | HIGH | P1 | M |
| Unpinned deploy.yml actions | Supply chain risk | Pin all actions to SHA in deploy.yml | MEDIUM | P2 | S |
| structlog not used | Plain logging despite dep | Wire structlog for JSON logs | LOW | P3 | M |

---

## STEP 4 — Production Action Plan

### Phase 1 — Critical Blockers (Fix Before Any Live Traffic)

#### 1.1 Add Authentication to `/api/v1/message`

**File:** `src/api/main.py:171`
**Change:**
```python
from src.api.middleware.auth import get_current_user
from src.models.user import UserInDB

@app.post("/api/v1/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),  # ADD THIS
) -> MessageResponse:
    # Replace request.user_id with current_user.id for rate limiting and orchestration
```
**Effort:** S | **Impact:** Critical security fix

#### 1.2 Implement Payment Webhook Signature Verification

**File:** `src/api/routes/payments.py:300`
**Change:** Add HMAC-SHA256 verification using the PSP's signing secret (same pattern as WhatsApp webhook in `webhooks.py:19-35`).
```python
import hashlib, hmac
PAYMENT_WEBHOOK_SECRET = settings.PAYMENT_WEBHOOK_SECRET  # Add to Settings

@router.post("/webhook")
async def payment_webhook(
    request: Request,
    x_payment_signature: str | None = Header(None),
) -> dict:
    raw_body = await request.body()
    # Verify HMAC
    expected = "sha256=" + hmac.new(
        PAYMENT_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, x_payment_signature or ""):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")
    body = json.loads(raw_body)
    ...
```
**DB migration:** None
**Effort:** S | **Impact:** Blocks fraud vector

#### 1.3 Fix `aiosmtplib` Missing from Production Requirements

**File:** `requirements-prod.txt`
**Change:** Add `aiosmtplib>=3.0.0` to the HTTP & Networking section
**Effort:** XS | **Impact:** Email service will crash in production without this

#### 1.4 Add Real Payment Provider

**Files:**
- `src/services/payment.py` — Implement `StripePaymentProvider` or `PayPlusPaymentProvider` class
- `src/config/settings.py` — Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (or PayPlus equivalents)
- `requirements-prod.txt` — Add `stripe>=7.0.0`

The `get_payment_provider()` factory already has a switch on `PAYMENT_PROVIDER` env var — just add the real implementation.
**Effort:** XL | **Impact:** No real money can be processed without this

#### 1.5 Require JWT_SECRET_KEY in Production (No Auto-Generation)

**File:** `src/config/settings.py`
**Change:** Remove the default `secrets.token_urlsafe(32)`. Make the field required with no default (or fail loudly if not set):
```python
JWT_SECRET_KEY: str = ""  # Will fail validator if empty in prod

@model_validator(mode="after")
def _validate_production_config(self) -> "Settings":
    if self.ENVIRONMENT != "development" and not self.JWT_SECRET_KEY:
        raise ValueError("JWT_SECRET_KEY must be explicitly set in non-development environments")
```
**Effort:** S | **Impact:** Prevents session invalidation on restart

#### 1.6 Add Authentication to `/metrics` and `/webhooks/contractor-update`

**File:** `src/api/main.py:274`, `src/api/routes/webhooks.py:117`
**Change:**
```python
# /metrics: add IP allowlist middleware or Bearer token
@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics(
    api_key: str = Depends(verify_api_key),  # or IP check
) -> Response: ...

# contractor-update webhook: add API key validation
@router.post("/contractor-update")
async def contractor_update_webhook(
    payload: dict[str, Any],
    api_key: str = Depends(verify_api_key),
) -> dict[str, str]: ...
```
**Effort:** S | **Impact:** Prevents data leakage and unauthorized vetting triggers

---

### Phase 2 — Stability & Reliability

#### 2.1 Fix Rate Limiting Race Condition

**File:** `src/databases/redis_client.py:79-95`
**Change:** Use atomic Lua script:
```python
_RATE_LIMIT_SCRIPT = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local count = redis.call('INCR', key)
if count == 1 then
    redis.call('EXPIRE', key, window)
end
return count
"""
async def check_rate_limit(self, user_id: str, limit: int = 60, window: int = 60) -> bool:
    key = f"rate:{user_id}"
    count = await self._redis.eval(_RATE_LIMIT_SCRIPT, 1, key, limit, window)
    return int(count) <= limit
```
**Effort:** S

#### 2.2 Add LLM Timeout and Fallback

**File:** `src/utils/llm_client.py`
**Change:** Wrap all LLM calls with `asyncio.wait_for(timeout=30)` and fallback to `FALLBACK_MODEL` on timeout or rate limit error.
**Effort:** M

#### 2.3 Add Smoke Test After Deploy

**File:** `.github/workflows/deploy.yml`
**Change:** After `docker compose up -d backend`, add a step:
```yaml
- name: Verify deployment
  run: |
    sleep 10
    curl -f https://api.groupio.co.il/api/v1/health/live || (echo "Deploy health check failed" && exit 1)
```
**Effort:** S

#### 2.4 Add Missing Database Indexes

**File:** New Alembic migration `alembic/versions/005_missing_indexes.py`
```python
def upgrade():
    op.create_index('ix_building_residents_building_id', 'building_residents', ['building_id'])
    op.create_index('ix_building_residents_user_id', 'building_residents', ['user_id'])
    op.create_index('ix_offer_participants_offer_id', 'offer_participants', ['offer_id'])
    op.create_index('ix_offer_participants_user_id', 'offer_participants', ['user_id'])
    op.create_index('ix_contractor_reviews_contractor_id', 'contractor_reviews', ['contractor_id'])
    op.create_index('ix_escalation_messages_escalation_id', 'escalation_messages', ['escalation_id'])
```
**Effort:** S

#### 2.5 Add Rollback Script

**File:** `scripts/rollback.sh` (new)
**Change:** Script that:
1. Accepts a Docker image tag as argument
2. SSHes to the VPS
3. Runs `docker compose stop backend && docker compose up -d --no-deps backend` with the previous tag
**Effort:** M

#### 2.6 Add Redis Authentication

**File:** `docker/docker-compose.yml`
**Change:**
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --requirepass ${REDIS_PASSWORD:?Set REDIS_PASSWORD in .env}
```
**File:** `src/config/settings.py` — update `REDIS_URL` to include password
**Effort:** S

#### 2.7 Fix CORS: Don't Add Localhost Origins in Non-Dev

**File:** `src/api/main.py:103-112`
**Change:**
```python
cors_origins = list(settings.CORS_ORIGINS)
if settings.ENVIRONMENT == "development":
    for origin in _dev_origins:
        if origin not in cors_origins:
            cors_origins.append(origin)
```
**Effort:** XS

#### 2.8 Add Database Backup Automation

**Infra change:** Add cron job or GitHub Actions scheduled workflow for `pg_dump` → S3.
**Effort:** M

---

### Phase 3 — Performance & Scale

#### 3.1 Multi-Worker Uvicorn

**File:** `docker/Dockerfile`
**Change:**
```dockerfile
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```
Note: The singleton orchestrator must be verified to be fork-safe.
**Effort:** S

#### 3.2 Streaming File Uploads (Don't Read Entire File into Memory)

**File:** `src/api/routes/uploads.py`
**Change:** Use chunked streaming instead of `await file.read()`. Validate size from `Content-Length` header before reading.
**Effort:** M

#### 3.3 Add Response Caching for Read-Heavy Endpoints

**Files:** `src/api/routes/contractors.py`, `src/api/routes/offers.py`
**Change:** Use Redis `cache_get`/`cache_set` for contractor listings (TTL=300s) and building data (TTL=60s).
**Effort:** M

#### 3.4 Make E2E Tests Blocking

**File:** `.github/workflows/ci.yml:345`
**Change:** Remove `continue-on-error: true` from E2E test step. Fix any flaky tests first.
**Effort:** S (after tests are stabilized)

#### 3.5 Increase Coverage Threshold

**File:** `pyproject.toml:67`
**Change:** `addopts = "--cov-fail-under=70"` (raise incrementally to ≥70%)
**Effort:** L (writing the tests)

#### 3.6 Add `chat_messages` Retention Policy

**File:** New migration or scheduler task
**Change:** Monthly partition on `chat_messages.created_at` or a scheduled job that deletes messages older than 90 days for closed conversations.
**Effort:** M

---

### Phase 4 — Optimization & Hardening

#### 4.1 Implement Right-to-Erasure Endpoint

**File:** `src/api/routes/auth.py`
**Change:** `DELETE /api/v1/auth/me` — anonymizes or deletes user data including chat history, profile, building association.
**Effort:** M

#### 4.2 Add Prometheus Alerting Rules

**File:** New `monitoring/alerts.yml`
```yaml
- alert: HighErrorRate
  expr: rate(errors_total[5m]) > 0.1
  for: 2m
- alert: LLMLatencyHigh
  expr: histogram_quantile(0.95, agent_duration_seconds_bucket) > 30
  for: 5m
- alert: EscalationSurge
  expr: rate(escalations_total[10m]) > 5
  for: 5m
```
**Effort:** M

#### 4.3 Pin Deploy Workflow Actions to SHA

**File:** `.github/workflows/deploy.yml`
**Change:** Replace all `@v4`/`@v3` with specific SHA commits (same pattern as `ci.yml`)
**Effort:** S

#### 4.4 Wire Structlog for JSON Logging

**File:** `src/utils/monitoring.py`, `src/api/main.py`
**Change:** Replace `logging.basicConfig()` with structlog's JSON renderer for machine-parseable logs
**Effort:** M

#### 4.5 Consolidate Duplicate Model Files

**Files:** `src/models/contractor.py` vs `src/models/contractors.py`, `src/models/offer.py` vs `src/models/offers.py`
**Change:** Remove unused file, update all imports
**Effort:** M

#### 4.6 Implement WhatsApp Sending

**File:** `src/api/routes/webhooks.py:174-176`
**Change:** Implement `_send_whatsapp_reply()` using WhatsApp Business API (`httpx` POST to `graph.facebook.com/v17.0/{PHONE_ID}/messages`)
**Effort:** L

---

## STEP 5 — Risk Heatmap

```
                        IMPACT
              Low         Medium        High       Critical
           ┌──────────┬──────────┬──────────┬──────────┐
  Critical │          │          │          │ Payment  │
  (almost  │          │          │          │ webhook  │
  certain  │          │          │          │ no sig   │
  to hit)  │          │          │          │ /message │
           │          │          │          │ no auth  │
           ├──────────┼──────────┼──────────┼──────────┤
  High     │          │          │ Single   │ Mock-only│
  (likely  │          │          │ worker   │ payment  │
  in prod) │          │          │ JWT regen│ provider │
           │          │          │ /metrics │          │
           │          │          │ no auth  │          │
           ├──────────┼──────────┼──────────┼──────────┤
  Medium   │ Duplicate│ No Lua   │ Missing  │          │
  (could   │ model    │ rate lim │ FK index │          │
  happen)  │ files    │          │ No LLM   │          │
           │          │          │ timeout  │          │
           ├──────────┼──────────┼──────────┼──────────┤
  Low      │ structlog│ Coverage │ No GDPR  │          │
  (edge    │ unused   │ 45%      │ erasure  │          │
  case)    │ String   │          │ No backup│          │
           │ UUIDs    │          │          │          │
           └──────────┴──────────┴──────────┴──────────┘
```

### Security Risks
| Risk | Likelihood | Impact | Evidence |
|------|-----------|--------|----------|
| Fake payment webhook — mark payments succeeded | HIGH | CRITICAL | `payments.py:300` — no sig verification |
| User impersonation via `/message` | HIGH | CRITICAL | `main.py:171` — no auth dep |
| Contractor data manipulation via unauthed webhook | MEDIUM | HIGH | `webhooks.py:117` — no auth |
| Business data exposure via `/metrics` | MEDIUM | HIGH | `main.py:274` — public |
| XSS in invoice PDF via description field | LOW | MEDIUM | `payments.py:418` — unescaped interpolation |

### Downtime Risks
| Risk | Likelihood | Impact |
|------|-----------|--------|
| Email service crash — `aiosmtplib` missing from prod deps | CERTAIN | HIGH |
| All sessions invalidated on backend restart | HIGH | HIGH |
| Single Uvicorn worker exhausted by LLM calls | HIGH | HIGH |
| LLM provider timeout blocks all requests | MEDIUM | CRITICAL |
| Redis/Qdrant/Neo4j unavailability — no graceful degradation | MEDIUM | HIGH |

### Data Corruption Risks
| Risk | Likelihood | Impact |
|------|-----------|--------|
| Building counter fields out of sync | HIGH | MEDIUM |
| Payment marked succeeded without verification | MEDIUM | CRITICAL |
| Chat messages table grows unboundedly | CERTAIN | MEDIUM |

### Scalability Risks
| Risk | Likelihood | Impact |
|------|-----------|--------|
| Single VPS node — no horizontal scaling | HIGH | HIGH |
| No CDN for frontend assets | MEDIUM | MEDIUM |
| Missing FK indexes causing slow queries | CERTAIN | MEDIUM |

---

## STEP 6 — Launch Decision

### ❌ NO — This system is NOT production ready.

**Readiness Score: 51%**

### Blockers (must fix before any live user traffic):

1. **`/api/v1/message` has no authentication** — any anonymous caller can impersonate any user
2. **Payment webhook has no signature verification** — active fraud vector; fake webhooks can mark payments as succeeded
3. **No real payment provider** — money cannot be collected (only mock)
4. **`aiosmtplib` missing from `requirements-prod.txt`** — email service will crash with `ImportError` in production
5. **JWT secret auto-generated on startup** — all sessions are invalidated on every restart/deploy

### What IS production-quality:
- Multi-agent LangGraph orchestration architecture ✅
- Security headers middleware (HSTS, CSP, X-Frame-Options) ✅
- bcrypt password hashing + JWT refresh token rotation ✅
- PII redaction in logs ✅
- Prometheus + Sentry integration (wired but not fully configured) ✅
- Alembic migration management ✅
- Multi-stage Docker build with non-root user ✅
- CI with pinned SHA actions, security scanning (Trivy + GitLeaks) ✅
- Input validation and sanitization ✅
- Rate limiting (with race condition caveat) ✅
- File type/size validation ✅
- HTTP-only refresh token cookies ✅
- Comprehensive test suite structure (even if coverage is low) ✅

---

## STEP 7 — Architecture & DevOps Recommendations

### Architecture Improvements

1. **Add a proper job queue** — Replace the polling `offer_lifecycle.py` worker with Celery + Redis or ARQ. This enables retries, dead-letter queues, and distributed processing of background AI tasks.

2. **LLM circuit breaker** — Add `circuitbreaker` or a custom implementation around all `llm_client.py` calls. Fall back to `FALLBACK_MODEL`, then return a canned response if both are down.

3. **Separate admin API** — The admin routes (`/api/v1/admin/*`) should run in a separate FastAPI app or at least behind a separate subdomain with stricter IP allowlisting.

4. **Read replicas** — Once traffic grows, Supabase supports read replicas. Use them for analytics and reporting queries.

5. **Distributed rate limiting with Redis Cluster** — Current Redis single-node is a SPOF for rate limiting.

### Cost Optimization Opportunities

1. **LLM caching** — Cache identical RAG queries and similar intent classifications in Redis (TTL=10 minutes). Could reduce LLM costs by 20-30%.

2. **Embedding caching** — Store computed embeddings per document in Redis. Re-embedding identical documents wastes money.

3. **Qdrant vs. pgvector** — Since Supabase already provides pgvector, consolidating vector storage into Supabase eliminates a separate Qdrant instance cost.

4. **Neo4j Community vs. Cloud** — Neo4j Community is free but not HA. Evaluate if the graph features justify the operational complexity vs. PostgreSQL recursive CTEs.

5. **Vercel preview deployments** — Current setup deploys to Vercel on `dev` pushes. Restrict preview URLs to be non-indexable and not receiving production traffic.

### DevOps Improvements

1. **Use Docker Compose v2 with profiles** — Separate `development` and `production` profiles. The `--reload` and source volume mount should be dev-only:
   ```yaml
   services:
     api:
       profiles: ["dev"]
       command: uvicorn ... --reload
       volumes: [../src:/app/src]
     api-prod:
       profiles: ["production"]
       command: uvicorn ... --workers 4
   ```

2. **Add GitHub Environments with approval gates** — Require manual approval before production deploys in `deploy.yml`.

3. **Infrastructure as Code** — Move VPS configuration to Terraform or Pulumi. Current state is undocumented manual setup.

4. **Add `--frozen-lockfile` to all deploy `pnpm install` calls** — Prevents accidental package drift between test and deploy environments.

### Monitoring Stack (Recommended)

```
Logs:      structlog (JSON) → Loki → Grafana
Metrics:   Prometheus → Grafana (dashboards per agent, per user journey)
Traces:    OpenTelemetry → Jaeger or Tempo (trace LangGraph agent chains)
Errors:    Sentry (already wired, add alert rules)
Uptime:    UptimeRobot or BetterUptime pinging /api/v1/health/live
Alerting:  AlertManager → PagerDuty → on-call rotation
```

**Priority Grafana dashboards to build:**
1. Agent performance: request rate, p95 latency, error rate, escalation rate by agent
2. LLM cost dashboard: tokens used by model, cost per user journey
3. Business dashboard: offer creation rate, contractor matching rate, payment conversion
4. Infrastructure: Redis memory, Postgres connection pool, Qdrant collection sizes

---

*End of Production Readiness Audit — Groupio Multi-Agent System*
*Generated: 2026-02-27*
