# Groupio Comprehensive End-to-End Audit

**Date:** March 12, 2026
**Auditor:** Principal Full-Stack Engineer / Staff Software Architect / Security Auditor
**Branch:** `xeo` worktree (detached HEAD)
**Repo:** `talakalo/Groupio-Multi-Agent-System`

---

## 1. Executive Summary

### Overall Assessment

Groupio is a well-structured monorepo (Turborepo) with a Python FastAPI backend, Next.js web + admin frontends, and an Expo React Native mobile app. The agent/orchestration layer (LangGraph + 11 agents) is a differentiating strength. However, there are **significant gaps between what exists and what is production-ready**.

### What Is Strongest

- **Backend route coverage** — 100+ endpoints across auth, offers, buildings, contractors, payments, admin, agents, escalations, uploads, webhooks, graph features
- **Agent orchestration** — Router, Matching, Pricing, Vetting, Support, Outreach, Analytics, Architecture, Influencer, Payment agents with LangGraph graph, safety modes (recommend/gated/auto), pending-decision workflow
- **Auth model** — JWT + HTTP-only cookie refresh, rate limiting on auth endpoints, admin role verification, production secret validation
- **Test volume** — ~600+ backend unit tests, ~114 frontend component tests, 11 E2E spec files
- **Database migration discipline** — 21 Alembic migrations with proper FK indexes, triggers, RLS, roles

### What Is Weakest

- **Zero real-backend tests** — Every test (unit, integration, E2E) uses mocks. No test verifies actual DB writes, Redis operations, or Stripe behavior
- **Schema drift** — `payment_splits`, `invoices`, `payments` columns in code don't match migration schema
- **Missing backend endpoints** — Frontend calls 5+ endpoints that don't exist (`/buildings/join`, `/payments/approve-work`, `/payments/invoices/my`, `/payments/methods`, `/buildings/search`)
- **Resilience gaps** — Redis down = auth endpoints crash. Qdrant/Neo4j down = uncaught 500s
- **Mobile not shippable** — Missing assets, logout bug, navigation bugs
- **No audit logging from agents** — `_persist_audit()` is defined but never called

### Biggest Risks

1. **Payment double-submit** — No idempotency key; concurrent `POST /payments/initiate` creates duplicate Stripe PaymentIntents
2. **Concurrent offer join race condition** — No unique constraint on `(user_id, offer_id)` in DB
3. **Schema drift** — Code INSERTs columns that may not exist in the actual schema (`invoice_id` vs `payment_id` in `payment_splits`)
4. **WebSocket admin endpoint has no auth** — Anyone can connect to `/ws/admin`
5. **Redis unavailability crashes auth** — No degradation path; auth endpoints 500 when Redis is down

### Current True Release-Readiness Level

| Level | Verdict |
|-------|---------|
| Internal testing only | **YES** — with caveats (schema drift must be fixed first) |
| Limited pilot | **CONDITIONAL** — requires fixing schema drift, missing endpoints, payment idempotency |
| Broader beta | **NO** — resilience, real-backend testing, and agent audit logging required |
| Public launch | **NO** — payment safety, mobile, accessibility, load testing, 2FA all missing |

---

## 2. Repository and Runtime Findings

### Repo Structure

```
/
├── apps/
│   ├── web/           # Next.js 15 resident/contractor/buildings-manager frontend
│   ├── admin/         # Next.js 15 admin dashboard
│   └── mobile/        # Expo React Native mobile app
├── packages/
│   ├── types/         # Shared TypeScript types
│   ├── api-client/    # Shared API client
│   └── utils/         # Shared utilities
├── src/               # Python FastAPI backend
│   ├── api/           # Routes, middleware
│   ├── agents/        # 11 AI agents
│   ├── orchestration/ # LangGraph orchestrator
│   ├── databases/     # Postgres, Redis, Vector (Qdrant), Graph (Neo4j)
│   ├── services/      # Payment, Email, Storage, Enrichment, Push, WhatsApp
│   ├── config/        # Settings, prompts
│   ├── models/        # Pydantic DTOs
│   └── workers/       # Scheduler, agent worker, offer lifecycle
├── alembic/           # Database migrations (21 files)
├── tests/             # Backend tests (unit + integration)
├── docker/            # Docker Compose + env files
├── .github/workflows/ # CI, Deploy, Backup
└── turbo.json         # Turborepo config
```

### Apps/Services Found

| App/Service | Technology | Port | Status |
|-------------|-----------|------|--------|
| Web frontend | Next.js 15.5.12 | 3000 | Functional |
| Admin frontend | Next.js 15.5.12 | 3001 | Functional |
| Mobile app | Expo SDK 51 / RN 0.74.5 | — | Partial (missing assets) |
| Backend API | FastAPI + Uvicorn | 8000 | Functional |
| PostgreSQL | 16 (Docker) | 5432 | Required |
| Redis | 7-alpine (Docker) | 6379 | Required |
| Neo4j | 5 (Docker) | 7474/7687 | Optional (degrades gracefully at startup) |
| Qdrant | Latest (Docker) | 6333/6334 | Optional (degrades gracefully at startup) |

### What Ran / Did Not Run

- Backend API: starts, connects to Postgres and Redis
- Web frontend: starts, renders pages, API calls work when backend is up
- Admin frontend: starts
- Mobile: `tsc --noEmit` passes, tests pass; native build not attempted
- Vector DB collections: "Could not verify" warning at startup (non-blocking)

