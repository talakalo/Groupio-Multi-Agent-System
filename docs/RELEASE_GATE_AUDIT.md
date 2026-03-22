# Final release-gate audit (evidence-based)

**Branch inspected:** `dev` (via `git branch --show-current`).  
**PRD:** `PRD*.md` — **MISSING** (glob repo: 0 files). Docs are not proof of implementation.

---

## 1. Executive Summary

| Topic | Finding |
|-------|---------|
| **Overall readiness** | **Not** ready for public launch; **conditionally** acceptable for **internal / friendly** pilot with explicit written limitations (payments, membership lifecycle, notifications UI, migration ops). |
| **Release score** | **58/100** (strict: many flows **NOT PROVEN** at runtime in this pass). |
| **Strongest areas** | Monorepo (web/admin/mobile + backend); FastAPI route surface; CI jobs (Ruff, mypy, tests, frontend lint/typecheck/build, security scans per `.github/workflows/ci.yml`); Stripe **PaymentIntent** path in `src/services/payment.py`; Stripe **payment** webhook for `payment_intent.*` / `charge.*` in `src/api/routes/payments.py`; signup role restriction (`SELF_REGISTERABLE_ROLES` + `UserCreate` in `src/models/user.py`, `src/api/routes/auth.py`); contractor offer-creation gate via `contractor_membership_allows_offer_creation` in `src/domain/contractor_membership.py` + `src/api/routes/offers.py`; orchestrator registers multiple agents in `src/orchestration/graph.py`; Alembic **single head** `030` (CLI). |
| **Weakest areas** | **`PAYMENT_PROVIDER` defaults to `"mock"`** (`src/config/settings.py`); **bit/PayBox** raise `NotImplementedError` (`src/services/payment.py`); **no Stripe subscription / contractor membership webhook handling** in `stripe_webhook` (only payment-intent/charge map); **notification REST + `ApiClient` methods exist** but **UI bell uses Zustand only** (`apps/web/components/shared/NotificationPanel.tsx` imports `notificationStore`, not `apiClient`); **OpenAPI → TS codegen `continue-on-error: true`** (`.github/workflows/ci.yml`); **middleware role from writable cookie** — explicitly UX-only (`apps/web/middleware.ts`); **no dedicated contractor billing route** under `apps/web/app/contractor/` (glob: 0 `billing` pages). |
| **Biggest blockers** | Real money on **mock** if misconfigured; **IL** providers not real; **contractor recurring billing** not automated in code reviewed (domain module defers webhooks); **server notifications not surfaced** in web shell; **per-environment migration history** not proven; **full-stack E2E** payments/membership **NOT RUN** this session. |
| **Publish recommendation** | **NO-GO** public; **GO WITH CONDITIONS** internal/friendly pilot; **GO WITH CONDITIONS** limited real-user pilot only with **non-mock** provider, webhooks, ops sign-off; **NO-GO** broader beta / public until matrix gaps closed. |

---

## 2. Environment and Runtime Findings

| Activity | Result | Evidence level |
|----------|--------|----------------|
| `git branch --show-current` | `dev` | **Proven** (CLI) |
| `alembic heads` | `030 (head)` | **Proven** (CLI) |
| `python -m ruff check src/ tests/` | All checks passed | **Proven** (CLI, this session) |
| Full `pytest`, `pnpm build`, Playwright, live Stripe | **Not executed** this session | **NOT PROVEN** |
| Browser crawl per page (loading/error/i18n/RTL) | **Not executed** | **NOT PROVEN** |
| Production/staging DB migration history | **Not inspected** | **NOT PROVEN** |

---

## 3. Repository Inventory

- **Apps:** `apps/web` (Next), `apps/admin` (Next), `apps/mobile` (Expo).
- **Backend:** `src/api` (routes, middleware), `src/services`, `src/databases`, `src/agents`, `src/orchestration`, `src/workers`, `src/domain`.
- **DB:** Alembic `alembic/versions/`; Postgres (code paths).
- **External (referenced in code/config):** Redis, Qdrant, Neo4j (orchestration/docs), LLM APIs, Stripe, WhatsApp (`src/api/routes/webhooks.py`), email, FCM (routes exist — not traced here).

---

## 4. Full Route and Page Inventory

**Method:** `glob **/page.tsx` under `apps/web/app` (35) and `apps/admin/app` (12).  
**Nav linked / reachable / per-page states / i18n quality:** **NOT PROVEN** (no browser audit this session).

### apps/web (35 `page.tsx` files)

Representative paths (full list: glob output in repo):

