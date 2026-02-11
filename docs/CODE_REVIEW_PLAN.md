# Code Review Implementation Plan

Based on [CODE_REVIEW.md](./CODE_REVIEW.md). Phases are ordered by priority; tasks within a phase can be parallelized where dependencies allow.

---

## Phase 1: Critical Fixes (Unblock Runtime)

**Goal:** Fix route prefixes and implement missing PostgresClient methods so offers, contractors, buildings, and escalations work end-to-end.

| # | Task | Owner | Deps | Notes |
|---|------|--------|------|--------|
| 1.1 | **Fix duplicate route prefix** | — | — | In `offers.py`, `contractors.py`, `buildings.py`, `escalations.py`, `agents.py`, `admin.py`, `webhooks.py`: change `APIRouter(prefix="/api/v1/...")` to `APIRouter()` (or empty prefix). Final path comes from `api_router` mount (`/api/v1`) + include_router prefix (`/offers`, etc.). |
| 1.2 | **Implement `is_user_in_building`** | — | — | In `postgres.py`: check `users.building_id` or `building_residents` for (user_id, building_id). Support both Supabase and asyncpg. |
| 1.3 | **Implement offer CRUD in PostgresClient** | — | 1.2 | `create_offer`, `get_offer`, `update_offer`, list (e.g. `list_offers` or reuse `get_active_offers` with filters), join-offer/participant logic. Match schema in `alembic/versions/001_initial_schema.py`. |
| 1.4 | **Implement contractor CRUD in PostgresClient** | — | — | `create_contractor` (user + contractor row or link), `list_contractors` (with filters), `get_contractor`. Align with contractors table and auth (password hash for contractor user). |
| 1.5 | **Implement escalation CRUD in PostgresClient** | — | — | `create_escalation`, `list_escalations` (filters, pagination), `get_escalation`, `update_escalation`, `get_escalation_stats`, `add_escalation_message`, `get_escalation_messages`. Match escalations + escalation_messages tables. |
| 1.6 | **Smoke-test routes** | — | 1.1–1.5 | Manually or via script: create offer, list offers, create contractor, list contractors, create/list/resolve escalation. Confirm no 404 and no AttributeError. |

**Exit criteria:** All affected API routes respond correctly with real DB (local or Supabase).

---

## Phase 2: Auth & Consistency

**Goal:** Align auth with frontend, fix refresh/cookie, resolve test vs route mismatches, and fix minor backend gaps.

| # | Task | Owner | Deps | Notes |
|---|------|--------|------|--------|
| 2.1 | **Auth login: JSON vs form** | — | — | Confirm web app calls `POST /api/v1/auth/login` with JSON body; ensure one route (e.g. `/login/json` or unified `/login` with JSON) returns `{ token, user?, expires_in }` and document. Update integration test if it should test JSON login. |
| 2.2 | **Refresh token from cookie** | — | — | In `refresh_token` endpoint: if `refresh_token` not in body, read from cookie (e.g. `request.cookies.get("refresh_token")`). Set cookie on response when `response` is not None. Document behavior in api_reference. |
| 2.3 | **Escalation resolve params** | — | — | Confirm escalation resolve: `resolution_notes` as query vs body. Update route or integration test so they match; prefer body for longer text. |
| 2.4 | **log_conversation for asyncpg** | — | — | In `postgres.py`: add asyncpg branch for `log_conversation` (insert into `conversation_logs` or equivalent table). If table missing, add migration and document. |
| 2.5 | **README vs LOCAL_SETUP** | — | — | Single source of truth: e.g. README “Quick Start” points to LOCAL_SETUP for full steps; README keeps minimal (clone, install backend with `pip install -e ".[dev]"`, docker compose, migrate, run). Remove or align `requirements.txt` usage. |
| 2.6 | **Admin escalations URL** | — | — | Change admin API client to use GET /escalations and POST /escalations/:id/resolve (with auth), or add proxy under /admin. |
| 2.7 | **Admin contractors** | — | 1.4 | Wire admin contractors list to GET /api/v1/contractors (admin auth) or add admin endpoint; remove or document mock. |
| 2.8 | **Admin analytics** | — | — | Add backend GET /api/v1/admin/analytics or Next.js API route; or use static/mock data with clear labeling. |