### Important Inconsistencies Between Docs and Code

1. **`orders` table** referenced in `get_user_orders()` — no migration creates it; returns `[]` on asyncpg
2. **`support_tickets` table** referenced in `create_support_ticket()` — no migration creates it; Supabase-only
3. **`contractor_documents` table** referenced in `get_contractor_documents()` — no migration creates it; Supabase-only
4. **Join-offer body mismatch** — Frontend sends `{ userId }`, backend expects `{ unit_count, invite_token }`

---

## 3. UI / UX Audit

### Navigation Quality

- **Resident sidebar:** 8 links — Dashboard, Offers, Contractors, Architecture, Building, Profile, Payments, Chat. All functional.
- **Contractor sidebar:** 5 links — Dashboard, Active Offers, Create Offer, Projects, Profile. All functional.
- **Buildings manager sidebar:** 3 links — Dashboard, Buildings, Escalations. All functional.
- **Admin sidebar:** 8 links — Dashboard, Agents, Escalations, Contractors, Analytics, Users, Offers, Settings. All functional.

### Key UX Issues

| Issue | Severity | Evidence |
|-------|----------|----------|
| `/change-password` page exists but is not linked from any navigation or profile page | Medium | `apps/web/app/(resident)/change-password/page.tsx` — only reachable by direct URL |
| `/settings/audit-logs` admin page exists but not in admin nav | Medium | `apps/admin/app/settings/audit-logs/page.tsx` — orphaned |
| No loading.tsx for auth pages, most resident pages, all buildings-manager pages | Medium | Only contractor sub-routes have loading.tsx |
| No error.tsx for contractor sub-routes, buildings-manager pages | Medium | Only root, resident, and a few sub-routes have error boundaries |
| Google Fonts blocked by CSP | Low | CSP `style-src 'self' 'unsafe-inline'` blocks external font loading |
| `posthog-js` module not found warning | Low | `app/providers.tsx` imports posthog-js but it's not installed |
| Landing page stats are hardcoded mock data | Low | `app/page.tsx` uses static `STATS` array |

### Forms and CTAs

- Login, signup, forgot-password, reset-password, verify-email, resend-verification forms are well-implemented with validation
- Contractor create-offer form is functional
- Resident checkout flow exists but depends on backend payment initiation
- Building join page exists but calls missing backend endpoint (`/buildings/join`)

### Loading / Error / Empty States

| Route Group | Loading States | Error Boundaries | Empty States |
|-------------|---------------|------------------|--------------|
| Auth | Form-level only | Root error.tsx | N/A |
| Resident | Form/query level | Yes (dashboard, offers, payments) | Yes (dashboard, offers) |
| Contractor | Yes (loading.tsx files) | Section-level only | Partial |
| Buildings Manager | No | No | Unknown |
| Admin | No | Root only | Partial |

### Accessibility / RTL / i18n

- RTL support implemented for Hebrew
- Language toggle exists (he/en)
- No systematic accessibility audit found (no axe/lighthouse reports)
- Forms generally have labels but `aria-invalid`/`aria-describedby` not verified across all forms
- Focus management not audited

---

## 4. Page and Route Inventory

### Web App Routes

| Route | File Path | Role | Backend Connected | Nav Linked | Has Loading/Error | Status | Tests |
|-------|-----------|------|-------------------|------------|-------------------|--------|-------|
| `/` | `app/page.tsx` | public | No (static) | Yes | No/Yes | Implemented | E2E |
| `/terms` | `app/terms/page.tsx` | public | No | Yes | No/No | Implemented | — |
| `/privacy` | `app/privacy/page.tsx` | public | No | Yes | No/No | Implemented | — |
| `/login` | `app/(auth)/login/page.tsx` | auth | Yes | Yes | No/No | Implemented | Unit + E2E |
| `/signup` | `app/(auth)/signup/page.tsx` | auth | Yes | Yes | No/No | Implemented | Unit + E2E |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | auth | Yes | Yes | No/No | Implemented | E2E |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | auth | Yes | Yes | No/No | Implemented | E2E |
| `/verify-email` | `app/(auth)/verify-email/page.tsx` | auth | Yes | Yes | No/No | Implemented | E2E |
| `/resend-verification` | `app/(auth)/resend-verification/page.tsx` | auth | Yes | Yes | No/No | Implemented | E2E |
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | auth | Yes | Yes | No/No | Implemented | — |
| `/dashboard` | `app/(resident)/dashboard/page.tsx` | resident | Yes | Yes | No/Yes | Implemented | E2E |
| `/offers` | `app/(resident)/offers/page.tsx` | resident | Yes | Yes | No/Yes | Implemented | E2E |
| `/offers/[offerId]` | `app/(resident)/offers/[offerId]/page.tsx` | resident | Yes | Yes | No/Yes | Implemented | E2E |
| `/contractors` | `app/(resident)/contractors/page.tsx` | resident | Yes | Yes | No/No | Implemented | — |
| `/architecture` | `app/(resident)/architecture/page.tsx` | resident | Yes | Yes | No/No | Implemented | E2E |
| `/building` | `app/(resident)/building/page.tsx` | resident | Yes | Yes | No/No | Implemented | E2E |
| `/building/join` | `app/(resident)/building/join/page.tsx` | resident | **Missing endpoint** | Yes | No/No | **BROKEN** | — |
| `/profile` | `app/(resident)/profile/page.tsx` | resident | Yes | Yes | No/No | Implemented | — |
| `/payments` | `app/(resident)/payments/page.tsx` | resident | Yes | Yes | No/Yes | Implemented | E2E |
| `/chat` | `app/(resident)/chat/page.tsx` | resident | Yes | Yes | No/No | Implemented | E2E |
| `/checkout` | `app/(resident)/checkout/page.tsx` | resident | Yes | Yes | No/No | Implemented | E2E (partial) |
| `/orders` | `app/(resident)/orders/page.tsx` | resident | **Missing table** | Yes | No/No | **PARTIAL** | — |
| `/orders/[id]` | `app/(resident)/orders/[id]/page.tsx` | resident | **Missing table** | Yes | No/No | **PARTIAL** | — |
| `/change-password` | `app/(resident)/change-password/page.tsx` | resident | Yes | **No** | No/No | Orphaned | E2E |
| `/contractor/dashboard` | `app/contractor/dashboard/page.tsx` | contractor | Yes | Yes | No/No | Implemented | E2E |
| `/contractor/offers/active` | `app/contractor/offers/active/page.tsx` | contractor | Yes | Yes | Yes/No | Implemented | E2E |
| `/contractor/offers/create` | `app/contractor/offers/create/page.tsx` | contractor | Yes | Yes | Yes/No | Implemented | E2E |
| `/contractor/projects` | `app/contractor/projects/page.tsx` | contractor | Yes | Yes | Yes/No | Implemented | E2E |
| `/contractor/projects/[id]` | `app/contractor/projects/[id]/page.tsx` | contractor | Yes | Yes | Yes/No | Implemented | Unit |
| `/contractor/profile` | `app/contractor/profile/page.tsx` | contractor | Yes | Yes | No/No | Implemented | — |
| `/buildings-manager/dashboard` | `app/buildings-manager/dashboard/page.tsx` | buildings_manager | Yes | Yes | No/No | Implemented | — |
| `/buildings-manager/buildings` | `app/buildings-manager/buildings/page.tsx` | buildings_manager | Yes | Yes | No/No | Implemented | — |
| `/buildings-manager/escalations` | `app/buildings-manager/escalations/page.tsx` | buildings_manager | Yes | Yes | No/No | Implemented | — |

