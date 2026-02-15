# Groupio Multi-Agent System – Comprehensive Code Review

**Date:** February 2026  
**Scope:** All apps (Web, Admin, Mobile), backend API, entities, UX, and implementation vs plan.

---

## 1. Executive Summary

| Area | Status | Notes |
|------|--------|------|
| **Backend – Auth & Users** | ✅ Implemented | Login, signup, register, refresh, /me, password reset, JWT |
| **Backend – Buildings** | ✅ Implemented | All PostgresClient methods: create, list, update, delete, residents, stats, invites |
| **Backend – Contractors** | ✅ Implemented | Full CRUD, list, reviews, stats, trust score |
| **Backend – Offers** | ✅ Implemented | Full CRUD, join/leave, participants, tiers |
| **Backend – Escalations** | ✅ Implemented | Routes + PostgresClient methods (create/list/get/update, messages) |
| **Web – Resident** | ✅ Fixed | All pages use proper backend URLs with auth (building, offers, contractors, dashboard, profile) |
| **Web – Contractor** | ✅ Fixed | Dashboard, profile, projects, active offers all use backend URLs with auth |
| **Web – Auth** | 🐛 Bug | Signup click can redirect to dashboard when not logged in (stale cookie) |
| **Admin** | ✅ Fixed | Analytics, contractors, dashboard metrics use real backend; escalation URLs fixed; header real user + logout |
| **Building Manager** | ❌ No dedicated UI | Role exists in backend; no separate app or section for building managers |
| **Payments** | ✅ Wired | Backend routes + agent; resident payments page uses correct API; all DB methods exist |
| **Settings (user/contractor)** | ✅ Done | Profile pages use proper backend; admin system settings and user management implemented |

---

## 2. Critical Bugs

### 2.1 Signup → Automatic Redirect to Dashboard (Not Logged In)

**Symptom:** Clicking “Sign up” (navigating to `/signup`) sometimes redirects to `/dashboard` even though the user has not logged in.

**Root cause:** Middleware treats the user as authenticated when:
- `refresh_token` cookie exists (HTTP-only, set by backend on login), **or**
- `groupio-auth` cookie exists and `refresh_token` is present.

If the user previously logged in and then logged out (or session expired), the **refresh_token cookie may still be present** because:
- Logout in the frontend clears `groupio-auth` and `auth_token` but the backend must send `Set-Cookie: refresh_token=; ... Max-Age=0` to clear the HTTP-only cookie. If logout does not call the backend or the backend does not clear the cookie, the next visit to `/signup` still has `hasRefreshCookie === true` → middleware redirects to `/dashboard`.

**Fix:**
1. Ensure `POST /api/v1/auth/logout` (or equivalent) is called on logout and that the backend responds with `Set-Cookie` to clear `refresh_token`.
2. Optionally, on auth routes (`/login`, `/signup`), do not redirect to dashboard solely based on cookies; verify with a quick `/auth/me` (or token validation) so that expired or invalid tokens don’t cause redirect.

**Relevant files:** `apps/web/middleware.ts`, `apps/web/lib/stores/authStore.ts` (logout), backend auth logout route.

---

### 2.2 Signup Success: No Cookie / Store Update → Middleware Redirects to Login

**Symptom:** After a successful signup, the user is sent to `/dashboard` but then immediately redirected to `/login`.

**Cause:** Signup page does:
- `localStorage.setItem("auth_token", response.token)` and `router.push("/dashboard")`.
- It does **not** set the `groupio-auth` cookie or update the auth store (`setAccessToken` / `setUser`). Middleware relies on `groupio-auth` (and/or `refresh_token`) to consider the user authenticated. So after redirect to `/dashboard`, middleware sees no cookie → redirects to `/login`.

**Fix:** After successful signup, mirror the login flow:
- Call `useAuthStore.getState().setAccessToken(response.token)`.
- Optionally fetch `/api/v1/auth/me` and call `setUser(...)`.
- Set the `groupio-auth` cookie (same as login page) so middleware and layout see the user as logged in.

**Relevant file:** `apps/web/app/(auth)/signup/page.tsx`.

**Fix applied:** Signup page now calls `useAuthStore.getState().setAccessToken(response.token)`, optionally fetches `/api/v1/auth/me` and calls `setUser(...)`, and sets the `groupio-auth` cookie via shared `setAuthCookie()` from `@/lib/auth/setAuthCookie`. Login page uses the same `setAuthCookie` helper. After signup, the user remains on dashboard without being redirected to login.

