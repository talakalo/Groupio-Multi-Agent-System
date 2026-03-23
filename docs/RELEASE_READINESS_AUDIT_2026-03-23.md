# Release readiness audit — 2026-03-23

Code-first audit of branch state (workspace: Groupio Multi-Agent System).  
Verdict: **NO-GO** for unconditional production release (see §10). Backend unit+integration+coverage and Docker **image** build verified locally; Stripe/browser/compose-stack/target-DB migration **not proven** here.

---

## 1. Executive Summary

| Item | Assessment |
|------|------------|
| Overall | **Not release-ready** under strict criteria (live Stripe E2E, `docker compose up` smoke on target env, **target** DB migration apply + live webhook replay). **Improved this pass:** Playwright **mock-API** coverage for NotificationPanel, RBAC middleware routing, contractor membership checkout CTA; integration **API RBAC matrix** + optional PostgreSQL **031 idempotency** test. |
| Top blockers | **Strict GO still blocked:** live Stripe checkout + webhook + duplicate `event.id` on **staging/prod** DB; full-stack **`docker compose up --build`** smoke (health + login + real auth flow) not executed here. **Now proven in-repo (mock/browser):** NotificationPanel states + rollback; Next middleware role redirects; `POST /admin/users` super_admin escalation guards (integration). **Automated DB idempotency:** `tests/integration/test_stripe_webhook_idempotency_db.py` **PASS** when PostgreSQL reachable and `stripe_webhook_events` exists; otherwise **skipped**. |
| Recommendation | **NO-GO** for unconditional production until staging/runtime/browser proofs are recorded. **Improved:** CI-equivalent backend test+coverage gate reproduced locally when Postgres/Redis match CI URLs. |

---

## 2. Repository areas audited

- **Backend:** `src/api/routes/payments.py`, `src/api/routes/contractors.py`, `src/api/routes/admin.py`, `src/api/routes/auth.py`, `src/config/settings.py`, `src/services/stripe_contractor_webhooks.py`, `src/databases/postgres.py` (`try_claim_stripe_webhook_event`), `src/api/middleware/auth.py`
- **Migrations:** `alembic/versions/030_*.py`, `alembic/versions/031_stripe_webhook_idempotency.py`, `alembic heads` / `history`
- **Frontend:** `apps/web` (`NotificationPanel.tsx`, `unwrapPageParams.ts` → `useUnwrapPageParams`, `app/providers.tsx`, `app/layout.tsx` fonts), `apps/web/e2e/reports/custom-reporter.ts`
- **Tests (sampled):** `tests/unit/test_publishable_payment_settings.py`, `tests/unit/test_stripe_contractor_webhooks.py`, `tests/unit/test_contractor_membership_checkout.py`, `tests/unit/test_rbac_buildings_manager.py`, `tests/unit/test_security_audit_fixes.py`, `tests/unit/test_security_middleware.py`; **new:** `tests/integration/test_rbac_release_matrix.py`, `tests/integration/test_stripe_webhook_idempotency_db.py`; **E2E:** `apps/web/e2e/notification-panel.spec.ts`, `apps/web/e2e/rbac-routing.spec.ts`, `apps/web/e2e/contractor-membership-checkout.spec.ts`, `apps/web/e2e/api/actions.ts` (`setupDefaultNotificationMocks`, role-aligned `/auth/me`)
- **CI:** not re-run end-to-end in this session (local commands only)

---

## 3. Issues identified

| ID | Severity | Title | Path(s) | Description | Release impact | Status |
|----|----------|-------|---------|-------------|----------------|--------|
| R1 | **Critical** (was) | No API to start contractor membership Stripe Checkout | `src/api/routes/contractors.py` | Only webhooks + `GET /contractors/me/membership`; no session creation with `metadata.contractor_id`. | Blocks self-service membership in production. | **FIXED** (new `POST /contractors/me/membership/checkout-session`) |
| R2 | **High** | Web production build failed | `apps/web` | Missing `posthog-js`; ESLint **error** `react-hooks/rules-of-hooks` in `unwrapPageParams`. | Blocks `pnpm build`. | **FIXED** (`posthog-js` dep; `useUnwrapPageParams`) |
| R3 | Medium | Playwright JSON reporter status union | `apps/web/e2e/reports/custom-reporter.ts` | `FullResult` includes `timedout`; narrow union caused TS error. | CI/typecheck friction. | **FIXED** (`status: FullResult['status']`) |
| R4 | High | Security audit unit tests failing locally | `tests/unit/test_security_audit_fixes.py` (+ `auth.py`, `main.py`, `test_route_auth.py`) | Was: CORS/admin override/brute-force/health DB. | CI / trust in security regressions. | **FIXED** (policy + tests aligned; run `pytest tests/unit/test_security_audit_fixes.py` — green) |
| R5 | Medium | RBAC test contradicted router policy | `tests/unit/test_rbac_buildings_manager.py` | Test expected `buildings_manager` → `GET /admin/status` allowed; router uses `require_admin_only` (excludes buildings_manager). | Misleading test signal. | **FIXED** (expect 403) |
| R6 | Critical | Live Stripe + DB proof | — | No test-mode checkout run; no real DB migration apply + duplicate webhook replay in this audit. | Cannot claim payment/membership readiness. | **NOT PROVEN** |
| R7 | High | Full `pytest` / coverage gate | `tests/unit/` | Full unit suite must stay green in CI. | May block CI. | **PASS** (local): `1270 passed` — see §7 remediation commands |

