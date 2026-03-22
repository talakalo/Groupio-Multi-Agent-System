# Publish readiness audit (Groupio Multi-Agent System)

**PRD note:** No file matching `PRD*.md` was found. Product intent is inferred from code + repo docs (e.g. `docs/PILOT_READINESS_AUDIT.md`, `docs/CONTRACTOR_MEMBERSHIP_AUDIT.md`, `docs/PAYMENT_PROVIDER_ONBOARDING.md`). Those docs are not proof of implementation.

## Code-verified errata (as of 2026-03-18)

Reconcile this document with the repo before relying on older audit copies:

| Claim (older audit) | Current code evidence |
|---------------------|------------------------|
| **G1** Web `ApiClient` missing notification methods | **RESOLVED:** `apps/web/lib/api/client.ts` defines `getNotifications`, `getUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead` (aligned with `src/api/routes/notifications.py`). |
| `useNotifications.ts` / `useNotificationsApi` unwired | No `useNotificationsApi` / `lib/hooks/useNotifications.ts` under `apps/web` (grep). **In-app panel** uses Zustand `notificationStore` + `NotificationPanel.tsx` (toasts/client state), not the REST API — classify as **BACKEND_ONLY_NOT_CONNECTED** for server-fed bell until UI wires `ApiClient` notification methods. |
| `joinOffer` test vs client | Tests expect `POST` body `{ userId }` and response `{ success, participants }` — matches `ApiClient.joinOffer`. |
| 401 + refresh on login | **FIXED:** `ApiClient.request` skips token refresh on `/api/v1/auth/login`, `/api/v1/auth/signup`, `/api/v1/auth/refresh` so bad credentials do not invoke `setOn401Retry`. |

---

## 1. Executive Summary

- **Overall readiness:** Not publish-ready for a broad public launch. Conditionally acceptable for internal / small pilot if payments, migrations, and **server-backed** notification UX are explicitly scoped and environments are non-mock where money moves.
- **Release score:** **59/100** (prior 58; +1 for notification API client parity + auth 401 behavior; major blockers unchanged).
- **Strongest areas:** Monorepo structure; CI (Ruff, mypy, backend tests + Postgres/Redis, frontend lint/typecheck/build, security scans, Docker build); FastAPI surface and admin app; signup role restriction in backend models; payment provider abstraction + Stripe path when configured; orchestration graph with multiple agents; contractor membership persistence + backend enforcement (per `docs/CONTRACTOR_MEMBERSHIP_AUDIT.md` + `030` migration).
- **Weakest areas:** Default `PAYMENT_PROVIDER=mock`; Bit/PayBox stubs (`NotImplemented` in providers); no Stripe subscription / membership webhooks for contractors; **server notification list still not surfaced in web UI** (client methods exist; no integrated bell); UX route protection relies on cookies (documented as non-security); OpenAPI codegen in CI is `continue-on-error: true`; no single PRD to diff against — docs can drift.
- **Biggest blockers for real users:** Real money on mock if misconfigured; incomplete IL providers; contractor recurring billing incomplete; **notification bell stack still unwired at UI** despite API + client methods; migration history must be applied consistently (environments that ever applied duplicate `029` need ops verification — not proven here).
- **Publish recommendation:** **NO-GO** for public launch; **GO WITH CONDITIONS** for internal/friendly pilot only with written limitations and staging proof.

---

## 2. Environment and Runtime Findings

| Check | Result | Evidence level |
|-------|--------|----------------|
| Branch | `dev` | Git / user context |
| `alembic heads` | Single head `030` | Proven (CLI) — re-verify before release |
| `ruff check src/ tests/` | Pass (last run this session) | Proven (CLI) |
| Full pytest, `pnpm build`, Playwright, live Stripe/bit | Not run in this doc session | Not proven |
| `ApiClient` unit tests (`apiClient.test.ts`) | 19 passed | Proven (Vitest, 2026-03-18) |

**Commands:** `alembic heads`, `ruff check src/ tests/`, `pnpm exec vitest run __tests__/apiClient.test.ts`, glob/grep reads.

---

## 3. Repository Inventory

