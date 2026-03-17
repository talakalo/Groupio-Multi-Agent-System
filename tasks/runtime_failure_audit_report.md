# Groupio Runtime Failure Pattern Audit and Fix Report

## 1. Executive Summary

- **What was failing**: Login and signup returned 500/503 when DB, Redis, or DNS failed; generic Hebrew error masked root cause; potential duplicate submissions on rapid double-click.
- **Issues found**: 6 runtime failure patterns identified (backend exception classification, duplicate submit risk, error mapping, 423 handling, gaierror).
- **Duplicate submissions**: Low risk on login/signup (disabled button + isLoading) but added `useRef` guard for Strict Mode and rapid clicks.
- **Fixes applied**: Backend gaierror→503, login/signup duplicate-submit guard, 423 (Locked) mapping, integration test for gaierror.
- **Remains**: Medium-risk flows (contractor profile save, uploads, checkout initiate) need submit-disable hardening; some use `alert()` instead of inline errors.

---

## 2. Action Failure Map

| Page | Action | Request | Backend Route | Status | Duplicate Risk |
|------|--------|---------|---------------|--------|----------------|
| /login | Submit | POST /api/v1/auth/login/json | auth.login_json | Hardened | Low |
| /signup | Submit | POST /api/v1/auth/signup | auth.signup | Hardened | Low |
| /forgot-password | Submit | POST /api/v1/auth/password/reset | auth.request_password_reset | Working | Low |
| /reset-password | Submit | POST /api/v1/auth/password/reset/confirm | auth.confirm_password_reset | Working | Low |
| /building/join | Submit | POST /api/v1/buildings/join | buildings.join | Working | Low |
| /offers/[id] | Join | POST /api/v1/offers/{id}/join | offers.join | Working | Low |
| /checkout | Initiate | POST /api/v1/payments/initiate | payments.initiate | Working | Medium |
| /onboarding | Submit | POST /api/v1/onboarding | onboarding | Working | Low |
| /profile | Password change | POST /api/v1/auth/password/change | auth.change_password | Working | Medium |
| /contractor/profile | Save / Upload | PUT /api/v1/contractors/{id}, POST uploads | contractors, uploads | Working | Medium |
| /architecture | Upload | POST /api/v1/uploads/architecture | uploads | Working | Medium |
| /chat | Send | POST /api/v1/message | message | Working | Low |
| /contractor/offers/create | Submit | POST /api/v1/offers | offers.create | Working | Medium |
| /orders/[id] | Approve work | POST /api/v1/payments/{id}/approve-work | payments.approve_work | Working | Low |

---

## 3. Confirmed Root Causes

| Action | Request | Backend Route | File(s) | Reason |
|--------|---------|---------------|---------|--------|
| Login | POST /login/json | login_json | auth.py, postgres.py | DB/Redis/DNS failure → 500; gaierror not classified as 503 |
| Login | POST /login/json | - | main.py | gaierror (Name or service not known) returned 500 |
| Login | POST /login/json | - | login/page.tsx | 423 (Locked) not mapped; generic fallback |
| Login/Signup | - | - | login/page.tsx, signup/page.tsx | Duplicate submit possible on rapid click before re-render |

---

## 4. Fixes Implemented

| Fix | Files | Why |
|-----|-------|-----|
| gaierror→503 | src/api/main.py | DNS failure (e.g. Docker hostname) now returns 503, not 500 |
| Duplicate submit guard | apps/web/app/(auth)/login/page.tsx, signup/page.tsx | useRef blocks second submit before first completes |
| 423 mapping | apps/web/app/(auth)/login/page.tsx | "החשבון נחסם. פנו לתמיכה." for account locked |
| Integration test | tests/integration/test_api_routes.py | test_gaierror_returns_503 |

---

## 5. Error-Handling Improvements

- **Frontend**: Login now maps 401, 403, 423, 500, 503, connection errors to specific Hebrew messages.
- **Backend**: gaierror added to connection-error classification (503).
- **Developer**: Integration tests assert 503 for connection-like exceptions.

---

## 6. Request Lifecycle Improvements

- **Login/Signup**: `submittingRef` prevents duplicate POST before `isLoading` re-render.
- **Other flows**: Recommend adding `disabled={isPending}` or `submittingRef` to contractor profile save, create offer, upload triggers.

---

## 7. Tests Added or Updated

- `test_gaierror_returns_503`: Asserts socket.gaierror from login path returns 503.

---

## 8. Validation

```bash
# Backend
pytest tests/integration/test_api_routes.py::TestGlobalExceptionHandler -v

# Frontend (manual)
# 1. Login with invalid creds → 401 message
# 2. Login when DB down → 503 / connection message
# 3. Rapid double-click login → single request
```

---

## 9. Remaining Risks

- Contractor profile save, create offer, uploads: no strong submit-disable; `alert()` for errors.
- Checkout: `initiatePayment` in useEffect can re-run on deps change.
- Raw `fetch` in onboarding, building join, chat: no 401 retry; no central error classification.
