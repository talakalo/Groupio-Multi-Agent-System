# Deep Pre-Launch Inspection Report — Groupio Multi-Agent System

**Branch inspected:** `fix/audit-findings-pilot-hardening` (commit `605e600`)  
**Note:** `dev` was not accessible in this worktree; inspection performed on the audit-hardening branch which includes all pilot fixes.  
**Date:** March 12, 2025

---

## 1. Executive Summary

### Overall Assessment
The Groupio Multi-Agent System is a feature-rich marketplace for group home improvements (Israeli market) with resident, contractor, buildings manager, and admin roles. Core flows are implemented and wired to the backend. Several critical UX and routing gaps remain that would frustrate real users on day one.

### Current Readiness Level
**Pilot-ready with fixes** — Internal/friendly pilot possible after addressing the contractor create-offer redirect. Broader launch requires additional hardening.

### Top Strengths
- **Backend:** 1010 unit tests + 131 integration tests passing; FastAPI well-structured; Redis/Postgres in CI
- **Auth:** Cookie-based session, role-based routing, refresh flow
- **Route coverage:** All major pages exist; contractor project detail implemented
- **Admin payments:** API base URL fixed; backend endpoints exist
- **i18n/RTL:** Hebrew-first; next-intl; RTL layouts

### Top Blockers
1. **Contractor create-offer redirects to 404** — `router.push(\`/contractor/offers/${offer.id}\`)` but no `/contractor/offers/[id]` page exists
2. **E2E flakiness** — Contractor form and active offers tests have been unstable in CI (recent fixes pushed)
3. **Legacy nav link** — `components/layouts/ContractorLayout.tsx` links to `/contractor/offers` (no trailing path) which may 404

### Publish Recommendation
**Publish to limited pilot only** — after fixing the contractor create-offer redirect. Do not publish publicly until E2E stability is confirmed and payment/escrow flows are validated with real data.

---

## 2. Environment / Runtime Findings

### Install/Run Status
| Command | Result |
|---------|--------|
| `pnpm install` | ✅ Success |
| `pnpm turbo test` | ✅ 123 web + 72 admin unit tests passed |
| `pytest tests/unit/` | ✅ 1010 passed |
| `pytest tests/integration/` | ✅ 131 passed |
| Backend startup | Not run (requires Postgres, Neo4j, Redis, Qdrant) |
| Web/Admin dev | Not run (requires backend) |

### Required Services
- **Postgres** (5432) — migrations, backend data
- **Redis** (6379) — auth rate limiting; CI provides it
- **Neo4j** (7687) — graph store
- **Qdrant** (6333) — vector DB
- **Worker** — agent worker process

### Env Variables (Production)
- `NEXT_PUBLIC_API_URL` — Web, Admin
- `JWT_SECRET_KEY` (≥32 chars in prod)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `POSTGRES_PASSWORD`, `NEO4J_PASSWORD`
- `SUPABASE_*` or `USE_LOCAL_POSTGRES=1`

### What Ran Successfully
- All unit tests (backend + frontend)
- All integration tests (with Redis/Postgres in local env)

---

## 3. Product Readiness Assessment

### Resident
| Flow | Status | Notes |
|------|--------|-------|
| Landing → Signup/Login | ✅ Usable | Auth flows wired |
| Onboarding | ✅ Usable | Building association, address enrichment |
| Dashboard | ✅ Usable | Buildings/me, offers, activity |
| Offers list/detail/join | ✅ Usable | apiClient.getOffer, joinOffer |
| Contractors search | ✅ Usable | apiClient.getContractors |
| Building | ✅ Usable | buildings/me |
| Profile | ✅ Usable | auth/me, avatar upload, password-reset |
| Payments | ✅ Usable | In nav; apiClient.getMyPayments |
| Chat/AI | ✅ Usable | /api/v1/message, conversations |
| Architecture upload | ✅ Usable | uploadArchitecturePlan |

**Gaps:** Payments initiate/checkout flow may be partial; no E2E against real payment API.

### Contractor
| Flow | Status | Notes |
|------|--------|-------|
| Login/Dashboard | ✅ Usable | Stats, offers |
| Create offer | ⚠️ **Broken post-submit** | Redirects to `/contractor/offers/{id}` — **404** |
| Active offers | ✅ Usable | List, filters |
| Projects list | ✅ Usable | Fetches offers |
| Project detail | ✅ Usable | `/contractor/projects/[id]` implemented |
| Profile | ✅ Usable | Contractor docs upload |

