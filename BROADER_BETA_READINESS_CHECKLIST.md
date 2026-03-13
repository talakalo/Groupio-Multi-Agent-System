# Broader Beta Readiness Checklist

**Target**: broader beta release (multi-building, real payments, real users)
**Date**: 2026-03-13

---

## 1. Required Environment Variables

### Backend (`src/config/settings.py`)

| Variable | Dev default | Required for broader beta | Notes |
|---|---|---|---|
| `ENVIRONMENT` | `development` | `staging` or `production` | Triggers strict validation |
| `JWT_SECRET_KEY` | auto-generated | ✅ MUST SET (≥ 32 chars) | Server validation raises on startup if missing |
| `DATABASE_URL` | local PG | ✅ MUST SET | Supabase or managed PG |
| `REDIS_URL` | localhost:6379 | ✅ MUST SET | With password: `redis://:pw@host:6379/0` |
| `REDIS_PASSWORD` | empty | ✅ if not in URL | |
| `ANTHROPIC_API_KEY` | empty | ✅ MUST SET | LLM agents |
| `PAYMENT_PROVIDER` | `mock` | ✅ Set to `stripe` | Production payments |
| `STRIPE_SECRET_KEY` | empty | ✅ MUST SET | Required when `PAYMENT_PROVIDER=stripe` |
| `STRIPE_PUBLISHABLE_KEY` | empty | ✅ MUST SET | Frontend Stripe.js init |
| `STRIPE_WEBHOOK_SECRET` | empty | ✅ MUST SET | Stripe dashboard → Webhooks → Signing secret |
| `PAYMENT_WEBHOOK_SECRET` | empty | ✅ MUST SET | Internal webhook HMAC, 32+ hex chars |
| `SMTP_HOST` | empty | ✅ MUST SET | Email delivery (forgot-password, verify-email) |
| `SMTP_PORT` | 587 | recommended | |
| `SMTP_USER` | empty | ✅ MUST SET | |
| `SMTP_PASSWORD` | empty | ✅ MUST SET | |
| `SMTP_FROM_EMAIL` | noreply@groupio.co.il | ✅ Verify SPF/DKIM | |
| `FRONTEND_URL` | https://groupio.co.il | ✅ Set to real URL | Used in password reset / verify emails |
| `ENFORCE_EMAIL_VERIFICATION` | `false` | ✅ Set to `true` | Blocks unverified users at login |
| `CORS_ORIGINS` | localhost | ✅ Set to real origins | e.g. `["https://groupio.co.il"]` |
| `API_KEYS` | empty | ✅ MUST SET | Service-to-service auth |
| `QDRANT_URL` | localhost:6333 | ✅ if using vector search | |
| `NEO4J_URI` | localhost:7687 | ✅ if using graph | |
| `SENTRY_DSN` | empty | Strongly recommended | Error tracking |
| `ADMIN_EMAIL` | empty | Recommended | System alert inbox |

### Frontend – Web App (`apps/web/.env.production`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend URL, e.g. `https://api.groupio.co.il` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | From Stripe Dashboard (pk_live_…) |
| `NEXT_PUBLIC_SENTRY_DSN` | Recommended | |

### Frontend – Admin App (`apps/admin/.env.production`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend URL |
| `NEXT_PUBLIC_SENTRY_DSN` | Recommended | |

---

## 2. Required Services

| Service | Purpose | Minimum |
|---|---|---|
| PostgreSQL | Primary DB | Managed, with daily backups |
| Redis | Sessions, rate limiting, token storage | Persistent (AOF or RDB) |
| Stripe account | Payments | Verified business account, KYC done |
| SMTP provider | Transactional email | Dedicated IP or reputable ESP |
| Qdrant | Vector search (AI matching) | Optional for initial beta |
| Neo4j | Graph relationships | Optional for initial beta |
| CDN/object storage | File uploads (avatars, docs) | S3-compatible |

---

## 3. Stripe Setup Steps

