# Groupio Backend Architecture — Design Reference

> Companion to: `design-system/MASTER.md`, `design-system/DATABASE.md`, `design-system/AGENTS.md`
> Source: `src/`, `docker/`, `monitoring/`, `tests/`, `.github/workflows/`

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTS                                 │
│  apps/web (Next.js)  │  apps/admin (Next.js)  │  apps/mobile│
│       :3000          │        :3001           │   (Expo)    │
└──────────┬───────────┴────────────┬───────────┴─────────────┘
           │          REST / WS           │
           ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY                               │
│  FastAPI (src/api/main.py) — :8000                          │
│  ┌──────────┬──────────┬──────────┬──────────┐             │
│  │   CORS   │ Security │ Logging  │ Rate     │             │
│  │ Middleware│ Headers  │Middleware│ Limiting │             │
│  └──────────┴──────────┴──────────┴──────────┘             │
│  ┌──────────────────────────────────────────┐               │
│  │              API Routes (17 modules)      │              │
│  │  auth │ offers │ contractors │ buildings  │              │
│  │  payments │ escalations │ agents │ admin  │              │
│  │  uploads │ webhooks │ onboarding │ etc.   │              │
│  └──────────────────────────────────────────┘               │
└─────────┬──────────┬──────────┬──────────┬──────────────────┘
          │          │          │          │
          ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│PostgreSQL│ │  Redis   │ │  Qdrant  │ │  Neo4j   │
│ (Supabase│ │  Cache   │ │  Vector  │ │  Graph   │
│ or local)│ │  Queue   │ │    DB    │ │    DB    │
│   :5432  │ │  :6379   │ │  :6333   │ │  :7687   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
                │
                ▼
┌──────────────────────┐     ┌──────────────────────┐
│   Agent Worker       │     │   Scheduler          │
│ (Redis queue BRPOP)  │     │ (Redis-based cron)   │
│ RouterAgent entry    │     │ Hourly/Daily/Weekly   │
└──────────────────────┘     └──────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────┐
│              LangGraph Orchestration              │
│  Router → 10 Specialist Agents → Response/Handoff│
│  (Anthropic Claude / OpenAI GPT-4o)              │
└──────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────┐
│           External Services                       │
│  Stripe │ WhatsApp Cloud │ SMTP │ FCM │ data.gov │
│         │     API        │      │     │   .il    │
└──────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version / Notes |
|-------|-----------|-----------------|
| **Runtime** | Python 3.11+ | Async throughout |
| **Framework** | FastAPI | REST + WebSocket |
| **Server** | Uvicorn | 4 workers in production |
| **Primary DB** | PostgreSQL 15 | Via Supabase or local asyncpg |
| **Cache / Queue** | Redis 7 | AOF, LRU, password-protected |
| **Vector DB** | Qdrant | Collections: contractors, buildings, knowledge_base, conversations |
| **Graph DB** | Neo4j 5 Community | APOC plugin, contractor reputation, viral invites |
| **LLM (primary)** | Anthropic Claude claude-sonnet-4-20250514 | Via anthropic SDK |
| **LLM (fallback)** | OpenAI GPT-4o | Via openai SDK |
| **Embeddings** | OpenAI text-embedding-3-large | 1536 dimensions |
| **Orchestration** | LangGraph | StateGraph with 11 agents |
| **Payments** | Stripe | PaymentIntents, webhooks |
| **Messaging** | WhatsApp Cloud API | Via Meta Business API |
| **Push** | Firebase Cloud Messaging | FCM via google-auth |
| **Email** | SMTP | Via aiosmtplib |
| **Storage** | Supabase Storage | Buckets: architecture-plans, contractor-docs, avatars, invoices |
| **Monitoring** | Prometheus + Alertmanager | prometheus-fastapi-instrumentator |
| **Data enrichment** | data.gov.il CKAN API | Address normalization, municipality lookup |
| **Migrations** | Alembic | 21 versions |
| **Testing** | pytest + Playwright | 80% coverage target |
| **Linting** | Ruff | Line length 120 |
| **Types** | Mypy | Strict off, per-module overrides |
| **CI/CD** | GitHub Actions | 8 workflows |
| **Deploy** | Docker + Vercel | Backend Docker, frontend Vercel |

---

## 3. API Layer