### Admin App Routes

| Route | File Path | Role | Backend Connected | Nav Linked | Status | Tests |
|-------|-----------|------|-------------------|------------|--------|-------|
| `/login` | `app/login/page.tsx` | public | Yes | N/A | Implemented | Unit + E2E |
| `/dashboard` | `app/dashboard/page.tsx` | admin | Yes | Yes | Implemented | Unit + E2E |
| `/agents` | `app/agents/page.tsx` | admin | Yes | Yes | Implemented | E2E |
| `/escalations` | `app/escalations/page.tsx` | admin | Yes | Yes | Implemented | E2E |
| `/contractors` | `app/contractors/page.tsx` | admin | Yes | Yes | Implemented | E2E |
| `/analytics` | `app/analytics/page.tsx` | admin | Yes | Yes | Implemented | E2E |
| `/users` | `app/users/page.tsx` | admin | Yes | Yes | Implemented | Unit + E2E |
| `/offers` | `app/offers/page.tsx` | admin | Yes | Yes | Implemented | Unit + E2E |
| `/payments` | `app/payments/page.tsx` | admin | Yes | Yes | Implemented | Unit + E2E |
| `/settings` | `app/settings/page.tsx` | admin | Yes | Yes | Implemented | Unit + E2E |
| `/settings/audit-logs` | `app/settings/audit-logs/page.tsx` | admin | Yes | **No** | Orphaned | Unit |

---

## 5. Frontend Audit

### Architecture

- **Framework:** Next.js 15 with App Router
- **State:** Zustand (auth store, offer store)
- **Data fetching:** React Query (TanStack Query)
- **Forms:** react-hook-form + Zod validation
- **API client:** Custom `apiClient` with automatic 401 refresh
- **i18n:** Custom locale system (Hebrew/English)
- **Styling:** Tailwind CSS

### API Wiring Issues

| Frontend Call | Backend Status | Impact |
|---------------|---------------|--------|
| `POST /api/v1/buildings/join` (invite code) | **Not implemented** | Building join page is broken |
| `GET /api/v1/payments/invoices/my` | **Not implemented** | Invoice listing unavailable |
| `POST /api/v1/payments/{id}/approve-work` | **Not implemented** | Work approval flow broken |
| `GET /api/v1/payments/methods` | **Not implemented** | Payment methods listing unavailable |
| `GET /api/v1/buildings/search` | **Not implemented** | Building search unavailable |
| `joinOffer` sends `{ userId }` | Expects `{ unit_count, invite_token }` | Join-offer flow likely fails |
| `get_user_orders` | Returns `[]` (no `orders` table) | Orders pages show empty |

### Dead Code / Legacy Components

- `posthog-js` imported in `providers.tsx` but not installed
- `orders` pages reference non-existent backend table
- Landing page stats are hardcoded (not dynamic)

### Security Concerns

- CSP allows `unsafe-eval` and `unsafe-inline` (needed for Next.js dev but should be tightened for production)
- `admin_role_verified` cookie is set client-side after `/me` check — backend is source of truth but defense-in-depth could use a signed cookie

---

## 6. Backend Audit

### Route/Service Quality

- **100+ endpoints** across 16 router modules
- Strong Pydantic validation on most routes
- Rate limiting on auth (20/min) and message (60/min)
- Security headers middleware (HSTS, CSP, X-Frame-Options)
- PII-aware request logging

