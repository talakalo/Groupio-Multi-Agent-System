# Groupio Comprehensive End-to-End Audit

**Date:** 2026-03-16
**Auditor Role:** Principal Full-Stack Engineer / Staff Software Architect / Senior QA Automation Architect / Database Reliability Engineer / Security Auditor / Product Readiness Lead
**Branch:** `claude/groupio-comprehensive-review-qgpS9`

---

## 1. Executive Summary

### Overall Assessment
Groupio is a **well-architected multi-agent marketplace platform** for Israeli residential buildings that has undergone significant iteration — 21 database migrations, 140+ commits, and multiple hardening passes. The codebase shows professional-grade patterns: proper monorepo structure (pnpm + Turborepo), FastAPI backend with LangGraph orchestration, Next.js frontends with Zustand state management, comprehensive CI/CD pipeline, and security-conscious design.

**However, the project is NOT production-ready for public launch.** It is at **broader beta** readiness at best, with several critical gaps that would cause real user and financial harm in production.

### What is Strongest
- **Backend API architecture**: Well-organized FastAPI service with 16 route modules, proper RBAC, rate limiting, and audit logging
- **Agent orchestration**: LangGraph-based orchestrator with 9 specialist agents, proper error handling, handoff logic, and human escalation
- **Auth system**: JWT + HTTP-only refresh cookies, bcrypt password hashing, brute-force lockout, GDPR account deletion, email verification
- **Database schema**: 21 Alembic migrations covering RLS policies, FK indexes, triggers, and security hardening
- **CI/CD pipeline**: Comprehensive GitHub Actions with backend lint/type-check, security scanning (Trivy + GitLeaks), frontend tests, E2E Playwright, Docker build
- **Security posture**: Security headers middleware, PII redaction in logs, production config validators, input sanitization
- **Resilience patterns**: Circuit breaker on external calls, LLM fallback (Anthropic→OpenAI), Redis-backed response cache, atomic rate limiting via Lua scripts, Neo4j retry with backoff

### What is Weakest
- **Payment system**: Defaults to `PAYMENT_PROVIDER=mock` — no real Stripe integration has been tested end-to-end in a live environment
- **Frontend-to-backend wiring gaps**: Several frontend pages exist but are not connected to real backend data
- **Mobile app**: Expo/React Native app exists but is skeletal — no tests, no auth flow, no real API integration
- **External service dependencies**: WhatsApp Business API, SMTP, data.gov.il, Qdrant, Neo4j — all have graceful degradation but zero verified production connectivity
- **E2E tests are mock-only**: All Playwright tests use `page.route()` mocks, meaning they validate UI contracts but not real backend integration

### Biggest Risks
1. **Mock payment provider in production** — if deployed without switching to `PAYMENT_PROVIDER=stripe`, all payments silently succeed without money movement
2. **No real E2E test coverage** — all E2E tests mock the backend; no integration test validates the full signup→offer→payment→delivery lifecycle
3. **Agent autonomous actions** — agents can trigger DB writes, notifications, and escalations with limited human-in-the-loop gates
4. **CORS wildcard in global exception handler** — `global_exception_handler` reflects the request `Origin` header, potentially allowing any origin on error responses
5. **Buildings manager role has admin-level access** — `get_admin_user` grants buildings_manager the same access as admin/super_admin

### Current True Release-Readiness Level
**Internal testing / Limited pilot** with close monitoring. NOT ready for broader beta or public launch.

---

## 2. Repository and Runtime Findings

### Repo Structure
```
Groupio-Multi-Agent-System/           # Root monorepo
├── apps/
│   ├── web/          # Next.js 14+ (resident + contractor + buildings_manager)
│   ├── admin/        # Next.js 14+ (admin dashboard)
│   └── mobile/       # Expo/React Native (skeletal)
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── ui/           # Shared UI components
│   ├── api-client/   # API client package
│   └── utils/        # Shared utilities
├── src/              # Python FastAPI backend
│   ├── api/          # Routes, middleware
│   ├── agents/       # 9 specialist AI agents + base
│   ├── config/       # Settings, prompts
│   ├── databases/    # Postgres, Redis, Qdrant, Neo4j clients
│   ├── models/       # Pydantic models
│   ├── orchestration/# LangGraph workflow
│   ├── rag/          # Chunking, embeddings, reranking
│   ├── services/     # Email, payment, storage, WhatsApp, enrichment
│   ├── utils/        # Validators, PII, Hebrew, monitoring
│   └── workers/      # Agent worker, scheduler, offer lifecycle
├── alembic/          # 21 DB migrations
├── tests/            # Python tests (unit + integration)
├── docker/           # Docker Compose + Dockerfile
├── monitoring/       # Prometheus, Alertmanager configs
├── scripts/          # DB setup, seeding, rollback
├── docs/             # 30+ documentation files
└── .github/workflows/# CI/CD pipelines
```

### Apps/Services Found
| Service | Framework | Status |
|---------|-----------|--------|
| Backend API | FastAPI + uvicorn | VERIFIED structure, not runnable without deps |
| Web app (resident/contractor) | Next.js 14 App Router | VERIFIED structure |
| Admin app | Next.js 14 App Router | VERIFIED structure |
| Mobile app | Expo/React Native | SKELETAL — 5 screens, no auth, no real API |
| Agent worker | Python background worker | VERIFIED structure |
| Scheduler | Python cron-like worker | VERIFIED structure |

### Required Services
- PostgreSQL 15 (via Docker or Supabase)
- Redis 7 (for sessions, rate limiting, caching)
- Qdrant (vector DB for RAG)
- Neo4j 5 (graph DB for social features)
- Anthropic API (primary LLM)
- OpenAI API (fallback LLM + embeddings)
- SMTP (email verification, notifications)
- Stripe (payments — currently defaulting to mock)
- WhatsApp Business API (notifications)
- data.gov.il (address/company enrichment)

