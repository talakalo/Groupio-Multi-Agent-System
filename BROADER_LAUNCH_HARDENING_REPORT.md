# Groupio Broader Launch Hardening Report

**Branch:** `feat/post-pilot-broader-launch-hardening`  
**Date:** March 2025  
**Scope:** Post-pilot hardening for broader beta readiness

---

## 1. Executive Summary

### What Was Implemented

- **Email verification enforcement:** `ENFORCE_EMAIL_VERIFICATION` flag, signup sends verification email, login gates unverified users when enforced, verify-email page, resend-by-email endpoint, unverified banner in resident/contractor layouts.
- **Admin token migration:** Access token and refresh token set as HTTP-only cookies; admin app no longer uses `sessionStorage`; API accepts token from cookie when header is absent.
- **admin_role_verified middleware:** Already enforced (from pilot hardening); middleware requires both `refresh_token` and `admin_role_verified` cookies.
- **Request-docs flow:** Backend `POST /admin/contractors/{id}/request-docs`, Redis persistence, audit log, contractor-facing `GET /contractors/me/doc-requests`, admin UI re-enabled, contractor profile banner when request exists.

### What Was Verified

- Backend auth unit tests: 42 passed.
- Admin app builds (with existing lint).
- Web app: new verify-email, resend-verification pages; signup uses `/signup` endpoint; api client updated.

### What Remains (see `feat/broader-launch-remaining-items` branch)

- **Admin E2E:** Updated for cookie auth; `setupAdminAuth` uses `addCookies` (refresh_token, admin_role_verified).
- **Docs:** `docs/BROADER_LAUNCH_DEPLOYMENT.md` — ENFORCE_EMAIL_VERIFICATION, SMTP, CORS_ORIGINS, WebSocket.
- **Secrets:** `docs/SECRETS_ROTATION.md` — rotation procedures.
- **Chat pagination:** Implemented; AIChat supports `before` cursor and "Load older" button.
- **Accessibility:** Forgot-password link fixed (href="#" → /forgot-password).
- **WebSocket:** Documented in BROADER_LAUNCH_DEPLOYMENT; existing tests in `tests/integration/test_websocket.py`.
- **Mobile:** Checklist in BROADER_LAUNCH_DEPLOYMENT.

### Launch Recommendation

**Ready for broader beta** with conditions:
- Set `ENFORCE_EMAIL_VERIFICATION=true` and `FRONTEND_URL` when enabling email verification for production.
- Configure SMTP for verification emails.
- Run admin E2E with cookie auth to confirm flows.

---

## 2. Files Changed

| Path | Change |
|------|--------|
| `src/config/settings.py` | Added `ENFORCE_EMAIL_VERIFICATION`, `FRONTEND_URL` |
| `src/api/routes/auth.py` | Signup sends verification email; login gates unverified when enforced; `resend-verification-by-email` endpoint; access_token cookie on login/refresh; clear access_token on logout |
| `src/api/middleware/auth.py` | `_get_token_from_header_or_cookie`; read token from cookie when header absent |
| `src/api/routes/admin.py` | `POST /admin/contractors/{id}/request-docs` |
| `src/api/routes/contractors.py` | `GET /contractors/me/doc-requests` |
| `apps/web/app/(auth)/verify-email/page.tsx` | **New** — verify email page |
| `apps/web/app/(auth)/resend-verification/page.tsx` | **New** — resend by email page |
| `apps/web/app/(auth)/login/page.tsx` | 403 handling for unverified; resend UI |
| `apps/web/app/(resident)/layout.tsx` | Unverified banner + resend button |
| `apps/web/app/contractor/layout.tsx` | Unverified banner + resend button |
| `apps/web/app/contractor/profile/page.tsx` | Doc request banner; fetch doc-requests |
| `apps/web/lib/api/client.ts` | Signup → `/signup`; `verifyEmail`, `resendVerificationByEmail`, `resendVerification` |
| `apps/web/messages/en.json` | `requestBannerTitle` |
| `apps/web/messages/he.json` | `requestBannerTitle` |
| `packages/api-client/src/client.ts` | `credentials: "include"` on fetch |
| `apps/admin/app/login/page.tsx` | No sessionStorage; cookie-based auth |
| `apps/admin/components/AdminShell.tsx` | consumeTokenFromHash sets admin_role_verified only; logout uses credentials only |
| `apps/admin/lib/hooks.ts` | No auth token; `credentials: "include"` on all fetches |
| `apps/admin/app/contractors/page.tsx` | Request Documents button enabled; `requestDocuments` wired |
| `apps/admin/app/payments/page.tsx` | credentials only |
| `apps/admin/app/users/page.tsx` | credentials only |
| `apps/admin/app/settings/page.tsx` | credentials only |
| `apps/admin/app/settings/audit-logs/page.tsx` | credentials only |
| `apps/admin/app/offers/page.tsx` | credentials only |
| `apps/admin/app/escalations/page.tsx` | credentials only |
| `apps/admin/SECURITY.md` | Updated for cookie-based auth |
| `apps/admin/__tests__/AdminLayout.test.tsx` | Logout test updated |
| `tests/unit/test_route_auth.py` | `test_login_json_unverified_when_enforced`; `TestResendVerificationByEmail` |