| Route (pattern) | Example file | Role (intent) | Backend (inferred) | Status |
|-----------------|--------------|---------------|----------------------|--------|
| `/` | `app/page.tsx` | guest | — | NOT PROVEN |
| `/login`, `/signup`, … | `app/(auth)/*` | guest/user | auth | NOT PROVEN |
| `/dashboard`, `/offers`, … | `app/(resident)/*` | resident | offers/buildings/payments | IMPLEMENTED_BUT_PARTIAL (code only) |
| `/contractor/*` | `app/contractor/*` | contractor | offers/contractors | IMPLEMENTED_BUT_PARTIAL; **no `/contractor/billing`** |
| `/buildings-manager/*` | `app/buildings-manager/*` | BM | buildings/escalations | NOT PROVEN |
| `/admin/*` | `app/admin/*` | admin | — | ORPHANED_RISK vs `apps/admin` |

**Middleware:** `apps/web/middleware.ts` — `refresh_token` for auth UX; `groupio-auth` cookie **not** for access control (commented).

### apps/admin (12 `page.tsx` files)

`/login`, `/dashboard`, `/users`, `/contractors`, `/offers`, `/payments`, `/escalations`, `/analytics`, `/agents`, `/settings`, `/settings/audit-logs`, `/`. **Runtime:** NOT PROVEN.

### apps/mobile

Screens exist; **NOT PROVEN** per-screen in this pass.

---

## 5. User Flow Matrix

| Role | Flow | Intended | Actual (code) | Blockers | Severity | Proof |
|------|------|----------|---------------|----------|----------|-------|
| guest | signup | Limited roles | Backend: `SELF_REGISTERABLE_ROLES` | — | Low | **Code** |
| any | login | JWT/session | API + cookies | Cookie UX drift | Med | **Code** |
| resident | join building | Code/ID | `POST /buildings/join` + invite derived in `buildings.py` | Simplified invite (`building_id` slice) | High pilot | **Code** |
| resident | pay | Real charge | `PAYMENT_PROVIDER` | **mock default** | **Critical** | **Code** |
| contractor | create offer | Membership | `offers.py` + `contractor_membership_allows_offer_creation` | No subscription automation | High | **Code** |
| contractor | pay membership monthly | Recurring | Columns/models; domain rules | **No webhook/subscription handler** | **Critical** | **Code** |
| BM | join codes | Manage | Web pages exist; API has `invite` patterns | BM UI grep empty for invite strings | Med | **Partial** |
| admin | ops | Full | Admin app routes | Env + RBAC matrix incomplete | High | **NOT PROVEN** |

---

## 6. Frontend Audit

| Category | Evidence |
|----------|----------|
| **Works (structure)** | 35 web + 12 admin pages exist; middleware protects prefixes; `ApiClient` includes notification HTTP methods (`apps/web/lib/api/client.ts`). |
| **Partial** | Checkout/payments pages depend on provider env. |
| **BACKEND_ONLY_NOT_CONNECTED** | **Server notifications:** `NotificationPanel.tsx` uses `@/lib/stores/notificationStore` only — **no** `apiClient.getNotifications` usage in that component. |
| **MISSING (paths)** | No `apps/web/app/contractor/**/billing/**/*.tsx`. |
| **Duplication** | `apps/web/app/admin/*` vs `apps/admin` — duplicate admin entrypoint risk. |
| **i18n/RTL/a11y** | `next-intl` used; **NOT PROVEN** quality/contrast/keyboard this session. |

---

## 7. Backend Audit

| Category | Evidence |
|----------|----------|
| **Works** | FastAPI routers registered including `notifications` (`src/api/routes/__init__.py`); payments routes + Stripe provider class; Stripe webhook verifies signature when secret set (`payments.py`). |
| **Partial** | Stripe webhook **only** maps `payment_intent.*` / `charge.*` → payment row — **not** `customer.subscription.*` / `invoice.paid` for membership. |
| **SPEC_ONLY / WIRED_BUT_NOT_REAL** | `BitPaymentProvider`, `PayBoxPaymentProvider` — `NotImplementedError` (`payment.py`). |
| **MOCK_ONLY default** | `PAYMENT_PROVIDER: str = "mock"` (`settings.py`). |
| **Resilience** | Partial (e.g. tenacity in some paths) — **not** systematically proven. |

---

## 8. Database Audit

| Topic | Evidence |
|-------|----------|
| **Head** | `alembic heads` → `030 (head)` — **Proven** (CLI). |
| **Membership columns** | `src/models/contractor.py` — `membership_status`, `provider_subscription_id`, etc.; `postgres.py` references `provider_subscription_id`. |
| **Notifications table** | Migration `026_*` (cited in prior audits; not re-read byte-by-byte this pass). |
| **Drift / env history** | **NOT PROVEN** (no live DB compare). |
| **Risk** | Duplicate/obsolete revision application in some envs — **NOT PROVEN** either way. |

---

## 9. Payments and Membership Capability Matrix