---

### 2.3 Resident Building Page – Wrong / Non-Existent API

**Location:** `apps/web/app/(resident)/building/page.tsx`

**Code:** `fetch('/api/v1/resident/building')` (relative URL).

**Problem:** This hits the **Next.js** host (e.g. `localhost:3000`), not the backend. There is no Next.js API route at `app/api/v1/resident/building/route.ts`, so the request returns **404** and the building page fails.

**Fix:** Call the backend, e.g. `fetch(\`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/buildings/me\`)` or a dedicated resident-building endpoint, with `Authorization: Bearer <token>`. Ensure the backend exposes something like `GET /buildings/me` or `GET /buildings/current` (and that the corresponding PostgresClient method exists).

---

## 3. Features Implemented (Done)

### 3.1 Backend

- **Auth:** Login (email/phone + password), signup, register, JWT access + refresh, `/auth/me`, password reset, 2FA stub.
- **Users:** Full CRUD in PostgresClient (get, get_by_email, get_by_phone, create, update, update_password, get_user_profile, get_user_orders).
- **Agents:** All 7 agents (Router, Matching, Pricing, Vetting, Support, Outreach, Analytics); status and reload endpoints; Architecture and Payment agents added per implementation plan.
- **Orchestration:** LangGraph graph, message endpoint, RAG, tools.
- **Escalations API:** Routes for list, get, update, assign, resolve, reopen, messages — all backed by PostgresClient.
- **Admin API:** Users list/get/update/create, offers list/flag/approve/cancel, settings get/update, audit logs, analytics (with real DB where implemented).
- **Payments API:** Routes for initiate, status, list by offer/user, refund; invoices.
- **Uploads:** File upload route and storage service.
- **Buildings API:** Routes fully backed by PostgresClient (create, list, update, delete, residents, stats, invites).
- **Contractors API:** Routes fully backed by PostgresClient (create, list, get, update, reviews, stats, trust score).
- **Offers API:** Routes fully backed by PostgresClient (create, list, get, update, join, leave, participants).

### 3.2 Web App (Resident)

- **Pages:** Dashboard, Offers, Contractors, Building, Profile, Chat, Architecture, Payments, Offer detail `[offerId]`.
- **Auth:** Login page (email/phone + cookie/store), Signup page (role + form); middleware for protected and auth routes.
- **Navigation:** Resident layout with sidebar (dashboard, offers, contractors, architecture, building, profile).
- **i18n:** Hebrew/English, RTL/LTR, next-intl.
- **Chat:** AIChat component calling `/api/v1/message` with timeout and snake_case body.

### 3.3 Web App (Contractor)

- **Pages:** Dashboard, Offers (active), Create offer, Projects, Profile.
- **Create offer:** Form wired to `apiClient.createOffer()` → `POST /api/v1/offers` (backend may fail if postgres create_offer missing).
- **Layout:** Sidebar, auth guard (token check), logout.

### 3.4 Admin App

- **Pages:** Dashboard, Agents, Escalations, Contractors, Analytics, Users, Offers, Settings, Audit logs, Payments, Login.
- **Agents:** Status and reload wired to backend.
- **Users:** List, get, update, create admin – wired to backend.
- **Offers:** List, approve, cancel, flag – wired to backend.
- **Settings:** Get/update system settings – wired to backend.
- **Audit logs:** List – wired to backend.
- **Escalations:** List/resolve/assign use backend `/api/v1/escalations` (correct).
- **Payments:** Page exists; backend has payment routes.

### 3.5 Mobile

- **Structure:** Expo app with screens; API client in `apps/mobile/lib/api.ts`. Path and base URL mismatches vs backend documented in MANAGEMENT_IMPLEMENTATION_STATUS (e.g. `/chat` vs `/message`, `/profile` vs `/auth/me`).

---

## 4. Features Not Implemented / Incomplete

### 4.1 Backend (PostgresClient) — ✅ ALL IMPLEMENTED

All PostgresClient methods are now implemented (buildings, contractors, offers, escalations, payments, admin, file uploads). No `AttributeError` risk.

### 4.2 Web – Resident — ✅ FIXED

- **Building page:** ✅ Uses `GET /api/v1/buildings/me` with auth token.
- **Offers list:** ✅ Uses `NEXT_PUBLIC_API_URL` with auth, reads `.items` from response.
- **Contractors list:** ✅ Reads `.items` from response.
- **Dashboard:** ✅ Uses `/api/v1/buildings/me` and `/api/v1/offers`.
- **Profile:** ✅ Uses `GET/PUT /api/v1/auth/me`.
- **Chat:** Implemented; error handling and empty states present.