1. Create Stripe account at stripe.com, complete business verification.
2. In Stripe Dashboard → Developers → API Keys:
   - Copy **Secret key** → `STRIPE_SECRET_KEY`
   - Copy **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. In Stripe Dashboard → Developers → Webhooks:
   - Add endpoint: `https://api.groupio.co.il/api/v1/payments/webhook/stripe`
   - Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`
4. Run a test charge using Stripe test card `4242 4242 4242 4242` before going live.
5. Switch to Live keys when ready (set `PAYMENT_PROVIDER=stripe`).

---

## 4. Email Verification Gate

- Set `ENFORCE_EMAIL_VERIFICATION=true` before broader launch.
- Verify SMTP delivers to major providers (Gmail, Outlook, Walla).
- Check SPF, DKIM, DMARC records for `groupio.co.il`.
- Test the full flow: signup → email received → verify link → login.
- Test the forgot-password flow: request email → link to `/reset-password?token=...` → reset → login.

---

## 5. Smoke Test Commands

```bash
# Unit / component tests
pnpm --filter web test
pnpm --filter admin test

# E2E smoke (no backend required — all mocked)
pnpm --filter web exec playwright test e2e/pilot-smoke.spec.ts --project=chromium

# TypeScript type checks
pnpm --filter web typecheck
pnpm --filter admin typecheck

# Lint
pnpm --filter web lint
pnpm --filter admin lint

# Backend tests
cd src && python -m pytest tests/ -v
```

---

## 6. Pre-Launch Verification Steps

- [ ] `ENVIRONMENT=production` — confirm backend starts without validation errors
- [ ] JWT_SECRET_KEY set to ≥ 32-char random string
- [ ] STRIPE_WEBHOOK_SECRET verified: place a test charge, confirm webhook fires
- [ ] PAYMENT_WEBHOOK_SECRET set
- [ ] ENFORCE_EMAIL_VERIFICATION=true confirmed blocking unverified login (403)
- [ ] Forgot-password email received, link resolves to `/reset-password?token=...`, form works
- [ ] Admin middleware: verify `/admin/dashboard` redirects to `/login` without cookies
- [ ] Admin login: confirm `refresh_token` + `admin_role_verified` cookies are set on login
- [ ] CORS restricted to real origins (no localhost in production)
- [ ] Sentry capturing errors in staging
- [ ] Redis password-protected in production
- [ ] GDPR deletion: `DELETE /auth/me` tested, PII anonymized
- [ ] Rate limiting: auth endpoints block after 5 failures / 20 req-min

---

## 7. Known Limitations for Broader Beta

| Item | Severity | Notes |
|---|---|---|
| Resident work-approval | Medium | No resident-side "approve work done" button yet. Escrow release is admin-only. Flag to users in beta ToS. |
| Stripe ILS support | Medium | Verify ILS currency is enabled in your Stripe account (some countries require local entity). |
| Admin `localStorage.getItem("admin_user_id")` | Low | Admin UI stores user ID in localStorage for reassignment. Not a credential, but should move to server-side session. |
| Qdrant/Neo4j optional | Low | AI matching degrades gracefully without these services but contractor suggestions will be limited. |
| `@stripe/react-stripe-js` install | Blocker for Stripe UI | Run `pnpm install` after package.json update before deploying with Stripe mode. |

---

## 8. Minimal Incident Runbook

### Payment stuck in `pending` / `processing`

1. Check Stripe Dashboard → Payments for the PaymentIntent status.
2. If `succeeded` in Stripe but `pending` in DB → call `GET /api/v1/payments/my` — if still out of sync, check webhook delivery (Stripe Dashboard → Webhooks → failed deliveries).
3. Manually trigger webhook retry from Stripe Dashboard if needed.
4. Escalate to admin escrow panel to manually release if required.

### Email not delivered

1. Check SMTP provider logs.
2. Verify SPF/DKIM records: `nslookup -type=TXT groupio.co.il`.
3. Resend via `/api/v1/auth/resend-verification-by-email` (rate-limited, 1/min per email).
4. For password reset: user can re-request from `/forgot-password`.

### Backend startup failure (settings validation error)

1. Check missing env vars from `Section 1` above.
2. Common: `JWT_SECRET_KEY` not set → set to `openssl rand -base64 32` output.
3. Common: `PAYMENT_WEBHOOK_SECRET` not set → generate with `python -c "import secrets; print(secrets.token_hex(32))"`.

### Admin cannot log in

1. Confirm user has `role=admin`, `super_admin`, or `buildings_manager` in DB.
2. Check both cookies are set: `refresh_token` AND `admin_role_verified`.
3. Check `ENVIRONMENT` is not blocking admin creation (contact DB admin to set role directly if needed).

---

*Generated: 2026-03-13 | Branch: claude/analyze-release-readiness-cCH04*