---

## 4. Incomplete features (selected)

| Feature | Expected | Current | Missing | Impact | Status |
|---------|----------|---------|---------|--------|--------|
| Contractor membership E2E | Checkout → webhooks → DB state | Checkout API + **contractor profile UI** (`GET/POST` membership via `apiClient`) + webhook handlers | Live Stripe + price config + browser checkout completion + replay proof | High | **PARTIAL** (UI wired; runtime E2E still unproven) |
| NotificationPanel runtime | Live list/count/read against API | Code calls `apiClient` | **Live backend** browser proof still outstanding | Medium | **PARTIAL** — **Playwright mock-API** proves empty/loading/error/retry/mark-read/mark-all/rollback (`e2e/notification-panel.spec.ts` + `data-testid` hooks) |
| RBAC matrix | All boundaries proven | Code + some tests | Live API + all roles against production-like stack | High | **PARTIAL** — **Integration** `test_rbac_release_matrix.py` + **Playwright** middleware redirects `e2e/rbac-routing.spec.ts` |

---

## 5. Release checklist status

- **A. Environment and payment safety**  
  - **Status:** **PASS** (code)  
  - **Evidence:** `Settings._validate_production_config` in `src/config/settings.py` rejects `mock`, `bit`, `paybox` in staging/production; requires `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` when `PAYMENT_PROVIDER=stripe`; tests in `tests/unit/test_publishable_payment_settings.py`.  
  - **Action taken:** None (verified).  
  - **Remaining risk:** Misconfigured env in deploy still possible — ops must enforce.

- **B. Database and migration integrity**  
  - **Status:** **PARTIAL**  
  - **Evidence:** `alembic heads` → `031`; `031_stripe_webhook_idempotency.py` creates `stripe_webhook_events`; `PostgresClient.try_claim_stripe_webhook_event` in `postgres.py`.  
  - **Action taken:** Chain verified locally via Alembic CLI.  
  - **Remaining risk:** **NOT PROVEN** on production/staging DB (no `upgrade` run in this audit).

- **C. Contractor membership and billing**  
  - **Status:** **PARTIAL** (improved)  
  - **Evidence:** `POST /api/v1/contractors/me/membership/checkout-session` sets `metadata` + `subscription_data.metadata` with `contractor_id`; `handle_stripe_subscription_event` covers listed events in `stripe_contractor_webhooks.py`.  
  - **Action taken:** Implemented checkout endpoint + `STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID` in settings.  
  - **Remaining risk:** Configure price ID + Stripe Dashboard webhooks; **live** lifecycle **NOT PROVEN**.

- **D. Payments runtime proof**  
  - **Status:** **NOT PROVEN**  
  - **Evidence:** None from this session (no Stripe CLI / real webhook delivery).  
  - **Action taken:** None.  
  - **Remaining risk:** Full blocker for strict GO.

- **E. Notification system**  
  - **Status:** **PARTIAL** (mock-API E2E added)  
  - **Evidence:** `NotificationPanel.tsx` uses `getNotifications` + `getUnreadNotificationCount` + mutations; Playwright `e2e/notification-panel.spec.ts` (chromium) exercises empty, loading, error+retry, mark read/all, optimistic rollback via `page.route` mocks.  
  - **Action taken:** `data-testid` hooks + `notification-retry` button id.  
  - **Remaining risk:** **Live** API proof still required for strict GO.

- **F. Frontend quality gate**  
  - **Status:** **PASS** (local)  
  - **Evidence:** `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` exit 0; `pnpm build` in `apps/web` exit 0 after fixes.  
  - **Action taken:** `useUnwrapPageParams`, `posthog-js` dependency, reporter typing.  
  - **Remaining risk:** ESLint **warnings** remain; `next/font/google` build succeeded here (font fetch may be cached — air-gapped builds **NOT PROVEN**).

