# Groupio — Claude Brain

## Product

Groupio is a marketplace for group building upgrades in Israel. Residents in apartment buildings group together to collectively hire contractors for home services (AC, plumbing, electrical, renovations, etc.) at discounted group rates via dynamic tier pricing.

## Architecture

```
apps/web          Next.js 15 — resident & contractor portal (:3000)
apps/admin        Next.js 15 — admin dashboard (:3001)
apps/mobile       React Native / Expo

packages/types    Shared TypeScript interfaces (single source of truth)
packages/api-client  Generated API client used by web + admin
packages/ui       Design system components
packages/utils    Shared formatters/helpers

src/api           FastAPI (:8000) — REST + WebSocket
src/agents        LangGraph multi-agent system (11 specialist agents)
src/services      Business logic layer
src/databases     asyncpg (Supabase/PostgreSQL), Redis, Neo4j, Qdrant
src/workers       RabbitMQ outbox, payment, notification, CRM sync workers
```

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, Python 3.11, Uvicorn |
| Primary DB | PostgreSQL via Supabase (asyncpg direct connection) |
| Cache / Queue | Redis 7 |
| Vector DB | Qdrant (contractors, buildings, knowledge_base, conversations) |
| Graph DB | Neo4j 5 (contractor reputation, relationships) |
| Message Queue | RabbitMQ (outbox pattern, optional) |
| LLM | Anthropic Claude claude-sonnet-4-6 (primary), OpenAI GPT-4o (fallback) |
| Payments | Stripe (PaymentIntents, webhooks, subscriptions) |
| Frontend | React 19 + Next.js 15, Zustand, React Query v5, Tailwind |
| Forms | React Hook Form + Zod |
| i18n | next-intl (Hebrew RTL + English) |
| Tests (FE) | Vitest (unit), Playwright (E2E) |
| Tests (BE) | pytest, pytest-asyncio |
| Monorepo | pnpm workspaces + Turbo |
| Migrations | Alembic (21 versions) |

## Roles

| Role | Can self-register | Access |
|------|------------------|--------|
| `resident` | Yes | Join offers, make payments, chat |
| `contractor` | Yes | Create/manage offers, receive payouts |
| `buildings_manager` | No (admin-created) | Manage building, view all residents |
| `admin` | No | Full system, escalations, metrics |
| `super_admin` | No | All admin + system config |

Roles are enforced at two levels: **RLS policies** in PostgreSQL and **backend guards** in FastAPI middleware.

## Core Domain Flows

### Offer Lifecycle
`draft → active → pending → in_progress → completed`  
Also: `cancelled`, `expired`

Key models: `offers`, `offer_participants`, `pricing_tiers` (JSONB), `matched_contractor_id`

### Dynamic Tier Pricing
Each offer has tiers: `[{ min, max, discount, price, marketPosition }]`  
Price drops as more residents join (group buying). `currentTier` updates in real-time.

### Escrow Payment Lifecycle
```
authorized → captured → released
```
EscrowStatus: `collecting → held → released → (partially_released | disputed | refunded)`

Never skip steps. All transitions logged in `audit_logs`.

### Contractor Vetting
Trust score built from: license number, insurance expiry, certifications, reviews, verification metadata.  
Stored in `contractor_verification_metadata` (JSONB).

## Dev Commands

```bash
# Frontend (all apps)
pnpm dev                          # start all apps
pnpm build                        # build all
pnpm lint                         # lint all
pnpm typecheck                    # type-check all
pnpm test                         # Vitest unit tests
pnpm test:e2e                     # Playwright E2E (web)

# Backend
pytest tests/                     # all Python tests
pytest tests/unit/                # unit only
pytest tests/integration/         # needs Docker services running
python -m ruff check src/         # lint
python -m mypy src/               # type check

# Docker
docker compose -f docker/docker-compose.yml up -d    # start all services
docker compose -f docker/docker-compose.yml down     # stop

# DB migrations
alembic upgrade head
alembic revision --autogenerate -m "description"
```

