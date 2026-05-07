---
last_mapped: 2026-05-06
---

# Architecture

## Pattern

**Layered monorepo** — backend service + two Next.js frontends + mobile, organized as a pnpm workspace with Turbo for parallel builds.

### Backend: FastAPI + LangGraph Multi-Agent System

```
HTTP/WebSocket request
  └─► FastAPI (src/api/main.py, :8000)
        ├─ Middleware stack (auth JWT → role guard → logging → rate limit → security headers)
        ├─ 17 route modules (src/api/routes/)
        └─ Service layer (src/services/)
              ├─ Business logic (payment, invoice, enrichment, email, storage…)
              └─ Database layer (src/databases/)
                    ├─ postgres.py — asyncpg pool (min 5, max 25)
                    ├─ redis_client.py — cache + queues
                    ├─ vector_store.py — Qdrant (contractors, buildings, knowledge_base, conversations)
                    ├─ graph_store.py — Neo4j (reputation graph)
                    └─ pinecone_store.py — optional Pinecone

LangGraph Orchestrator (src/orchestration/graph.py)
  └─► Router Agent (src/agents/router.py) — intent classification → agent dispatch
        ├─ matching agent — contractor search
        ├─ pricing agent — dynamic tier pricing
        ├─ payment agent — escrow & Stripe
        ├─ vetting agent — contractor verification
        ├─ analytics agent — metrics
        ├─ support agent — order status, complaints
        ├─ architecture agent — building analysis
        ├─ outreach agent — viral invite (graph-powered)
        ├─ influencer agent — influencer campaigns
        ├─ notification agent — push/email/WhatsApp
        └─ (base class: src/agents/base.py — retry, RAG pipeline, LLM client)

Workers (src/workers/)
  ├─ outbox_dispatcher.py — reliable message delivery (RabbitMQ outbox pattern)
  ├─ worker_payments.py — async payment processing
  ├─ worker_notifications.py — notification delivery
  ├─ worker_crm_sync.py — EspoCRM sync
  ├─ agent_worker.py — async agent task queue
  ├─ offer_lifecycle.py — offer state machine transitions
  └─ scheduler.py — cron-style scheduled tasks
```

### Frontend Architecture

```
apps/web (:3000) — Resident & contractor portal
  ├─ app/(auth)/           — Login, register, password reset
  ├─ app/(resident)/       — Dashboard, offers, payments, chat, profile, contractors
  ├─ app/contractor/       — Dashboard, offers management, earnings, projects, profile
  ├─ app/buildings-manager/ — Building management
  ├─ app/admin/            — Admin panel
  ├─ app/api/              — Next.js API routes (proxies + webhooks)
  ├─ lib/stores/           — Zustand (authStore, offerStore, notificationStore)
  ├─ lib/hooks/            — React Query (useApiData, useChat, useOffers, useRealtimeOffers)
  └─ components/           — UI components (auth, features, landing, layouts, payments, shared, ui)

apps/admin (:3001) — Admin-only dashboard
  └─ Next.js 15 + recharts (data visualization)

apps/mobile — React Native / Expo (in progress)
```

## Layers (strict separation)

```
Route handler (src/api/routes/*.py)
  → Service (src/services/*.py)       ← business logic lives here
    → Database (src/databases/*.py)   ← all DB access through helpers
      → PostgreSQL / Redis / Qdrant / Neo4j
```

**Rules:**
- Routes call services only — never hit DB directly
- Services contain business logic — no DB imports in routes
- Agents do LLM orchestration only — no direct DB writes
- All column lists defined at top of `postgres.py` — never `SELECT *`

## Data Flow

### Offer Lifecycle
```
draft → active → pending → in_progress → completed
                                       → cancelled
                                       → expired
```
Offer state transitions managed by `src/workers/offer_lifecycle.py`.

### Payment / Escrow Lifecycle
```
Payment: pending → processing → succeeded
                             → failed
                succeeded → refunded | partially_refunded

Escrow: collecting → held → released
                         → partially_released
                         → disputed → refunded
```
All transitions written to `audit_logs` table. Handler: `src/services/payment.py`.

### Agent Request Flow
```
User message → FastAPI websocket/HTTP → Orchestrator → Router agent → Specialist agent
→ RAG pipeline (Qdrant retrieval) → LLM (Anthropic / OpenAI) → Response
```

## Entry Points

| Entry point | File |
|-------------|------|
| FastAPI app | `src/api/main.py` |
| Agent orchestrator | `src/orchestration/graph.py` |
| Next.js web | `apps/web/app/layout.tsx` |
| Next.js admin | `apps/admin/app/layout.tsx` |
| Worker startup | `src/workers/scheduler.py` |

## Auth & Authorization

Two-layer enforcement:
1. **PostgreSQL RLS** — row-level security scoped to 5 roles (resident, contractor, buildings_manager, admin, super_admin)
2. **FastAPI middleware** — JWT validation + `require_role()` decorator pattern in `src/api/middleware/auth.py`

## Key Abstractions

| Abstraction | Location | What it does |
|-------------|----------|--------------|
| `BaseAgent` | `src/agents/base.py` | Retry logic, RAG pipeline access, LLM client, state management |
| `AgentState` | `src/models/agent_state.py` | Shared state passed between LangGraph nodes |
| Postgres helpers | `src/databases/postgres.py` | Named column lists, connection pool, `RETURNING id` pattern |
| `get_payment_provider()` | `src/services/payment.py` | Factory for Stripe / Bit / Paybox, fail-closed at startup |
| `@groupio/api-client` | `packages/api-client/` | Frontend API client with auth headers, retry, deduplication |