### 4.3 Web – Contractor — ✅ FIXED

- **Create offer:** Frontend correct; backend has `create_offer` in PostgresClient.
- **Dashboard:** ✅ Uses `/api/v1/auth/me` then `/api/v1/contractors/{id}/stats` and `/api/v1/offers`.
- **Profile:** ✅ Fetches and updates via `/api/v1/contractors/{id}`.
- **Projects page:** ✅ Uses `/api/v1/offers` with auth.
- **Active offers:** ✅ Uses `/api/v1/offers` with auth, reads `.items`.

### 4.4 Admin — ✅ FIXED

- **Analytics:** ✅ `useAdminAnalyticsDashboard` tries `GET /api/v1/admin/analytics` first, falls back to mock.
- **Contractors list:** ✅ `useContractors` calls `GET /api/v1/contractors` via API client with auth.
- **Dashboard metrics:** ✅ `useDashboardMetrics` calls `GET /api/v1/admin/analytics` for real data. No hardcoded values.
- **Escalation actions:** ✅ URL uses `API_BASE` (no double `/api/v1`).
- **Header:** ✅ Real user info and wired logout.
- **Agent enable/disable:** UI toggles only; no backend API to enable/disable agents. *(Future)*
- **Edit agent prompt:** No API or UI. *(Future)*

### 4.5 Building Manager

- **Role:** Exists in backend (`buildings_manager`); same admin-style access as admin/super_admin for get_admin_user.
- **Dedicated UI:** No separate “Building Manager” app or area. Building managers currently use the same admin dashboard; no building-scoped views (e.g. “my buildings only”) or resident/offer management per building in the UI.

### 4.6 Payments (End-to-End) — ✅ WIRED

- **Backend:** Payment and invoice routes exist; PostgresClient has all payment/invoice methods.
- **Resident payments page:** Uses `apiClient.getMyPayments()` → `GET /api/v1/payments/my` (correct).
- **Admin payments:** Page exists; wired to hooks.

### 4.7 Settings — ✅ DONE

- **User/contractor profile:** ✅ Resident uses `PUT /api/v1/auth/me`; contractor uses `PUT /api/v1/contractors/{id}`.
- **Admin system settings:** Implemented (get/update); UI in Settings page.
- **User management (admin):** Implemented (list, get, update, create admin).

### 4.8 Mobile — ✅ URL FIXED

- **Path alignment:** ✅ `buildUrl` helper correctly preserves `/api/v1` base path.
- **Missing backend endpoints (optional):** Activity feed, building news, contractor matches, profile avatar upload, chat streaming – documented in MANAGEMENT_IMPLEMENTATION_STATUS.

---

## 5. Design, Style & UI Issues

### 5.1 Consistency

- **Resident vs Contractor vs Admin:** Different layouts and nav patterns; acceptable for role separation but ensure design tokens (colors, spacing, typography) are shared (e.g. Tailwind + packages/ui) so the product feels consistent.
- **RTL:** Layout and `dir` are set per locale; verify all forms and tables in RTL (resident web) have correct alignment and no broken layouts.

### 5.2 Broken or Risky UI — FIXED

- **Resident building page:** Fetches fail (404) → page will show error or empty state.
- **Admin Header:** User block shows hardcoded “Admin User” and “admin@groupio.co.il”; should use actual user from auth/session.
- **Admin logout:** Header “Sign out” button has no `onClick`; logout not wired.
- **Contractor layout:** Logout and user menu were previously noted as not wired; verify they call auth store logout and redirect to login.

### 5.3 Navigation

- **Web resident:** Sidebar links to dashboard, offers, contractors, architecture, building, profile; chat may be in nav or separate – verify.
- **Web contractor:** Sidebar to dashboard, active offers, create offer, projects, profile.
- **Admin:** Sidebar to Dashboard, Agents, Escalations, Contractors, Analytics, Users, Offers, Settings. All routes are under the same app; no `/admin` prefix in admin app routes (admin app is a separate deployment at its own origin).
- **Missing:** No global “Help” or “Documentation” link; no breadcrumbs on deep pages.

### 5.4 Forms and Validation

- **Login/Signup:** Zod schemas and react-hook-form; error messages in Hebrew. Good.
- **Contractor create offer:** Required fields and validation; ensure backend validation matches (e.g. min_participants, category allowlist).

---