### 3.1 Entry Point — `src/api/main.py`

| Component | Detail |
|-----------|--------|
| App | `FastAPI(title="Groupio Agent API", version="1.0.0")` |
| Lifespan | Async context manager: startup → `init_monitoring()`, ensure vector collections; shutdown → close DB/Redis/Graph |
| Base path | All routes under `/api/v1` |

### 3.2 Middleware Stack (outer → inner)

| Order | Middleware | File | Purpose |
|-------|-----------|------|---------|
| 1 | **CORS** | `main.py` | Origins from `CORS_ORIGINS` + localhost:3000/3001 in dev |
| 2 | **Security Headers** | `src/api/middleware/security.py` | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cache-Control |
| 3 | **Request Logging** | `src/api/middleware/logging.py` | Request ID (UUID), PII redaction, duration logging |

### 3.3 Rate Limiting

| Context | Limit | Window | Implementation |
|---------|-------|--------|---------------|
| Message endpoint | 60/user | 60s | Redis `check_rate_limit` |
| Auth endpoints (login, signup, reset) | 20/IP | 60s | Redis `check_ip_rate_limit` |
| Login failures | 5 failures → lockout | 15 min | Redis `increment_login_failures` |
| WebSocket | 60 msgs | 60s | Per-connection counter |

### 3.4 Error Handling

| Status | When | Response Shape |
|--------|------|---------------|
| 400 | Validation, business rule violation | `{"detail": "message"}` |
| 401 | Invalid/expired token, not authenticated | `{"detail": "message"}` |
| 403 | Insufficient permissions, disabled account | `{"detail": "message"}` |
| 404 | Entity not found | `{"detail": "message"}` |
| 409 | Conflict (already resolved, duplicate) | `{"detail": "message"}` |
| 423 | Account locked (too many failures) | `{"detail": "message"}` |
| 429 | Rate limit exceeded | `{"detail": "Rate limit exceeded"}` |
| 500 | Internal error (dev: message exposed; prod: generic) | `{"detail": "Internal server error"}` |
| 502 | External service failure (Stripe refund) | `{"detail": "message"}` |
| 503 | Database unavailable | `{"detail": "Service temporarily unavailable"}` |

Global exception handler catches unhandled exceptions, logs them, and returns JSON with CORS headers.

### 3.5 Health Checks

| Endpoint | Purpose | What It Checks |
|----------|---------|---------------|
| `GET /api/v1/health/live` | Liveness (is process running) | Always returns 200 |
| `GET /api/v1/health` | Readiness (are dependencies up) | PostgreSQL, Redis, Qdrant, Neo4j |
| `GET /api/v1/health/db` | DB pool status | asyncpg pool stats or Supabase ping |
| `GET /metrics` | Prometheus metrics | Protected by X-API-Key |

---

## 4. API Routes — Complete Inventory

### 4.1 Route Module Summary

| Module | Prefix | Endpoints | Auth | Purpose |
|--------|--------|-----------|------|---------|
| `auth.py` | `/auth` | 18 | Mixed | Registration, login, tokens, password, verification, profile |
| `offers.py` | `/offers` | 12 | Yes | CRUD, join/leave, publish, match, participants |
| `contractors.py` | `/contractors` | 12 | Mixed | CRUD, search, reviews, stats, verify |
| `buildings.py` | `/buildings` | 12 | Yes | CRUD, residents, stats, offers, invite |
| `escalations.py` | `/escalations` | 12 | Admin | CRUD, assign, reply, resolve, reopen, messages |
| `agents.py` | `/agents` | 3 | Admin | Invoke, list, metrics |
| `admin.py` | `/admin` | 30+ | Admin | System status, users, offers, settings, audit, vetting, outreach, decisions, exports |
| `payments.py` | `/payments` | 7+5 | Yes/Admin | User payments + admin escrow/payouts |
| `uploads.py` | `/uploads` | 5 | Yes | Architecture, contractor docs, avatars |
| `webhooks.py` | `/webhooks` | 3 | Signature/Key | WhatsApp, contractor updates |
| `activity.py` | `/activity` | 1 | Yes | Recent activity feed |
| `onboarding.py` | `/onboarding` | 1 | Yes | Complete onboarding |
| `conversations.py` | `/conversations` | 1 | Yes | Chat history |
| `graph_features.py` | `/graph` | 5 | Yes/Admin | Invite chains, building similarity, influencers |
| `enrichment.py` | `/enrichment` | 1 | No | Address normalization |
| `websocket.py` | `/ws` | 1 | No | Admin real-time WebSocket |

