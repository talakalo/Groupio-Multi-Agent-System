# Publish blockers — implementation notes (2026-03-18)

## Payments (staging / production)

- **`Settings` validation** (`src/config/settings.py`): `ENVIRONMENT` in `production` or `staging` requires `PAYMENT_PROVIDER=stripe`, non-empty `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; rejects `mock`, `bit`, and `paybox`.
- **`get_payment_provider()`** (`src/services/payment.py`): still rejects `mock` at runtime in `production`/`staging` (defense in depth).
- **bit / PayBox**: remain **NotImplemented**; blocked in publishable envs via settings.

## Contractor membership (Stripe)

- **Webhook events** (`src/api/routes/payments.py` + `src/services/stripe_contractor_webhooks.py`):
  - `checkout.session.completed` (subscription mode + `metadata.contractor_id`)
  - `customer.subscription.created` / `updated` / `deleted`
  - `invoice.paid` / `invoice.payment_failed`
- **Idempotency**: table `stripe_webhook_events` (Alembic **031**).
- **DB helpers**: `PostgresClient.try_claim_stripe_webhook_event`, `get_contractor_by_stripe_customer_id`, `get_contractor_by_stripe_subscription_id`.

## Notifications (web)

- **`NotificationPanel`** (`apps/web/components/shared/NotificationPanel.tsx`) uses **`apiClient`** list/unread/mark-read/mark-all; loading/error/empty; optimistic updates with rollback.

## TypeScript / CI

- **`apps/web/tsconfig.json`**: excludes `**/*.stories.*` and `.next` from `tsc` project.
- **OpenAPI codegen** step: **`continue-on-error` removed** from `.github/workflows/ci.yml` (fails pipeline if types generation fails).

## RBAC

- See **`docs/RBAC_RELEASE_MATRIX.md`**.
- **`require_super_admin`** added in `src/api/middleware/auth.py` for future ultra-sensitive routes.

## Migrations

- Run **`alembic upgrade head`** before relying on webhook idempotency.