| capability | frontend | backend | DB | webhook | tests | runtime proof | status | blockers |
|------------|----------|---------|-----|---------|-------|---------------|--------|----------|
| Resident card (Stripe) | pages + client | `StripePaymentProvider` | invoices/payments | `payment_intent.*` | **NOT PROVEN** this run | **NOT PROVEN** | IMPLEMENTED_BUT_PARTIAL | env, live test |
| Resident (mock) | yes | mock provider | yes | n/a | mocks likely | **NOT PROVEN** | MOCK_ONLY | default `PAYMENT_PROVIDER` |
| Contractor membership **enforcement** | weak/no billing page | `contractor_membership` + offers route | columns | **MISSING** for subs | **NOT PROVEN** | **NOT PROVEN** | IMPLEMENTED_BUT_PARTIAL | no subscription webhook |
| Contractor **recurring** charge | **MISSING** UI | **NOT FOUND** dedicated subscription service | partial schema | **MISSING** | — | **NOT PROVEN** | **MISSING** / SPEC_ONLY | product + Stripe Billing |
| bit | unproven UI | `NotImplementedError` | n/a | n/a | — | **NOT PROVEN** | SPEC_ONLY | merchant API |
| PayBox | unproven UI | `NotImplementedError` | n/a | n/a | — | **NOT PROVEN** | SPEC_ONLY | merchant + webhook |
| Refunds/escrow | partial | partial | partial | partial | **NOT PROVEN** | **NOT PROVEN** | IMPLEMENTED_BUT_PARTIAL | trace needed |

---

## 10. Notifications and Integrations Audit

| Channel / surface | Backend | Web client | Web UI wiring | Status |
|-------------------|---------|------------|---------------|--------|
| REST notifications | `src/api/routes/notifications.py`, router in `src/api/routes/__init__.py` | `getNotifications`, `getUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead` in `apps/web/lib/api/client.ts` | `NotificationPanel.tsx` uses **only** `@/lib/stores/notificationStore` (toasts) — **no** `apiClient` calls | **BACKEND_ONLY_NOT_CONNECTED** (in-app list) |
| Bell / panel UX | N/A | N/A | Bell exists; data not from API | **IMPLEMENTED_BUT_PARTIAL** |
| WhatsApp | `src/api/routes/webhooks.py` (HMAC, fail-closed w/o secret) | N/A | N/A | **IMPLEMENTED_BUT_PARTIAL** (runtime delivery **NOT PROVEN**) |
| Email (verify / reset) | Auth routes exist (`src/api/routes/auth.py` patterns) | Pages exist | **NOT PROVEN** deliverability | **NOT PROVEN** |
| Push / FCM | Routes referenced in broader codebase | Mobile / web **NOT PROVEN** this pass | — | **NOT PROVEN** |
| Enrichment / gov / vector / graph | RAG / Neo4j / Qdrant paths in orchestration | — | — | **NOT PROVEN** E2E |

---

## 11. Agents and Automation Audit

| Agent | Wired (`graph.py`) | Runtime usefulness | Safety/audit | Notes |
|-------|-------------------|--------------------|--------------|-------|
| router | yes | NOT PROVEN | Partial | `RouterAgent` |
| support, matching, pricing, vetting, outreach, analytics, architecture, influencer | yes | NOT PROVEN | Partial | Registered in `GroupioOrchestrator.__init__` |
| payment | lazy import | Conditional (`PAYMENT_AGENT_MODE` / settings) | Partial | May be absent on `ImportError` |

**Classification:** **IMPLEMENTED_BUT_PARTIAL** (wired in code); production value **NOT PROVEN**.

---

## 12. Testing and CI/CD Audit

| Topic | Evidence |
|-------|----------|
| **CI** | `.github/workflows/ci.yml` — backend tests, coverage, frontend lint, typecheck, turbo, Docker, security scans. |
| **False confidence** | `openapi-typescript` step: **`continue-on-error: true`** (line ~298). |
| **Mock-heavy** | Typical unit tests — **do not prove** production. |
| **Missing gates** | Live Stripe checkout, contractor subscription lifecycle, notification UI E2E — **not evidenced** as blocking in CI. |

---

## 13. Security and Permission Audit

| Item | Verdict | Evidence |
|------|---------|----------|
| Self-signup privileged roles | **Blocked** | `SELF_REGISTERABLE_ROLES` / `UserCreate` |
| Middleware role | **UX only** | `apps/web/middleware.ts` comments |
| Backend enforcement | **Partially verified** | Signup + sample routes; **full endpoint matrix NOT PROVEN** |
| Admin vs super_admin | **Partial** | Patterns in admin routes — not exhaustively mapped |
| Webhook (WhatsApp) | Fail-closed w/o secret | `webhooks.py` |

---

## 14. Gap Map

