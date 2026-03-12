# Implementation Report — Audit Fixes

**Branch:** dev  
**Date:** March 12, 2025  
**Reference:** AUDIT_REPORT_DEV.md

---

## Executive Summary

All six audit findings have been implemented in a minimal, production-safe way. The repository is now pilot-hardened with no broken links, correct API wiring, discoverable pages, and resilient tests.

| Fix | Status |
|-----|--------|
| A. Contractor project detail page | ✅ Implemented |
| B. Admin payments API base | ✅ Fixed |
| C. Broken not-found/error links | ✅ Fixed |
| D. Resident payments in nav | ✅ Added |
| E. Admin request-docs flow | ✅ Disabled (backend not implemented) |
| F. Redis-dependent integration tests | ✅ Hardened |

---

## Files Changed (Exact Paths)

### A. Contractor Project Detail Page
- **Created:** `apps/web/app/contractor/projects/[id]/page.tsx` — New project detail page
- **Modified:** `apps/web/app/contractor/projects/page.tsx` — Replaced `<a>` with `<Link>` for project detail navigation

### B. Admin Payments API Base
- **Modified:** `apps/admin/app/payments/page.tsx` — Replaced relative `API_BASE` with `getApiBase()` using `NEXT_PUBLIC_API_URL`, added `getAuthHeaders()` and `credentials: "include"`

### C. Broken Links in not-found and error
- **Modified:** `apps/web/app/not-found.tsx` — `/buildings` → `/building`, `/support` → `/chat` (label: "עוזר AI / תמיכה")
- **Modified:** `apps/web/app/error.tsx` — `/support` → `/chat` (label: "פנה לעוזר AI")

### D. Resident Payments in Navigation
- **Modified:** `apps/web/app/(resident)/layout.tsx` — Added `/payments` and `CreditCard` icon to `NAV_ITEMS`
- **Modified:** `apps/web/messages/he.json` — Added `"payments": "תשלומים"` to `residentNav`
- **Modified:** `apps/web/messages/en.json` — Added `"payments": "Payments"` to `residentNav`
- **Modified:** `apps/web/__tests__/ResidentLayout.test.tsx` — Added `/payments` to `EXPECTED_HREFS`

### E. Admin Contractor Request-Docs
- **Modified:** `apps/admin/app/contractors/page.tsx` — Removed `requestDocuments` function and `handleBulkRequestDocs`, disabled both "Request Docs" and "Request Documents" buttons with title "Request documents — coming soon"

### F. Redis-Dependent Integration Tests
- **Modified:** `tests/integration/test_api_routes.py` — Added `mock_redis` fixture and `mock_redis.check_ip_rate_limit = AsyncMock(return_value=True)` to `test_login_invalid_credentials`, `test_signup_validation_fails`, `test_signup_email_exists`
- **Modified:** `LOCAL_SETUP.md` — Clarified integration test note (mocks Redis when unavailable)

---

## Per-File Explanation

### apps/web/app/contractor/projects/[id]/page.tsx (new)
Implements contractor project detail. Projects are backed by offers (`/api/v1/offers/{id}`). Page shows title, status, building, pricing, tiers, participants, dates. Uses existing auth pattern (useAuthStore, token refresh). Handles loading, error, and 404. RTL layout.

### apps/admin/app/payments/page.tsx
`API_BASE = "/api/v1"` caused requests to hit admin origin. Replaced with `getApiBase()` that uses `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`) and appends `/api/v1` if needed. Added auth headers from `sessionStorage` and `credentials: "include"` for cookies.

### apps/web/app/not-found.tsx, apps/web/app/error.tsx
Resident route for building is `/building` (singular). `/support` does not exist; `/chat` serves as AI assistant and support.

### apps/web/app/(resident)/layout.tsx
`/payments` added to sidebar after `/profile`. Uses `CreditCard` icon.

### apps/admin/app/contractors/page.tsx
Backend has no `/contractors/{id}/request-docs`. Disabled buttons instead of inventing an endpoint. UX shows "(soon)" and tooltip.

### tests/integration/test_api_routes.py
Auth routes use `check_auth_rate_limit`, which needs Redis. Three tests did not use `mock_redis`. Added fixture and `check_ip_rate_limit` mock so tests pass without Redis.

---

## Test Commands Run

```bash
# Backend unit
python -m pytest tests/unit/ -v -q

# Backend integration (previously failing auth tests)
python -m pytest tests/integration/test_api_routes.py::TestAuthAPI::test_login_invalid_credentials \
  tests/integration/test_api_routes.py::TestAuthAPI::test_signup_validation_fails \
  tests/integration/test_api_routes.py::TestAuthAPI::test_signup_email_exists -v

# Web unit
pnpm --filter @groupio/web test

# Admin unit
pnpm --filter @groupio/admin test
```

---

## Test Results

| Suite | Result |
|-------|--------|
| Auth integration (3 tests) | 3 passed |
| Web unit | 119 passed |
| Admin unit | 72 passed |

---

## Assumptions Made

1. **Project = Offer:** Contractor “projects” are offers; detail page fetches from `GET /api/v1/offers/{id}`.
2. **Support = Chat:** No `/support` route; `/chat` is used as support destination.
3. **Request-docs:** Backend has no request-docs domain; disabled UI rather than adding a stub endpoint.

---

## Remaining Limitations / Follow-Ups

1. **Admin payments auth:** Uses `sessionStorage` auth token. Ensure admin login flow stores the token for the payments page.
2. **Request-docs:** When the backend implements document requests, re-enable the admin buttons and wire them.
3. **Contractor project detail:** Offer API shape may vary; some fields (e.g. `building` object) may need adjustment for real backend responses.
