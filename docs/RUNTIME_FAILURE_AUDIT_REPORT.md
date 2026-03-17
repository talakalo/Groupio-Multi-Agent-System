# Groupio Runtime Failure Audit and Fix Report

## 1. Executive Summary

**What failed:**
- Login: `POST /api/v1/auth/login/json` returned 500 (Redis `[Errno 99] Cannot assign requested address` from localhost IPv6 resolution).
- Profile password change: Wrong endpoint `/auth/password-reset` (expects `{email}`) — profile sent `{current_password, new_password}`.
- Dashboard orders: Wrong path `GET /payments?status=...` (404) — backend has `GET /payments/my`.
- Building join: Relative URL `/api/v1/buildings/join` in dev hits Next.js (no rewrite) → 404.
- Connection errors (EADDRNOTAVAIL, ECONNREFUSED) returned 500 instead of 503.

**Root causes found:**
1. Redis `localhost` → IPv6 `::1` on macOS (errno 99).
2. Profile page used wrong auth endpoint.
3. Dashboard used non-existent payments path.
4. Building join used relative URL without dev rewrite.
5. Global exception handler did not classify Redis/network connection errors.

**Issues identified:** 6 confirmed; 4 fixed in this audit; 2 (login 500, 503 mapping) addressed previously or concurrently.

**What was fixed:**
- Profile: Switched to `apiClient.changePassword()` → `POST /auth/password/change`.
- Dashboard: Use `GET /payments/my` + client-side mapping for snake_case and active-status filter.
- Building join: Use full `apiBase` URL.
- Global handler: Treat OSError EADDRNOTAVAIL and ECONNREFUSED as 503.
- Login 500 message: "אירעה שגיאה בשרת. נסה שוב." (already applied).

**What remains:**
- Dev rewrite for `/api/*` in `next.config.mjs` (optional — we fixed by using `apiBase`).
- Signup/reset-password could use status-specific messages like login.
- E2E tests for building join and profile password change.

---

## 2. Failure Map

| Page | Action | Request | Status | Issue Type | Severity |
|------|--------|---------|--------|------------|----------|
| `/login` | Submit login | POST /auth/login/json | FailsAtRuntime → Fixed | Redis IPv6, RLS recursion | Critical |
| `/profile` | Change password | POST /auth/password-reset | FailsAtRuntime → Fixed | PayloadMismatch + WrongEndpoint | High |
| `/dashboard` | Load orders | GET /payments?status=... | FailsAtRuntime → Fixed | MissingEndpoint | High |
| `/building/join` | Submit invite code | POST /buildings/join (relative) | FailsAtRuntime → Fixed | BadEnvOrHostConfiguration | High |
| `/signup` | Submit signup | POST /auth/signup | NotVerified | — | — |
| `/verify-email` | Verify token | POST /auth/verify-email/{token} | NotVerified | — | — |
| `/forgot-password` | Request reset | POST /auth/password/reset | NotVerified | — | — |
| `/reset-password` | Confirm reset | POST /auth/password/reset/confirm | NotVerified | — | — |
| `/onboarding` | Submit | POST /onboarding | NotVerified | — | — |
| `/checkout` | Initiate payment | POST /payments/initiate | NotVerified | — | — |
| `/orders/[id]` | Approve work | POST /payments/{id}/approve-work | NotVerified | — | — |
| `/chat` | Send message | POST /message | NotVerified | — | — |
| `/contractor/offers/create` | Create offer | POST /offers | NotVerified | — | — |

---

## 3. Confirmed Root Causes

### 3.1 Profile password change

- **Request:** POST `/api/v1/auth/password-reset` with `{ current_password, new_password }`
- **Backend route:** `POST /auth/password/reset` expects `{ email }` (unauthenticated)
- **Files:** `apps/web/app/(resident)/profile/page.tsx`
- **Reason:** Profile used forgot-password endpoint; correct endpoint is `POST /auth/password/change` with auth and `{ current_password, new_password }`.

