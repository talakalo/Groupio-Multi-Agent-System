# Contractor membership & subscription billing — audit (code-evidence)

**Date:** 2026-03-18  
**Branch audited:** local `dev` (with this document’s implementation commits applied)

## 1. Executive summary

- **Resident / order payments** (escrow, `PaymentIntent`, offer checkout) exist in `src/api/routes/payments.py`, `src/services/payment.py` — **separate** from contractor marketplace membership.
- **Stripe recurring subscriptions** for contractors (Billing, `customer.subscription.*`, `invoice.paid` / `invoice.payment_failed` webhooks) are **not** implemented end-to-end in this codebase.
- **Before this change:** contractor monthly membership was **MISSING** as a persisted model with enforcement (no membership columns on `contractors`, no offer-creation gate for contractors, no public discovery filter).
- **After migration `029` + routes:** state is **IMPLEMENTED_BUT_PARTIAL** — DB + backend enforcement + admin override + contractor self read API exist; **no** live recurring charge or Stripe subscription webhooks; **minimal** contractor billing UI (API only unless wired in frontends).

## 2. Classification

| Area | State (before → after this PR) |
|------|--------------------------------|
| Overall contractor subscription product | **MISSING** → **IMPLEMENTED_BUT_PARTIAL** |
| Resident payments | **IMPLEMENTED_AND_WORKING** (scope: one-time / order flows; verify prod config separately) |
| Recurring contractor billing | **MISSING** (no subscription lifecycle in code) |
| UI contractor billing | **UI_ONLY_PLACEHOLDER / absent** (no dedicated billing page in `apps/web` audited paths) |

## 3. Capability matrix

| Capability | Frontend | Backend | DB | Provider | Enforcement | Tests |
|------------|----------|---------|-----|----------|-------------|-------|
| Contractor monthly plan purchase (checkout) | No | No | N/A | No recurring | N/A | N/A |
| Persist membership status / plan / provider IDs | N/A | Admin PATCH + read | **029 columns** | Manual/mock only | N/A | Unit + route |
| Auto monthly renewal | No | No | N/A | No | N/A | No |
| Webhooks (invoice/subscription) | N/A | No (`webhooks.py` = WhatsApp / contractor-update) | N/A | No | N/A | No |
| Block offer create if unpaid / canceled | Partial (no banner) | **Yes** (`offers.create_offer` + contractor row) | Yes | N/A | **Backend** | Yes |
| Hide non-paying from discovery | Partial | **Yes** (`list_contractors` + search filter) | Yes | N/A | **Backend** | Integration |
| Public profile hidden if not marketplace-visible | N/A | **Yes** (`GET /contractors/{id}`) | Yes | N/A | **Backend** | Integration |
| Admin override / comp | No dedicated UI | **Yes** `PATCH /admin/contractors/{id}/membership` | Yes | N/A | Audit log | Yes |
| Contractor self status | No dedicated UI | **Yes** `GET /contractors/me/membership` | Yes | N/A | N/A | No (API only) |
| i18n billing strings | Not found for membership | N/A | N/A | N/A | N/A | N/A |

## 4. Files inspected (representative)

- Payments (resident/order): `src/api/routes/payments.py`, `src/services/payment.py`
- Webhooks: `src/api/routes/webhooks.py`
- Offers: `src/api/routes/offers.py`
- Contractors: `src/api/routes/contractors.py`, `src/databases/postgres.py` (`list_contractors`, `create_contractor`)
- Schema: `alembic/versions/001_initial_schema.py`, `004_admin_and_payments.py`
- Frontend contractor offer create: `apps/web/app/contractor/offers/create/page.tsx`, `apps/web/lib/api/client.ts`

## 5. Files changed (this implementation)

- `alembic/versions/029_contractor_membership_columns.py`
- `src/domain/contractor_membership.py`
- `src/models/contractor.py`, `src/models/__init__.py`
- `src/api/middleware/auth.py` (`get_current_user_optional`)
- `src/databases/postgres.py` (`list_contractors`, `admin_update_contractor_membership`)
- `src/api/routes/offers.py`, `src/api/routes/contractors.py`, `src/api/routes/admin.py`
- `src/workers/scheduler.py`
- `tests/unit/test_contractor_membership.py`, `tests/unit/test_route_offers_extended.py`, `tests/unit/test_route_admin.py`, `tests/unit/test_auth_middleware.py`, `tests/integration/test_api_routes.py`

## 6. Business questions (code evidence)

1. **Monthly membership payment today?** **No** automated product path; admin can set state only after **029**.
2. **Auto renewal?** **No** (no subscription engine / webhooks).
3. **Blocked from creating offers if unpaid?** **Yes** for `UserRole.CONTRACTOR` when `membership_status` is not `active`/`trialing` and not `past_due` inside grace (`offers.py` + `contractor_membership.py`).
4. **Membership model in DB?** **Yes** after **029** (`membership_status`, plan, provider IDs, periods, grace, etc.).
5. **Recurring provider integration?** **No** for contractor membership (resident flows may use Stripe `PaymentIntent` — see `payment.py`).
6. **Billing UI for contractors?** **Not** in scope of this patch; use API or add pages later.
7. **Admin manage state?** **Yes** — `PATCH /api/v1/admin/contractors/{id}/membership` (requires `require_admin_only`).
8. **Audited transitions?** **Yes** — `audit_logs` entry `contractor_membership_update`.
9. **Docs-only?** N/A; this file + code now align on “partial implementation”.
10. **Launch-ready for paid contractor subscriptions?** **No** for public launch until recurring billing + webhooks + UI + dunning are built and tested.

## 7. Root causes of prior gap

- Product modeled **resident** offer creation (`is_user_in_building`) without a **contractor** branch.
- No **membership** columns on `contractors` in initial migrations.
- **Payments** module targets **orders / intents**, not **Stripe Billing** subscriptions.

## 8. Recommended implementation plan (next)

1. Add Stripe Billing (or chosen provider) **subscription** create/update + **customer** portal.
2. Implement webhook handlers (idempotent) updating `contractors` membership fields.
3. Contractor billing page in `apps/web` + admin read-only subscription history.
4. Dunning: map `invoice.payment_failed` → `past_due` + `membership_grace_until`; job to suspend after grace.
5. E2E tests with Stripe test clocks or provider mocks.

## 9. Release readiness

| Stage | Verdict |
|-------|---------|
| Internal testing | **OK** after `alembic upgrade head` on non-prod DBs |
| Limited pilot | **OK** if billing is **manual/admin-only** and pilots understand no auto-charge |
| Broader beta | **Not without** recurring billing + webhook hardening |
| Public launch paid membership | **Not ready** |

## 10. Git note

`git pull` was **blocked** earlier when the working tree had many local modifications. Stash/commit/reconcile before pulling `origin/dev`.