### Build/Runtime Blockers
- **Cannot build/run without external services** — no `.env` file present, only `.env.example`
- Docker Compose provides Postgres, Qdrant, Neo4j, Redis but NOT the LLM APIs
- Frontend build requires `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, etc.
- CI uses placeholder API keys (`test-key`) for backend tests

### Important Inconsistencies Between Docs and Code
1. `docs/PRODUCTION_READINESS_AUDIT.md` claims many features are "VERIFIED IMPLEMENTED" but E2E tests all use mocks
2. `PAYMENT_PROVIDER=mock` is set TWICE in `.env.example` (lines 88 and 100) — copy-paste artifact
3. Docs reference "broader beta" and "public launch" readiness, but payment system has never processed real money
4. `BROADER_BETA_READINESS_CHECKLIST.md` lists items as complete that haven't been verified against real infrastructure

---

## 3. UI / UX Audit

### Navigation Quality
- **Resident sidebar**: 7 nav items (Dashboard, Offers, Contractors, Architecture, Building, Profile, Payments) + AI Chat CTA — well-organized
- **Contractor sidebar**: Dashboard, Active Offers, Create Offer, Projects, Profile — coherent
- **Buildings Manager**: Dashboard, Buildings, Escalations — minimal but functional
- **Admin app**: Dashboard, Offers, Contractors, Users, Payments, Agents, Escalations, Analytics, Settings, Audit Logs — comprehensive

### Layout Consistency
- RTL-aware layouts using `start/end` instead of `left/right` — GOOD
- Tailwind CSS with consistent color palette (primary-500/600/700)
- Responsive design with mobile sidebar overlay
- Hebrew as primary language with English toggle via `next-intl`

### Forms and CTAs
- **Validation framework**: Zod schemas + react-hook-form + @hookform/resolvers — VERIFIED proper integration
- Signup form: 2-step process (role selection → details form), Zod schema validates password (8+ chars, uppercase, number), auto-login after registration — GOOD
- Login: JSON body endpoint (`/login/json`) + OAuth2 form endpoint (`/login`) — correctly wired; email/phone toggle with Zod refine validation
- Create Offer form: Full Zod validation (title min 10 chars, description min 50, base price min ₪100, min/max participants 3-100, required services array) — GOOD
- Phone validation: Israeli format (`^0\d{8,9}$`) — GOOD
- Form error display: `aria-describedby`, `aria-invalid`, field-level red error text — GOOD
- **Password requirements mismatch**: Frontend requires 8+ chars with uppercase + number; backend `UserCreate` requires only `min_length=8` — validation gap

### Loading/Error/Empty States
- **Email verification banner**: Shown for unverified users with resend button — GOOD
- **Auth guard**: Resident layout redirects to `/login` when no token — GOOD
- **Web app error boundaries**: VERIFIED — `app/error.tsx` (global), `app/(resident)/error.tsx`, `app/(resident)/dashboard/error.tsx`, `app/(resident)/offers/error.tsx`, `app/(resident)/payments/error.tsx`, `app/contractor/error.tsx` — multiple layers of error handling
- **Admin app**: Has `error.tsx` and `not-found.tsx` — GOOD
- **Web app loading states**: VERIFIED — skeleton cards with `animate-pulse` in dashboard/offers, `loading.tsx` files in contractor routes (`offers/active/loading.tsx`, `offers/create/loading.tsx`, `projects/loading.tsx`, `projects/[id]/loading.tsx`)
- **Empty states**: VERIFIED — `EmptyState` shared component used across pages (no building joined, no offers, no payments, no contractors found) with icons, descriptions, and CTAs
- **Inline error handling**: Retry buttons on error states, `role="alert"` on error cards — GOOD
- **Toast notifications**: `ToastContainer` with color-coded types (success/error/warning/info), auto-dismiss, action buttons — GOOD

### Accessibility/RTL/i18n Findings
- `aria-label` on sidebar toggle buttons — GOOD
- `role="alert"` and `aria-live="polite"` on verification banner — GOOD
- `LanguageToggle` component for he/en switching — GOOD
- **Missing**: Skip-to-content link
- **Missing**: Focus trap management in mobile sidebar overlay
- **Missing**: ARIA landmarks (`role="navigation"`, `role="main"`)

### Misleading or Broken UX
1. **Checkout page without Stripe key**: Shows config error or silently redirects — poor UX for residents trying to pay
2. **Orders page**: Route exists (`/orders`, `/orders/[id]`) but unclear if wired to backend — may show empty state without explanation
3. **WhatsApp notifications**: Code sends WhatsApp messages on offer join/leave (`_send_text_message`) but uses private method — will fail silently if WhatsApp is not configured
4. **Architecture page**: Exists for residents but purpose is unclear without context — may confuse non-technical users

---

## 4. Page and Route Inventory

### Web App (Resident/Contractor/Buildings Manager)

| Route | File | Role | Backend Connected | Nav Linked | Status | Tests |
|-------|------|------|-------------------|------------|--------|-------|
| `/` | `app/page.tsx` | Public | No | Landing | IMPLEMENTED | E2E smoke |
| `/login` | `app/(auth)/login/page.tsx` | Public | Yes (`/auth/login/json`) | Auth | IMPLEMENTED | E2E + unit |
| `/signup` | `app/(auth)/signup/page.tsx` | Public | Yes (`/auth/signup`) | Auth | IMPLEMENTED | E2E + unit |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Public | Yes (`/auth/password/reset`) | Auth | IMPLEMENTED | E2E |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | Public | Yes (`/auth/password/reset/confirm`) | Auth | IMPLEMENTED | E2E |
| `/verify-email` | `app/(auth)/verify-email/page.tsx` | Public | Yes (`/auth/verify-email/{token}`) | Auth | IMPLEMENTED | No |
| `/resend-verification` | `app/(auth)/resend-verification/page.tsx` | Public | Yes | Auth | IMPLEMENTED | No |
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | Auth | Partial | Post-signup | PARTIAL | E2E smoke |
| `/dashboard` | `app/(resident)/dashboard/page.tsx` | Resident | Yes (offers, building) | Sidebar | IMPLEMENTED | E2E smoke |
| `/offers` | `app/(resident)/offers/page.tsx` | Resident | Yes (`/offers`) | Sidebar | IMPLEMENTED | E2E |
| `/offers/[offerId]` | `app/(resident)/offers/[offerId]/page.tsx` | Resident | Yes (`/offers/{id}`) | Link | IMPLEMENTED | E2E |
| `/contractors` | `app/(resident)/contractors/page.tsx` | Resident | Yes (`/contractors`) | Sidebar | IMPLEMENTED | No |
| `/architecture` | `app/(resident)/architecture/page.tsx` | Resident | Partial | Sidebar | PARTIAL | E2E |
| `/building` | `app/(resident)/building/page.tsx` | Resident | Yes (`/buildings/me`) | Sidebar | IMPLEMENTED | No |
| `/building/join` | `app/(resident)/building/join/page.tsx` | Resident | Partial | Link | PARTIAL | No |
| `/profile` | `app/(resident)/profile/page.tsx` | Resident | Yes (`/auth/me`) | Sidebar | IMPLEMENTED | No |
| `/payments` | `app/(resident)/payments/page.tsx` | Resident | Partial (mock provider) | Sidebar | PARTIAL | E2E smoke |
| `/checkout` | `app/(resident)/checkout/page.tsx` | Resident | Partial (needs Stripe key) | Link | PARTIAL | E2E smoke |
| `/orders` | `app/(resident)/orders/page.tsx` | Resident | NOT VERIFIED | Orphaned | NOT VERIFIED | No |
| `/orders/[id]` | `app/(resident)/orders/[id]/page.tsx` | Resident | NOT VERIFIED | Orphaned | NOT VERIFIED | No |
| `/chat` | `app/(resident)/chat/page.tsx` | Resident | Yes (`/message`) | CTA | IMPLEMENTED | E2E |
| `/change-password` | `app/(resident)/change-password/page.tsx` | Resident | Yes (`/auth/password/change`) | Link | IMPLEMENTED | No |
| `/privacy` | `app/privacy/page.tsx` | Public | No | Footer | IMPLEMENTED | No |
| `/terms` | `app/terms/page.tsx` | Public | No | Footer | IMPLEMENTED | No |
| `/contractor/dashboard` | `app/contractor/dashboard/page.tsx` | Contractor | Yes | Sidebar | IMPLEMENTED | E2E |
| `/contractor/offers/active` | `app/contractor/offers/active/page.tsx` | Contractor | Yes | Sidebar | IMPLEMENTED | No |
| `/contractor/offers/create` | `app/contractor/offers/create/page.tsx` | Contractor | Yes (`POST /offers`) | Sidebar | IMPLEMENTED | E2E |
| `/contractor/projects` | `app/contractor/projects/page.tsx` | Contractor | Partial | Sidebar | PARTIAL | No |
| `/contractor/projects/[id]` | `app/contractor/projects/[id]/page.tsx` | Contractor | Partial | Link | PARTIAL | Unit |
| `/contractor/profile` | `app/contractor/profile/page.tsx` | Contractor | Yes | Sidebar | IMPLEMENTED | No |
| `/buildings-manager/dashboard` | `app/buildings-manager/dashboard/page.tsx` | Buildings Mgr | Partial | Sidebar | PARTIAL | No |
| `/buildings-manager/buildings` | `app/buildings-manager/buildings/page.tsx` | Buildings Mgr | Partial | Sidebar | PARTIAL | No |
| `/buildings-manager/escalations` | `app/buildings-manager/escalations/page.tsx` | Buildings Mgr | Yes (`/escalations`) | Sidebar | IMPLEMENTED | No |

### Admin App

| Route | File | Status | Tests |
|-------|------|--------|-------|
| `/` (redirect) | `app/page.tsx` | IMPLEMENTED | No |
| `/login` | `app/login/page.tsx` | IMPLEMENTED | No |
| `/dashboard` | `app/dashboard/page.tsx` | IMPLEMENTED | No |
| `/offers` | `app/offers/page.tsx` | IMPLEMENTED | No |
| `/contractors` | `app/contractors/page.tsx` | IMPLEMENTED | No |
| `/users` | `app/users/page.tsx` | IMPLEMENTED | No |
| `/payments` | `app/payments/page.tsx` | IMPLEMENTED | No |
| `/agents` | `app/agents/page.tsx` | IMPLEMENTED | No |
| `/escalations` | `app/escalations/page.tsx` | IMPLEMENTED | No |
| `/analytics` | `app/analytics/page.tsx` | IMPLEMENTED | No |
| `/settings` | `app/settings/page.tsx` | IMPLEMENTED | No |
| `/settings/audit-logs` | `app/settings/audit-logs/page.tsx` | IMPLEMENTED | No |

### Mobile App (Expo)

| Screen | Status |
|--------|--------|
| Login | SKELETAL — no real API wiring |
| Home (Tabs) | SKELETAL |
| Offers | SKELETAL |
| Chat | SKELETAL |
| Profile | SKELETAL |
| Create Offer | SKELETAL |
| Offer Detail | SKELETAL |

### Dead/Orphaned Routes
- `/orders` and `/orders/[id]`: Exist as pages but not linked in sidebar navigation; backend wiring unverified
- Mobile app: Entire app is essentially a prototype; no production use

---

## 5. Frontend Audit

### Architecture
- **App Router** (Next.js 14+) with route groups: `(auth)`, `(resident)`, `contractor/`, `buildings-manager/`
- **State management**: Zustand stores (`authStore`, `offerStore`, `notificationStore`) with localStorage persistence
- **API client**: Custom fetch-based `apiClient` in `lib/api/client.ts`
- **i18n**: `next-intl` for Hebrew/English
- **UI**: Tailwind CSS + Lucide icons + custom components

### API Wiring Quality
- **Auth store**: Properly uses `credentials: 'include'` for HTTP-only cookies — GOOD
- **Token management**: Access token in memory only, refresh token in HTTP-only cookie — GOOD (security best practice)
- **Profile fetch after login**: Calls `/auth/me` after login to populate user state — GOOD
- **Register then auto-login**: Register calls `/auth/register` then calls `login()` — works but makes 2 API calls instead of using `/auth/signup` which returns a token directly

### Security Concerns
1. **Access token not persisted but `isAuthenticated` is**: Zustand persists `isAuthenticated: true` to localStorage while `accessToken` is null on page reload. This causes a brief state where `isAuthenticated` is true but no token exists, triggering a refresh attempt — potential race condition
2. **`clearAuth()` clears both localStorage and a cookie named `groupio-auth`** but the cookie set by the backend is named `access_token` and `refresh_token` — mismatch in cookie names
3. **`API_URL` defaults to `http://localhost:8000`** — if `NEXT_PUBLIC_API_URL` is not set in production, all API calls will fail silently