### Critical Backend Issues

| Issue | Severity | Evidence |
|-------|----------|----------|
| **WebSocket `/ws/admin` has no auth** | Critical | Anyone can connect; no JWT or API key check |
| **`POST /escalations/` is unauthenticated** | High | Agents call it but no auth/API-key verification |
| **`POST /enrichment/normalize-address` is unauthenticated** | Medium | Could be abused for data scraping |
| **Missing 5 endpoints** called by frontend | High | `/buildings/join`, `/payments/approve-work`, `/payments/invoices/my`, `/payments/methods`, `/buildings/search` |
| **Join-offer body mismatch** | High | Frontend sends `userId`, backend expects `unit_count`/`invite_token` |
| **No idempotency on payment initiation** | Critical | Double-click creates duplicate Stripe PaymentIntents |
| **`/auth/register` duplicate of `/auth/signup`** | Low | Same logic, no rate limit on `/register` |

### Auth/RBAC Enforcement

- Per-route auth via `get_current_user` and `get_admin_user` dependencies
- Admin routes require `admin`, `super_admin`, or `buildings_manager` role
- Service-to-service uses `X-API-Key` verification
- Webhook endpoints use HMAC signature validation

### Missing Business Logic

- **Work approval endpoint** — Frontend has `approveWork()` but no backend endpoint
- **Building join-by-code** — Frontend has join page but no backend endpoint
- **Orders table** — Referenced in code but no migration; `get_user_orders` returns empty
- **Contractor documents table** — Referenced but no migration; Supabase-only

---

## 7. Database Audit

### DB Inventory

| Database | Engine | Tables | Migrations | Status |
|----------|--------|--------|------------|--------|
| PostgreSQL | 16+ | 24 tables | 21 Alembic | Primary, functional |
| Redis | 7 | Key-value | N/A | Cache/session/rate-limit |
| Qdrant | Latest | Collections | N/A | Vector search, optional |
| Neo4j | 5 | Graph | N/A | Social graph, optional |

### Schema/Migration Health

**21 migrations total** covering users, buildings, building_residents, contractors, offers, offer_participants, contractor_reviews, escalations, escalation_messages, chat_messages, agent_metrics, invitations, conversation_logs, file_uploads, audit_logs, system_settings, payment_methods, invoices, payments, payment_splits, outreach_queue, chat_messages_archive, agent_audit_log, contractor_verification_metadata, credit_awards, pending_agent_decisions.

### Critical Schema Drift

| Table | Migration Column | Code Column | Impact |
|-------|-----------------|-------------|--------|
| `payment_splits` | `payment_id` | `invoice_id` | INSERT/SELECT may fail |
| `payment_splits` | `participant_user_id` | `user_id` | INSERT/SELECT may fail |
| `invoices` | `tax_amount` | `tax` | INSERT may fail |
| `invoices` | `currency`, `due_date`, `pdf_path` | `tax_rate`, `platform_fee_rate`, `transaction_id`, `payment_method` | Column mismatch |
| `payments` | `provider`, `provider_transaction_id`, `metadata` | `transaction_id`, `payment_method`, `provider_data` | Column mismatch |

**These schema drifts are a critical blocker** — payment-related INSERT/SELECT operations may silently fail or use wrong column names.

### Tables Referenced But Not in Migrations

| Table | Referenced By | Impact |
|-------|--------------|--------|
| `orders` | `get_user_orders()` | Returns `[]`; orders pages always empty |
| `support_tickets` | `create_support_ticket()` | Supabase-only; fails on asyncpg |
| `contractor_documents` | `get_contractor_documents()` | Supabase-only; fails on asyncpg |

### Trigger Inventory

| Trigger | Table(s) | Timing | Purpose | Migration |
|---------|----------|--------|---------|-----------|
| `trg_{table}_updated_at` | 9 tables | BEFORE UPDATE | Auto-update `updated_at` | 020 |
| `trg_sync_resident_count` | building_residents | AFTER INSERT/UPDATE/DELETE | Sync `buildings.resident_count` | 020 |
| `trg_sync_active_offers` | offers | AFTER INSERT/UPDATE/DELETE | Sync `buildings.active_offers` | 020 |
| `archive_old_chat_messages()` | — | Function only (no trigger/cron) | Archive old chats | 006 |
| `join_offer_atomic()` | — | Supabase RPC only | Atomic offer join | 008 |

### RLS Policies

| Table | Migration | Policies |
|-------|-----------|----------|
| users | 009, 021 | Supabase auth + groupio_app + groupio_readonly |
| offer_participants | 009, 021 | Same |
| payments | 009, 021 | Same |
| chat_messages | 021 | owner_bypass + app_role + readonly |
| audit_logs | 021 | owner_bypass + app_role (append-only) + readonly |
| escalations | 021 | owner_bypass + app_role + readonly |
| escalation_messages | 021 | owner_bypass + app_role + readonly |

### FK Index Coverage

Migrations 005 and 020 added FK indexes for all major foreign key columns. **Coverage is comprehensive.**

### Data Flow: Key Entity CRUD

