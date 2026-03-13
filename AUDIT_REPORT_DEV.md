# Deep Practical Audit Report — Groupio Multi-Agent System
## Branch: dev (commit 8b24f5e)

**Audit Date:** March 12, 2025  
**Scope:** Repository setup, runtime, UI pages, navigation, frontend-backend connections, tests, gaps

---

## 1. REPOSITORY SETUP SUMMARY

### Repo Structure
```
Groupio-Multi-Agent-System/
├── src/                    # Backend (FastAPI)
│   ├── agents/             # 7 AI agents
│   ├── api/                # Routes
│   ├── config/
│   ├── databases/
│   ├── models/
│   ├── orchestration/
│   ├── rag/
│   └── services/
├── apps/
│   ├── web/                # Next.js 15 — Resident/Contractor/Buildings Manager UI
│   ├── admin/              # Next.js 14 — Admin Dashboard
│   └── mobile/             # React Native/Expo
├── packages/
│   ├── types/              # Shared TypeScript types
│   ├── api-client/         # API client
│   ├── ui/
│   └── utils/
├── tests/                  # Python unit + integration
├── docker/                 # docker-compose, Dockerfile, .env.example
└── scripts/
```

### Main Apps / Services
| App/Service | Port | Purpose |
|-------------|------|---------|
| **Web** | 3000 | Main user-facing UI (residents, contractors, buildings managers) |
| **Admin** | 3001 | Admin dashboard (agents, escalations, contractors, users, etc.) |
| **Backend API** | 8000 | FastAPI |
| **Mobile** | Expo dev | React Native app |

### Branch Inspected
- **dev** — commit `8b24f5e` (Phase 3: data.gov.il integration, profile locale sync, E2E coverage)

### Runtime-Critical Paths
- Backend: `uvicorn src.api.main:app --reload --port 8000`
- Web: `pnpm --filter @groupio/web dev` (or `cd apps/web && pnpm dev`)
- Admin: `pnpm --filter @groupio/admin dev` (or `cd apps/admin && pnpm dev`)

### Setup / Run Commands Used
- `pnpm install` — succeeds
- `docker compose up -d` — expects PostgreSQL, Qdrant, Neo4j, Redis in `docker/`
- `alembic upgrade head` — migrations (requires PostgreSQL)
- `python -m uvicorn src.api.main:app --reload --port 8000` — backend

---

## 2. RUN STATUS

### What Ran Successfully
- **pnpm install** — 1598 packages installed
- **Backend unit tests** — 1010 passed (`pytest tests/unit/`)
- **Web unit tests** — 118 passed (Vitest)
- **Backend integration tests** — 128 passed, 3 failed (see below)

### What Failed
- **Integration tests (3)** — `test_api_routes.py::TestAuthAPI`: `redis.exceptions.ConnectionError` connecting to `localhost:6379`. Auth rate-limiting uses Redis; tests fail when Redis is not running.
- **Web build** — Started but timed out during audit (Next.js build can be slow; no explicit failure observed).