- **G. Backend quality gate**  
  - **Status:** **PASS** (unit + integration + coverage, local)  
  - **Evidence:** `pytest tests/unit/` → **1270 passed**; `pytest tests/integration/` → **213 passed** (with `DATABASE_URL`/`REDIS_URL` as in `.github/workflows/ci.yml`); `pytest tests/ --cov=src --cov-fail-under=80` → **1493 passed**, **~80.1%** coverage.  
  - **Action taken:** Same as prior pass plus: `_is_db_connection_error` handles `ECONNREFUSED`, `EADDRNOTAVAIL`, `gaierror`; `PaymentInitiateRequest.idempotency_key`; integration `mock_redis` lockout defaults; `test_list_offers` building scope; `test_login_json_success` user/redis.  
  - **Remaining risk:** Full Playwright suite + CI matrix not re-run in every pass. **Focused Playwright** (this update): `e2e/notification-panel.spec.ts`, `e2e/rbac-routing.spec.ts`, `e2e/contractor-membership-checkout.spec.ts` on **chromium** with `pnpm exec playwright test …` from `apps/web`. **Vitest** (`pnpm test` in `apps/web`): run after UI changes as needed.

- **H. RBAC and security**  
  - **Status:** **PARTIAL** (integration + middleware E2E)  
  - **Evidence:** `tests/integration/test_rbac_release_matrix.py` (403 for resident/contractor/BM on `/admin/status`; admin blocked from creating/assigning `super_admin`; super_admin path with mocked DB); `e2e/rbac-routing.spec.ts` for Next middleware redirects; `require_admin_only` on `admin.py` router.  
  - **Action taken:** New integration + Playwright specs; `setupAuthAndMocks` aligns mocked `/auth/me` with `loginAs` role.  
  - **Remaining risk:** **Live** JWT + API enforcement matrix on deployed stack not recorded here.

- **I. Full runtime proof**  
  - **Status:** **NOT PROVEN**  
  - **Evidence:** `docker compose up` / health / authenticated flows not run in this audit.  
  - **Action taken:** None.  
  - **Remaining risk:** High.

- **J. Release documentation**  
  - **Status:** **PARTIAL**  
  - **Evidence:** This file; prior audits may overstate completion.  
  - **Action taken:** Added this audit.  
  - **Remaining risk:** Reconcile `docs/PUBLISH_READINESS_AUDIT.md` with code after fixes.

---

## 6. Actions taken (this session)

| Area | Files | Change | Verification |
|------|-------|--------|----------------|
| Membership checkout | `src/config/settings.py` | `STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID` | Config surface for Stripe Price |
| Membership checkout | `src/api/routes/contractors.py` | `POST /me/membership/checkout-session`, redirect validation, Stripe session with `metadata.contractor_id` | `tests/unit/test_contractor_membership_checkout.py` (4 passed) |
| Membership checkout UI E2E | `apps/web/e2e/contractor-membership-checkout.spec.ts`, `app/contractor/profile/page.tsx` | `data-testid="contractor-membership-subscribe"`; mock checkout-session → navigation | Playwright chromium |
| NotificationPanel E2E | `apps/web/e2e/notification-panel.spec.ts`, `NotificationPanel.tsx` | Mock API routes; loading/error/retry/read/rollback | Playwright chromium |
| RBAC release tests | `tests/integration/test_rbac_release_matrix.py`, `apps/web/e2e/rbac-routing.spec.ts` | API + middleware routing | `pytest` + Playwright |
| Stripe webhook idempotency DB | `tests/integration/test_stripe_webhook_idempotency_db.py` | `ON CONFLICT DO NOTHING` semantics vs `stripe_webhook_events` | **PASS** if Postgres + table; else **skipped** |
| E2E mocks | `apps/web/e2e/api/actions.ts`, `e2e/helpers/user.factory.ts` | Default notification routes; `buildings_manager` / `super_admin` roles for `loginAs` | Playwright |
| Web build | `apps/web/lib/utils/unwrapPageParams.ts` + call sites | Rename to `useUnwrapPageParams` | ESLint hooks rule |
| Web build | `apps/web/package.json` (via pnpm) | `posthog-js` dependency | Resolves `posthog-js` module |
| Web TS | `apps/web/e2e/reports/custom-reporter.ts` | `FullResult['status']` | Align with Playwright |
| RBAC test | `tests/unit/test_rbac_buildings_manager.py` | buildings_manager → 403 on `/admin/status` | Matches `admin.py` router |
| Schema not ready | `src/api/main.py` | `_is_schema_not_ready` + **503** `DB_SCHEMA_NOT_READY` in global handler | `tests/unit/test_error_scenarios.py::TestSchemaNotReady` |
| Full unit green | Multiple `tests/unit/*.py` | Offers mocks (`get_building_ids_for_user`, `is_user_in_building`); contractor create + `created_by`; WhatsApp tests + `_verify_whatsapp_signature` expect fail-closed; payment mock-in-prod → `RuntimeError`; PaymentAgent refund_queued; vetting fixture patch `src.config.settings.get_settings`; `AgentWorker` test `aclose` | `pytest tests/unit/` |