- **Apps:** `apps/web` (Next), `apps/admin` (Next), `apps/mobile` (Expo).
- **Backend:** `src/api` (routes, middleware), `src/services`, `src/databases`, `src/agents`, `src/orchestration`, `src/workers`.
- **DB:** Alembic under `alembic/versions/`.
- **External:** Postgres, Redis, Qdrant, Neo4j (per app lifecycle/docs), LLM APIs, Stripe, bit/PayBox (stubs), WhatsApp webhooks, FCM (auth token routes), email.

---

## 4. Full Route and Page Inventory

**Legend:** Nav / Reachable / Loading-error-empty / runtime: **NOT VERIFIED** without browser crawl. Backend = inferred primary API. **i18n:** `next-intl` present in web app.

### apps/web — `page.tsx` (35)

| Route | File | Role (intent) | Status | Issues |
|-------|------|---------------|--------|--------|
| `/` | `app/page.tsx` | guest | NOT VERIFIED | — |
| `/login` | `app/(auth)/login/page.tsx` | guest | NOT VERIFIED | — |
| `/signup` | `app/(auth)/signup/page.tsx` | guest | NOT VERIFIED | Role limited to resident/contractor in `ApiClient.signup` typing |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | guest | NOT VERIFIED | — |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | guest | NOT VERIFIED | — |
| `/verify-email` | `app/(auth)/verify-email/page.tsx` | guest | NOT VERIFIED | — |
| `/resend-verification` | `app/(auth)/resend-verification/page.tsx` | user | NOT VERIFIED | — |
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | user | NOT VERIFIED | — |
| `/dashboard` | `app/(resident)/dashboard/page.tsx` | resident (typical) | IMPLEMENTED_BUT_PARTIAL | — |
| `/offers` | `app/(resident)/offers/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/offers/[offerId]` | `app/(resident)/offers/[offerId]/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/building` | `app/(resident)/building/page.tsx` | resident | NOT VERIFIED | — |
| `/building/join` | `app/(resident)/building/join/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/checkout` | `app/(resident)/checkout/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | Depends on `PAYMENT_PROVIDER` |
| `/payments` | `app/(resident)/payments/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/orders` | `app/(resident)/orders/page.tsx` | resident | NOT VERIFIED | — |
| `/orders/[id]` | `app/(resident)/orders/[id]/page.tsx` | resident | NOT VERIFIED | — |
| `/contractors` | `app/(resident)/contractors/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/chat` | `app/(resident)/chat/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/architecture` | `app/(resident)/architecture/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/profile` | `app/(resident)/profile/page.tsx` | resident | IMPLEMENTED_BUT_PARTIAL | — |
| `/change-password` | `app/(resident)/change-password/page.tsx` | resident | NOT VERIFIED | — |
| `/contractor/dashboard` | `app/contractor/dashboard/page.tsx` | contractor | IMPLEMENTED_BUT_PARTIAL | — |
| `/contractor/offers/create` | `app/contractor/offers/create/page.tsx` | contractor | IMPLEMENTED_BUT_PARTIAL | Membership enforced server-side |
| `/contractor/offers/active` | `app/contractor/offers/active/page.tsx` | contractor | NOT VERIFIED | — |
| `/contractor/projects` | `app/contractor/projects/page.tsx` | contractor | NOT VERIFIED | — |
| `/contractor/projects/[id]` | `app/contractor/projects/[id]/page.tsx` | contractor | NOT VERIFIED | — |
| `/contractor/profile` | `app/contractor/profile/page.tsx` | contractor | NOT VERIFIED | No dedicated billing page in paths |
| `/buildings-manager/dashboard` | `app/buildings-manager/dashboard/page.tsx` | BM | NOT VERIFIED | — |
| `/buildings-manager/buildings` | `app/buildings-manager/buildings/page.tsx` | BM | NOT VERIFIED | — |
| `/buildings-manager/escalations` | `app/buildings-manager/escalations/page.tsx` | BM | NOT VERIFIED | — |
| `/admin/dashboard` | `app/admin/dashboard/page.tsx` | admin | ORPHANED_RISK | Admin UX often separate app URL |
| `/admin/buildings` | `app/admin/buildings/page.tsx` | admin | ORPHANED_RISK | — |
| `/terms` | `app/terms/page.tsx` | guest | NOT VERIFIED | — |
| `/privacy` | `app/privacy/page.tsx` | guest | NOT VERIFIED | — |

**Middleware:** `apps/web/middleware.ts` — protected prefixes; role hints from `groupio-auth` cookie (UX only); `refresh_token` for session presence.

### apps/admin — `page.tsx` (12)

| Route | File | Status |
|-------|------|--------|
| `/` | `app/page.tsx` | NOT VERIFIED |
| `/login` | `app/login/page.tsx` | NOT VERIFIED |
| `/dashboard` | `app/dashboard/page.tsx` | IMPLEMENTED_BUT_PARTIAL |
| `/users`, `/contractors`, `/offers`, `/payments`, `/escalations`, `/analytics`, `/agents`, `/settings`, `/settings/audit-logs` | respective `app/**/page.tsx` | NOT VERIFIED each |

### apps/mobile

~25 TSX files under `app/` and `components/` — flows exist; per-screen nav/states not verified in browser; see `docs/MOBILE_API_ALIGNMENT.md` (doc ≠ proof).

---

## 5. User Flow Matrix

| Role | Flow | Intended | Actual state | Blockers | Severity |
|------|------|----------|--------------|----------|----------|
| Guest | Landing, legal | View marketing + terms | NOT VERIFIED runtime | — | Low until proven |
| Guest | Signup | Create resident/contractor | Backend blocks privileged roles | — | Low |
| User | Login/logout | JWT + refresh | Code present | Cookie/role UX drift | Medium |
| User | Email verify / resend | API + pages | Code present | Email deliverability NOT proven | Medium |
| Resident | Join building | Join code / assignment | Partial | Building assignment complexity | High for pilot |
| Resident | Offers / join | Join offer | Backend uses `current_user.id` for join | Client may send `userId` in body — ignored for join DB op (OK) | Low |
| Resident | Checkout / pay | Real charge | MOCK_DEFAULT | `PAYMENT_PROVIDER` | Critical for paid pilot |
| Contractor | Create offer | Allowed with membership | Backend enforced | No recurring billing UI | High for monetization |
| BM | Buildings / codes | Scoped admin | Code + middleware UX | Backend enforcement must hold per route | Medium |
| Admin | Users/offers/payments | Full ops | Routes exist | Depends on env + provider | High |
| Agents | Routed automation | Graph | Wired in `graph.py` | LLM/DB failures = degraded | Medium |

---

## 6. Frontend Audit

- **Works (code):** `ApiClient` covers auth, offers, contractors, buildings, uploads, payments, reviews, participants, **and in-app notification REST** (`apps/web/lib/api/client.ts`).
- **Still unwired:** No production UI path found that calls the notification `ApiClient` methods; `NotificationPanel` / `ToastContainer` use **Zustand** `notificationStore` only → **BACKEND_ONLY_NOT_CONNECTED** for API-backed bell.
- **Duplication:** Web + admin + mobile overlapping flows — contract drift risk.
- **Stale state:** Middleware trusts client-writable cookie for role routing (UX only); manipulation causes UX confusion, not necessarily API privilege escalation if API enforces roles.
- **i18n / RTL:** `next-intl` + `messages/*` — string quality not audited here.
- **A11y:** Not proven (no automated a11y run cited).

---

## 7. Backend Audit

- **Works:** Large FastAPI surface; `src/api/routes/__init__.py` registers notifications router.
- **Notifications:** GET/POST under `src/api/routes/notifications.py` backed by postgres helpers — **IMPLEMENTED** (code).
- **Payments:** `src/services/payment.py` — Stripe when selected; mock default in `settings.PAYMENT_PROVIDER`.
- **Bit/PayBox:** Classes exist; `create_charge` / `refund` / `get_status` raise `NotImplemented` — **SPEC_ONLY** / **WIRED_BUT_NOT_REAL**.
- **Webhooks:** `webhooks.py` — WhatsApp + related; membership subscription webhook set not evidenced in same file (narrow pass).
- **Contractor membership:** Enforcement in offers + contractor routes — **IMPLEMENTED_BUT_PARTIAL** (no full recurring billing).
- **Resilience:** Partial retries (e.g. tenacity); not systematically proven.

---

## 8. Database Audit

- **Migration graph:** `030` single head — verify with `alembic heads` before each deploy.
- **Contractor membership:** `030_contractor_membership_columns.py` (after `029` payment columns).
- **Notifications:** `026_create_notifications_table.py`.
- **RLS / Supabase:** `028_*` migration — app vs PostgREST not re-verified here.
- **Risk:** DBs that applied an obsolete duplicate `029` need manual ops review.

---

## 9. Payments and Membership Capability Matrix

| Capability | Frontend | Backend | DB | Webhook | Tests | Status | Blockers |
|------------|----------|---------|-----|---------|-------|--------|----------|
| Resident card (Stripe) | Pages + client | Stripe when configured | payments/invoices migrations | Partially audited | CI partial | IMPLEMENTED_BUT_PARTIAL | Env, live verification |
| Contractor monthly membership | No dedicated billing UI | State + enforcement; no full subscription engine | `030` columns | Missing subscription events | Some | IMPLEMENTED_BUT_PARTIAL | Recurring product + webhooks |
| Invoices / history | `getMyInvoices` | payments routes | DB | — | Partial | IMPLEMENTED_BUT_PARTIAL | — |
| Refunds | Admin partial | Provider refund | — | — | Partial | IMPLEMENTED_BUT_PARTIAL | Provider-specific |
| Escrow / release | Not fully traced | Partial in payments/agents | — | — | NOT proven E2E | NOT PROVEN | Trace needed |
| bit | UI not proven | `NotImplemented` | N/A | N/A | N/A | SPEC_ONLY | Merchant API |
| PayBox | UI not proven | `NotImplemented` | N/A | N/A | N/A | SPEC_ONLY | Merchant + webhook |

---

## 10. Agents and Automation Audit

| Agent | Wired | Useful | Safety / audit | Notes |
|-------|-------|--------|----------------|-------|
| router, support, matching, pricing, vetting, outreach, analytics, architecture, influencer | Yes (graph) | Partial | Partial | Mostly IMPLEMENTED_BUT_PARTIAL |
| payment | Conditional | Partial | `PAYMENT_AGENT_MODE` | Gated modes |

---

## 11. Testing and CI/CD Audit

- **CI:** `.github/workflows/ci.yml` — Ruff, mypy, tests + coverage gate, integration tests, Trivy, Gitleaks, frontend lint + `pnpm typecheck`, turbo test/build, Docker.
- **False confidence:** OpenAPI → TS codegen `continue-on-error: true`.
- **Mock-heavy:** Many unit tests use mocks; integration ≠ production.
- **Gaps:** Live Stripe checkout E2E, contractor subscription lifecycle, multilingual E2E, notification **UI** E2E.

---

## 12. Security and Permission Audit

| Item | Verdict | Evidence |
|------|---------|----------|
| Privilege escalation via signup | Blocked | `SELF_REGISTERABLE_ROLES` + `UserCreate` validator |
| Next middleware as security | No — UX only | `middleware.ts` comments |
| Admin vs super_admin | Partially differentiated | `require_admin_only` vs broader admin patterns |
| buildings_manager | Middleware allows `/buildings-manager`; backend must repeat checks | Per-route matrix incomplete |
| Webhook auth | WhatsApp HMAC fail-closed when secret missing | Unit tests (prior context) |

**Verdict:** Strong signup control; full endpoint matrix still recommended before public launch.

---

## 13. Gap Map

| id | Title | Category | Severity | File(s) | Notes |
|----|-------|----------|----------|---------|-------|
| ~~G1~~ | ~~Web ApiClient missing notification methods~~ | FE/API | ~~P0~~ | `apps/web/lib/api/client.ts` | **RESOLVED** — methods implemented; see errata |
| G2 | Server notifications not integrated in web UI | FE | P1 | `NotificationPanel.tsx`, `notificationStore.ts` | Wire `ApiClient` notification methods or document toast-only |
| G3 | Default mock payments | Ops | P0 | `src/config/settings.py` | Env + runbooks |
| G4 | bit/PayBox not implemented | Payments | P0 (IL) | `src/services/payment.py` | Implement per onboarding doc |
| G5 | Contractor subscription incomplete | Billing | P0 | multiple | Stripe Billing + webhooks |
| G6 | CI OpenAPI step non-blocking | CI | P1 | `.github/workflows/ci.yml` | `continue-on-error` |
| G7 | No PRD in repo | Process | P2 | — | Add PRD or link |

---

## 14. Duplication / Dead Code / Unwired Code

- **API-backed notifications:** Client methods exist; **no** `useNotificationsApi` hook file; UI still Zustand-toast-centric — integrate or prune duplicate concepts.
- **Parallel admin:** `apps/web` `/admin/*` vs `apps/admin` — ORPHANED_RISK for web admin routes.
- **Mobile + web:** Overlapping offer/checkout — see `docs/MOBILE_API_ALIGNMENT.md`.

---

## 15. Priority Fix Plan

**Must fix before internal pilot**

- Confirm non-mock `PAYMENT_PROVIDER` when testing money; document mock in UI for internal-only.
- Decide: wire server notifications into UI **or** remove misleading “bell” affordances.
- Alembic upgrade path verified on staging DB (messy `029` history).

**Must fix before limited real-user pilot**

- Stripe (or chosen provider) live test + webhook secrets + reconciliation.
- Contractor membership policy documented (manual comp vs paid).
- Role + building scoping spot-check on critical admin/BM endpoints.

**Must fix before broader beta**

- bit/PayBox real implementation or remove UI claims.
- Contractor billing UI + subscription lifecycle.
- Observability per `docs/OPERATIONS.md`.

**Must fix before public launch**

- Full security matrix per API route; load/perf baseline; legal checkout + refunds; support runbooks.

---

## 16. Final Release Verdict

| Stage | Verdict |
|-------|---------|
| Internal testing | GO WITH CONDITIONS |
| Friendly pilot | GO WITH CONDITIONS |
| Limited real-user pilot | GO WITH CONDITIONS (real provider, webhooks, no mock) |
| Broader beta | NO-GO |
| Public launch | NO-GO |

---

## 17. Final Truth Table

**Fully implemented now (code-evidenced, not necessarily E2E-proven)**

- FastAPI structure + route modules (`src/api/routes/*`).
- Web/Admin/Mobile shells and many pages.
- Signup role restriction (`UserCreate`).
- Payment abstraction + mock default + Stripe path (`payment.py`, settings).
- Notifications REST API (`notifications.py`) + Postgres methods + **web `ApiClient` notification methods**.
- Orchestration graph (`graph.py`).
- CI pipeline (`ci.yml`).
- Alembic single head `030` (verify per environment).
- `ApiClient` skips 401 refresh on auth credential paths.

**Partially implemented now**

- Resident payments (env-dependent; default mock).
- Contractor membership (DB + rules; no full recurring billing/webhooks).
- bit / PayBox (stubs).
- **Web notification UX** (API + client ready; UI still toast/local).
- Admin/agents (pages exist; full matrix unproven).

**Missing / not proven**

- PRD artifact in repo (`PRD*.md`).
- Full public-launch proof: staging runtime, E2E on real payments, subscription webhooks, IL provider flows.
- Per-page nav, a11y, i18n quality, loading/error states (browser audit).

---

## Appendix — Files referenced in this audit

`apps/web/lib/api/client.ts`, `apps/web/middleware.ts`, `apps/web/components/shared/NotificationPanel.tsx`, `apps/web/lib/stores/notificationStore.ts`, `src/api/routes/notifications.py`, `src/services/payment.py`, `src/config/settings.py`, `.github/workflows/ci.yml`, `alembic/versions/*`, `docs/CONTRACTOR_MEMBERSHIP_AUDIT.md`, `apps/web/__tests__/apiClient.test.ts`.

**Provenance:** Proven by code/grep/read; full-stack runtime and production DB history **not** proven in this document session.
