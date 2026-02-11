# Groupio Multi-Agent System – Code Review Summary

**Date:** February 2026  
**Scope:** Full codebase review (backend, frontend, tests, config, CI/CD).

---

## 1. What Has Been Done

### Backend (Python/FastAPI)
- **API layer:** FastAPI app with `/api/v1` prefix; CORS, request logging, global exception handler; health check and service health (vector, graph, Redis, Postgres).
- **Routes:** Auth (signup, register, login form + JSON, refresh, logout, me, password change/reset, verify email), offers, contractors, buildings, escalations, agents, admin, webhooks. Main chat endpoint: `POST /api/v1/message`.
- **Auth:** JWT access + refresh tokens; bcrypt passwords; Redis refresh storage; OAuth2PasswordBearer; admin via `get_admin_user`; API key support.
- **Agents:** Router, Matching, Pricing, Vetting, Support, Outreach, Analytics with unit tests and mocks.
- **Orchestration:** LangGraph workflow; message flow with rate limiting and conversation logging.
- **RAG:** Chunking, embeddings, pipeline, reranking; vector (Qdrant) and graph (Neo4j) stores.
- **Databases:** PostgresClient with Supabase or local asyncpg; RedisClient (conversation, cache, rate limit, tokens); vector/graph clients.
- **Config:** Pydantic Settings; env from `.env` / `docker/.env`; JWT, CORS, rate limit, WhatsApp, email, feature flags.
- **Migrations:** Alembic with initial schema (users, buildings, building_residents, contractors, offers, offer_participants, contractor_reviews, escalations, escalation_messages, chat_messages, agent_metrics, invitations).

### Frontend (Turborepo)

- **Web (Next.js 14):** App Router; (auth) login/signup/onboarding; (resident) dashboard, building, offers, contractors, profile; (contractor) dashboard, offers/active/create, profile, projects; i18n (next-intl) EN/HE RTL; API client (`/api/v1`); auth store; Supabase client; providers. Uses `@groupio/types`, `@groupio/api-client`, `@groupio/utils` (not `@groupio/ui`).
- **Admin:** Dashboard, agents, analytics, contractors, escalations; AgentCard, EscalationsTable, MetricCard, AgentMetricsChart; `GroupioApiClient` for status, metrics, health; escalations/resolve use **wrong path** (`/admin/escalations`); contractors list is **mock data**; analytics page calls non-existent `/api/admin/analytics`. Uses `@groupio/types`, `@groupio/api-client`, `@groupio/utils`.
- **Mobile (Expo 51):** Tabs (index, chat, offers, profile); components (CategoryChip, ChatBubble, MobileOfferCard, StatCard); **own `lib/api.ts`** (not shared api-client for most calls); TanStack Query hooks; storage, notifications. Uses `@groupio/types`, `@groupio/utils`; api-client in deps but chat/offers/contractors use local api. **API base URL** is `https://api.groupio.co.il/v1` (missing `/api`); **endpoints** (`/chat`, `/profile`, `/activity`, `/contractors/matches`, `/buildings/:id/news`) do not match backend (`/api/v1/message`, `/api/v1/auth/me`, etc.).
- **Packages:**
  - **types:** Resident, Building, Contractor, Offer, Message, MessageRequest/Response, AgentResponse, Escalation, SystemStatus, enums (ServiceCategory, Region, OfferStatus, Channel, etc.). Used by web, admin, mobile.
  - **api-client:** `GroupioApiClient` – sendMessage, getHealth, getOffers, joinOffer, getContractor, getBuilding, getMetrics, getEscalations, getSystemStatus. Used by **web** (custom client in `apps/web/lib/api/client.ts` that mirrors paths) and **admin**; **mobile** uses its own `lib/api.ts` with different paths and shapes.
  - **ui:** Design tokens + Button, Input, Select, Modal, Toast, LoadingSpinner, Navbar, Sidebar, Footer, Textarea, Checkbox, Radio, Switch, ErrorBoundary, SocialAuthButtons. **Not** transpiled by web; used in tests (admin/mobile vitest alias). Consider using in web/admin for consistency.
  - **utils:** formatPrice, formatDate, formatPercentage, formatPhoneNumber; category/region names and translation (HE/EN). Used by web and mobile.

