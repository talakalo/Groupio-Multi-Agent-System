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