---

## 7. Commands run

```bash
python -m pytest tests/unit/test_contractor_membership_checkout.py tests/unit/test_publishable_payment_settings.py tests/unit/test_stripe_contractor_webhooks.py -q --tb=short
python -m pytest tests/unit/test_rbac_buildings_manager.py tests/unit/test_security_audit_fixes.py tests/unit/test_security_middleware.py -q --tb=line
python -m pytest tests/unit/ -q --tb=line   # 1270 passed
python -m pytest tests/integration/ -q --timeout=60   # 213 passed (CI-like DATABASE_URL/REDIS_URL)
python -m pytest tests/ --cov=src --cov-fail-under=80 -q   # 1493 passed, ~80.1% cov
docker build -f docker/Dockerfile -t groupio-api:audit .
python -m alembic heads
python -m alembic history -r 030:031
python -m ruff check src/ tests/
python -m ruff format src/ tests/ --check
cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json
cd apps/web && pnpm build
python -m pytest tests/integration/test_rbac_release_matrix.py tests/integration/test_stripe_webhook_idempotency_db.py -q
cd apps/web && pnpm exec playwright test e2e/notification-panel.spec.ts e2e/rbac-routing.spec.ts e2e/contractor-membership-checkout.spec.ts --project=chromium --workers=1 --reporter=line
docker compose -f docker/docker-compose.yml config
```

---

## 8. Test and build results (summary)

| Gate | Result |
|------|--------|
| TypeScript (`apps/web`) | **PASS** |
| `pnpm build` (`apps/web`) | **PASS** |
| `pytest` targeted (publishable + stripe webhooks + membership checkout) | **PASS** |
| `pytest` full `tests/unit/` | **PASS** (1270 passed, remediation) |
| `pytest` RBAC + security_audit_fixes + security_middleware | **PASS** (when run as part of full unit suite) |
| Alembic heads / 030→031 | **PASS** (repo chain) |
| Migration on live DB | **NOT PROVEN** (staging/prod); **repo test** `test_stripe_webhook_idempotency_db.py` exercises table when local PG has 031 |
| Docker / runtime | **PARTIAL** — `docker compose … config` OK; **`docker compose up --build` smoke not run** this pass |
| Stripe test checkout + webhooks | **NOT PROVEN** (live test mode) |
| NotificationPanel | **PARTIAL** — **mock-API Playwright PASS** (chromium); live API **NOT PROVEN** |
| RBAC | **PARTIAL** — **integration + middleware Playwright PASS**; live JWT matrix **NOT PROVEN** |

---

## 9. Remaining blockers (strict release)

1. **Live** Stripe subscription checkout + webhook delivery + idempotency replay on **target** DB with migration **031** applied (automated insert test is not a substitute).  
2. **Runtime** smoke: `docker compose -f docker/docker-compose.yml up --build` (or project-standard) → health → web → login → one authenticated flow on target env.  
3. **Operational:** set `STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID`, webhook events in Stripe, `FRONTEND_URL` for redirects.

---

## 10. Final release verdict

**NO-GO.**  

Payment safety rules and membership **checkout initiation** are implemented in code with unit tests; `apps/web` **tsc** + **build** pass; **focused Playwright** (NotificationPanel, RBAC routing, contractor membership CTA) and **RBAC/idempotency integration tests** were added and executed locally on **chromium**. **Live** Stripe (test-mode checkout + webhook + replay on **target** DB), **full docker-compose stack smoke**, and **live-API** NotificationPanel proof are **still unproven** — **NO-GO** for unconditional production until those are executed and logged.

---

## 11. Exact next steps

1. Run `alembic upgrade head` on staging DB; confirm `stripe_webhook_events` exists.  
2. Configure Stripe: Price ID → `STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID`; point webhooks to `/api/v1/payments/webhook/stripe`; run checkout session → complete payment → assert contractor row; replay same event → idempotent DB state.  
3. ~~Wire contractor UI~~ **Done** — profile Settings tab + `apiClient` checkout; run **live** Stripe test-mode from staging.  
4. Run full CI-equivalent: `pytest tests/` (unit + integration + coverage), `pnpm build` / `pnpm test` in `apps/web`, full Playwright suite if required by CI, Docker compose smoke + health + login.  
5. Update `docs/PUBLISH_READINESS_AUDIT.md` to reference this audit and remove overstated claims.