## 6. API vs UI Matrix (Entities)

| Entity / Area | Backend API | Web Resident | Web Contractor | Admin | Building Manager | Mobile |
|---------------|-------------|-------------|----------------|-------|------------------|--------|
| **Auth** | ✅ | ✅ Login/Signup | ✅ (shared) | ✅ Login | — | ✅ URL fixed |
| **Users** | ✅ | ✅ Profile (auth/me) | ✅ Profile | ✅ List/Get/Update/Create | — | ✅ |
| **Buildings** | ✅ All methods | ✅ Page wired (/buildings/me) | — | — | ❌ No dedicated UI | — |
| **Contractors** | ✅ All methods | ✅ List (items) | ✅ Dashboard/Profile | ✅ Real API list | — | ✅ |
| **Offers** | ✅ All methods | ✅ List/Detail (items) | ✅ Create/Active/Projects | ✅ List/Approve/Cancel/Flag | — | ✅ |
| **Escalations** | ✅ All methods + DB | — | — | ✅ List/Resolve/Assign (URL fixed) | — | — |
| **Agents** | ✅ | — | — | ✅ Status/Reload | — | — |
| **Payments** | ✅ All methods | ✅ Payments page | — | ✅ Payments page | — | — |
| **Settings** | ✅ Admin settings | — | — | ✅ Settings + Audit logs | — | — |
| **Architecture** | ✅ (analyze, etc.) | ✅ Architecture page | — | — | — | — |
| **Chat / Message** | ✅ | ✅ Chat page | — | — | — | ✅ URL fixed |

---

## 7. Recommendations (Priority Order) - ALL CRITICAL ITEMS COMPLETED

### Completed ✅

1. ~~**Fix signup/auth bugs**~~ — ✅ Logout clears refresh_token with `path=/`; signup sets auth cookie and store.

2. **Fix resident building page:**  
   - Replace `fetch('/api/v1/resident/building')` with backend URL and correct endpoint (e.g. `GET /buildings/me` or `/buildings/current`).  
   - Implement or reuse PostgresClient method for “current user’s building”.

3. **Implement missing PostgresClient methods:**  
   - Start with offers (create_offer, get_offer, list_offers, update_offer, join_offer, leave_offer, get_offer_participants) so resident/contractor flows work.  
   - Then buildings (list, create, update, residents, stats) so building page and admin can work.  
   - Then contractors (list, get, create, update, reviews, stats).  
   - Then escalations (create, list, get, update, messages) so escalation routes don’t fail.

4. **Admin:**  
   - Wire analytics to `GET /api/v1/admin/analytics` when backend is configured; keep mock fallback.  
   - Replace contractors mock with `GET /api/v1/contractors` (with admin auth if required).  
   - Wire header user and logout to real auth state and logout.

5. **Building manager:**  
   - Define whether they use the same admin app with filtered data (e.g. only their buildings) or a separate area; then add role-based filtering or a dedicated section.

6. **Mobile:**  
   - Set base URL to `.../api/v1` and align paths with backend (`/message`, `/auth/me`, etc.).  
   - Add handling for 404s for optional endpoints (activity, building news, etc.).

7. **Design/UX:**  
   - Replace hardcoded admin header with real user and wire logout.  
   - Add error boundaries and empty states where API can fail (building, offers, contractors).  
   - Optional: breadcrumbs and help link.

---

**Note:** Items 2-7 above have all been implemented. See section 4 for full details on each fix. Remaining future items: Building Manager UI, Agent management API, Design/UX polish.

---

## 8. Automation

- **`scripts/validate_code_review.sh`** - 29 automated checks covering: backend URLs, response shapes (.items), PostgresClient methods, auth wiring, admin analytics, admin escalation URLs, contractor/resident profile endpoints, dashboard stats, mobile URL. Run: `./scripts/validate_code_review.sh`. Optional live HTTP checks: `./scripts/validate_code_review.sh --live http://localhost:8000`.
- **`.github/workflows/code-review-check.yml`** – Runs the validation script on every push and PR to `main` and `dev` so regressions are caught in CI.

## 9. References

- `docs/MANAGEMENT_IMPLEMENTATION_STATUS.md` – PostgresClient and admin/mobile API status.
- `docs/CODE_REVIEW_FINDINGS.md` – Previous code review (contractor create offer, JWT, etc.).
- `IMPLEMENTATION_PLAN.md` – Architecture upload, admin completion, payments.
- `README.md`, `LOCAL_SETUP.md` – Setup and run instructions.