### Data Fetching Strategy
- **React Query** for offers, contractors, building, payments — with query key factory, staleTime: 60s, 2 retries — GOOD
- **Direct fetch** in some components (dashboard stats, payments page) — inconsistent with React Query usage
- **Zustand `offerStore`** exists as fallback alongside React Query `useOffers` hook — duplication risk
- **API client** supports single-flight refresh token mechanism (reuses in-flight refresh) — GOOD
- **Chat**: React Query for message history with cursor-based pagination (50 messages/page), 30s timeout with slow-response notice — GOOD

### Dead Code / Legacy Components
- `apps/web/__tests__/apiClient.test.ts` tests exist but API client file path needs verification
- Orders pages exist without visible backend connection or sidebar links
- Mobile app `lib/api.ts`, `lib/hooks.ts`, `lib/storage.ts` exist but are minimal stubs
- Dual offer stores (Zustand `offerStore` + React Query `useOffers`) — should consolidate to React Query

### Testability
- 13 frontend unit tests covering auth store, API client, key pages (Login, Signup, Payments, etc.)
- 7 E2E Playwright specs covering critical flows
- **All E2E tests are mock-based** (`page.route()`) — good for CI reliability, bad for real integration confidence

---

## 6. Backend Audit

### Route/Service Quality
The backend has **16 well-organized route modules** under `/api/v1/`:

| Prefix | Module | Endpoints | Auth Required |
|--------|--------|-----------|---------------|
| `/auth` | `auth.py` | signup, register, login, login/json, refresh, logout, me, password/change, password/reset, verify-email, resend-verification, push-token, DELETE /me | Mixed |
| `/offers` | `offers.py` | CRUD, join, leave, publish, start-matching, match, participants, resolve-undersubscription | Yes |
| `/contractors` | `contractors.py` | List, get, register, update, verify, doc-requests | Mixed |
| `/buildings` | `buildings.py` | CRUD, residents, join, my-building | Yes |
| `/payments` | `payments.py` | Initiate, status, history, methods, webhook/stripe, admin escrow/payout | Yes |
| `/admin` | `admin.py` | Users CRUD, offers management, settings, audit logs, vetting, outreach queue, agent audit, credit awards, pending decisions | Admin |
| `/escalations` | `escalations.py` | CRUD, assign, resolve, messages | Yes |
| `/agents` | `agents.py` | Agent info, status | Admin |
| `/uploads` | `uploads.py` | Avatar, contractor docs | Yes |
| `/webhooks` | `webhooks.py` | Stripe, WhatsApp | Service |
| `/activity` | `activity.py` | Recent activity feed | Yes |
| `/onboarding` | `onboarding.py` | Building association | Yes |
| `/conversations` | `conversations.py` | Chat history | Yes |
| `/enrichment` | `enrichment.py` | Address enrichment | Yes |
| `/graph` | `graph_features.py` | Social proof, viral | Yes |
| `/ws` | `websocket.py` | WebSocket chat | Yes |

### API Completeness — Verified Gaps
1. **`DELETE /me`**: Uses `try/except AttributeError` for `db.delete_user()` — fallback to anonymization proves hard-delete isn't fully implemented
2. **`POST /payments/initiate`**: Calls `get_payment_provider()` which defaults to `MockPaymentProvider` — payment amounts are calculated but never actually charged
3. **Stripe webhook handler**: Code exists (`POST /payments/webhook/stripe`) with proper HMAC verification but `STRIPE_WEBHOOK_SECRET` defaults to empty string
4. **`GET /admin/export/*`**: CSV exports work but `execute_query` for payments export has a fallback to empty array — fragile

### Auth/RBAC Enforcement
- `get_current_user`: JWT token validation with DB user lookup on every request — GOOD but N+1 potential
- `get_admin_user`: Checks `role in (ADMIN, SUPER_ADMIN, BUILDINGS_MANAGER)` — **RISK: buildings_manager gets full admin access**
- `require_roles()`: Factory function for fine-grained role checks — available but underused
- Rate limiting: IP-based (20/min) on auth endpoints + user-based (60/min) on general endpoints, **atomic Lua scripts** prevent race conditions — GOOD

### Resilience Patterns
- **Circuit breaker**: `CircuitBreaker` class in `agents/base.py` protects external service calls — GOOD
- **LLM fallback**: Primary model (claude-sonnet-4-20250514) with automatic fallback to gpt-4o on timeout — GOOD
- **LLM response cache**: Redis-backed `LLMResponseCache` for deduplication — GOOD
- **DB transactions**: `PostgresClient.transaction()` context manager exists for asyncpg backend (Supabase fallback is non-transactional) — PARTIAL
- **Graph store retries**: Neo4j driver with 3 attempts + exponential backoff, max 50 connections — GOOD
- **Fraud detection**: `graph_store.detect_suspicious_patterns()` analyzes offer/review patterns — GOOD but effectiveness unverified
- **Background workers**: Redis-based task queue (`groupio:agent:tasks`) for async agent processing — GOOD

### Business Logic Concerns
1. **Offer join uses non-atomic counter**: `current_participants` is read from the offer dict, incremented client-side, but the DB update is separate — race condition risk for concurrent joins
2. **WhatsApp notifications use private method**: `get_whatsapp_bot()._send_text_message()` — poor encapsulation, breaks if WhatsApp module changes internals
3. **Payment VAT rate hardcoded**: `VAT_RATE = 0.18` (18%) vs invoice default `tax_rate: 0.17` (17%) — INCONSISTENCY, potential financial error
4. **CSP in production** blocks `connect-src` to `'self'` — will break API calls if frontend and backend are on different domains (which they are: `groupio.co.il` vs `api.groupio.co.il`)

---

## 7. Database Audit

### DB Inventory
**Engine**: PostgreSQL 15 (Alpine) via Docker, with optional Supabase hosted backend
**Migrations**: 21 Alembic revisions (001-021)
**Client**: Dual-backend `PostgresClient` supporting both asyncpg (local) and Supabase PostgREST

### Schema / Table Inventory

