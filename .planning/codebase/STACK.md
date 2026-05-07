---
last_mapped: 2026-05-06
---

# Tech Stack

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