| Entity | Create | Read | Update | Delete | Notes |
|--------|--------|------|--------|--------|-------|
| Users | `create_user` | `get_user*`, `get_admin_users` | `update_user`, `update_user_password` | None (GDPR: `DELETE /auth/me` clears fields) | No hard delete |
| Buildings | `create_building` | `get_building`, `list_buildings` | `update_building` | `delete_building` (cascade residents) | |
| Offers | `create_offer` | `get_offer`, `list_offers` | `update_offer` | None (status-based) | |
| Payments | `create_payment` | `get_payment`, `list_payments_for_user` | `update_payment` | None | Schema drift risk |
| Invoices | `create_invoice` | `get_invoice`, `list_invoices_for_user` | `update_invoice` | None | Schema drift risk |
| Contractors | `create_contractor` | `get_contractor`, `list_contractors` | `update_contractor` | None | |

---

## 8. Auth / Roles / Permissions Audit

### Role Model

| Role | Frontend Access | Backend Enforcement | DB Access |
|------|----------------|--------------------| ----------|
| `resident` | Resident pages | `get_current_user` | Via application role |
| `contractor` | Contractor pages | `get_current_user` + role check | Via application role |
| `buildings_manager` | Buildings manager pages | `get_admin_user` | Via application role |
| `admin` | Admin pages | `get_admin_user` | Via application role |
| `super_admin` | Admin pages | `get_admin_user` | Via postgres superuser |

### Auth Flow

| Step | Implementation | Status |
|------|---------------|--------|
| Signup | `POST /auth/signup` → create user + send verification email | Implemented |
| Login | `POST /auth/login/json` → JWT access + refresh tokens | Implemented |
| Token refresh | `POST /auth/refresh` → new access token from refresh token | Implemented |
| Logout | `POST /auth/logout` → revoke refresh token | Implemented |
| Verify email | `POST /auth/verify-email/{token}` → mark user verified | Implemented |
| Resend verification | `POST /auth/resend-verification-by-email` | Implemented |
| Forgot password | `POST /auth/password/reset` → send reset email | Implemented |
| Reset password | `POST /auth/password/reset/confirm` → update password | Implemented |
| Change password | `POST /auth/password/change` → verify old, set new | Implemented |
| Account deletion | `DELETE /auth/me` → GDPR erasure | Implemented |

### Permission Gaps

| Gap | Severity | Evidence |
|-----|----------|----------|
| **WebSocket `/ws/admin` has no auth check** | Critical | `src/api/routes/websocket.py` — no JWT/API key verification |
| **`POST /escalations/` unauthenticated** | High | Intended for agents but no verification of caller identity |
| **`/auth/register` lacks rate limiting** | Medium | Duplicate of `/auth/signup` but without `check_auth_rate_limit` |
| **`admin_role_verified` cookie set client-side** | Medium | Backend is source of truth but cookie could be spoofed for frontend routing |
| **No unique constraint on `(user_id, offer_id)`** in offer_participants | High | Concurrent joins could create duplicate rows |

---

## 9. Agents / Handovers Audit

### Agent Inventory

| Agent | Purpose | DB Writes | Audit Logged | Safety Mode | Tested | Status |
|-------|---------|-----------|-------------|-------------|--------|--------|
| **Router** | Intent classification | None | **No** | Confidence threshold (0.7) | Yes | Active |
| **Matching** | Contractor matching | None | **No** | recommend/gated → pending | Yes | Active |
| **Pricing** | Tiered pricing | offers (pricing_rationale) | **No** | recommend/gated → pending | Yes | Active |
| **Vetting** | Contractor verification | None | **No** | recommend/gated + admin email | Yes | Active |
| **Support** | Customer support | Redis (conversation) | **No** | Escalation triggers | Yes | Active |
| **Outreach** | Campaigns | outreach_queue | **No** | Always gated | Yes | Active |
| **Analytics** | NL-to-SQL | None | **No** | SQL validation (SELECT only) | Partial | Active |
| **Architecture** | Floor plan analysis | file_uploads | **No** | Error handling | No | Active |
| **Influencer** | Credit awards | credit_awards | **No** | **No pending-decision wiring** | Yes | **Partial** |
| **Payment** | Payment/invoice/refund | payments, invoices | **No** | Refund escalation | Yes | Active |
| **Notification** | Multi-channel dispatch | None | **No** | None | Yes | **Orphaned** |

### Critical Agent Issues

| Issue | Severity | Evidence |
|-------|----------|----------|
| **`_persist_audit()` never called** | Critical | `src/agents/base.py` defines it but no agent invokes it; `agent_audit_log` table exists but is empty |
| **Notification agent not in orchestration graph** | High | `src/orchestration/graph.py` does not add it as a node |
| **Agent worker interface mismatch** | High | `agent_worker.py` calls `router_agent.run(message=..., user_id=...)` but `RouterAgent.run()` expects `AgentState` dict — will raise `TypeError` at runtime |
| **Influencer agent bypasses gated mode** | Medium | `_REVIEW_AGENTS` includes it but no `_enqueue_pending_decision()` call |
| **No human-in-the-loop for Payment agent refunds** | Medium | Refund failures escalate but successful refunds execute without approval |

### Orchestration Quality

- LangGraph `StateGraph` with proper routing
- Handovers via `last_agent_handoff` (summary + suggested_next_intent)
- `_run_agent_safe()` catches exceptions with transient vs permanent classification
- Human handoff creates support tickets
- Agent modes configurable via settings

---

## 10. Tests and Coverage Audit

### Test Inventory