**Exit criteria:** Login/signup/refresh work from web; integration tests pass; docs consistent; admin escalations/contractors/analytics wired or documented.

---

## Phase 3: Tests & CI

**Goal:** Run integration tests in CI; add missing test coverage; harden E2E.

| # | Task | Owner | Deps | Notes |
|---|------|--------|------|--------|
| 3.1 | **Run integration tests in CI** | — | Phase 1 | New job (or extend backend job): run `pytest tests/integration/` with Redis (existing). Optionally use testcontainers or in-memory SQLite for Postgres if needed; otherwise keep mocks and ensure no missing attributes. |
| 3.2 | **Auth integration tests** | — | 2.1 | Signup (success, validation, email/phone uniqueness), login JSON, refresh, logout, `/me` with auth. |
| 3.3 | **Offers/buildings integration tests** | — | 1.3, 1.2 | Create offer (validation, 403 when not resident), list, get, join. Buildings: get, resident checks. |
| 3.4 | **PostgresClient tests** | — | 1.2–1.5 | Unit or integration tests for `create_user`, `get_user_by_email`/`get_user_by_phone`, `is_user_in_building`, `create_offer`, `list_offers`, `create_escalation`, `list_escalations` (with test DB or mocks). |
| 3.5 | **WhatsApp webhook test** | — | — | Test with sample payload: parse, mock orchestrator, assert response shape and status. |
| 3.6 | **E2E: fail CI on failure** | — | — | When E2E is stable: set `continue-on-error: false` for Playwright job. Optionally add API mocking or test backend for reliability. |
| 3.7 | **Root E2E script (optional)** | — | — | Add to root `package.json`: e.g. `"test:e2e": "pnpm --filter @groupio/web exec playwright test"` if E2E should be run from repo root. |

**Exit criteria:** Integration tests run in CI and pass; E2E either fails CI or is explicitly optional with clear docs.

---

## Phase 3b: Mobile & Client Alignment

**Goal:** Align mobile app with backend API so core flows work.

| # | Task | Owner | Deps | Notes |
|---|------|--------|------|--------|
| 3b.1 | **Mobile base URL** | — | — | Ensure mobile env (e.g. `EXPO_PUBLIC_API_URL`) uses base URL ending in `/api/v1` (e.g. `https://api.groupio.co.il/api/v1` or `http://localhost:8000/api/v1`). Update default in `lib/api.ts` if needed. |
| 3b.2 | **Mobile path alignment** | — | 3b.1 | In `lib/api.ts`: map `POST /chat` → `POST /message`; `GET /profile` → `GET /auth/me`; `PATCH /profile` → `PUT /auth/me`. Add auth header from token (already present). |
| 3b.3 | **Mobile optional endpoints** | — | — | Document or stub: `/activity`, `/contractors/matches`, `/buildings/:id/news`, `POST /profile/avatar`, `POST /chat/stream`. Either add backend routes later or have mobile handle 404 and show empty/offline state. |
| 3b.4 | **Mobile auth token** | — | — | Use SecureStore (or equivalent) for token in production; document in README or LOCAL_SETUP. |

**Exit criteria:** Mobile can call message and auth/me successfully against backend; offers/contractors work when backend and base URL are correct.

---

## Phase 4: API & Docs

**Goal:** Clear, consistent API surface and documentation.

| # | Task | Owner | Deps | Notes |
|---|------|--------|------|--------|
| 4.1 | **Update api_reference.md** | — | — | Document all route groups: auth (signup, register, login, refresh, logout, me, password, verify), offers, contractors, buildings, escalations, agents, admin, webhooks. Include request/response examples and auth requirements. |
| 4.2 | **OpenAPI / versioning** | — | — | Ensure `/openapi.json` (or `/docs` schema) is correct. Document that all routes are under `/api/v1` and any v2 strategy. |
| 4.3 | **Pagination standard** | — | — | Standardize list endpoints on e.g. `page`, `page_size` (or `limit`/`offset`). Document response shape (e.g. `{ items, total, page, page_size, has_more }`). |

**Exit criteria:** api_reference and OpenAPI match implementation; pagination is consistent and documented.

---

## Phase 5: Resilience & Security

**Goal:** Better error handling, security hardening, and operability.