| Table | Migration | FK Indexes | RLS | Triggers | Used By |
|-------|-----------|------------|-----|----------|---------|
| `users` | 001 | email, phone | Yes (009, 021) | `set_updated_at` (020) | Auth, all flows |
| `buildings` | 001 | city, region | No | `set_updated_at` (020) | Building management |
| `building_residents` | 001 | user_id+building_id | No | None | Building association |
| `contractors` | 001 | verification_status, trust_score | No | `set_updated_at` (020) | Contractor flows |
| `offers` | 001 | building_id, status, category | No | `set_updated_at` (020) | Offer lifecycle |
| `offer_participants` | 001 | offer_id+user_id | Yes (009, 021) | `trg_offer_join_update` (008) | Offer join/leave |
| `contractor_reviews` | 001 | contractor_id | No | None | Reviews |
| `escalations` | 001 | status, priority, assigned_to | Yes (021) | None | Support escalation |
| `escalation_messages` | 001 | escalation_id | Yes (021) | None | Escalation thread |
| `chat_messages` | 001 | conversation_id, user_id | Yes (021) | None | AI chat history |
| `agent_metrics` | 001 | agent_name, recorded_at | No | None | Agent monitoring |
| `invitations` | 001 | None | No | None | Building invites |
| `conversation_logs` | 002 | conversation_id, user_id | No | `auto_retention` (006) | Chat logs |
| `file_uploads` | 003 | user_id, entity_type | No | None | Document uploads |
| `audit_logs` | 004 | user_id, created_at, action | Yes (021) | None | Admin audit trail |
| `system_settings` | 004 | key | No | None | System config |
| `payment_methods` | 004 | user_id | No | None | Stored cards |
| `invoices` | 004 | offer_id, status | No | None | Billing |
| `payments` | 004 | user_id, status | Yes (009, 021) | None | Payment records |
| `payment_splits` | 004 | payment_id, participant_user_id | No | None | Split payments |
| `outreach_queue` | 007 | None found | No | None | Agent outreach |
| `agent_audit_log` | 010 | agent_name | No | None | AI agent audit |
| `contractor_verification_metadata` | 015 | contractor_id | No | None | Verification docs |
| `credit_awards` | 017 | resident_id | No | None | Referral credits |
| `pending_agent_decisions` | 018 | agent_name, status | No | None | Agent approval queue |

### Insert/Select/Update/Delete Flow Audit

**Users:**
- INSERT: Via `/auth/signup` or `/auth/register` — validated, password hashed, UUID generated — GOOD
- SELECT: By ID, email, phone — all implemented — GOOD
- UPDATE: Via `/auth/me` (self) or `/admin/users/{id}` (admin) — GOOD
- DELETE: `DELETE /auth/me` with GDPR anonymization fallback — GOOD design, but `delete_user()` may not exist (try/except)

**Offers:**
- INSERT: Via `POST /offers` with building membership check — GOOD
- SELECT: List with filters/pagination, get by ID — GOOD
- UPDATE: Creator or admin only, blocked for completed/cancelled — GOOD
- DELETE: Soft-delete (status → cancelled) with participant notifications — GOOD

**Payments:**
- INSERT: Via `POST /payments/initiate` — **RISK: uses mock provider by default**
- SELECT: By ID, user history — GOOD
- UPDATE: Admin override with audit log — GOOD
- DELETE: No delete path (correct for financial records)

### Trigger Audit
| Trigger | Table | Type | Migration | Purpose | Risk |
|---------|-------|------|-----------|---------|------|
| `set_updated_at` | users, buildings, contractors, offers | BEFORE UPDATE | 020 | Auto-update `updated_at` | Low |
| `trg_offer_join_update` | offer_participants | AFTER INSERT/DELETE | 008 | Atomically update `current_participants` count | Medium — critical for correctness |
| `auto_retention_trg` | conversation_logs | AFTER INSERT | 006 | Auto-delete old conversation logs | Low |

### Permission Audit
- **RLS enabled** on: users, offer_participants, payments (009), chat_messages, audit_logs, escalations, escalation_messages (021)
- **Roles created**: `groupio_app` (application), `groupio_readonly` (analytics) — migration 021
- **audit_logs**: UPDATE/DELETE revoked from `groupio_app` — append-only — GOOD
- **RISK**: Application still connects as `postgres` superuser by default — migration 021 creates roles but nothing forces the app to use them
- **RISK**: `groupio_app` role password is `change-me-in-production` in the migration — must be changed before deploy

### Data Integrity Concerns
1. **Float for money**: `payments.amount`, `invoices.subtotal/total` use `sa.Float()` — should use `sa.Numeric(12, 2)` for financial precision
2. **VAT rate inconsistency**: Code uses 0.18 (18%), DB default is 0.17 (17%) — will cause billing discrepancies
3. **`offer_participants` trigger vs API code**: Both the trigger (migration 008) and the API code update `current_participants` — potential double-counting if both fire
4. **No FK from `users.building_id` to `buildings.id`**: Column exists but no foreign key constraint in migration 001

---

## 8. Auth / Roles / Permissions Audit

### Role Model
| Role | Stored In | Pages Accessible | API Access |
|------|-----------|------------------|------------|
| `resident` | `users.role` | All `(resident)/*` routes | Own data, offers, building, chat |
| `contractor` | `users.role` | All `contractor/*` routes | Own profile, projects, offers |
| `buildings_manager` | `users.role` | `buildings-manager/*` routes | Buildings, escalations, **full admin API** |
| `admin` | `users.role` | Admin app only | Full admin API |
| `super_admin` | `users.role` | Admin app only | Full admin API |

### Security Issues Found

1. **`get_admin_user` is too permissive** (`src/api/middleware/auth.py:189`):
   ```python
   if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BUILDINGS_MANAGER):
   ```
   Buildings managers get full admin access including: user management, payment overrides, offer force-cancel, system settings, CSV exports. This is almost certainly over-privileged.

2. **No scope separation for buildings_manager**: A buildings_manager can modify users in OTHER buildings, override payments for ANY offer, change system settings. Should be scoped to their assigned buildings.

3. **Signup allows any role** (`src/api/routes/auth.py:61`):
   ```python
   role: UserRole = UserRole.RESIDENT
   ```
   The `SignupRequest` model accepts any `UserRole` value. A malicious user could sign up as `admin` or `super_admin` by passing `"role": "admin"` in the request body. **CRITICAL SECURITY VULNERABILITY.**

4. **No admin role validation on signup**: `POST /auth/signup` and `POST /auth/register` both accept `role` field from the request body without restricting to safe values (resident/contractor only).

5. **Brute-force lockout locks the account permanently**: After 5 failed login attempts, `is_active` is set to False. There's no automatic unlock mechanism or admin notification — user must contact support.

6. **Refresh token stored in Redis without per-device tracking**: Only one refresh token per user — logging in on a new device invalidates the old session. Not ideal for multi-device users.