### 3.2 Dashboard payments 404

- **Request:** GET `/api/v1/payments?status=active&page_size=5`
- **Backend route:** Only `GET /payments/my` exists; no `GET /payments` (no query params)
- **Files:** `apps/web/app/(resident)/dashboard/page.tsx`
- **Reason:** Wrong path; dashboard got 404 and returned empty orders silently.

### 3.3 Building join 404 in dev

- **Request:** POST `/api/v1/buildings/join` (relative)
- **Backend route:** `POST /buildings/join` exists
- **Files:** `apps/web/app/(resident)/building/join/page.tsx`
- **Reason:** Relative URL in dev hits Next.js; Vercel rewrites exist only in production.

### 3.4 Connection errors → 500

- **Request:** Any (e.g. login) when Redis/DB raise OSError
- **Backend:** `src/api/main.py` global exception handler
- **Reason:** Only errno 61 (ConnectionRefusedError) was mapped to 503; errno 49 (EADDRNOTAVAIL) and 111 (ECONNREFUSED) were not.

---

## 4. Fixes Implemented

| Fix | What Changed | Why | Risk | User Impact |
|-----|--------------|-----|------|-------------|
| Profile password | Use `apiClient.changePassword()` | Correct endpoint and payload | Low | Password change works |
| Dashboard payments | `GET /payments/my` + mapping | Correct path; handle snake_case | Low | Active orders display correctly |
| Building join | Use `${apiBase}/api/v1/buildings/join` | Reach backend in dev | Low | Join works locally |
| Global handler | Add `_is_connection_error()` for EADDRNOTAVAIL, ECONNREFUSED | Classify network errors as 503 | Low | Clearer retry semantics |
| Login 500 message | "אירעה שגיאה בשרת. נסה שוב." | Better UX (already applied) | Low | Clearer feedback |

---

## 5. Error-Handling Improvements

### Frontend
- Login: 500 → "אירעה שגיאה בשרת. נסה שוב."; 503 → "מסד הנתונים לא זמין..."
- Profile: Use `apiClient.changePassword()` (throws ApiError with status)
- Dashboard: Map snake_case and filter active statuses; return [] on fetch error

### Backend
- Global handler: 503 for OSError EADDRNOTAVAIL and ECONNREFUSED
- Rate limiter: Existing graceful degradation when Redis unavailable
- Redis URL: `_normalize_redis_url()` (localhost → 127.0.0.1) already in place

### Developer diagnostics
- `tasks/lessons.md`: Added lessons for profile password endpoint, payments path, building join URL
- Integration tests: `TestGlobalExceptionHandler` for 503 on connection errors

---

## 6. Tests Added or Updated

| Test | File | Scenario |
|------|------|----------|
| `test_connection_error_errno_99_returns_503` | `test_api_routes.py` | OSError EADDRNOTAVAIL → 503 |
| `test_connection_error_errno_111_returns_503` | `test_api_routes.py` | OSError ECONNREFUSED → 503 |

**Coverage:** Connection error classification; no regression for normal 500 paths.

---

## 7. Validation Performed

- `pytest tests/integration/test_api_routes.py::TestGlobalExceptionHandler` — passed
- Manual verification: Profile uses `changePassword`; dashboard uses `/payments/my`; building join uses `apiBase`
- Linting: No new issues in modified files

---

## 8. Remaining Risks

| Risk | Mitigation |
|------|------------|
| Env-sensitive behavior | `REDIS_URL` should use `127.0.0.1`; default in settings updated |
| Supabase RLS recursion | Migration 027 applied (see prior context) |
| Signup/forgot-password error messages | Generic; could add status-based messages like login |
| Building join in production | Vercel rewrite works; `apiBase` fix helps dev only |
| No dev API rewrite | Using `apiBase` avoids need; optional `next.config` rewrite possible |