### DevOps & Quality
- **CI (GitHub Actions):** Backend lint (Ruff, format), frontend lint (ESLint, typecheck), security (Trivy, Gitleaks), dependency review, backend unit tests (with Redis service), frontend tests, build, Docker build, E2E (main/dev, Playwright, continue-on-error), Codecov upload.
- **Docker:** Dockerfile, docker-compose (Redis, Qdrant, Neo4j, Postgres), `.env.example`.
- **Docs:** README, LOCAL_SETUP.md, architecture, api_reference, agent_behaviors, deployment, rag_guide.

---

## 2. What’s Left To Do

- **PostgresClient:** Implement all missing methods (see Issues below) so offers, contractors, buildings, and escalations work without mocks.
- **Run integration tests in CI:** Backend CI runs only `tests/unit/`; add a job to run `tests/integration/` (with DB/Redis or testcontainers).
- **E2E:** Make E2E non–continue-on-error so failures fail the pipeline; consider API mocking or test backend for stability.
- **API docs:** Align `docs/api_reference.md` with actual routes (auth, offers, contractors, buildings, escalations, agents, admin).
- **Refresh token from cookie:** Auth refresh endpoint should accept refresh token from cookie when not in body (for browser flows).
- **Web app:** No `test:e2e` script in root; add if E2E should run from root (e.g. `pnpm --filter @groupio/web exec playwright test`).
- **Mobile:** Align `apps/mobile/lib/api.ts` with backend: base URL should include `/api` (e.g. `…/api/v1`); map `/chat` → `/message`, `/profile` → `/auth/me`; add or stub `/activity`, `/contractors/matches`, `/buildings/:id/news`, `/profile/avatar` if backend adds them.
- **Admin:** Fix escalations URLs (client calls `/admin/escalations`, backend has `/escalations`); wire contractors list to backend or document mock; add backend or Next.js API route for analytics, or remove analytics fetch.
- **Packages:** Unify API usage: either have mobile use `@groupio/api-client` with correct base URL and paths, or document why mobile keeps its own client. Optionally use `@groupio/ui` in web/admin for shared components.

---

## 3. Issues

### Critical (runtime / correctness)
1. **Duplicate route prefix (API 404 risk)**  
   Child routers define full path in `APIRouter(prefix="/api/v1/...")` while the main app mounts `api_router` with `prefix="/api/v1"`. That can produce paths like `/api/v1/offers/api/v1/offers/` (or similar duplication).  
   **Fix:** In `offers.py`, `contractors.py`, `buildings.py`, `escalations.py`, `agents.py`, `admin.py`, `webhooks.py`, use a prefix relative to mount (e.g. `""` or `"/"`) so final path is `/api/v1/offers`, `/api/v1/contractors`, etc.

2. **Missing PostgresClient methods**  
   The following are called from routes but **not implemented** in `src/databases/postgres.py`:
   - `is_user_in_building(user_id, building_id)` – used in `offers.py`, `buildings.py`
   - `create_offer`, `list_offers` (or equivalent list), `get_offer`, `update_offer`, offer join/participant logic – used in `offers.py`
   - `create_contractor`, `list_contractors`, `get_contractor` – used in `contractors.py`
   - `create_escalation`, `list_escalations`, `get_escalation`, `update_escalation`, `get_escalation_stats`, `add_escalation_message`, `get_escalation_messages` – used in `escalations.py`  
   Without these, create/list/get/update for offers, contractors, and escalations will raise `AttributeError` at runtime.

### Medium
3. **Auth login vs frontend:** Web client uses JSON login; backend has both form (`/login`) and `POST /login/json`. Integration test uses form (`data={"username", "password"}`). Ensure frontend calls `/api/v1/auth/login` with JSON and that the route used returns the same shape (token + user if applicable).

4. **Auth refresh_token endpoint:** `refresh_token(response: Response = None)` – when refresh is sent in body, `response` is None so cookie is not set. Document or support reading refresh token from cookie when not in body for browser clients.