7. **Admin app uses `admin_role_verified` cookie for middleware gate**: The admin app sets a non-HTTP-only `admin_role_verified=1` cookie after verifying the user's role via `/auth/me`. This cookie is SameSite=Strict which mitigates CSRF, but it can be forged client-side to bypass the middleware check. Backend enforcement is authoritative, but the frontend gate is bypassable.

8. **CORS origin reflection in error handler** (`src/api/main.py:96`):
   ```python
   origin = request.headers.get("origin")
   if origin:
       response.headers["Access-Control-Allow-Origin"] = origin
   ```
   This reflects ANY origin in error responses, bypassing the configured CORS whitelist. An attacker could trigger a server error and read the error message from any origin.

---

## 9. Agents / Handovers Audit

### Agent Inventory
| Agent | File | Purpose | Tools | Mode |
|-------|------|---------|-------|------|
| RouterAgent | `agents/router.py` | Intent classification + routing | LLM | Auto |
| SupportAgent | `agents/support.py` | General support, FAQ | LLM + RAG | Auto |
| MatchingAgent | `agents/matching.py` | Contractor-offer matching | LLM + DB + Vector | Recommend |
| PricingAgent | `agents/pricing.py` | Price estimation, tier analysis | LLM + DB | Recommend |
| VettingAgent | `agents/vetting.py` | Contractor verification | LLM + DB + External | Recommend |
| OutreachAgent | `agents/outreach.py` | Message drafting for prospects | LLM | Gated |
| AnalyticsAgent | `agents/analytics.py` | Data analysis queries | LLM + DB | Auto |
| ArchitectureAgent | `agents/architecture.py` | Building analysis | LLM | Auto |
| InfluencerAgent | `agents/influencer.py` | Viral/social campaigns | LLM + Graph | Auto |
| PaymentAgent | `agents/payment.py` | Payment flow assistance | LLM + Payment service | Auto |

### Orchestration Quality
- **LangGraph state machine**: Well-structured with conditional edges, safe agent wrappers, and explicit state validation
- **Error handling**: `_run_agent_safe()` catches all exceptions, classifies as transient vs permanent, returns Hebrew error message — GOOD
- **Handoff protocol**: `last_agent_handoff` with `summary_for_next_agent`, `suggested_next_agent`, `entities_to_pass` — well-designed
- **Human escalation**: Proper ticket creation in DB with context preservation — GOOD
- **State contract validation**: `validate_agent_state()` called at entry and exit — GOOD

### Agent Safety Concerns
1. **Autonomy modes are env-configurable but not enforced in the orchestrator**: The `MATCHING_AGENT_MODE`, `PRICING_AGENT_MODE` etc. are set in settings but the graph doesn't check them before applying agent results
2. **Agent audit log table exists** (migration 010) and admin endpoint exists (`/admin/agents/audit`) — GOOD
3. **Pending decisions table exists** (migration 018) with admin approval/reject workflow — GOOD
4. **No retry with exponential backoff**: Agent errors are caught but not retried — a transient LLM timeout kills the entire request
5. **Outreach agent mode is "gated"** but the gate is the admin outreach queue, not an in-flow checkpoint — outreach messages could be crafted and queued without admin seeing them until after
6. **No token/cost budgets per conversation**: A conversation could loop through multiple agents consuming unlimited LLM tokens

### Missing/Broken Agent Workflows
- **NotificationAgent**: Exists in `agents/notification.py` but is NOT registered in the orchestrator graph — orphan code
- **PaymentAgent**: Loaded with `try/except ImportError` — fragile; if import fails, payment-related queries silently route to SupportAgent

---

## 10. Tests and Coverage Audit

### Test Inventory
| Category | Count | Framework | Coverage |
|----------|-------|-----------|----------|
| Python unit tests | ~70 files | pytest + pytest-asyncio | Target: 80% (CI enforced) |
| Python integration tests | 17 files | pytest + TestClient | Real DB required |
| Frontend unit tests | 13 files | Vitest + Testing Library | Unknown |
| E2E tests | 7 specs | Playwright | Mock-only |
| Mobile tests | 3 files | Vitest | Basic component tests |