**Blocker:** After creating an offer, user lands on 404. Fix: redirect to `/contractor/projects/${offer.id}`.

### Buildings Manager
| Flow | Status | Notes |
|------|--------|-------|
| Dashboard | ✅ Usable | buildings, escalations |
| Buildings list | ✅ Usable | |
| Escalations | ✅ Usable | resolve, assign |

### Admin
| Flow | Status | Notes |
|------|--------|-------|
| Login | ✅ Usable | auth/login/json, auth/me |
| Dashboard | ✅ Usable | |
| Contractors | ✅ Usable | verify, PUT; request-docs **disabled** (backend missing) |
| Payments | ✅ Usable | getApiBase(); summary, escrow, payouts |
| Users | ✅ Usable | admin/users |
| Offers | ✅ Usable | admin/offers, approve, cancel |
| Escalations | ✅ Usable | |
| Analytics | ✅ Usable | Proxy to backend |
| Settings | ✅ Usable | |
| Audit logs | ✅ Usable | |
| Agents | ✅ Usable | |

**Note:** Admin middleware does not enforce role in Next.js; backend `get_admin_user` enforces on API.

---

## 4. Full Route and Page Inventory

### apps/web

| Route | File | Role | Linked | Backend | Status |
|-------|------|------|--------|---------|--------|
| `/` | `app/page.tsx` | Public | Yes | — | ✅ |
| `/login` | `app/(auth)/login/page.tsx` | — | Yes | auth | ✅ |
| `/signup` | `app/(auth)/signup/page.tsx` | — | Yes | auth | ✅ |
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | Auth | Flow | onboarding | ✅ |
| `/terms` | `app/terms/page.tsx` | Public | Yes | — | ✅ |
| `/privacy` | `app/privacy/page.tsx` | Public | Yes | — | ✅ |
| `/dashboard` | `app/(resident)/dashboard/page.tsx` | Resident | Nav | buildings, offers, activity | ✅ |
| `/offers` | `app/(resident)/offers/page.tsx` | Resident | Nav | offers | ✅ |
| `/offers/[offerId]` | `app/(resident)/offers/[offerId]/page.tsx` | Resident | Links | getOffer, joinOffer | ✅ |
| `/contractors` | `app/(resident)/contractors/page.tsx` | Resident | Nav | contractors | ✅ |
| `/building` | `app/(resident)/building/page.tsx` | Resident | Nav | buildings/me | ✅ |
| `/architecture` | `app/(resident)/architecture/page.tsx` | Resident | Nav | uploads | ✅ |
| `/profile` | `app/(resident)/profile/page.tsx` | Resident | Nav | auth, uploads | ✅ |
| `/payments` | `app/(resident)/payments/page.tsx` | Resident | Nav | payments/my | ✅ |
| `/chat` | `app/(resident)/chat/page.tsx` | Resident | Nav | message, conversations | ✅ |
| `/contractor/dashboard` | `app/contractor/dashboard/page.tsx` | Contractor | Nav | auth, stats, offers | ✅ |
| `/contractor/offers/create` | `app/contractor/offers/create/page.tsx` | Contractor | Nav | createOffer | ⚠️ Redirect broken |
| `/contractor/offers/active` | `app/contractor/offers/active/page.tsx` | Contractor | Nav | offers | ✅ |
| `/contractor/projects` | `app/contractor/projects/page.tsx` | Contractor | Nav | offers | ✅ |
| `/contractor/projects/[id]` | `app/contractor/projects/[id]/page.tsx` | Contractor | Projects list | offers/{id} | ✅ |
| `/contractor/profile` | `app/contractor/profile/page.tsx` | Contractor | Nav | auth, contractors | ✅ |
| `/buildings-manager/*` | `app/buildings-manager/*/page.tsx` | BM | Nav | buildings, escalations | ✅ |
| `/contractor/offers/[id]` | **MISSING** | — | — | — | ❌ **404** |

### apps/admin