## Critical Invariants

- **Never skip payment lifecycle steps** — `authorized → captured → released` strictly
- **Always validate RLS** — every new table needs RLS policies, every new route needs role guard
- **Hebrew RTL required** — all new UI must work in both LTR (English) and RTL (Hebrew)
- **Explicit column lists** — never `SELECT *`; use named column lists (see `src/databases/postgres.py`)
- **Service layer** — routes must call services, not hit the DB directly
- **All 5 roles must be considered** — especially in E2E tests and permission checks
- **Stripe webhook signatures** — always verify before processing
- **50% test coverage minimum** — configured in `pyproject.toml`

## Key File Paths

```
packages/types/src/index.ts          All shared TypeScript types
src/models/                          Pydantic models (user, offer, contractor, payment)
src/api/routes/                      FastAPI route handlers (17 modules)
src/agents/                          LangGraph agents (base, router, pricing, matching, payment, vetting...)
src/services/payment.py              Payment orchestration + Stripe webhooks
src/services/invoice.py              Invoice generation
src/databases/postgres.py            asyncpg queries + connection pool
alembic/versions/                    DB migrations (21 versions)
apps/web/app/                        Next.js page routes (resident, contractor, admin sub-apps)
apps/web/lib/stores/                 Zustand stores (auth, offers, notifications)
apps/web/lib/hooks/                  React Query hooks (useOffers, useChat, useRealtimeOffers)
apps/web/e2e/                        Playwright E2E specs
apps/web/__tests__/                  Vitest unit tests
.env.example                         All 170 environment variables documented
design-system/BACKEND.md             Backend architecture reference
design-system/DATABASE.md            Schema reference
```

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First** — Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan** — Check in before starting implementation
3. **Track Progress** — Mark items complete as you go
4. **Explain Changes** — High-level summary at each step
5. **Document Results** — Add review section to `tasks/todo.md`
6. **Capture Lessons** — Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First** — Make every change as simple as possible. Impact minimal code.
- **No Laziness** — Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact** — Changes should only touch what's necessary. Avoid introducing bugs.

## Sub-agents

Claude may spawn these specialized agents from `.claude/agents/`:
- `backend-architect` — API design, RLS, service layer, async patterns
- `payments-guardian` — Escrow lifecycle, Stripe safety, payment transitions
- `data-integrity` — FK relationships, orphan data, schema consistency
- `qa-e2e` — Playwright + Vitest test writing for all roles
- `frontend-ux` — React patterns, RTL, React Query, Zustand
- `security-auditor` — JWT, RLS gaps, webhook signatures, OWASP
- `code-reviewer` — Code quality, conventions, TypeScript types

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Groupio — City MVP Launch Readiness**

Groupio is a marketplace where Israeli apartment building residents group together to hire contractors for home services (AC, plumbing, electrical, renovations) at discounted rates via dynamic tier pricing. Residents in the same building join an "offer" collectively; the more who join, the lower the price drops.

The platform already has a full-stack codebase (FastAPI + Next.js + 11 LangGraph agents). This milestone is about getting it **launch-ready** for a multi-city Israeli MVP — hardening, completing unfinished flows, and shipping to production so real residents and contractors can transact.

**Core Value:** **The first real transaction** — a resident pays for a contractor service through escrow, the work gets done, the contractor gets paid. Everything else is scaffolding for that moment.