**Total: ~130 endpoints across 17 route modules.**

### 4.2 Key Endpoint Details

#### Authentication Flow

```
1. POST /auth/signup          → Create user, send verification email, return tokens
2. POST /auth/verify-email/{token} → Verify email
3. POST /auth/login/json      → Authenticate (email or phone), return tokens + cookies
4. POST /auth/refresh          → Refresh access token (cookie or body)
5. POST /auth/logout           → Invalidate tokens
6. GET  /auth/me               → Get current user
7. PUT  /auth/me               → Update profile
```

#### Offer Lifecycle

```
1. POST /offers               → Create offer (contractor)
2. POST /offers/{id}/publish   → Publish draft → active
3. POST /offers/{id}/join      → Resident joins (creates participant + triggers invoice)
4. POST /offers/{id}/leave     → Resident leaves
5. GET  /offers/{id}/participants → View participants
6. POST /offers/{id}/start-matching → Start contractor matching (agent)
7. POST /offers/{id}/match     → Admin confirms match
8. POST /offers/{id}/resolve-undersubscription → Handle under-subscribed offer
```

#### Payment Flow

```
1. POST /payments/initiate     → Create invoice + payment intent (Stripe or mock)
2. POST /payments/webhook/stripe → Stripe confirms payment → update status
3. GET  /payments/my           → User's payment history
4. POST /payments/{id}/refund  → Request refund
5. GET  /admin/payments/escrow → Admin: escrowed payments
6. POST /admin/payments/escrow/{id}/release → Admin: release escrow
7. GET  /admin/payments/payouts → Admin: contractor payouts
8. POST /admin/payments/payouts/{id}/approve → Admin: approve payout
```

#### Contractor Verification Flow

```
1. POST /contractors           → Create contractor profile
2. POST /uploads/contractor-docs → Upload verification documents
3. POST /contractors/{id}/verify → Admin: verify/reject (triggers VettingAgent)
4. POST /contractors/{id}/recalculate-trust-score → Recalculate trust
5. GET  /admin/contractors/{id}/verification-metadata → View vetting data
6. POST /admin/contractors/{id}/request-docs → Request additional documents
```

---

## 5. Authentication System

### 5.1 Implementation — `src/api/middleware/auth.py`

| Component | Detail |
|-----------|--------|
| Algorithm | HS256 |
| Access token TTL | 30 minutes (configurable) |
| Refresh token TTL | 7 days (configurable) |
| Password hashing | bcrypt |
| Token storage | Redis (`refresh_token:{user_id}`) |
| Failure tracking | Redis (5 failures → 15 min lockout) |
| Cookie names | `access_token`, `refresh_token` (httponly, samesite=lax) |

### 5.2 Roles & Permissions

| Role | Access Level |
|------|-------------|
| `resident` | Own data, offers, payments, building, chat |
| `contractor` | Own data, own offers/projects, profile/docs |
| `buildings_manager` | Building data, escalations, admin pages |
| `admin` | All routes, all data |
| `super_admin` | All routes, all data, system settings |

### 5.3 Auth Dependencies

| Dependency | Purpose | Used By |
|------------|---------|---------|
| `get_current_user` | Extract user from JWT (Bearer or cookie) | Most routes |
| `get_current_active_user` | Active + verified user | Protected routes |
| `get_admin_user` | Admin/super_admin/buildings_manager role | Admin routes |
| `require_roles(*roles)` | Factory for specific role requirements | Specialized routes |
| `verify_api_key` | X-API-Key header validation | Webhooks, metrics |

---

## 6. Services Layer

### 6.1 Service Inventory — `src/services/`

