# Staging smoke test checklist (beta / pilot)

Use this after deploying API + Postgres/Supabase + Redis + web (3000) + admin (3001) + optional mobile, with **staging** secrets and **real** Stripe test mode where checkout is tested.

## Preconditions

| Requirement | Notes |
|-------------|--------|
| API running | FastAPI `uvicorn` or container; health returns OK |
| DB migrated | `alembic upgrade head` through **034** on Supabase/Postgres |
| Redis | Rate limits, sessions, password-reset tokens |
| Email | SMTP or provider for reset emails (or expect 503 on send failure) |
| Stripe (checkout tests) | `STRIPE_*` test keys; webhook secret for `/api/v1/payments/webhook/stripe` |
| Web env | `NEXT_PUBLIC_API_URL`, cookies same-site as API |
| Admin env | `NEXT_PUBLIC_API_URL` → API (not 3001), `NEXT_PUBLIC_ADMIN_URL` |
| Test accounts | Resident, contractor, admin (or super_admin) with known passwords |

**Failure signals (global):** 5xx from API, CORS/cookie mismatches (401 on authenticated routes), blank pages with console errors, migrations not applied (missing columns / RLS errors in Supabase logs).

### Environment variables (authoritative lists)

Copy from repo templates and fill staging values:

| Surface | Template |
|---------|----------|
| API / workers | Repository root `.env.example`, `docker/.env.example` |
| Web | `apps/web/.env.example` |
| Admin | `apps/admin/.env.example` |
| Mobile (E2E) | `apps/mobile/.maestro/.env.example` |

**Smoke-test minimum (names only; see templates for descriptions):** API `DATABASE_URL`, `REDIS_URL`, JWT/session secrets, `CORS_ORIGINS` / cookie domain alignment with web; email/SMTP for reset; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable key on web; web `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`; admin `NEXT_PUBLIC_API_URL`, optional `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` for error reporting.

### Admin observability follow-up (optional)

Web ships a client `AppErrorBoundary` that reports to Sentry in `apps/web/app/providers.tsx`. Admin has `sentry.client.config.ts` / `sentry.server.config.ts` plus webpack noise suppression aligned with web; adding the same boundary pattern is **not** required for beta but improves client-side crash visibility.

---

## 1. Resident auth + account menu

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open `/login`, sign in as resident | Redirect to `/dashboard` or onboarding |
| 1.2 | Header: open **account menu** (labeled account menu in EN) | Dropdown with profile + logout |
| 1.3 | **Logout** | Redirect to `/login`; protected routes redirect when unauthenticated |
| 1.4 | Invalid password | Error message; no token stored |

**Failure:** No menu button, logout does not clear session, 401 loops.

---

## 2. Resident notification preferences

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | `/profile` → notification toggles | Loads current settings |
| 2.2 | Toggle one channel, **Save** | Success or clear error |
| 2.3 | Hard refresh | Preference persists |

**Failure:** 403, empty payload, reverts after reload.

---

## 3. Resident checkout (happy / fail)

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Join/own an offer eligible for payment; open `/checkout?offerId=...` (or app flow) | Invoice/payment UI loads |
| 3.2 | **Happy path** (Stripe test card `4242…`) | Payment succeeds or client_secret present for confirm; no silent success without provider |
| 3.3 | **Fail closed** | Missing `client_secret` when Stripe requires it → user sees failure, not fake success |
| 3.4 | Webhook (optional) | Stripe CLI forward → payment + invoice status update; idempotent duplicate events OK |

**Failure:** Success UI with failed backend, missing error on provider error, 500 without message.

---

## 4. Contractor auth + earnings

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | `/login` as contractor → `/contractor/dashboard` | Layout + nav |
| 4.2 | `/contractor/earnings` | Table or empty state; no crash |
| 4.3 | Account menu → logout | Same as resident pattern |

**Failure:** 404 on earnings, wrong role routing, 403 on API.

---

## 5. Admin analytics, payments, approve/reject

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Admin login at admin app `/login` | Session cookie; redirect to dashboard |
| 5.2 | `/analytics` | Charts/metrics load or honest empty/error |
| 5.3 | Sidebar **Payments** → `/payments` | Page loads |
| 5.4 | `/agents` — pending decisions (if any) | Approve / Reject calls return 200/4xx with body; audit trail updated |
| 5.5 | Locale toggle EN/HE (if enabled) | Nav strings flip; RTL sane for Hebrew |

**Failure:** 401 on all API calls (wrong `NEXT_PUBLIC_API_URL`), dead sidebar links, approve no-ops.

---

## 6. Forgot password + email + confirm

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Web `/forgot-password` or mobile forgot-password — enter email | 200 generic “sent” for unknown emails (no enumeration) |
| 6.2 | Known user + working SMTP | Email received with reset link |
| 6.3 | SMTP failure (simulate) | API **503**; Redis reset key not left dangling (verify in logs) |
| 6.4 | `/reset-password` with valid token | Password updates; login works |
| 6.5 | Expired/invalid token | 400 + clear message |

**Failure:** Always 200 on email failure, token still valid after failed send, no 503 when mail down.

---

## Commands to re-verify automation (CI parity)

```bash
python -m ruff check src/ tests/ && python -m ruff format src/ tests/ --check
python -m pytest tests/ -q --tb=no
pnpm turbo typecheck
pnpm turbo test
pnpm turbo build
```

---

## Post-test

- [ ] Record pass/fail per section and attach API logs for any 5xx.
- [ ] Confirm Supabase **RLS** migrations applied if clients use PostgREST with user JWTs.