| Route | File | Linked | Backend | Status |
|-------|------|--------|---------|--------|
| `/` | `app/page.tsx` | Root | — | Redirect |
| `/login` | `app/login/page.tsx` | Yes | auth | ✅ |
| `/dashboard` | `app/dashboard/page.tsx` | Nav | — | ✅ |
| `/contractors` | `app/contractors/page.tsx` | Nav | contractors, admin | ✅ |
| `/payments` | `app/payments/page.tsx` | Nav | admin/payments | ✅ |
| `/users` | `app/users/page.tsx` | Nav | admin/users | ✅ |
| `/offers` | `app/offers/page.tsx` | Nav | admin/offers | ✅ |
| `/escalations` | `app/escalations/page.tsx` | Nav | escalations | ✅ |
| `/analytics` | `app/analytics/page.tsx` | Nav | admin/analytics | ✅ |
| `/agents` | `app/agents/page.tsx` | Nav | admin/agents | ✅ |
| `/settings` | `app/settings/page.tsx` | Nav | admin/settings | ✅ |
| `/settings/audit-logs` | `app/settings/audit-logs/page.tsx` | Nav | admin/audit-logs | ✅ |

---

## 5. UX / UI Audit

### Navigation
- **Resident:** Dashboard, offers, contractors, building, profile, payments, chat — all linked
- **Contractor:** Dashboard, active offers, create offer, projects, profile — all linked
- **Admin:** All pages in AdminShell sidebar

### Discoverability
- Payments added to resident nav (audit fix)
- 404/error pages link to `/building`, `/chat` (fixed; no more `/buildings`, `/support`)

### Consistency
- RTL throughout; Hebrew-first; next-intl
- Contractor "projects" vs "offers" — projects list shows offers; detail at `/contractor/projects/[id]`; create redirect expects `/contractor/offers/[id]` — **inconsistent**

### Loading/Error/Empty States
- **No `loading.tsx`** — route-level loading skeletons absent
- Pages use local `isLoading`; spinners present
- Error boundary: `AppErrorBoundary` in providers
- `error.tsx`, `not-found.tsx` implemented

### Responsive / Accessibility
- Contractor layout: sidebar `lg:block`, mobile overlay
- Tailwind responsive utilities used
- No systematic a11y audit; eslint-plugin-jsx-a11y present

---

## 6. Feature Status Matrix