| Category | Files | Test Count | All Mocked? |
|----------|-------|------------|-------------|
| Backend unit | 65 | ~500+ | Yes |
| Backend integration | 16 | ~100+ | Yes (mock DB, Redis, orchestrator) |
| Frontend component (web) | 13 | ~114 | Yes |
| Frontend component (admin) | 8 | ~65 | Yes |
| Frontend E2E (web) | 9 | ~50+ | Yes (page.route() mocks) |
| Frontend E2E (admin) | 2 | ~20+ | Yes (page.route() mocks) |
| Mobile | 3 | 31 | Yes |

### Coverage Gap Matrix

| Critical Flow | Unit Test | E2E Test | Real Backend | Verdict |
|---------------|-----------|----------|-------------|---------|
| Login | Yes | Yes | **No** | Mock-only confidence |
| Signup | Yes | Yes | **No** | Mock-only confidence |
| Verify email | Yes | Yes | **No** | Mock-only confidence |
| Forgot/reset password | Yes | Yes | **No** | Mock-only confidence |
| Payment initiation | Yes | Partial | **No** | **Weak** |
| Checkout flow | Yes | Partial | **No** | **Weak** |
| Offer join | Yes | Yes | **No** | Mock-only (body mismatch not caught) |
| Building join | No | No | **No** | **Not tested** (endpoint missing) |
| Work approval | No | No | **No** | **Not tested** (endpoint missing) |
| Account deletion | Yes | No | **No** | Partial |
| Agent workflows | Yes | Partial (chat) | **No** | Mock-only |
| Rate limiting | Yes | No | **No** | Partial |
| DB triggers | No | No | **No** | **Not tested** |
| Admin auth | Yes | Yes | **No** | Mock-only |

### Test Quality Issues

1. **`test_coverage_boost.py` and `test_coverage_boost2.py`** — Import-only tests that inflate coverage numbers without testing behavior
2. **All E2E tests mock backend** — Zero tests verify actual API contracts or DB writes
3. **Join-offer body mismatch undetected** — Frontend sends wrong payload but mocked E2E doesn't catch it
4. **Schema drift undetected** — Tests mock DB so column mismatches aren't caught

---

## 11. Error Handling and Resilience Audit

### Service Failure Impact

| Service Down | Impact | Degradation | Severity |
|-------------|--------|-------------|----------|
| **Redis** | Auth endpoints crash (rate limit + session); message endpoint crashes | **No degradation** — hard failure | Critical |
| **Qdrant** | Offer creation, contractor search fail | Startup warns; runtime uncaught | High |
| **Neo4j** | Graph features, matching fail | Startup warns; runtime uncaught | High |
| **Email** | Verification, password reset silent-fail | User created but no email sent | Medium |
| **Stripe** | Payment initiation fails | Error returned to user | Medium |

### Edge Case Handling

| Edge Case | Handling | Severity |
|-----------|---------|----------|
| **Payment double-submit** | No idempotency key; duplicate charges possible | Critical |
| **Concurrent offer join** | No unique constraint; race condition possible | High |
| **Expired verification token** | 400 with clear message + resend link | Good |
| **Token reuse** | Redis delete after use; second call fails | Good |
| **File upload → DB failure** | Orphan file in storage | Medium |
| **429 rate limit** | Only handled on 3 pages (change-password, forgot/reset-password) | Medium |
| **Invalid JWT** | 401 → automatic refresh via API client | Good |

---

## 12. Gap Map

### Critical Gaps

| # | Title | Category | Severity | Evidence | Impact | Blocks |
|---|-------|----------|----------|----------|--------|--------|
| 1 | **Payment schema drift** | DATABASE GAP | Critical | `payment_splits.payment_id` vs code `invoice_id`; `invoices` columns mismatch | Payment INSERT/SELECT may fail at runtime | Limited pilot |
| 2 | **Payment double-submit** | BACKEND GAP | Critical | No idempotency key on `POST /payments/initiate` | Duplicate Stripe charges possible | Limited pilot |
| 3 | **WebSocket admin no auth** | SECURITY GAP | Critical | `/ws/admin` has no JWT/API-key check | Anyone can monitor admin WebSocket | Limited pilot |
| 4 | **Agent audit logging never fires** | AGENT GAP | Critical | `_persist_audit()` defined but never called | Agent actions completely unauditable | Broader beta |
| 5 | **Redis down crashes auth** | BACKEND GAP | Critical | No try/except around Redis calls in auth rate limiting | Auth endpoints return 500 | Broader beta |

### High Gaps

| # | Title | Category | Severity | Evidence | Impact | Blocks |
|---|-------|----------|----------|----------|--------|--------|
| 6 | **5 missing backend endpoints** | BACKEND GAP | High | `/buildings/join`, `/payments/approve-work`, `/payments/invoices/my`, `/payments/methods`, `/buildings/search` | Frontend pages broken or empty | Limited pilot |
| 7 | **Join-offer body mismatch** | MIXED GAP | High | FE sends `{ userId }`, BE expects `{ unit_count, invite_token }` | Offer join fails at runtime | Limited pilot |
| 8 | **Concurrent offer join race** | DATABASE GAP | High | No unique constraint on `(user_id, offer_id)` | Duplicate participation records | Limited pilot |
| 9 | **Agent worker TypeError** | AGENT GAP | High | `router_agent.run()` called with wrong signature | Background agent processing crashes | Broader beta |
| 10 | **3 tables referenced but missing** | DATABASE GAP | High | `orders`, `support_tickets`, `contractor_documents` — no migrations | Code paths fail on asyncpg | Limited pilot |
| 11 | **Zero real-backend tests** | TEST GAP | High | All 800+ tests use mocks | Schema drift, body mismatches, permission issues undetected | Broader beta |
| 12 | **Unauthenticated `/escalations/` POST** | SECURITY GAP | High | No auth or API-key check | Anyone can create escalations | Broader beta |
| 13 | **Notification agent orphaned** | AGENT GAP | High | Not in orchestration graph; never invoked by orchestrator | Push/email/WhatsApp notifications from agents don't fire | Broader beta |

