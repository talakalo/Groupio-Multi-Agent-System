---
last_mapped: 2026-05-06
---

# Directory Structure

## Root Layout

```
Groupio-Multi-Agent-System/
├── apps/                    # Frontend applications
│   ├── web/                 # Resident & contractor portal (Next.js 15, :3000)
│   ├── admin/               # Admin dashboard (Next.js 15, :3001)
│   └── mobile/              # React Native / Expo app
├── packages/                # Shared monorepo packages
│   ├── types/               # @groupio/types — shared TypeScript interfaces
│   ├── api-client/          # @groupio/api-client — generated API client
│   ├── ui/                  # @groupio/ui — design system components
│   └── utils/               # @groupio/utils — shared formatters/helpers
├── src/                     # FastAPI backend
├── alembic/                 # DB migrations (44 versions)
├── docker/                  # Docker Compose configs
├── docs/                    # Documentation
├── design-system/           # Backend & DB architecture reference docs
├── monitoring/              # Prometheus / Grafana configs
├── scripts/                 # Ops scripts
├── tests/                   # Backend tests
│   ├── unit/
│   └── integration/
├── .claude/                 # Claude Code config
│   ├── agents/              # GSD agent definitions
│   ├── rules/               # Project rules (payments, frontend, database, backend, roles)
│   └── skills/              # GSD skill definitions (installed by gsd-new-project)
├── pyproject.toml           # Python deps + test config
├── pnpm-workspace.yaml      # Monorepo workspace definition
├── turbo.json               # Turborepo build pipeline
└── CLAUDE.md                # Project instructions for Claude
```

## Backend (`src/`)

```
src/
├── agents/                  # LangGraph specialist agents (11 total)
│   ├── base.py              # BaseAgent — retry, RAG, LLM client
│   ├── router.py            # Intent classifier → agent dispatch
│   ├── matching.py          # Contractor search/matching
│   ├── pricing.py           # Dynamic tier pricing
│   ├── payment.py           # Escrow + Stripe orchestration
│   ├── vetting.py           # Contractor verification
│   ├── analytics.py         # Metrics queries
│   ├── support.py           # Order status, complaints
│   ├── architecture.py      # Building analysis
│   ├── outreach.py          # Viral invite (graph-powered)
│   ├── influencer.py        # Influencer campaigns
│   └── notification.py      # Push/email/WhatsApp dispatch
├── api/
│   ├── main.py              # FastAPI app entry point + lifespan
│   ├── middleware/          # auth.py, caching.py, logging.py, security.py
│   └── routes/              # 17 route modules:
│       ├── auth.py, admin.py, offers.py, contractors.py
│       ├── buildings.py, payments.py, conversations.py
│       ├── notifications.py, escalations.py, webhooks.py
│       ├── websocket.py, uploads.py, agents.py
│       ├── activity.py, enrichment.py, graph_features.py
│       └── onboarding.py
├── config/
│   ├── settings.py          # Pydantic settings (env-based)
│   └── prompts/             # LLM system prompts per agent
├── databases/
│   ├── postgres.py          # asyncpg pool + named column lists + helpers
│   ├── redis_client.py      # Redis connection + helpers
│   ├── vector_store.py      # Qdrant client (4 collections)
│   ├── graph_store.py       # Neo4j client
│   └── pinecone_store.py    # Pinecone (optional)
├── domain/                  # Domain models and business rules
├── integrations/
│   └── espocrm/             # EspoCRM CRM integration
├── messaging/               # Messaging abstractions
├── models/                  # Pydantic request/response models
│   ├── user.py, contractor.py, offer.py, offers.py, contractors.py
│   ├── residents.py, building.py, escalation.py
│   ├── messages.py, agent_state.py, agent_actions.py
├── orchestration/
│   └── graph.py             # LangGraph orchestrator (get_orchestrator)
├── rag/
│   └── pipeline.py          # RAG retrieval pipeline
├── services/                # Business logic layer
│   ├── payment.py           # Payment orchestration + Stripe webhooks
│   ├── invoice.py           # Invoice generation
│   ├── stripe_contractor_webhooks.py  # Contractor membership webhooks
│   ├── email.py, push.py    # Notification delivery
│   ├── whatsapp_bot.py      # WhatsApp bot
│   ├── enrichment.py        # Contractor data enrichment
│   ├── datagov_provider.py  # Israeli gov data API
│   ├── storage.py           # File storage
│   └── agent_config.py      # Agent configuration service
├── utils/
│   ├── monitoring.py        # Prometheus + Sentry init
│   ├── llm_client.py        # Unified LLM client (Anthropic/OpenAI)
│   └── validators.py        # Input sanitization
└── workers/
    ├── outbox_dispatcher.py  # RabbitMQ outbox pattern
    ├── worker_payments.py    # Async payment processing
    ├── worker_notifications.py # Notification delivery
    ├── worker_crm_sync.py    # EspoCRM sync
    ├── agent_worker.py       # Agent task queue
    ├── offer_lifecycle.py    # Offer state transitions
    └── scheduler.py          # Cron scheduler
```