**Launch success = 10 active buildings** with residents browsing and joining offers.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages & Runtime
| Layer | Language | Version |
|-------|----------|---------|
| Backend | Python | 3.11+ |
| Frontend | TypeScript | 5.x |
| Frontend runtime | Node.js | >=20 |
| Migrations | Python / Alembic | — |
## Backend Framework
| Component | Technology | Notes |
|-----------|-----------|-------|
| API server | FastAPI + Uvicorn | `src/api/` — REST + WebSocket |
| Async ORM | asyncpg (raw) | No ORM — explicit SQL in `src/databases/postgres.py` |
| LLM orchestration | LangGraph 0.0.30 | 11 specialist agents in `src/agents/` |
| LLM primary | Anthropic Claude (claude-sonnet-4-6) | `anthropic>=0.39.0` |
| LLM fallback | OpenAI GPT-4o | `openai>=1.6.0` |
| Validation | Pydantic v2 | `pydantic>=2.5.0`, `pydantic-settings` |
## Frontend Framework
| App | Technology | Port |
|-----|-----------|------|
| `apps/web` | Next.js 15 + React 19 | :3000 |
| `apps/admin` | Next.js 15 + React 19 | :3001 |
| `apps/mobile` | React Native / Expo | — |
### Frontend Key Libraries
| Library | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | v5 | Server state / data fetching |
| `zustand` | ^4.5 | Client-only state (auth, UI, notifications) |
| `react-hook-form` | ^7.52 | Form management |
| `zod` | ^3.23 | Schema validation |
| `next-intl` | ^3.15 | i18n — Hebrew RTL + English |
| `tailwind-merge` + `clsx` | — | Styling utilities |
| `lucide-react` | ^0.400 | Icons |
| `@stripe/react-stripe-js` | ^2.7 | Stripe Elements |
| `posthog-js` | ^1.200 | Product analytics |
| `@sentry/nextjs` | ^8 | Error tracking |
| `recharts` | — | Charts (admin only) |
## Databases
| Database | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Primary DB | PostgreSQL via Supabase | postgres:15-alpine | All relational data |
| Cache / Queues | Redis | redis:7-alpine | Session cache, rate limiting, queues |
| Vector DB | Qdrant | qdrant/qdrant:latest | Contractor/building/conversation embeddings |
| Vector DB (alt) | Pinecone | — | Optional alternative to Qdrant |
| Graph DB | Neo4j | neo4j:5-community | Contractor reputation & relationships |
| Message Queue | RabbitMQ | rabbitmq:3-management-alpine | Outbox pattern, async workers |
## Monorepo & Build Tools
| Tool | Config |
|------|-------|
| pnpm workspaces | `pnpm-workspace.yaml` — `apps/*`, `packages/*` |
| Turbo | Root `turbo.json` — parallel builds |
| TypeScript | Root `tsconfig.json` + per-app configs |
| ESLint | `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `@typescript-eslint` |
| Prettier | Root `.prettierrc` |
| Ruff | Python linter |
| mypy | Python type checker |
## Shared Packages
| Package | Path | Purpose |
|---------|------|---------|
| `@groupio/types` | `packages/types/src/index.ts` | Single source of truth for TypeScript interfaces |
| `@groupio/api-client` | `packages/api-client/` | Generated API client (auth, retries, dedup) |
| `@groupio/ui` | `packages/ui/` | Design system components |
| `@groupio/utils` | `packages/utils/` | Shared formatters and helpers |
## Testing Stack
| Layer | Tool | Config |
|-------|------|-------|
| Frontend unit | Vitest + React Testing Library | `apps/web/__tests__/` |
| Frontend E2E | Playwright | `apps/web/e2e/` — includes Hebrew locale project |
| Backend unit | pytest + pytest-asyncio | `tests/unit/` |
| Backend integration | pytest (needs Docker) | `tests/integration/` |
| Coverage | pytest-cov | 50% minimum — `pyproject.toml` |
## Observability
| Tool | Purpose |
|------|---------|
| Sentry | Error tracking (FE + BE — `sentry-sdk[fastapi]`) |
| Prometheus | Metrics (`prometheus-client>=0.19`) |
| Grafana | Dashboards (grafana:10.4.1 in Docker) |
| structlog | Structured logging |
| PostHog | Product analytics (FE) |
## DB Migrations
- Alembic — 44 migration versions in `alembic/versions/`
- `alembic upgrade head` / `alembic revision --autogenerate -m "desc"`
## Key Config Files
- `.env.example` — 170+ documented environment variables
- `docker/docker-compose.yml` — All services (Postgres, Redis, Qdrant, Neo4j, RabbitMQ, Prometheus, Grafana)
- `pyproject.toml` — Python deps, test config, coverage (50% min)
- `pnpm-workspace.yaml` — Monorepo workspace packages
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Python (Backend)
### Style
- **Linter:** Ruff (`python -m ruff check src/`)
- **Type checker:** mypy (`python -m mypy src/`)
- **Formatting:** Ruff formatter (Black-compatible)
- No `SELECT *` — always use named column lists defined at top of `src/databases/postgres.py`
### Naming
- Files: `snake_case.py`
- Classes: `PascalCase`
- Functions/methods: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Private helpers: `_leading_underscore`
### Async Patterns
- All DB calls and external API calls must be `await`ed
- Never `time.sleep()` — use `asyncio.sleep()`
- All service methods are `async def`
- Use `asynccontextmanager` for connection management
### FastAPI Route Pattern
### Service Pattern (business logic)
### DB Query Pattern (asyncpg)
### Pydantic Models
- All request/response bodies use Pydantic v2 models in `src/models/`
- Use `Field(...)` with constraints: `min_length`, `ge`, `le`
- Never validate manually in route handlers
### Error Handling
- `HTTPException` for client errors (4xx)
- Log + return 500 for unexpected errors
- Never expose stack traces to API responses
- Input sanitization before DB writes: `src/utils/validators.py`
### JWT / Auth Pattern
## TypeScript / React (Frontend)
### Style
- ESLint: `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`
- Prettier for formatting
- No `any` types — use types from `@groupio/types` or define locally
- All component props must be typed
### State Management Rules
### Component Pattern
### Forms
### API Client
### i18n
- All user-facing strings use `next-intl`
- Translation files in `apps/web/messages/`
- Hebrew (he) is primary — English (en) is secondary
- RTL support required for all UI components
### Layout Test Pattern
## Database Conventions
### Column Lists
- `_USER_COLS` — excludes `hashed_password` for security
- `_OFFER_COLS`
- `_CONTRACTOR_COLS`
- `_PAYMENT_COLS`
### Migrations (Alembic)
### JSONB Columns (must validate before write)
- `pricing_tiers` on offers
- `trust_score_breakdown` on contractors
- `notification_settings` on users
- `provider_data` on contractors (Stripe subscription data)
## Security Conventions
- Never skip Stripe webhook signature verification (`stripe.Webhook.construct_event()`)
- Rate limiting configured globally — never bypass
- All protected endpoints verify JWT via auth middleware
- Never rely on RLS alone for business-level access control
- Input sanitization: `sanitize_input()` and `validate_message_request()` in `src/utils/validators.py`
- RLS policies defined in Alembic migrations — never ad-hoc in SQL editors
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern
### Backend: FastAPI + LangGraph Multi-Agent System
```
```
### Frontend Architecture
```
```
## Layers (strict separation)
```
```
- Routes call services only — never hit DB directly
- Services contain business logic — no DB imports in routes
- Agents do LLM orchestration only — no direct DB writes
- All column lists defined at top of `postgres.py` — never `SELECT *`
## Data Flow
### Offer Lifecycle
```
```
### Payment / Escrow Lifecycle
```
```
### Agent Request Flow
```
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
## Key Abstractions
| Abstraction | Location | What it does |
|-------------|----------|--------------|
| `BaseAgent` | `src/agents/base.py` | Retry logic, RAG pipeline access, LLM client, state management |
| `AgentState` | `src/models/agent_state.py` | Shared state passed between LangGraph nodes |
| Postgres helpers | `src/databases/postgres.py` | Named column lists, connection pool, `RETURNING id` pattern |
| `get_payment_provider()` | `src/services/payment.py` | Factory for Stripe / Bit / Paybox, fail-closed at startup |
| `@groupio/api-client` | `packages/api-client/` | Frontend API client with auth headers, retry, deduplication |
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