### Medium Gaps

| # | Title | Category | Severity | Evidence | Impact | Blocks |
|---|-------|----------|----------|----------|--------|--------|
| 14 | `/change-password` orphaned from navigation | UX GAP | Medium | Not linked from profile or sidebar | Users can't discover feature | — |
| 15 | Admin audit-logs page orphaned | UX GAP | Medium | Not in admin nav sidebar | Admins can't discover audit logs | — |
| 16 | Missing loading.tsx for most routes | UX GAP | Medium | Auth, most resident, all buildings-manager routes | Flash of empty content on load | — |
| 17 | Missing error.tsx for most routes | UX GAP | Medium | Buildings-manager, contractor sub-routes | Unhandled errors bubble to root | — |
| 18 | CSP blocks Google Fonts | FRONTEND GAP | Medium | `style-src 'self' 'unsafe-inline'` without `fonts.googleapis.com` | Heebo font doesn't load | — |
| 19 | `posthog-js` not installed | FRONTEND GAP | Medium | Imported in `providers.tsx` but not in dependencies | Build warning; analytics broken | — |
| 20 | Mobile missing assets | FRONTEND GAP | Medium | `app.json` references `./assets/icon.png` etc. but folder missing | Native build fails | — |
| 21 | Mobile logout doesn't clear tokens | SECURITY GAP | Medium | Sets `null` but doesn't clear SecureStore | Tokens persist after logout | — |
| 22 | 429 handling inconsistent in frontend | UX GAP | Medium | Only 3 pages handle 429; others show generic error | Bad UX when rate-limited | — |
| 23 | Backup S3 upload never runs | OPS GAP | Medium | `AWS_S3_BUCKET` check always false in CI | Backups don't reach S3 | Broader beta |
| 24 | Influencer agent bypasses gated mode | AGENT GAP | Medium | Awards credits without pending-decision queue | Uncontrolled credit distribution | — |
| 25 | `admin_role_verified` cookie client-set | SECURITY GAP | Medium | Could be spoofed for frontend routing (backend still validates) | Defense-in-depth weakness | — |
| 26 | Supabase key in mobile `.env.example` | SECURITY GAP | Medium | Real-looking URL and key committed | Credential exposure risk | — |
| 27 | `/auth/register` lacks rate limiting | SECURITY GAP | Medium | Duplicate of `/auth/signup` without rate limit | Abuse vector for account creation | — |
| 28 | File upload orphan on DB failure | BACKEND GAP | Medium | File uploaded to storage but DB write fails = orphan | Storage waste | — |
| 29 | Qdrant/Neo4j runtime failures uncaught | BACKEND GAP | Medium | Startup warns but runtime calls don't gracefully degrade | 500 errors on vector/graph features | — |

### Low Gaps

| # | Title | Category | Severity | Evidence | Impact |
|---|-------|----------|----------|----------|--------|
| 30 | Landing page stats hardcoded | FRONTEND GAP | Low | Static `STATS` array | Misleading numbers |
| 31 | `test_coverage_boost*.py` inflate metrics | TEST GAP | Low | Import-only tests | False confidence |
| 32 | No `SECURITY.md` in repo root | OPS GAP | Low | Missing security disclosure policy | —  |
| 33 | Docker ports exposed on host | SECURITY GAP | Low | Dev-appropriate but production risk | — |
| 34 | `archive_old_chat_messages()` not scheduled | DATABASE GAP | Low | Function exists but no trigger/cron | Chat messages never archived |

---

## 13. Development Backlog

### Must Fix Before Limited Pilot

| # | Task | Estimated Effort |
|---|------|-----------------|
| 1 | **Fix payment schema drift** — align `payment_splits`, `invoices`, `payments` columns between migrations and code | 4–8h |
| 2 | **Add payment idempotency** — idempotency key on `POST /payments/initiate` | 2–4h |
| 3 | **Add auth to WebSocket `/ws/admin`** — JWT or API-key verification | 1–2h |
| 4 | **Implement missing endpoints** — `/buildings/join`, `/payments/approve-work`, `/payments/invoices/my` | 8–16h |
| 5 | **Fix join-offer body mismatch** — align frontend payload with backend schema | 1–2h |
| 6 | **Add unique constraint on `(user_id, offer_id)`** — prevent duplicate joins | 1h |
| 7 | **Create missing tables or remove references** — `orders`, `support_tickets`, `contractor_documents` | 4–8h |

### Must Fix Before Broader Beta