## Web App (`apps/web/`)

```
apps/web/
├── app/                     # Next.js App Router
│   ├── (auth)/              # Login, register, password reset
│   ├── (resident)/          # Resident portal
│   │   ├── dashboard/
│   │   ├── offers/
│   │   ├── payments/
│   │   ├── chat/
│   │   ├── contractors/
│   │   ├── building/
│   │   └── profile/
│   ├── contractor/          # Contractor portal
│   │   ├── dashboard/
│   │   ├── offers/
│   │   ├── earnings/
│   │   ├── projects/
│   │   └── profile/
│   ├── buildings-manager/   # Buildings manager portal
│   ├── admin/               # Admin panel (within web app)
│   └── api/                 # Next.js API routes
├── components/
│   ├── auth/
│   ├── features/
│   ├── landing/
│   ├── layouts/
│   ├── payments/
│   ├── shared/
│   └── ui/
├── lib/
│   ├── stores/              # Zustand stores
│   │   ├── authStore.ts
│   │   ├── offerStore.ts
│   │   └── notificationStore.ts
│   ├── hooks/               # React Query hooks
│   │   ├── useApiData.ts
│   │   ├── useChat.ts
│   │   ├── useOffers.ts
│   │   └── useRealtimeOffers.ts
│   ├── api/                 # API client wrappers
│   ├── auth/                # Auth utilities
│   ├── supabase/            # Supabase client
│   └── utils/
├── __tests__/               # Vitest unit tests
├── e2e/                     # Playwright E2E tests (inc. Hebrew locale project)
├── messages/                # i18n translations (next-intl)
├── i18n/                    # next-intl config
├── styles/                  # Global CSS + Tailwind
└── types/                   # Local TypeScript types
```

## Key File Locations (Quick Reference)

| What | Where |
|------|-------|
| All shared TypeScript types | `packages/types/src/index.ts` |
| Pydantic models | `src/models/` |
| FastAPI route handlers | `src/api/routes/` (17 modules) |
| LangGraph agents | `src/agents/` (11 specialists) |
| Payment service | `src/services/payment.py` |
| Invoice service | `src/services/invoice.py` |
| asyncpg queries + pool | `src/databases/postgres.py` |
| DB migrations | `alembic/versions/` (44 versions) |
| Next.js pages | `apps/web/app/` |
| Zustand stores | `apps/web/lib/stores/` |
| React Query hooks | `apps/web/lib/hooks/` |
| E2E specs | `apps/web/e2e/` |
| Vitest unit tests | `apps/web/__tests__/` |
| Env vars (all 170+) | `.env.example` |
| Backend architecture ref | `design-system/BACKEND.md` |
| DB schema ref | `design-system/DATABASE.md` |

## Naming Conventions

| Context | Convention |
|---------|-----------|
| Python files | `snake_case.py` |
| Python classes | `PascalCase` |
| Python functions/methods | `snake_case` |
| TypeScript files | `camelCase.ts` / `PascalCase.tsx` for components |
| React components | `PascalCase` |
| Zustand stores | `*Store.ts` |
| React Query hooks | `use*.ts` |
| Next.js pages | `page.tsx`, `layout.tsx` |
| API routes | `src/api/routes/<resource>.py` |
| DB column lists | Defined at top of `src/databases/postgres.py` |
| REQ IDs | `[CATEGORY]-[NUMBER]` (e.g. AUTH-01) |