| id | title | category | severity | file(s) | route(s) | roles | impact | fix |
|----|-------|----------|----------|---------|----------|-------|--------|-----|
| P1 | Default mock payments | ops | P0 | `src/config/settings.py`, `apps/web/app/(resident)/checkout/page.tsx` | `/api/v1/payments/*`, `/checkout` | residents | fake money | env + runbooks; **checkout success banner when no `client_secret`** (2026-03-18) |
| P2 | bit/PayBox stubs | payments | P0 (IL) | `src/services/payment.py` | — | residents | cannot pay IL | implement or hide |
| P3 | No contractor subscription webhooks | billing | P0 | `src/api/routes/payments.py` | Stripe webhook | contractors | no automated lifecycle | handle subscription events + sync DB |
| P4 | Notification UI not using REST | FE | P1 | `NotificationPanel.tsx`, `client.ts` | `/api/v1/notifications` | all | no server bell | wire or remove |
| P5 | OpenAPI codegen non-blocking | CI | P1 | `.github/workflows/ci.yml` | — | devs | type drift | make strict when ready |
| P6 | No PRD in repo | process | P2 | — | — | team | scope drift | add PRD |
| P7 | Migration history per env | ops | P1 | `alembic/` | — | ops | bad state | staging verify |

---

## 15. Duplication / Dead Code / Unwired Code

| path | category | explanation |
|------|----------|-------------|
| `apps/web/app/admin/*` vs `apps/admin` | DUPLICATED / ORPHANED_RISK | Two admin surfaces |
| `NotificationPanel` + `notificationStore` | UNWIRED vs API | REST client exists; panel does not call it |
| Mobile vs web | DUPLICATED | Overlapping flows — contract drift risk |

---

## 16. Priority Fix Plan

- **Internal pilot:** Document mock; verify Alembic on staging; decide notification UX (wire vs toast-only).
- **Limited real-user pilot:** Non-mock `PAYMENT_PROVIDER`; Stripe webhook secrets; live payment smoke; BM/resident join-code behavior documented.
- **Broader beta:** bit/PayBox or remove claims; contractor billing UI + subscription sync; observability.
- **Public launch:** Full RBAC matrix; perf baseline; legal/refund flows; support runbooks.

---

## 17. Final Release Verdict

| Stage | Verdict |
|-------|---------|
| Internal testing | **GO WITH CONDITIONS** |
| Friendly pilot | **GO WITH CONDITIONS** |
| Limited real-user pilot | **GO WITH CONDITIONS** (real provider + webhooks + ops) |
| Broader beta | **NO-GO** |
| Public launch | **NO-GO** |

---

## 18. Final Truth Table

**Fully implemented now (code-evidenced; runtime NOT proven unless stated)**  
FastAPI + broad routers; web/admin/mobile shells; signup role restriction; Stripe PaymentIntent provider + payment-intent webhook path; mock payment default; notifications REST + postgres wiring (routes); `ApiClient` notification HTTP methods; contractor membership **rules** + offer-create check; orchestration graph registration; CI pipeline; Alembic head `030` (CLI).

**Partially implemented now**  
Resident payments (env-dependent); contractor membership state in models/DB + enforcement without full billing automation; bit/PayBox classes; admin pages; agents wired but unproven in prod.

**Missing / not implemented**  
`PRD*.md`; contractor **recurring** billing automation (webhooks/handlers not found for subscriptions); dedicated contractor billing page; server-driven notification UI; full runtime/E2E proof this session; per-env migration audit.

---

## 19. Provenance Summary

| Level | What |
|-------|------|
| **Proven by code** | Files cited above (settings, payment.py, payments.py webhook map, user.py, auth.py, offers.py, contractor_membership.py, graph.py, middleware.ts, NotificationPanel.tsx, client.ts, ci.yml, glob page counts). |
| **Proven by tests** | **NOT** re-run full pytest this session; `ruff check` passed. |
| **Proven by runtime** | **NOT** — no full stack, browser, or live Stripe in this pass. |
| **Not proven** | End-user flows, email delivery, WhatsApp delivery, production DB state, admin/super_admin exhaustive matrix, a11y/i18n QA. |

---

## 20. Fixes applied (this audit pass)

| File | Change | Risk | Verified |
|------|--------|------|----------|
| `apps/web/app/(resident)/checkout/page.tsx` | When payment succeeds without `client_secret`, show **Hebrew + English** “test / simulated path” banner; track `simulatedPayment` state from initiate response; footer text no longer implies Stripe is always active | **Low** (copy + conditional UI only) | Manual code review; **NOT** browser/E2E this session |
| `docs/RELEASE_GATE_AUDIT.md` | Added §10 Notifications; renumbered §11–§19; §20 this table; P1 gap note updated | None | N/A |