| # | Task | Owner | Deps | Notes |
|---|------|--------|------|--------|
| 5.1 | **Frontend: error boundaries & loading** | — | — | Add error boundaries and loading states for signup, login, offer create. |
| 5.2 | **API client: 401 handling** | — | — | On 401: try refresh token (if implemented); else redirect to login or clear session. Optional retry/backoff for transient errors. |
| 5.3 | **Secrets in logs** | — | — | Audit `logger.*` and exception handlers; ensure tokens and passwords are never logged. |
| 5.4 | **Auth rate limits** | — | — | Consider separate rate limits for login, signup, password-reset (stricter than general API). |
| 5.5 | **Health: ready vs live** | — | — | Optional: `/health/live` (no DB) vs `/health/ready` (DB required). Document for k8s/Docker. |
| 5.6 | **Request ID / tracing** | — | — | Add request ID (e.g. middleware) and include in logs; optional user ID where authenticated. |
| 5.7 | **CORS & feature flags** | — | — | Document required CORS origins for production. Document feature flags (ENABLE_WEB_SEARCH, etc.) and how to toggle. |

**Exit criteria:** Critical user flows have clear loading/errors; auth is rate-limited and logs are safe; health and CORS documented.

---

## Phase 6: Optional Improvements

**Goal:** Maintainability and testability.

| # | Task | Owner | Deps | Notes |
|---|------|--------|------|--------|
| 6.1 | **Dependency injection** | — | — | Consider FastAPI `Depends()` or a small DI layer for `get_postgres_client`, `get_redis_client`, etc., to simplify testing and overrides. |
| 6.2 | **Frontend: API client tests** | — | — | Unit tests for api-client (error parsing, 401/429 handling, request shapes). |
| 6.3 | **E2E with mocked API** | — | — | Use MSW or Playwright route mocking so E2E doesn’t depend on live backend; faster and more stable. |
| 6.4 | **Admin escalations UI tests** | — | — | Loading, empty state, error state for escalations table. |
| 6.5 | **Use @groupio/ui in web/admin** | — | — | Optionally use shared UI package (Button, Input, Modal, Toast, etc.) in web and admin for consistency; add to next.config transpilePackages if used. |
| 6.6 | **Unify mobile API client** | — | 3b.2 | Consider replacing mobile `lib/api.ts` with `@groupio/api-client` plus mobile-specific methods (stream, activity, etc.) to reduce drift. |

**Exit criteria:** Agreed improvements merged; no hard deadline.

---

## Dependency Overview

```
Phase 1.1 (prefix) ──────────────────────────────────────────────┐
Phase 1.2 (is_user_in_building) ─────────────────────────────────┤
Phase 1.3 (offers) ─────────────────────────────────────────────┤
Phase 1.4 (contractors) ────────────────────────────────────────┼──► Phase 1.6 (smoke)
Phase 1.5 (escalations) ───────────────────────────────────────┘

Phase 2 (auth & consistency) ───────────────────────────────────► Phase 3.1 (integration in CI)
Phase 1 done ──────────────────────────────────────────────────► Phase 3.2–3.5 (new tests)
```

---

## Checklist Summary

- [ ] **Phase 1:** Route prefix fix + all PostgresClient methods + smoke test
- [ ] **Phase 2:** Auth alignment, refresh cookie, escalation params, log_conversation, README/LOCAL_SETUP, **admin escalations URL, admin contractors, admin analytics**
- [ ] **Phase 3:** Integration tests in CI, new auth/offers/postgres/webhook tests, E2E policy
- [ ] **Phase 3b:** Mobile base URL, path alignment (chat→message, profile→auth/me), optional endpoints doc/stub, auth token storage
- [ ] **Phase 4:** api_reference, OpenAPI, pagination standard
- [ ] **Phase 5:** Frontend resilience, 401 handling, secrets audit, rate limits, health, tracing, CORS/docs
- [ ] **Phase 6:** DI, frontend/client tests, E2E mocking, admin UI tests, @groupio/ui in web/admin, mobile client unification (as capacity allows)

---

*Plan derived from [CODE_REVIEW.md](./CODE_REVIEW.md). Covers backend, web, admin, mobile, and packages. Update when tasks are completed or scope changes.*