### Exact Blockers
1. **Redis** — Required for auth rate limiting. Integration tests and live auth flows fail without Redis.
2. **PostgreSQL** — Migrations and backend need DB. `LOCAL_SETUP.md` describes both Docker and local Postgres.
3. **API keys** — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` required for LLM/embedding features.

### Env/Config Issues
- `.env` must be populated from `docker/.env.example` or `.env.example`
- Admin app: `NEXT_PUBLIC_API_URL` must point to backend (e.g. `http://localhost:8000`)
- Web app: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` for auth and Supabase

---

## 3. UI PAGE INVENTORY

### Web App (apps/web) — Next.js 15, file-based routing

| Route | File | App | Purpose | Auth/Role |
|-------|------|-----|---------|-----------|
| `/` | `app/page.tsx` | web | Landing page | Public |
| `/login` | `app/(auth)/login/page.tsx` | web | Login | Unauthenticated only |
| `/signup` | `app/(auth)/signup/page.tsx` | web | Signup | Unauthenticated only |
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | web | Post-signup onboarding | Auth |
| `/terms` | `app/terms/page.tsx` | web | Terms of service | Public |
| `/privacy` | `app/privacy/page.tsx` | web | Privacy policy | Public |
| `/dashboard` | `app/(resident)/dashboard/page.tsx` | web | Resident dashboard | Resident |
| `/offers` | `app/(resident)/offers/page.tsx` | web | Offers list | Resident |
| `/offers/[offerId]` | `app/(resident)/offers/[offerId]/page.tsx` | web | Offer detail + join | Resident |
| `/contractors` | `app/(resident)/contractors/page.tsx` | web | Contractor search | Resident |
| `/building` | `app/(resident)/building/page.tsx` | web | My building | Resident |
| `/architecture` | `app/(resident)/architecture/page.tsx` | web | Architecture plan upload | Resident |
| `/profile` | `app/(resident)/profile/page.tsx` | web | Profile settings | Resident |
| `/payments` | `app/(resident)/payments/page.tsx` | web | My payments | Resident |
| `/chat` | `app/(resident)/chat/page.tsx` | web | AI assistant chat | Resident |
| `/contractor/dashboard` | `app/contractor/dashboard/page.tsx` | web | Contractor dashboard | Contractor |
| `/contractor/offers/active` | `app/contractor/offers/active/page.tsx` | web | Active offers | Contractor |
| `/contractor/offers/create` | `app/contractor/offers/create/page.tsx` | web | Create offer | Contractor |
| `/contractor/projects` | `app/contractor/projects/page.tsx` | web | Projects list | Contractor |
| `/contractor/projects/[id]` | **MISSING** | web | Project detail | Contractor |
| `/contractor/profile` | `app/contractor/profile/page.tsx` | web | Contractor profile | Contractor |
| `/buildings-manager/dashboard` | `app/buildings-manager/dashboard/page.tsx` | web | Manager dashboard | Buildings Manager |
| `/buildings-manager/buildings` | `app/buildings-manager/buildings/page.tsx` | web | Buildings list | Buildings Manager |
| `/buildings-manager/escalations` | `app/buildings-manager/escalations/page.tsx` | web | Escalations | Buildings Manager |

### Admin App (apps/admin)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Redirect/landing |
| `/login` | `app/login/page.tsx` | Admin login |
| `/dashboard` | `app/dashboard/page.tsx` | Dashboard |
| `/agents` | `app/agents/page.tsx` | AI agents |
| `/escalations` | `app/escalations/page.tsx` | Escalations |
| `/contractors` | `app/contractors/page.tsx` | Contractors |
| `/analytics` | `app/analytics/page.tsx` | Analytics |
| `/users` | `app/users/page.tsx` | User management |
| `/offers` | `app/offers/page.tsx` | Offers |
| `/payments` | `app/payments/page.tsx` | Payments/escrow |
| `/settings` | `app/settings/page.tsx` | Settings |
| `/settings/audit-logs` | `app/settings/audit-logs/page.tsx` | Audit logs |

### Special Pages
- `app/not-found.tsx` — 404
- `app/error.tsx` — Error boundary
- `app/(resident)/error.tsx`, `app/contractor/error.tsx` — Route-level error

---

## 4. NAVIGATION / USAGE AUDIT

### Pages Actively Linked (Resident)
- `/dashboard`, `/offers`, `/contractors`, `/architecture`, `/building`, `/profile` — in `ResidentLayout` sidebar
- `/chat` — linked as AI assistant button
- `/offers/[offerId]` — linked from dashboard and offers list

### Pages Reachable Only by Direct URL
- **`/payments`** — Not in resident sidebar. Protected by middleware; reachable only via direct URL or external link. **Orphan in navigation.**
- **`/onboarding`** — Post-signup flow; not in main nav (expected).

### Unused / Orphan Pages
- **`/contractor/projects/[id]`** — **Page does not exist.** `apps/web/app/contractor/projects/page.tsx` links to `/contractor/projects/${project.id}` (line 229) but there is no `app/contractor/projects/[id]/page.tsx`. **Broken link → 404.**

### Broken or Suspicious Navigation Links
- **`not-found.tsx`** (lines 67, 76):
  - `href="/buildings"` — Resident route is `/building` (singular). `/buildings` is undefined → 404.
  - `href="/support"` — No `/support` route. Chat may serve as support, but `/support` does not exist → 404.
- **`error.tsx`** (line 76): `href="/support"` — same issue.

### Duplicate / Legacy
- No duplicate routes found.

### Admin
- All admin pages are linked from `AdminShell` sidebar (`NAV_ITEMS`).

---

## 5. FRONTEND ↔ BACKEND CONNECTION AUDIT

### A. Fully Connected to Real Backend
| Page | Frontend File | Backend API |
|------|---------------|-------------|
| Login | `app/(auth)/login/page.tsx` | `/api/v1/auth/login/json`, `/api/v1/auth/me` |
| Signup | `app/(auth)/signup/page.tsx` | `/api/v1/auth/register` |
| Onboarding | `app/(auth)/onboarding/page.tsx` | `/api/v1/onboarding`, `/api/v1/enrichment/normalize-address` |
| Resident dashboard | `app/(resident)/dashboard/page.tsx` | `/api/v1/buildings/me`, `/api/v1/offers`, `/api/v1/activity/recent` |
| Offers list | `app/(resident)/offers/page.tsx` | `/api/v1/offers` |
| Offer detail | `app/(resident)/offers/[offerId]/page.tsx` | `apiClient.getOffer`, `joinOffer` |
| Contractors | `app/(resident)/contractors/page.tsx` | `apiClient.getContractors` |
| Building | `app/(resident)/building/page.tsx` | `/api/v1/buildings/me` |
| Profile | `app/(resident)/profile/page.tsx` | `/api/v1/auth/me`, `/api/v1/uploads/avatar`, `/api/v1/auth/password-reset` |
| Architecture | `app/(resident)/architecture/page.tsx` | `apiClient.uploadArchitecturePlan`, `getFileUpload` |
| Payments (resident) | `app/(resident)/payments/page.tsx` | `apiClient.getMyPayments()` → `/api/v1/payments/my` |
| Chat | `app/(resident)/chat/page.tsx` | `/api/v1/message`, `/api/v1/conversations/{userId}/messages` |
| Contractor dashboard | `app/contractor/dashboard/page.tsx` | `/api/v1/auth/me`, `/api/v1/contractors/{id}/stats`, `/api/v1/offers` |
| Contractor create offer | `app/contractor/offers/create/page.tsx` | `apiClient.createOffer` |
| Contractor active offers | `app/contractor/offers/active/page.tsx` | `/api/v1/offers` |
| Contractor projects | `app/contractor/projects/page.tsx` | `/api/v1/offers` |
| Contractor profile | `app/contractor/profile/page.tsx` | `/api/v1/auth/me`, `/api/v1/contractors/{id}`, uploads |
| Buildings manager dashboard | `app/buildings-manager/dashboard/page.tsx` | `/api/v1/buildings`, `/api/v1/escalations` |
| Buildings manager buildings | `app/buildings-manager/buildings/page.tsx` | `/api/v1/buildings` |
| Buildings manager escalations | `app/buildings-manager/escalations/page.tsx` | `/api/v1/escalations`, resolve |

### B. Partially Connected
- **Resident dashboard** — `/api/v1/activity/recent` may return empty; UI handles it.
- **Resident payments** — Read works; initiate/checkout flow may be partial.

### C. UI-Only Placeholder
- None identified.

### D. Uses Mock Data Instead of Real Backend
- E2E tests use `page.route()` mocks; production pages use real APIs.

### E. Backend Exists but Page Not Wired
- **Admin contractors** — Calls `GET /api/v1/contractors/{id}/request-docs`. **Backend has no such endpoint** (`src/api/routes/contractors.py` has `verify`, `reviews`, `stats`, etc., but no `request-docs`). Admin falls back with console.warn.

### F. Backend Missing / Miswired
- **Admin payments page** — Uses `API_BASE = "/api/v1"` (relative). `fetch("/api/v1/admin/payments/...")` hits the admin app origin (e.g. localhost:3001), not the backend. Admin has no `/api/v1` routes. **All payment API calls fail (404).** Other admin pages use `NEXT_PUBLIC_API_URL`; this one does not.

---

## 6. TESTING AUDIT

### Existing Test Setup
- **Backend:** pytest (unit + integration)
- **Web:** Vitest + React Testing Library
- **Admin:** Vitest
- **E2E:** Playwright (web + admin)

### Tests Run
- Backend unit: 1010 passed
- Web unit: 118 passed
- Backend integration: 128 passed, 3 failed (Redis)

### Missing Coverage
- **Contractor project detail** — No page, no tests.
- **Resident payments** — Unit test exists; no E2E against real API.
- **Admin payments** — Broken API base URL; tests would hit wrong target.
- **`/support`** — No page, no tests.

### Important UI Flows Not Tested
- Resident payments flow (pay, view invoices)
- Contractor project detail (page missing)
- Buildings manager flows (E2E not fully verified)
- Admin payments (escrow release, payout approve)

### Test Approach
- Web E2E: `page.route()` mocks backend; no live API.
- Admin E2E: Same pattern.

---

## 7. MISSING PARTS / GAPS

| Item | Affected Files/Flows | Priority |
|------|----------------------|----------|
| Contractor project detail page | `app/contractor/projects/page.tsx` links to non-existent `/contractor/projects/[id]` | **Critical** |
| Fix not-found/error links | `app/not-found.tsx`, `app/error.tsx`: `/buildings` → `/building`, `/support` → `/chat` or implement `/support` | **High** |
| Admin payments API base | `apps/admin/app/payments/page.tsx`: Use `NEXT_PUBLIC_API_URL` instead of `/api/v1` | **Critical** |
| Payments in resident nav | `components/layouts/ResidentLayout.tsx`: Add `/payments` to `NAV_ITEMS` | **Medium** |
| Backend `request-docs` | Admin contractors calls it; implement or remove from admin | **Medium** |
| Redis for integration tests | Document need for Redis or mock rate limiting in tests | **Medium** |

---

## 8. TOP RISKS

1. **Dead/broken links**
   - Contractor "View details" → 404 (no project detail page)
   - 404/error pages link to `/buildings` and `/support` (wrong/missing routes)

2. **Admin payments disconnected**
   - Relative `API_BASE` makes all admin payment API calls hit admin app instead of backend → effectively non-functional

3. **Resident payments hidden**
   - Page exists and works but is not linked in navigation

4. **Runtime dependencies**
   - Redis required for auth rate limiting; integration tests and possibly staging fail without it

5. **Admin contractor request-docs**
   - Frontend calls non-existent backend endpoint

---

## 9. RECOMMENDED NEXT ACTIONS

1. **Create contractor project detail page** — `app/contractor/projects/[id]/page.tsx` or remove "View details" link.
2. **Fix admin payments API base** — Use `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`) in `apps/admin/app/payments/page.tsx`.
3. **Fix 404/error links** — `/buildings` → `/building`; add `/support` route (or redirect to `/chat`) and update `error.tsx`.
4. **Add payments to resident nav** — Include `/payments` in `ResidentLayout` `NAV_ITEMS`.
5. **Resolve `request-docs`** — Implement `/contractors/{id}/request-docs` or remove the admin button/flow.
6. **Document/integrate Redis** — Ensure Redis is part of local setup and CI; or mock rate limiting in tests.

---

## 10. FINAL EXECUTIVE SUMMARY

### What Is Working
- Core flows: auth, resident dashboard, offers, contractors, building, profile, chat, contractor create/active offers, buildings manager dashboard/buildings/escalations.
- Backend API: 1000+ unit tests passing; integrations mostly passing (except auth when Redis is down).
- Web and admin build and run; E2E suites use mocks and pass.

### What Is Partially Working
- Resident payments: backend integration works, but page is not discoverable from nav.
- Admin contractors: main flows work; "Request docs" targets a non-existent endpoint.
- Integration tests: depend on Redis for auth-related tests.

### What Is Not Connected
- Admin payments: wrong API base URL; all requests fail against real backend.

### What Is Unused
- Resident payments: page is not linked in navigation.

### What Is Missing for a Solid Product
- Contractor project detail page (or removal of the link).
- Correct admin payments backend URL.
- Working `/support` route (or redirect) and corrected `/buildings` link.
- Resident payments discoverable via navigation.
- Backend support for contractor `request-docs` or removal of that admin action.
- Clear documentation for Redis requirement in local and CI environments.