5. **Escalation resolve route vs integration test:** Test calls `POST /api/v1/escalations/esc-123/resolve` with `params={"resolution_notes": "..."}`. Actual route is `POST /{escalation_id}/resolve` with optional `resolution_notes`; confirm param name and location (query vs body) match.

### Minor
6. **log_conversation:** When using local Postgres (asyncpg), `log_conversation` in postgres.py only implements Supabase path; asyncpg path is missing (no insert into `conversation_logs`). Add asyncpg implementation or document Supabase-only.

7. **LOCAL_SETUP.md vs README:** README uses `requirements.txt` and `pip install -r requirements.txt`; LOCAL_SETUP uses `pip install -e ".[dev]"` and `docker compose`. Align so one source of truth (e.g. LOCAL_SETUP for dev, README quick start points to it).

### Frontend / Client
8. **Mobile API mismatch:** Mobile `lib/api.ts` uses base URL `https://api.groupio.co.il/v1` (no `/api`). Paths used: `GET/POST /offers`, `POST /offers/:id/join`, `GET /contractors`, `GET /contractors/matches`, `GET/PATCH /profile`, `POST /profile/avatar`, `POST /chat`, `POST /chat/stream`, `GET /activity`, `GET /buildings/:id/news`. Backend has `POST /api/v1/message` (not `/chat`), `GET /api/v1/auth/me` (not `/profile`), `GET /api/v1/offers`, etc. No backend routes for `/activity`, `/contractors/matches`, `/chat/stream`, `/buildings/:id/news`, `/profile/avatar`. Mobile will get 404 or wrong paths until aligned.

9. **Admin escalations URL:** Admin API client calls `GET /admin/escalations` and resolve uses `POST /admin/escalations/:id/resolve`. Backend exposes `GET /api/v1/escalations` and `POST /api/v1/escalations/:id/resolve`. Admin requests hit wrong path unless proxy or client is fixed.

10. **Admin analytics 404:** Admin analytics page fetches `GET /api/admin/analytics`. No Next.js route in `apps/admin/app/api/` and no backend route; request 404s.

11. **Admin contractors mock:** Admin contractors list is hardcoded in `lib/hooks.ts`; no call to backend. Backend has no `GET /admin/contractors`; list would need to use `GET /api/v1/contractors` with admin auth or a dedicated admin endpoint.

---

## 4. Areas To Improve

- **Backend**
  - Add integration tests to CI (with Redis; optional Postgres/Qdrant/Neo4j or mocks).
  - Implement all PostgresClient methods used by routes; add unit tests for postgres module where feasible.
  - Consider dependency injection for `get_postgres_client`, `get_redis_client`, etc., to simplify testing.
  - Add request validation tests for auth (signup schema, phone pattern, role).

- **Frontend**
  - Add error boundaries and loading states on critical flows (signup, login, offer create).
  - Consider retry/backoff for API client and explicit handling of 401 (e.g. refresh or redirect to login).
  - E2E: add API mocking or dedicated test backend to avoid flakiness and speed.

- **API**
  - Versioning: document that all routes are under `/api/v1` and any future v2 strategy.
  - OpenAPI: ensure tags and descriptions are consistent; expose `/openapi.json` if not already.
  - Pagination: standardize query params (e.g. `page`, `page_size`) and response shape across list endpoints.

- **Security**
  - Ensure no secrets in logs (tokens, passwords); audit `logger.*` and exception handlers.
  - Rate limit auth endpoints (login, signup, password reset) separately if needed.
  - CORS: keep origin list strict in production; LOCAL_SETUP/README should document required origins.

- **Operations**
  - Health check: consider a “ready” vs “live” distinction (e.g. DB required for ready).
  - Structured logging: ensure request IDs and user IDs where appropriate for tracing.
  - Feature flags (e.g. ENABLE_WEB_SEARCH, ENABLE_GRAPH_QUERIES): document and test toggling.

---

## 5. Tests Done