### Critical Coverage Gaps
1. **No real E2E tests**: All 7 Playwright specs use `page.route()` to mock the backend. The comment in `pilot-smoke.spec.ts` explicitly states: "All backend calls are intercepted with page.route() mocks so the suite runs without a live API or DB."
2. **No payment flow E2E**: The checkout E2E test (#14) just verifies the route doesn't crash — no actual payment processing
3. **No admin app tests**: Zero tests for the entire admin Next.js application
4. **No buildings_manager tests**: The buildings_manager role flow has no test coverage
5. **No mobile tests for auth**: Mobile app has 3 component tests but no authentication or API integration tests
6. **Coverage boost tests**: Files `test_coverage_boost.py` and `test_coverage_boost2.py` exist — suggests coverage was artificially inflated to meet the 80% threshold
7. **No database migration tests**: Alembic migrations are not tested for correctness (upgrade + downgrade)
8. **No Stripe integration test**: Payment service has unit tests for mock provider only
9. **No accessibility tests**: No axe-core, Lighthouse, or pa11y integration
10. **No load/stress tests**: No k6, Artillery, or Locust configurations

### Test Quality Concerns
- Many tests mock database calls completely — they test the routing logic but not actual data flow
- Integration tests require Redis and PostgreSQL services (provided in CI) — GOOD
- `pytest-timeout` configured at 120s per test and 30s for integration tests — GOOD

---

## 11. Error Handling and Resilience Audit

| Scenario | Handling | Quality |
|----------|----------|---------|
| Invalid login | 401 with generic "Invalid credentials" | GOOD (no info leak) |
| Unverified account | 403 with verification link reminder | GOOD |
| Account locked (brute force) | 423 with clear message | GOOD |
| Expired token | 401, frontend triggers refresh | GOOD |
| Invalid reset link | 400 with clear message | GOOD |
| Missing permissions | 403 with required roles | GOOD |
| Failed payment | Mock always succeeds; Stripe wraps errors | PARTIAL |
| DB unavailable | 503 with "Database unavailable" | GOOD |
| Agent timeout | Caught, returns Hebrew error message | GOOD |
| Missing external service | Graceful degradation (Qdrant, Neo4j, SMTP) | GOOD |
| Empty search results | Returns empty list with total: 0 | GOOD |
| Duplicate submission (offer join) | 400 "Already joined this offer" | GOOD |
| Rate limit exceeded | 429 with Retry-After header | GOOD |
| CORS on error | Reflects origin — **security issue** | POOR |
| Unhandled exception | 500 with detail only in development | GOOD |
| Rollback behavior | No explicit DB transactions — relies on single-query atomicity | POOR |
| Observability | Structured logging + Sentry DSN + Prometheus metrics | GOOD |

---

## 12. Gap Map

### CRITICAL

| # | Title | Category | Evidence | Impact | Blocks |
|---|-------|----------|----------|--------|--------|
| G1 | **Signup allows arbitrary role escalation** | SECURITY GAP | `src/api/routes/auth.py:61` — `role: UserRole = UserRole.RESIDENT` accepts any role | Any user can sign up as admin/super_admin | All releases |
| G2 | **Mock payment provider in production** | PRODUCT GAP | `.env.example:88` — `PAYMENT_PROVIDER=mock`, `src/services/payment.py` warns but allows | Real money never moves; silent data corruption | Public launch |
| G3 | **CORS origin reflection on errors** | SECURITY GAP | `src/api/main.py:96` — reflects any Origin header | Cross-origin error message leakage | Public launch |
| G4 | **Float for financial columns** | DATABASE GAP | Migration 004 — `sa.Float()` for amounts | Floating-point arithmetic errors on money | Public launch |
| G5 | **VAT rate inconsistency (18% vs 17%)** | BACKEND GAP | `payments.py:39` (0.18) vs `004_admin_and_payments.py:80` (0.17) | Incorrect billing amounts | Broader beta |

### HIGH

| # | Title | Category | Evidence | Impact | Blocks |
|---|-------|----------|----------|--------|--------|
| G6 | **Buildings manager has full admin access** | PERMISSION/RBAC GAP | `auth.py:189` | Over-privileged role can modify any user/payment | Broader beta |
| G7 | **CSP blocks cross-origin API calls** | BACKEND GAP | `security.py:48` — `connect-src 'self'` | Frontend can't call API in production (different domains) | Public launch |
| G8 | **No real E2E tests** | TEST GAP | All 7 Playwright specs use `page.route()` mocks | No confidence in full-stack integration | Broader beta |
| G9 | **No admin app tests** | TEST GAP | Zero test files in `apps/admin/` | Admin panel may break without detection | Broader beta |
| G10 | **DB app role uses default password** | SECURITY GAP | Migration 021: `'change-me-in-production'` | DB credentials in migration code | Public launch |
| G11 | **App still connects as postgres superuser** | SECURITY GAP | `docker-compose.yml` uses `POSTGRES_USER` for app | Least-privilege violation | Public launch |
| G12 | **NotificationAgent orphaned** | AGENT/HANDOVER GAP | `agents/notification.py` exists but not in orchestrator | Notification features don't work through agent system | Limited pilot |

### MEDIUM

| # | Title | Category | Evidence | Impact | Blocks |
|---|-------|----------|----------|--------|--------|
| G13 | **Password validation mismatch front/back** | FRONTEND GAP | Signup Zod schema requires uppercase+number; backend `UserCreate` only enforces `min_length=8` | Passwords accepted by backend may be rejected by frontend and vice versa | Broader beta |
| G14 | **Orders pages orphaned** | FRONTEND GAP | `app/(resident)/orders/` exists but not in sidebar | Users can't discover order tracking | Broader beta |
| G15 | **No foreign key: users.building_id → buildings.id** | DATABASE GAP | Migration 001 — column exists without FK | Referential integrity not enforced | Broader beta |
| G16 | **Concurrent offer join race condition** | BACKEND GAP | Both trigger (008) and API code update participant count | Potential double-counting | Broader beta |
| G17 | **Mobile app is skeletal** | PRODUCT GAP | 5 screens, no auth, 3 component tests | Mobile users have no usable app | Public launch |
| G18 | **WhatsApp uses private method** | BACKEND GAP | `get_whatsapp_bot()._send_text_message()` | Breaks on internal API changes | Limited pilot |
| G19 | **Register then login makes 2 API calls** | FRONTEND GAP | `authStore.ts:177-202` calls register then login | Unnecessary latency; `/signup` endpoint returns token directly | Nice to have |
| G20 | **No skip-to-content link** | UX GAP | All layouts missing accessibility landmark | Screen reader users can't skip navigation | Public launch |
| G21 | **Account lockout has no auto-unlock** | BACKEND GAP | `auth.py:220-222` sets `is_active=False` permanently | Locked-out users stuck without admin intervention | Broader beta |
| G22 | **DB transactions underused for multi-step operations** | DATABASE GAP | `PostgresClient.transaction()` exists but payment+invoice creation doesn't use it; Supabase backend has no transaction support | Partial writes on failure | Broader beta |

### LOW

| # | Title | Category | Evidence | Impact | Blocks |
|---|-------|----------|----------|--------|--------|
| G23 | **`PAYMENT_PROVIDER=mock` duplicated in .env.example** | OPS GAP | Lines 88 and 100 of `.env.example` | Confusion during setup | Nice to have |
| G24 | **Coverage boost test files** | TEST GAP | `test_coverage_boost.py`, `test_coverage_boost2.py` | Artificially inflated coverage metrics | Nice to have |
| G25 | **No database backup verification** | OPS GAP | `backup.yml` workflow exists but no restore test | Backup may not be restorable | Public launch |

---

## 13. Development Backlog

### Must Fix Before Limited Pilot

1. **[G1] Fix signup role escalation**: Restrict `role` field in `SignupRequest` and `UserCreate` to only allow `resident` and `contractor`. Admin/super_admin/buildings_manager should only be assignable by existing admins.
2. **[G12] Register NotificationAgent in orchestrator**: Add to `GroupioOrchestrator.__init__` and graph edges, or remove the orphaned file.
3. **[G18] Fix WhatsApp private method access**: Create a public `send_text()` method on the WhatsApp bot class.

### Must Fix Before Broader Beta

4. **[G3] Fix CORS origin reflection**: Remove origin reflection in `global_exception_handler`. Return the configured CORS origins instead.
5. **[G5] Fix VAT rate inconsistency**: Standardize to 18% (current Israeli rate) in both code and DB defaults.
6. **[G6] Scope buildings_manager permissions**: Create separate `get_buildings_manager_user` dependency that restricts access to their assigned buildings only.
7. **[G8] Add real E2E tests**: Create at least one Playwright spec that runs against a live backend (use Docker Compose in CI).
8. **[G9] Add admin app tests**: Create basic smoke tests for admin dashboard, users, offers pages.
9. **[G13] Align password validation**: Ensure backend `UserCreate` model enforces the same rules as the frontend Zod schema (uppercase + number required), or relax the frontend to match backend.
10. **[G14] Wire orders pages**: Either connect to backend and add to sidebar, or remove the orphaned pages.
11. **[G16] Fix offer join race condition**: Remove the client-side participant count update; rely solely on the DB trigger.
12. **[G21] Add auto-unlock mechanism**: Reset login failure counter after a configurable cooldown period (e.g., 15 minutes).
13. **[G22] Use existing DB transactions**: `PostgresClient.transaction()` context manager exists — wrap payment+invoice creation and other multi-step ops in it. For Supabase backend, implement transaction support or document the limitation.

### Must Fix Before Public Launch

14. **[G2] Configure real payment provider**: Set `PAYMENT_PROVIDER=stripe` with valid keys, test full payment lifecycle.
15. **[G4] Change financial columns to Numeric**: Migrate `Float` columns in payments/invoices to `Numeric(12, 2)`.
16. **[G7] Fix CSP for cross-origin API**: Add API domain to `connect-src` directive in production CSP.
17. **[G10] Rotate DB role passwords**: Change default passwords in migration and document rotation procedure.
18. **[G11] Configure app to use groupio_app role**: Update connection string to use the least-privileged role.
19. **[G15] Add missing foreign key**: Add FK constraint from `users.building_id` to `buildings.id`.
20. **[G17] Build out mobile app**: Implement auth, real API integration, and key flows.
21. **[G20] Add accessibility landmarks**: Add skip-to-content, ARIA landmarks, focus management.
22. **[G25] Test backup restoration**: Verify database backups can be restored.

### Nice to Have / Later

23. **[G19] Use signup endpoint instead of register+login**: Reduce API calls during registration.
24. **[G23] Clean up .env.example duplication**: Remove duplicate Stripe/payment config.
25. **[G24] Remove coverage boost tests**: Replace with meaningful tests that cover real behavior.
26. Add WebSocket reconnection logic with exponential backoff in the chat frontend.
27. Add per-agent LLM token budgets to prevent runaway costs.
28. Implement multi-device session support (multiple refresh tokens per user).
29. Add OpenTelemetry distributed tracing for cross-service observability.

---

## 14. Final Release Readiness Verdict

### Internal Testing Only: READY with caveats
- **What's ready**: All backend endpoints, auth flows, agent orchestration, DB schema
- **What's partial**: Payment system (mock only), external service integrations
- **What's unsafe**: G1 (role escalation) must be fixed even for internal testing
- **Verdict**: Fix G1 first, then internal testing is safe

### Limited Pilot: CONDITIONALLY READY
- **What's ready**: Core user flows (signup, login, offers, building management, AI chat), admin dashboard
- **Must fix first**: G1, G3, G12, G18
- **Known limitations**: Payments are mock, no real email delivery, no WhatsApp
- **Verdict**: Can pilot with 10-20 known users if G1/G3 are fixed and users are informed payments are simulated

### Broader Beta: NOT READY
- **What's missing**: G2 (real payments), G6 (role scoping), G8 (real E2E tests), G13 (password validation mismatch), G16 (race condition), G22 (transactions)
- **Estimated effort**: 2-3 sprint cycles
- **Verdict**: Requires all "Must Fix Before Broader Beta" items

### Public Launch: NOT READY
- **What's missing**: All of the above plus G4, G7, G10, G11, G15, G17, G20, G25
- **Estimated effort**: 4-6 sprint cycles from current state
- **Verdict**: Requires fundamental financial system hardening, mobile app build-out, accessibility compliance, and production infrastructure verification

---

## 15. Final Truth Check

### Fully Implemented Now
- User authentication (signup, login, logout, password reset, email verification, refresh tokens)
- Offer lifecycle (create, publish, join, leave, match, cancel, participant management)
- Contractor registration and profile management
- Building management with resident association
- AI chat with multi-agent orchestration (9 agents + router + human escalation)
- Admin dashboard with user/offer/contractor/payment management
- Audit logging (admin actions + agent actions)
- Security headers, rate limiting, input sanitization, PII redaction
- CI/CD with lint, type-check, security scan, tests, Docker build
- Database schema with 21 migrations including RLS and triggers

### Partially Implemented
- Payment system (code exists for Stripe but defaults to mock; no real money has flowed)
- Contractor verification (vetting agent + metadata table exists, but no real external verification source)
- Email notifications (email service exists with templates, but SMTP not configured/tested)
- WhatsApp notifications (bot code exists, but Business API not connected)
- Checkout flow (page exists, Stripe.js integration code present, but requires `NEXT_PUBLIC_STRIPE_KEY`)
- Buildings manager role (pages exist, but permissions are over-broad)
- Orders pages (exist but not wired to backend or navigation)
- data.gov.il enrichment (service exists, API URLs configurable, but not verified against real endpoints)

### Missing / Not Implemented
- Real Stripe payment processing end-to-end
- Mobile app production features (auth, real data, push notifications)
- Multi-device session management
- Admin analytics with real-time data (currently returns computed aggregates)
- Automated backup restoration testing
- Load testing / performance benchmarks
- Accessibility compliance (WCAG 2.1)
- Production deployment runbook with verified procedures

### Only Documented / Spec-Only
- Many items in `docs/PRODUCTION_READINESS_AUDIT.md` and similar docs are marked as "implemented" based on code existence, not runtime verification
- Multiple "readiness checklists" exist but conflate "code exists" with "feature works end-to-end"
- Mobile API alignment documented in `docs/MOBILE_API_ALIGNMENT.md` but mobile app doesn't use the documented endpoints

### Dangerous to Assume is Ready
1. **Payment processing** — mock provider silently succeeds; switching to Stripe has never been tested in a real environment
2. **Email delivery** — email service code is solid but SMTP configuration is placeholder
3. **Buildings manager permissions** — they have full admin access, which is almost certainly not intended
4. **Signup role validation** — any user can escalate to admin (CRITICAL)
5. **Production CSP** — will block legitimate API calls between frontend and backend
6. **Database financial precision** — Float arithmetic on money amounts will cause rounding errors at scale