| # | Task | Estimated Effort |
|---|------|-----------------|
| 8 | **Wire agent audit logging** — call `_persist_audit()` from all agents | 4–8h |
| 9 | **Add Redis resilience** — try/except + degradation in auth rate limiting | 2–4h |
| 10 | **Fix agent worker interface** — build `AgentState` via `create_initial_state()` | 1–2h |
| 11 | **Add auth to `POST /escalations/`** — API-key or internal service auth | 1–2h |
| 12 | **Wire Notification agent into orchestration graph** | 2–4h |
| 13 | **Add at least one real-backend E2E suite** | 8–16h |
| 14 | **Fix backup S3 upload condition** | 1h |
| 15 | **Add 429 handling to frontend API client** | 2–4h |
| 16 | **Add loading.tsx and error.tsx to all route groups** | 4–8h |
| 17 | **Link orphaned pages** — `/change-password` from profile, audit-logs from admin nav | 1–2h |
| 18 | **Fix Qdrant/Neo4j runtime error handling** — graceful degradation | 4–8h |
| 19 | **Rate-limit `/auth/register`** or remove duplicate endpoint | 1h |

### Must Fix Before Public Launch

| # | Task | Estimated Effort |
|---|------|-----------------|
| 20 | **Implement 2FA (TOTP)** — `totp_secret` column exists but unused | 16–24h |
| 21 | **Mobile app fixes** — add assets, fix logout, fix navigation | 8–16h |
| 22 | **Accessibility audit and fixes** — WCAG 2.1 AA for critical flows | 16–24h |
| 23 | **Load testing** — establish baseline for concurrent users | 8–16h |
| 24 | **Social OAuth (Google)** — currently not implemented | 8–16h |
| 25 | **Tighten CSP** — remove `unsafe-eval`/`unsafe-inline` | 4–8h |
| 26 | **Add SECURITY.md** — vulnerability disclosure process | 1–2h |
| 27 | **Production runbooks** — incident response, rollback, monitoring | 4–8h |
| 28 | **Email change flow** — currently not implemented | 4–8h |
| 29 | **gov.il license verification** — currently partial | 4–8h |

### Nice to Have / Later

| # | Task |
|---|------|
| 30 | Push notifications (FCM wiring exists but untested) |
| 31 | Chat message archiving cron |
| 32 | Dynamic landing page stats |
| 33 | Remove `test_coverage_boost*.py` |
| 34 | Signed `admin_role_verified` cookie |
| 35 | Circuit breakers for external services |

---

## 14. Final Release Readiness Verdict

### Internal Testing Only

**YES** — The application runs, pages load, key flows work against mocked backends. However, **schema drift in payment tables must be verified/fixed** before any real database testing.

### Limited Pilot

**CONDITIONAL — 7 blockers must be resolved:**
1. Payment schema drift
2. Payment idempotency
3. WebSocket auth
4. Missing endpoints (at least `/buildings/join` and `/payments/approve-work`)
5. Join-offer body mismatch
6. Concurrent join race condition
7. Missing tables (at minimum, `orders`)

**Estimated effort: 2–3 developer-weeks**

### Broader Beta

**NOT READY — additionally requires:**
- Agent audit logging
- Redis resilience
- Agent worker fix
- Escalation auth
- Notification agent wiring
- Real-backend E2E tests
- Error/loading state coverage
- 429 frontend handling

**Estimated additional effort: 3–4 developer-weeks**

### Public Launch

**NOT READY — additionally requires:**
- 2FA
- Mobile fixes
- Accessibility
- Load testing
- Production runbooks
- CSP hardening
- Social OAuth

**Estimated additional effort: 6–8 developer-weeks**

---

## 15. Final Truth Check

### Fully Implemented Now

- Signup, login, logout, verify-email, resend-verification, forgot-password, reset-password, change-password
- Resident dashboard, offers list/detail, contractors list, architecture upload, building page, profile, payments list, AI chat
- Contractor dashboard, active offers, create offer, projects, profile
- Buildings manager dashboard, buildings, escalations
- Admin dashboard, agents, escalations, contractors, analytics, users, offers, payments, settings
- Backend auth with JWT + refresh tokens + HTTP-only cookies
- Rate limiting on auth and message endpoints
- 11 AI agents with LangGraph orchestration
- 21 database migrations with triggers, RLS, FK indexes
- WhatsApp webhook integration
- Stripe payment provider (mock + real modes)
- Email service for verification, notifications
- File upload with Supabase/local storage

### Partially Implemented

- **Orders pages** — UI exists but `orders` table missing; shows empty
- **Building join** — UI exists but backend endpoint missing
- **Work approval** — Frontend calls `approveWork()` but endpoint doesn't exist
- **Payment checkout** — UI + backend exist but schema drift may cause runtime failures
- **Agent audit logging** — Table + function exist but never called
- **Notification agent** — Implemented but not wired into orchestration
- **Agent worker** — Exists but interface mismatch causes runtime crash
- **Mobile app** — 7 screens, backend-connected, but missing assets + bugs
- **Influencer agent** — Works but bypasses gated safety mode

### Missing / Not Implemented

- 2FA (TOTP column exists, no code)
- Social OAuth (Google)
- Email change flow
- Push notifications (FCM service exists, not wired E2E)
- Load testing
- Production runbooks
- Accessibility certification
- gov.il license verification (partial enrichment service only)
- Real-backend test suite

### Only Documented / Spec-Only

- Some flows described in product docs but not in code: full order lifecycle, contractor scheduling/rescheduling, resident work-approval-to-release, issue reporting

### Dangerous to Assume Is Ready

1. **Payment flow** — Schema drift means DB operations may fail; no idempotency protection
2. **Offer joining** — Frontend sends wrong body; concurrent joins have race condition
3. **Agent safety** — No audit trail for any agent action; worker crashes on startup
4. **WebSocket security** — Admin WebSocket completely open
5. **Test confidence** — 800+ tests all use mocks; zero verify real system behavior