---

## 3. Auth and Security Hardening

### Email Verification

- **Backend:** `ENFORCE_EMAIL_VERIFICATION` (default `False`) gates login when `True`; signup sends verification email; `POST /verify-email/{token}`; `POST /resend-verification` (auth); `POST /resend-verification-by-email` (no auth, rate-limited).
- **Frontend:** `/verify-email?token=xxx` page; `/resend-verification` page; login shows resend when 403; resident/contractor layouts show unverified banner.
- **Config:** `FRONTEND_URL` for verification links in emails.

### Admin Token Migration

- Backend sets `access_token` as HTTP-only cookie on login and refresh; cleared on logout.
- Auth middleware reads token from `Authorization` header or `access_token` cookie.
- Admin app: all fetches use `credentials: "include"`; no `sessionStorage` for tokens.
- `@groupio/api-client`: added `credentials: "include"` to fetch.

### Middleware Enforcement

- Middleware requires `refresh_token` and `admin_role_verified` cookies (from pilot hardening).
- Login page sets `admin_role_verified` after role verification.

### Secrets / Config

- No doc changes in this branch. Existing `SECURITY.md` updated for admin cookie auth.

---

## 4. Admin Hardening

### Request-Docs

- **Backend:** `POST /api/v1/admin/contractors/{contractor_id}/request-docs` — persists to Redis, audit log.
- **Contractor visibility:** `GET /api/v1/contractors/me/doc-requests` — contractor sees pending request.
- **Admin UI:** Request Documents button enabled and wired.
- **Contractor profile:** Banner when admin requested docs.

### Admin Smoke / E2E

- Admin E2E specs exist (`admin-flow.spec.ts`, `admin-management-flow.spec.ts`).
- May need updates for cookie-based auth (no token in storage).
- Not validated in this branch.

---

## 5. UX / Accessibility / Responsive Improvements

- No dedicated a11y pass.
- No targeted responsive changes.
- New pages (verify-email, resend-verification) include basic labels and ARIA where relevant.

---

## 6. Chat / Realtime Improvements

- Chat pagination: not implemented.
- WebSocket/realtime: not validated.
- Status: unchanged from pilot.

---

## 7. Commands Run

```bash
# Auth unit tests
python -m pytest tests/unit/test_route_auth.py -v

# Admin build (run separately)
pnpm --filter admin run build

# Web build (may have pre-existing ESLint warnings)
pnpm --filter web run build
```

---

## 8. Results

| Check | Outcome |
|-------|---------|
| Auth unit tests | 42 passed |
| Admin build | Runs; existing lint may warn |
| Web build | May fail on pre-existing ESLint; new pages build |
| Request-docs backend | Implemented and unit-testable |
| Admin cookie auth | Implemented; manual verification recommended |

---

## 9. Remaining Risks / Follow-Ups

### Required Before Broader Beta

1. **Email verification:** Set `ENFORCE_EMAIL_VERIFICATION=true` and SMTP when ready.
2. **Admin E2E:** Verify admin flows with cookie auth; update specs if needed.
3. **CORS:** Ensure `CORS_ORIGINS` includes admin frontend origin for cookie-based requests.

### Should Do Later

1. Full accessibility audit and fixes.
2. Chat history pagination if backend supports cursor.
3. WebSocket/realtime validation or documentation.
4. Secrets rotation docs and production checklist.
5. Mobile/responsive pass on critical routes.

---

## 10. Recommendation

**Ready for broader beta** with the following:

- Deploy with `ENFORCE_EMAIL_VERIFICATION=false` initially if SMTP is not configured.
- Enable `ENFORCE_EMAIL_VERIFICATION` and SMTP when ready for verification.
- Manually verify admin login, dashboard, contractors, payments, and request-docs.
- Run admin E2E after updating for cookie auth.
- Document `FRONTEND_URL` for verification emails in production.