| Service | File | External Integration | Key Methods |
|---------|------|---------------------|-------------|
| **PaymentProvider** | `payment.py` | Stripe API | `create_payment_intent`, `confirm_payment`, `create_refund`, `get_payment_status` |
| **InvoiceService** | `invoice.py` | — | `create_collection_invoice`, `create_payout_invoice`, `process_participant_payment`, `calculate_payment_splits`, `generate_invoice_pdf` |
| **EmailService** | `email.py` | SMTP (aiosmtplib) | `send_verification_email`, `send_password_reset_email`, `send_welcome_email`, `send_payment_confirmation`, `send_escalation_notification` |
| **PushService** | `push.py` | Firebase FCM | `send_push_notification`, `send_to_user`, `send_to_building` |
| **WhatsAppBotService** | `whatsapp_bot.py` | Meta WhatsApp Cloud API | `send_message`, `handle_incoming_message`, `send_template_message` |
| **StorageService** | `storage.py` | Supabase Storage / local FS | `upload_file`, `get_signed_url`, `delete_file`, `list_files` |
| **EnrichmentService** | `enrichment.py` | data.gov.il CKAN API | `normalize_address`, `lookup_municipality`, `verify_contractor_license` |
| **DataGovIlProvider** | `datagov_provider.py` | data.gov.il CKAN API | `search_businesses`, `get_municipality_data`, `verify_business_registration` |

### 6.2 Payment Architecture

```
Resident joins offer
        │
        ▼
POST /payments/initiate
        │
        ├── InvoiceService.create_collection_invoice()
        │      → Creates invoice with subtotal + 17% VAT + 5% platform fee
        │
        ├── PaymentProvider.create_payment_intent()
        │      → Stripe: creates PaymentIntent with metadata
        │      → Mock: returns fake client_secret
        │
        └── Returns { clientSecret, paymentId, invoiceId }

Stripe confirms payment
        │
        ▼
POST /payments/webhook/stripe
        │
        ├── Verify webhook signature
        ├── Update payment status → "succeeded"
        ├── Update invoice status → "paid"
        └── Create payment_splits per participant

Admin releases escrow
        │
        ▼
POST /admin/payments/escrow/{offer_id}/release
        │
        ├── InvoiceService.create_payout_invoice()
        └── Update payment statuses
```

### 6.3 Storage Architecture