### Backend (Python)
- **Unit (pytest):**
  - Agents: router, matching, pricing, vetting, support, outreach, analytics.
  - Utils: validators, hebrew_utils, chunking.
  - Conftest: mock LLM, RAG, vector, graph, postgres, Redis, sample AgentState.
- **Integration:**
  - `test_api_routes.py`: health (healthy/degraded), message (success, rate limit, invalid input), offers (list, create), contractors (list, get, get not found), auth (register, register email exists, login success, login invalid), escalations (list admin, list non-admin 403, resolve).
  - `test_end_to_end.py`: contractor search, low-confidence → support, pricing query, support query (all with mocked orchestrator deps).

### Frontend
- **Web:** Vitest – AIChat, authStore, OfferCard, StatCard (see `apps/web/__tests__/`).
- **Admin:** Dashboard test, setup (see `apps/admin/__tests__/`).
- **Mobile:** MobileOfferCard test, setup (see `apps/mobile/__tests__/`).
- **E2E (Playwright):** Web – resident-flow, contractor-flow; Admin – admin-flow (see `apps/web/e2e/`, `apps/admin/e2e/`).

### CI
- Backend: `pytest tests/unit/` with coverage and Redis service.
- Frontend: `pnpm test` (turbo test across apps).
- E2E: only on main/dev, continue-on-error: true.

---

## 6. Tests To Add

- **Backend**
  - Integration tests for auth: signup (success, validation, phone/email uniqueness), login JSON, refresh, logout, me (with real or test client).
  - Integration tests for offers: create (validation, 403 when not resident), list (filtering), get, join (with mocked or test DB).
  - Integration tests for buildings: get, list (if any), resident checks.
  - PostgresClient: unit or integration tests for `create_user`, `get_user_by_email`, `get_user_by_phone`, and (once implemented) `is_user_in_building`, `create_offer`, `list_offers`, `create_escalation`, `list_escalations`.
  - WhatsApp webhook: test with sample payload (parse, orchestrate mock, response).

- **Frontend**
  - Web: signup form validation, login form, API client error handling (401, 429, network).
  - Admin: escalations table (loading, empty, error); fix escalations/resolve URLs; contractors from API or document mock; analytics route or remove.
  - Mobile: API client aligned with backend (base URL, /message vs /chat, /auth/me vs /profile); tests for api.ts and hooks.
  - Shared packages: api-client and types (e.g. request/response shapes); consider using @groupio/ui in web/admin.

- **E2E**
  - Full signup → login → create offer (or join offer) with mocked API or test backend.
  - Contractor: login → create offer → view active offers.
  - Admin: login → view escalations → resolve (if applicable).

- **CI**
  - Run `tests/integration/` in CI (with Redis and optionally other deps).
  - Optionally fail E2E instead of continue-on-error once stable.

---

## 7. Quick Reference

| Area              | Status | Notes |
|-------------------|--------|--------|
| API routes        | Done   | Fix duplicate prefix; add missing postgres methods |
| Auth (JWT, signup, login) | Done | Align login JSON vs form; refresh cookie |
| Agents + orchestration | Done | Unit tests in place |
| RAG + vector/graph | Done | — |
| PostgresClient    | Partial | Many methods missing (offers, contractors, escalations, buildings, is_user_in_building) |
| RedisClient       | Done   | — |
| Web app (resident/contractor) | Done | Uses types, api-client, utils; contractor under `app/contractor/` |
| Admin app         | Done   | Escalations wrong URL; contractors mock; analytics 404 |
| Mobile app        | Done   | Own api.ts; base URL and endpoints don’t match backend |
| Packages (types, api-client, ui, utils) | Done | types/api-client/utils used; ui not used by web |
| Unit tests (backend) | Done | Good coverage for agents and utils |
| Integration tests | Done | Not run in CI; depend on mocks |
| E2E               | Done   | continue-on-error; consider hardening |
| CI/CD             | Done   | Add integration job; optional E2E strict |
| Docs              | Done   | Update api_reference and align README/LOCAL_SETUP |

---

*Full project code review (backend, web, admin, mobile, packages). Address critical issues first (route prefix, PostgresClient), then admin/mobile client URLs and missing backend endpoints.*