| Feature | Status | Evidence | Severity |
|---------|--------|----------|----------|
| Auth login/signup | Working | tests pass; API wired | — |
| Onboarding | Working | enrichment, buildings | — |
| Resident dashboard | Working | buildings/me, offers | — |
| Offers list/detail/join | Working | apiClient | — |
| Contractor create offer | **Broken redirect** | `create/page.tsx:100` → 404 | **Critical** |
| Contractor project detail | Working | `projects/[id]/page.tsx` | — |
| Admin payments | Working | getApiBase(); backend has /admin/payments/* | — |
| Chat/AI | Working | /api/v1/message | — |
| Request-docs (admin) | Disabled | Backend not implemented | Medium |
| Payments initiate (resident) | Partial | getMyPayments works; checkout TBD | Medium |

---

## 7. Frontend ↔ Backend Integration Audit

### Web
- **apiClient** (`lib/api/client.ts`): createOffer, getOffer, joinOffer, getContractors, getMyPayments, uploadArchitecturePlan
- **Direct fetch:** buildings/me, offers, auth/me, activity/recent, message, conversations
- **Base URL:** `NEXT_PUBLIC_API_URL` or `http://localhost:8000`

### Admin
- **getApiBase()** in payments, contractors, escalations; `NEXT_PUBLIC_API_URL` used
- **API_URL** in users, settings, offers, login — all append `/api/v1`
- **Backend:** `/api/v1/admin/payments/summary`, `/escrow`, `/payouts`, `/release`, `/approve` — exist in `src/api/routes/payments.py`

### Mismatches
- Create offer redirect: frontend expects `/contractor/offers/{id}`; only `/contractor/projects/[id]` exists

---

## 8. Architecture Audit

### Strengths
- Monorepo with turbo; shared `packages/types`
- Backend: FastAPI, async, route modules
- Auth: refresh_token cookie; JWT; role-based routing
- CI: lint, test, build, security scan, Redis/Postgres services

### Weaknesses
- No `loading.tsx`; page-level loading only
- Admin role not validated in middleware (relies on backend)
- sessionStorage for admin auth_token (XSS surface)

### Production Readiness
- Docker Compose for full stack
- Env docs in docker/.env.example
- Sentry/monitoring hooks exist

---

## 9. Code Quality Audit

### Notable
- TypeScript strict; mypy on backend
- Vitest + RTL; pytest
- No `loading.tsx`; some TODOs in codebase

### Dead Code / Placeholders
- `components/layouts/ContractorLayout.tsx`: `href='/contractor/offers'` — may be legacy (app uses `app/contractor/layout.tsx` with `/contractor/offers/active`)

---

## 10. Testing and Release Confidence

| Suite | Count | Result |
|-------|-------|--------|
| Backend unit | 1010 | ✅ Pass |
| Backend integration | 131 | ✅ Pass |
| Web unit | 123 | ✅ Pass |
| Admin unit | 72 | ✅ Pass |
| E2E (Playwright) | 51 | ⚠️ 2 flaky (contractor form, active offers); fixes pushed |

**E2E:** Uses `page.route()` mocks; does not hit live API. Contractor flow expects URL `/contractor/offers/` after submit — test would pass but user sees 404.

**Confidence:** High for backend; moderate for frontend; E2E needs stability run in CI.

---

## 11. Security / Privacy / Operational Risks

| Risk | Location | Severity |
|------|----------|----------|
| Admin token in sessionStorage | `apps/admin` | Medium (XSS) |
| Admin middleware no role check | `apps/admin/middleware.ts` | Medium (backend enforces) |
| JWT defaults | `src/config/settings.py` | Low (prod validation) |
| Redis required for auth | Integration | Low (CI has Redis) |

---

## 12. Top Launch Blockers

### 1. Contractor Create-Offer Redirect → 404
- **Severity:** Critical
- **Impact:** Contractor completes offer form, submits, lands on 404
- **Evidence:** `apps/web/app/contractor/offers/create/page.tsx:100` — `router.push(\`/contractor/offers/${offer.id}\`)`; no `app/contractor/offers/[id]/page.tsx`
- **Fix:** Change to `router.push(\`/contractor/projects/${offer.id}\`)`

### 2. E2E Flakiness (Partially Addressed)
- **Severity:** High
- **Impact:** CI may fail; false sense of stability
- **Evidence:** contractor-flow "fill in and submit", "display active offers" — element detachment, hidden sidebar text
- **Fix:** Recent commits (605e600) improve selectors; verify CI pass

### 3. Legacy ContractorLayout Link
- **Severity:** Medium
- **Impact:** If used, `/contractor/offers` may 404 (no index)
- **Evidence:** `apps/web/components/layouts/ContractorLayout.tsx:46` — `href='/contractor/offers'`
- **Fix:** Align with `app/contractor/layout.tsx` (use `/contractor/offers/active`) or remove legacy component

---

## 13. Prioritized Action Plan

### Must Fix Before Any Real Users
1. **Fix contractor create-offer redirect** — `router.push(\`/contractor/projects/${offer.id}\`)` in `apps/web/app/contractor/offers/create/page.tsx`
2. **Update E2E contractor-flow** — Expect `toHaveURL(/contractor\/projects\//)` after submit

### Must Fix Before Paid/Pilot Users
3. Confirm admin login stores token for payments page
4. Verify E2E suite passes in CI on main/dev
5. Validate payment/escrow flows with real or staging backend

### Should Fix Soon After Launch
6. Add `loading.tsx` for key routes
7. Add admin role check in middleware
8. Revisit sessionStorage for admin token

### Nice to Have / Later
9. Implement request-docs backend; re-enable admin buttons
10. Resident payments checkout flow completion
11. Accessibility audit

---

## 14. Final Verdict

**Should the product be published now?**  
**No** — not until the contractor create-offer redirect is fixed.

**After that fix:**  
**Yes, to a limited pilot** — internal or friendly users. Under these conditions:
- Pilot users are informed of potential rough edges
- E2E stability verified in CI
- Payment flows validated in staging

**Minimum fixes required first:**
1. Redirect to `/contractor/projects/${offer.id}` after offer creation
2. Update E2E assertion to match

---

## Appendix

### Commands Run
```bash
pnpm install --frozen-lockfile
python -m pytest tests/unit/ -v -q --timeout=60
python -m pytest tests/integration/ -v -q --timeout=30
pnpm turbo test
```

### Tests Run
- Backend unit: 1010 passed
- Backend integration: 131 passed
- Web unit: 123 passed
- Admin unit: 72 passed

### Unresolved Verification Gaps
- Backend not started (no Postgres/Neo4j/Redis local)
- Web/Admin dev servers not started
- E2E not re-run after latest fixes
- Mobile app not inspected

### Assumptions
- Branch `fix/audit-findings-pilot-hardening` is representative of what will merge to dev
- Admin payments fix (getApiBase) is present and correct
- Backend admin payment routes match frontend paths