| Bucket | Purpose | Max Size | Allowed Types |
|--------|---------|----------|--------------|
| `architecture-plans` | Floor plans for analysis | 20 MB | image/*, application/pdf |
| `contractor-docs` | License, insurance, certs | 10 MB | image/*, application/pdf |
| `avatars` | User profile photos | 5 MB | image/* |
| `invoices` | Generated invoice PDFs | — | application/pdf |

Supabase Storage with signed URLs (1-hour expiry). Falls back to local `uploads/` directory when Supabase is not configured.

---

## 7. Database Clients

### 7.1 PostgreSQL — `src/databases/postgres.py`

| Feature | Detail |
|---------|--------|
| Dual mode | Supabase PostgREST or local asyncpg |
| Pool | min 5, max 25, 300s idle, 60s timeout |
| Retry | tenacity: 3 attempts, exponential backoff 1–10s |
| SQL safety | `_SAFE_COLUMN_RE` validation for column names |
| Methods | ~80+ CRUD methods across all entities |
| Singleton | `get_postgres_client()` |

### 7.2 Redis — `src/databases/redis_client.py`

| Feature | Detail |
|---------|--------|
| Pool | max 20 connections, 5s timeout, retry on timeout |
| Conversation memory | `conv:{user_id}`, last 10 messages, 24h TTL |
| Cache | `cache:{key}`, JSON serialized, configurable TTL |
| Rate limiting | Atomic Lua script, per-user and per-IP |
| Agent state | `agent_state:{conversation_id}`, 1h TTL |
| Login tracking | Failure counter with 15 min window |
| A/B testing | Campaign hash tracking |
| Singleton | `get_redis_client()` |

### 7.3 Qdrant Vector DB — `src/databases/vector_store.py`

| Feature | Detail |
|---------|--------|
| Collections | `contractors`, `buildings`, `knowledge_base`, `conversations` (1536 dim, cosine) |
| Embedding model | OpenAI `text-embedding-3-large` (1536 dimensions) |
| Search modes | Semantic (cosine), hybrid (semantic + keyword, 70/30 weight) |
| Batch upsert | 1000 points per batch with retry |
| Singleton | `get_vector_store()` |

### 7.4 Neo4j Graph DB — `src/databases/graph_store.py`

| Feature | Detail |
|---------|--------|
| Pool | max 50 connections, 30s acquisition timeout |
| Node types | Resident, Building, Contractor, Offer, InviteEvent |
| Relationships | COMPLETED, REVIEWED, INVITED, JOINED, LIVES_IN, INFLUENCED, SIMILAR_TO |
| Key queries | Contractor matching, reputation, fraud detection, viral invite chains, building similarity, influencer scoring |
| Singleton | `get_graph_store()` |

---

## 8. Workers & Background Tasks

### 8.1 Agent Worker — `src/workers/agent_worker.py`

| Feature | Detail |
|---------|--------|
| Queue | Redis BRPOP from `groupio:agent:tasks` |
| Results | Push to `groupio:agent:results` |
| Agent | RouterAgent (entry point for orchestration) |
| Docker | Runs as `worker` service |

### 8.2 Scheduler — `src/workers/scheduler.py`

| Task | Frequency | Purpose |
|------|-----------|---------|
| `check_expired_offers` | Hourly | Expire offers past deadline |
| `recalculate_trust_scores` | Weekly | Refresh contractor trust scores |
| `cleanup_stale_conversations` | Daily | Archive old conversations |
| `generate_daily_analytics` | Daily | Compute daily metrics |
| `refresh_building_similarity` | Daily | Update Neo4j similarity edges |
| `refresh_influencer_scores` | Daily | Update influencer scores |

**Note**: Scheduler is not a dedicated Docker service — runs as standalone `asyncio.run()`. Needs to be added to docker-compose or run via process manager.

### 8.3 Offer Lifecycle — `src/workers/offer_lifecycle.py`

Event-driven handlers for offer state transitions:
- Participant join → trigger invoice creation
- Contractor match → notify participants
- Offer completed → trigger payout flow
- Offer cancelled → process refunds

---

## 9. Utilities

### 9.1 Utility Modules — `src/utils/`

| Module | Purpose | Key Functions |
|--------|---------|--------------|
| `validators.py` | Input validation | `validate_user_id`, `validate_phone`, `validate_email`, `validate_category`, `validate_region`, `sanitize_input`, `validate_sql_query` |
| `hebrew_utils.py` | Hebrew NLP | `is_hebrew`, `detect_language`, `normalize_hebrew`, `remove_stopwords`, `translate_category`, `translate_region`, `detect_legal_keywords` |
| `pii.py` | PII protection | `redact_pii` — emails, phones, Israeli IDs, credit cards, JWTs |
| `monitoring.py` | Observability | `get_logger`, `init_monitoring`, Prometheus counters, `track_agent_execution`, `generate_request_id` |
| `llm_client.py` | LLM abstraction | `LLMClient` — Anthropic primary, retry, fallback to OpenAI, tool use support |

### 9.2 LLM Client — `src/utils/llm_client.py`

| Feature | Detail |
|---------|--------|
| Primary | Anthropic AsyncAnthropic → Claude claude-sonnet-4-20250514 |
| Fallback | OpenAI (if Anthropic fails) |
| Retry | tenacity-based retry |
| Cache | Redis LLM cache (disabled in tests) |
| Tool use | Supports Anthropic tool_use format |
| Max tokens | 2000 default per agent |

---

## 10. Configuration — `src/config/settings.py`

### 10.1 Environment Variables

| Category | Variables | Defaults |
|----------|----------|----------|
| **LLM** | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PRIMARY_MODEL`, `FALLBACK_MODEL` | claude-sonnet-4-20250514, gpt-4o |
| **Embedding** | `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | text-embedding-3-large, 1536 |
| **Database** | `DATABASE_URL`, `USE_LOCAL_POSTGRES`, `SUPABASE_URL`, `SUPABASE_KEY` | postgresql://...localhost:5432/groupio |
| **Redis** | `REDIS_URL`, `REDIS_PASSWORD` | redis://localhost:6379 |
| **Vector** | `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_PREFER_GRPC` | localhost:6333 |
| **Graph** | `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` | bolt://localhost:7687 |
| **Auth** | `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` | auto-gen in dev, 30 min, 7 days |
| **Payment** | `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET` | mock |
| **WhatsApp** | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | — |
| **Email** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `FROM_EMAIL` | — |
| **Agent modes** | `MATCHING_AGENT_MODE`, `PRICING_AGENT_MODE`, `VETTING_AGENT_MODE`, `OUTREACH_AGENT_MODE` | recommend, recommend, recommend, gated |
| **Thresholds** | `ROUTER_CONFIDENCE_THRESHOLD`, `SENTIMENT_ESCALATION_THRESHOLD`, `MAX_SUPPORT_ATTEMPTS_BEFORE_ESCALATION` | 0.7, -0.5, 3 |
| **Rate limits** | `RATE_LIMIT_PER_USER`, `RATE_LIMIT_WINDOW` | 60, 60 |
| **Infrastructure** | `CORS_ORIGINS`, `API_KEYS`, `ENVIRONMENT`, `FRONTEND_URL` | localhost:3000/3001, [], development |
| **Features** | `ENFORCE_EMAIL_VERIFICATION`, `ENABLE_DATAGOV_IL`, `HUMAN_ESCALATION_ENABLED` | False, True, True |

### 10.2 Production Validation

On startup in production, the system validates:
- JWT secret is set and ≥ 32 characters
- Payment webhook secret is set
- At least one LLM API key present
- API keys are configured
- Valid DATABASE_URL (no placeholder passwords)
- Redis auth is configured

---

## 11. Infrastructure

### 11.1 Docker Services — `docker/docker-compose.yml`

| Service | Image | Port | Depends On |
|---------|-------|------|-----------|
| `postgres` | postgres:15-alpine | 5432 | — |
| `api` | Built from Dockerfile | 8000 | postgres, qdrant, neo4j, redis |
| `qdrant` | qdrant/qdrant:latest | 6333 | — |
| `neo4j` | neo4j:5-community | 7474, 7687 | — |
| `redis` | redis:7-alpine | 6379 | — |
| `worker` | Same as api | — | postgres, qdrant, neo4j, redis |

**Dockerfile**: Multi-stage (Python 3.11-slim), non-root user, healthcheck on `/api/v1/health/live`, 4 Uvicorn workers in production.

**Missing**: Scheduler service not in docker-compose. Prometheus/Alertmanager not in compose (config files exist but no service definition).

### 11.2 CI/CD — `.github/workflows/`

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | Push/PR to dev, main | Ruff lint, Mypy, ESLint, security scan (Trivy + Gitleaks), pytest (80% coverage), frontend test, build, Docker build, E2E (Playwright) |
| `deploy.yml` | After CI / manual | Deploy backend (Docker + SSH), deploy web (Vercel), deploy admin (Vercel), deploy mobile (EAS), run migrations, Slack notify |
| `backup.yml` | Daily 02:00 UTC / manual | pg_dump, S3 upload, 30-day retention |
| `chromatic.yml` | — | Storybook visual regression |
| `require-pr-from-dev.yml` | — | Enforce PRs from dev into main |
| `dev-to-main-pr.yml` | — | Auto-create release PR dev→main |
| `auto-merge.yml` | — | Auto-merge + PR labeling |
| `code-review-check.yml` | — | Validate code review script |

### 11.3 Monitoring

| Component | Config File | Status |
|-----------|-------------|--------|
| Prometheus | `monitoring/prometheus.yml` | Config present, scrapes api:8000/metrics |
| Alertmanager | `monitoring/alertmanager.yml` | Slack integration (#alerts-critical, #alerts-warning) |
| Alert rules | `monitoring/alerts.yml` | 9 rules (payment failures, error rate, LLM latency, escalation surge, DB pool, rate limits, Redis, disk, backup) |
| Grafana | — | NOT configured (planned) |

**Prometheus scrape targets**: groupio-api, groupio-frontend, redis-exporter, node-exporter, postgres-exporter.

**Critical alerts**: PaymentWebhookFailed, HighErrorRate, LLMLatencyHigh, EscalationSurge, DatabasePoolExhausted.

---

## 12. Testing

### 12.1 Structure

```
tests/
├── conftest.py                  # Global fixtures, LLM cache disabled
├── fixtures/sample_data.json    # Sample test data
├── unit/                        # ~55 unit test files
│   ├── conftest.py
│   └── test_*.py
├── integration/                 # ~15 integration test files
│   ├── conftest.py
│   └── test_*.py
apps/web/e2e/                    # Playwright E2E tests
apps/admin/e2e/                  # Admin E2E tests
```

### 12.2 Frameworks & Config

| Tool | Purpose | Config |
|------|---------|--------|
| pytest | Unit + integration | asyncio_mode=auto, timeout=120s |
| pytest-cov | Coverage | fail-under=50 (local), 80 (CI) |
| pytest-asyncio | Async test support | Auto mode |
| Playwright | E2E browser tests | Chromium in CI |
| Ruff | Linting | Line length 120 |
| Mypy | Type checking | Strict off |
| Trivy | Security scanning | Container vulnerability scan |
| Gitleaks | Secret detection | Scans for leaked secrets |
| Codecov | Coverage reporting | Backend + frontend |

### 12.3 Key Fixtures

| Fixture | Purpose |
|---------|---------|
| `mock_llm_client` | Mock LLM responses |
| `mock_rag_pipeline` | Mock RAG retrieval |
| `mock_vector_store` | Mock Qdrant operations |
| `mock_graph_store` | Mock Neo4j operations |
| `mock_postgres_client` | Mock DB operations |
| `mock_redis_client` | Mock Redis operations |
| `sample_agent_state` | Pre-built AgentState for testing |

---

## 13. Frontend API Client

### 13.1 Shared Client — `packages/api-client/src/client.ts`

| Feature | Detail |
|---------|--------|
| Class | `GroupioApiClient` |
| Base URL | Configurable, defaults to `/api/v1` |
| Auth | Bearer token from config |
| Timeout | 30s via AbortController |
| Credentials | `include` (sends cookies) |
| Error types | `ApiError`, `NetworkError`, `ValidationError`, `UnauthorizedError`, `NotFoundError`, `RateLimitError` |

### 13.2 Web Client — `apps/web/lib/api/client.ts`

| Feature | Detail |
|---------|--------|
| Class | `ApiClient` |
| Base URL | `NEXT_PUBLIC_API_URL` or `http://localhost:8000` |
| Auth | Zustand `useAuthStore.getState().accessToken` |
| Token refresh | On 401: call `refreshToken()`, retry once with new token |
| Single-flight | `_refreshPromise` ensures one refresh at a time |
| Credentials | `include` (cookies for refresh token) |

---

## 14. Documentation — `docs/`

| Document | Purpose |
|----------|---------|
| `architecture.md` | System architecture, tech stack, data flow |
| `agent_behaviors.md` | Agent behavior specs and routing rules |
| `agent_handoff_contract.md` | Inter-agent state handoff protocol |
| `api_reference.md` | REST API documentation |
| `deployment.md` | Deployment and run guide |
| `OPERATIONS.md` | Health checks, CORS, secrets management |
| `rag_guide.md` | RAG pipeline usage guide |
| `PRODUCTION_READINESS_AUDIT.md` | Production readiness checklist |
| `PILOT_READINESS_AUDIT.md` | Pilot launch checklist |
| `SECRETS_ROTATION.md` | Secret rotation procedures |
| `BRANCH_PROTECTION.md` | Git branch protection rules |
| 20+ additional audit, review, and planning docs | Various |

---

## 15. Known Backend Issues

| Issue | Location | Impact | Priority |
|-------|----------|--------|----------|
| Scheduler not in docker-compose | `docker/docker-compose.yml` | Background tasks won't run without manual startup | P1 |
| Grafana not configured | `monitoring/` | No visualization dashboards | P2 |
| `window.prompt()` in admin payments | Frontend but backed by `PATCH /admin/payments/{id}/status` | Poor UX | P2 |
| Trust score simulated in admin UI | `apps/admin/app/contractors/page.tsx` | Admin sees fake data | P1 |
| API inconsistency: `request-docs` vs `request-documents` | `admin.py` bulk actions | Potential 404 on bulk doc requests | P1 |
| Notification settings not persisted | No DB column | Profile toggles don't save | P2 |
| No dedicated orders table | DB schema | "Orders" composed from 3 tables | P2 |
| Checkout `offerId` param mismatch | `payments/page.tsx` → `checkout/page.tsx` | Checkout fails from payments page | P0 |
| Duplicate Heebo font import | `globals.css` + `layout.tsx` | Performance waste | P3 |
| `window.location.reload()` after upload | `contractor/profile/page.tsx` | Poor UX | P2 |
