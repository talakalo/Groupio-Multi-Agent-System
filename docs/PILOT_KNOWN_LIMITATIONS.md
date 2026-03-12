# Groupio Pilot — Known Limitations & Support Notes

> **Scope:** Limited pilot (20–50 users, 1–3 buildings).
> **Last updated:** March 2025 (post pilot-hardening)

---

## 1. Pilot Caveats

### Payment Flows

| Item | Status | Notes |
|------|--------|-------|
| Resident payments list/history | ✅ Working | Read-only display of payment status |
| Resident checkout/initiate | ⚠️ Partial | UI does not misleadingly promise full checkout; payments appear after joining offers |
| Admin payments summary/escrow/payouts | ✅ Working | Requires backend; admin panel displays correctly |
| Stripe integration | ⚠️ Test mode only | **MUST use `sk_test_` / `pk_test_` keys** — no real charges |

### Admin

| Item | Status | Notes |
|------|--------|-------|
| Request-docs flow | ❌ Disabled | Backend endpoint not implemented; UI shows "(soon)" and is disabled |
| Admin middleware role check | ⚠️ Backend-only | Frontend middleware checks `refresh_token`; backend enforces admin role on API |
| Admin token storage | ⚠️ sessionStorage | XSS exposure; see `apps/admin/SECURITY.md` for mitigation notes |

### Contractor / Resident

| Item | Status | Notes |
|------|--------|-------|
| Contractor create-offer redirect | ✅ Fixed | Now redirects to `/contractor/projects/{id}` (valid detail page) |
| Contractor nav | ✅ Aligned | `/contractor/offers/active` used consistently |
| Resident signup → onboarding → dashboard | ✅ Working | Verified by pilot-smoke E2E |
| Offer join/leave | ✅ Working | API and UI aligned |

---

## 2. Logging, Monitoring & Support

### What Is Present

- **Sentry (web):** `@sentry/nextjs` integrated; error boundaries in `(resident)/dashboard`, `(resident)/offers`, `(resident)/payments`, `contractor` layouts
- **Backend:** `LOG_LEVEL` env; `SENTRY_DSN` optional for backend errors
- **Admin:** `apps/admin/SECURITY.md` documents token and auth caveats

### How to Investigate Failures

| Area | Where to look |
|------|---------------|
| Web frontend errors | Browser console; Sentry (if DSN configured); error boundary fallbacks |
| Backend API errors | Server logs; `uvicorn` stdout; Sentry (if configured) |
| Auth/login issues | Check `refresh_token` cookie; backend `/api/v1/auth/me` response |
| Contractor create 404 | **Fixed** — redirect now goes to `/contractor/projects/{id}` |

### What Is Not Covered

- No centralized log aggregation
- No alerting on payment failures
- No admin audit log UI (backend may have audit tables)
- Mobile app not in pilot scope

---

## 3. E2E / Runtime Validation

| Suite | Status | Command |
|-------|--------|---------|
| Contractor create-offer flow | ✅ Verified | `pnpm --filter web exec playwright test e2e/contractor-flow.spec.ts --grep "should fill in and submit offer form"` |
| Pilot smoke (10 tests) | ⚠️ Run locally | `pnpm --filter web exec playwright test e2e/pilot-smoke.spec.ts --project=chromium` |
| Full E2E | Use CI or clean env | Port 3000 must be free; `CI=1` forces fresh webServer |

### Reproducible Verification

```bash
# 1. Ensure port 3000 is free
lsof -i :3000  # should be empty

# 2. Run contractor + pilot smoke
CI=1 pnpm --filter web exec playwright test e2e/contractor-flow.spec.ts e2e/pilot-smoke.spec.ts --project=chromium
```

---

## 4. Mobile & Accessibility

- **Mobile app:** Not in pilot scope
- **Responsive web:** Basic; no full accessibility audit completed for pilot

---

## 5. Rollback / Stop Pilot

- Disable signup if needed (backend/feature flag)
- Rotate `JWT_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` after pilot
- Set Stripe to live keys only after pilot validation
