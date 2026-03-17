# Groupio Dev Branch Implementation Gap Report

**Branch:** `dev`
**Commit:** `7130b1b6b6960b797545670c6876277322c27160`
**Date:** 2026-03-17
**Auditor:** Principal Full-Stack Engineer / QA Automation Architect

---

## 1. Executive Summary

### Overall State
The Groupio dev branch is a **substantially built** multi-tenant marketplace platform with a Python/FastAPI backend, Next.js web app, Next.js admin panel, and Expo React Native mobile app. The core architecture is sound and most critical user flows are wired to real API endpoints.

### Biggest Strengths
- **Backend completeness:** 150+ API endpoints covering auth, offers, payments, contractors, buildings, escalations, admin, and agent orchestration
- **Real API wiring:** 100% of web app pages use real API calls (no mock-only pages)
- **Loading/error/empty states:** 95%+ of pages implement all three states
- **Backend test coverage:** 428 test functions across unit and integration tests
- **Multi-agent AI system:** 12 specialized agents with autonomy modes, audit logging, and orchestration
- **Payment infrastructure:** Stripe integration with escrow, VAT (18% Israeli), invoicing, and refund flows

### Biggest Missing Pages/Features
- **Admin web app is minimal:** Only 2 pages (dashboard redirect + buildings redirect) — the real admin is the separate `apps/admin` Next.js app
- **Notifications:** In-memory only (no backend persistence, no real push/email delivery)
- **i18n wiring:** 94.5% of web components, 100% of admin components, and ~60% of mobile screens are NOT wired to translation files
- **Leave offer flow:** Frontend calls `POST /offers/{id}/leave` but no such backend endpoint exists
- **Payment receipt endpoint:** Frontend references `GET /payments/{id}/receipt` — does not exist
- **Payment confirm endpoint:** Frontend references `POST /payments/{id}/confirm` — does not exist

### Biggest Broken Flows
- **Resident/Contractor layout role guards:** Neither layout validates the user's role — any authenticated user can access any role's routes (middleware partially guards, but layout-level enforcement is missing)
- **Login redirect for buildings_manager:** Login page does not explicitly redirect `buildings_manager` to `/buildings-manager/dashboard` (falls through to resident `/dashboard`)
- **Admin agents page:** Approve/reject decision handlers have TODO markers — not implemented
- **Contractor active offers:** View count is hardcoded mock data

### Biggest UI/UX Inconsistencies
- **Mixed language:** Most web components show hardcoded Hebrew text but are not wired to i18n, making locale switching non-functional
- **Admin app i18n:** Explicitly marked TODO — zero components use translations
- **Buildings-manager error page:** Hardcoded Hebrew, no i18n
- **Notification panel:** Time formatting hardcoded in Hebrew
- **Admin dashboard (web):** System Settings card is disabled/grayed out with no explanation

### Release Readiness Summary
| Level | Verdict |
|-------|---------|
| Internal Testing | **Ready with caveats** |
| Limited Pilot | **Not ready** — 5 P0 blockers |
| Broader Beta | **Not ready** — 12+ blockers |
| Public Launch | **Not ready** — 20+ blockers |

---

## 2. Repository Inventory

```typescript
const repoInventory: RepoInventory = {
  branch: "dev",
  commit: "7130b1b6b6960b797545670c6876277322c27160",
  apps: ["web", "admin", "mobile"],
  frontendApps: [
    "apps/web",      // Next.js 15 (React 19) — main web app, port 3000
    "apps/admin",    // Next.js 14 (React 18) — admin panel, port 3001
    "apps/mobile",   // Expo 51 (React Native 0.74) — mobile app
  ],
  backendPath: "src/",
  adminAppPath: "apps/admin/",
  mobileAppPath: "apps/mobile/",
  sharedPackages: [
    "packages/api-client",  // GroupioApiClient class, 30+ methods
    "packages/types",       // 40+ TypeScript types, 9 enums
    "packages/ui",          // 18 components, design tokens
    "packages/utils",       // Format, category/region translation helpers
  ],
  testsPath: [
    "tests/unit/",           // 73 Python test files
    "tests/integration/",    // 18 Python test files
    "apps/web/__tests__/",   // 12 React test files
    "apps/web/e2e/",         // 8 Playwright specs
    "apps/admin/__tests__/", // 8 React test files
    "apps/admin/e2e/",       // 2 Playwright specs
    "apps/mobile/__tests__/",// 3 React Native test files
  ],
  docsPath: [
    "design-system/",       // 11 markdown design docs
    "docs/",                 // Additional documentation
  ],
};
```

### Services & Workers
| Service | Path | Purpose |
|---------|------|---------|
| FastAPI Backend | `src/api/main.py` | Main API server |
| Agent Orchestrator | `src/orchestration/graph.py` | Multi-agent routing |
| 12 Specialized Agents | `src/agents/*.py` | Router, Matching, Vetting, Pricing, Payment, Outreach, Support, Analytics, Notification, Influencer, Architecture |
| Workers | `src/workers/` | Agent worker, offer lifecycle, scheduler |
| RAG Pipeline | `src/rag/` | Embeddings, chunking, reranking |

### Databases
| Database | Purpose |
|----------|---------|
| PostgreSQL/Supabase | Primary relational data |
| Redis | Caching, rate limiting, token storage |
| Qdrant | Vector search (contractors, offers, buildings) |
| Neo4j | Graph relationships (invites, influence, similarity) |

### Roles
- `resident` — Group purchasing participant
- `contractor` — Service provider
- `buildings_manager` — Building administrator
- `admin` — Platform administrator
- `super_admin` — Superuser

---

## 3. Full Route Inventory

### 3.1 Web App (`apps/web`)

#### Public Routes

| Route | File Path | Role | Nav? | Status | Notes |
|-------|-----------|------|------|--------|-------|
| `/` | `app/page.tsx` | public | Landing | Implemented | Hero, How It Works, Featured Offers, CTA |
| `/privacy` | `app/privacy/page.tsx` | public | Footer | Implemented | Static content |
| `/terms` | `app/terms/page.tsx` | public | Footer | Implemented | Static content |

#### Auth Routes

| Route | File Path | Role | Nav? | Status | Notes |
|-------|-----------|------|------|--------|-------|
| `/login` | `app/(auth)/login/page.tsx` | public | Yes | Implemented | Real API, role-based redirect |
| `/signup` | `app/(auth)/signup/page.tsx` | public | Yes | Implemented | Role selection (resident/contractor/buildings_manager) |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | public | Link | Implemented | Real API |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | public | Email | Implemented | Token-based reset |
| `/verify-email` | `app/(auth)/verify-email/page.tsx` | public | Email | Implemented | Token verification |
| `/resend-verification` | `app/(auth)/resend-verification/page.tsx` | public | Link | Implemented | Real API |
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | auth | Auto | Implemented | Post-signup profile completion |

#### Resident Routes

| Route | File Path | Role | Nav? | Status | Notes |
|-------|-----------|------|------|--------|-------|
| `/dashboard` | `app/(resident)/dashboard/page.tsx` | auth | Yes | Implemented | 3 API calls, skeleton loading |
| `/offers` | `app/(resident)/offers/page.tsx` | auth | Yes | Implemented | Filtering, search, pagination |
| `/offers/[offerId]` | `app/(resident)/offers/[offerId]/page.tsx` | auth | Drill | Implemented | Join offer, escrow badge, savings calc |
| `/orders` | `app/(resident)/orders/page.tsx` | auth | Yes | Implemented | Tabs, review rating, timeline |
| `/orders/[id]` | `app/(resident)/orders/[id]/page.tsx` | auth | Drill | Implemented | Work approval flow |
| `/contractors` | `app/(resident)/contractors/page.tsx` | auth | Yes | Implemented | Advanced filtering, trust scores |
| `/building` | `app/(resident)/building/page.tsx` | auth | Yes | Implemented | Building info, invite code sharing |
| `/building/join` | `app/(resident)/building/join/page.tsx` | auth | Link | Implemented | Code-based join |
| `/profile` | `app/(resident)/profile/page.tsx` | auth | Yes | Implemented | Multi-tab, avatar upload, account deletion |
| `/change-password` | `app/(resident)/change-password/page.tsx` | auth | Link | Implemented | Zod validation |
| `/chat` | `app/(resident)/chat/page.tsx` | auth | Yes | Implemented | AI assistant, history loading, escalation detection |
| `/checkout` | `app/(resident)/checkout/page.tsx` | auth | Flow | Implemented | Stripe integration, escrow messaging |
| `/payments` | `app/(resident)/payments/page.tsx` | auth | Yes | Implemented | Filter tabs, payment breakdown |
| `/architecture` | `app/(resident)/architecture/page.tsx` | auth | No | Implemented | Drag-drop upload, polling for analysis |

#### Contractor Routes

| Route | File Path | Role | Nav? | Status | Notes |
|-------|-----------|------|------|--------|-------|
| `/contractor/dashboard` | `app/contractor/dashboard/page.tsx` | contractor | Yes | Implemented | Stats, trust score, doc requests |
| `/contractor/offers/active` | `app/contractor/offers/active/page.tsx` | contractor | Yes | Implemented | Analytics panel; mock view count |
| `/contractor/offers/create` | `app/contractor/offers/create/page.tsx` | contractor | CTA | Implemented | Multi-step wizard, zod validation |
| `/contractor/projects` | `app/contractor/projects/page.tsx` | contractor | Yes | Implemented | Stats, timeline; "Request Review" disabled |
| `/contractor/projects/[id]` | `app/contractor/projects/[id]/page.tsx` | contractor | Drill | Implemented | Tier breakdown, timeline |
| `/contractor/profile` | `app/contractor/profile/page.tsx` | contractor | Yes | Implemented | Doc upload, vetting timeline; settings placeholder |

#### Admin Routes (Web App — Minimal)

| Route | File Path | Role | Nav? | Status | Notes |
|-------|-----------|------|------|--------|-------|
| `/admin/dashboard` | `app/admin/dashboard/page.tsx` | admin | Yes | Partial | Static cards, System Settings disabled |
| `/admin/buildings` | `app/admin/buildings/page.tsx` | admin | Link | Implemented | Redirect to `/buildings-manager/buildings` |

#### Buildings Manager Routes

| Route | File Path | Role | Nav? | Status | Notes |
|-------|-----------|------|------|--------|-------|
| `/buildings-manager/dashboard` | `app/buildings-manager/dashboard/page.tsx` | buildings_manager | Yes | Implemented | Real API, i18n wired |
| `/buildings-manager/buildings` | `app/buildings-manager/buildings/page.tsx` | buildings_manager | Yes | Implemented | Real API, filtering, i18n |
| `/buildings-manager/escalations` | `app/buildings-manager/escalations/page.tsx` | buildings_manager | Yes | Implemented | Real API, resolve mutation, i18n |

### 3.2 Admin App (`apps/admin`)

| Route | File Path | Role | Nav? | Status | Notes |
|-------|-----------|------|------|--------|-------|
| `/` | `app/page.tsx` | admin | — | Implemented | Redirect to `/dashboard` |
| `/login` | `app/login/page.tsx` | public | — | Implemented | Real API, role validation |
| `/dashboard` | `app/dashboard/page.tsx` | admin | Core | Implemented | 6+ API hooks; `pendingPayments=0` placeholder |
| `/agents` | `app/agents/page.tsx` | admin | Core | Partial | Real API but approve/reject NOT wired (TODO) |
| `/escalations` | `app/escalations/page.tsx` | admin | Core | Implemented | Real API, resolve mutation |
| `/payments` | `app/payments/page.tsx` | admin | Core | Hybrid | Defaults + Real API fallback; 3 TODOs |
| `/offers` | `app/offers/page.tsx` | admin | Data | Implemented | Real API, approve/cancel/flag/export |
| `/users` | `app/users/page.tsx` | admin | Data | Implemented | Real API, suspend/activate/create |
| `/contractors` | `app/contractors/page.tsx` | admin | Data | Implemented | Real API, verification, doc requests |
| `/analytics` | `app/analytics/page.tsx` | admin | Data | Hybrid | Real API with proxy fallback |
| `/settings` | `app/settings/page.tsx` | admin | Config | Hybrid | Default settings + Real API |
| `/settings/audit-logs` | `app/settings/audit-logs/page.tsx` | admin | Config | Implemented | Real API, pagination, CSV export |

### 3.3 Mobile App (`apps/mobile`)

| Route | File | Role | Status | Notes |
|-------|------|------|--------|-------|
| `/(auth)/login` | `app/(auth)/login.tsx` | public | Implemented | Real API |
| `/(auth)/signup` | `app/(auth)/signup.tsx` | public | Implemented | Role selection |
| `/(auth)/verify-email` | `app/(auth)/verify-email.tsx` | public | Implemented | Resend capability |
| `/(tabs)/index` | `app/(tabs)/index.tsx` | auth | Implemented | Dual-mode (resident/contractor) |
| `/(tabs)/offers` | `app/(tabs)/offers.tsx` | auth | Implemented | Marketplace |
| `/(tabs)/orders` | `app/(tabs)/orders.tsx` | auth | Implemented | Purchase history |
| `/(tabs)/chat` | `app/(tabs)/chat.tsx` | auth | Implemented | AI assistant |
| `/(tabs)/profile` | `app/(tabs)/profile.tsx` | auth | Implemented | Settings, language toggle |
| `/offer-detail` | `app/offer-detail.tsx` | auth | Implemented | Join action |
| `/order-detail` | `app/order-detail.tsx` | auth | Implemented | Order timeline |
| `/checkout` | `app/checkout.tsx` | auth | Implemented | Payment flow |
| `/create-offer` | `app/create-offer.tsx` | contractor | Implemented | Contractor quote |
| `/contractor-offers` | `app/contractor-offers.tsx` | contractor | Implemented | Submitted offers |
| `/contractor-projects` | `app/contractor-projects.tsx` | contractor | Implemented | Active projects |
| `/building` | `app/building.tsx` | auth | Implemented | Building info |
| `/payments` | `app/payments.tsx` | auth | Implemented | Payment history |

### 3.4 Orphan Routes & Navigation Gaps

| Issue | Details |
|-------|---------|
| `/architecture` not in sidebar | Page exists and works but is not linked in ResidentLayout navigation |
| `/change-password` not in sidebar | Accessible from profile page link only |
| `/checkout` not in sidebar | Flow-only page reached from offer detail |
| Admin web app minimal | Only 2 pages in `apps/web/admin/`; real admin at `apps/admin` (port 3001) |
| Mobile `/building` not in tabs | Accessible but not a tab; reached from home screen link |
| Mobile `/payments` not in tabs | Accessible but not a tab |

---

## 4. Page Implementation Findings

### 4.1 Web App — Resident Pages

| Route | Data Source | Loading | Error | Empty | Form Validation | Role Guard | Status | Root Issues |
|-------|-------------|---------|-------|-------|-----------------|------------|--------|-------------|
| `/dashboard` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | Layout doesn't check role |
| `/offers` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | — |
| `/offers/[id]` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | — |
| `/orders` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | TODO: Payment type duplication |
| `/orders/[id]` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | — |
| `/contractors` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | — |
| `/building` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | Settings fields read-only |
| `/building/join` | RealAPI | Present | Present | Present | Present | Missing | Implemented | — |
| `/profile` | RealAPI | Present | Present | N/A | Present | Missing | Implemented | Notifications tab disabled |
| `/change-password` | RealAPI | Present | Present | Present | Present | Missing | Implemented | — |
| `/chat` | RealAPI | Present | Present | N/A | N/A | Missing | Implemented | 30s hardcoded timeout |
| `/checkout` | Hybrid | Present | Present | N/A | Present | Missing | Implemented | Mock mode for dev |
| `/payments` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | — |
| `/architecture` | RealAPI | Present | Present | N/A | N/A | Missing | Implemented | Not in sidebar nav |

### 4.2 Web App — Contractor Pages

| Route | Data Source | Loading | Error | Empty | Form Validation | Role Guard | Status | Root Issues |
|-------|-------------|---------|-------|-------|-----------------|------------|--------|-------------|
| `/contractor/dashboard` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | Layout doesn't check role |
| `/contractor/offers/active` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | Mock view count |
| `/contractor/offers/create` | RealAPI | Present | Present | N/A | Present | Missing | Implemented | — |
| `/contractor/projects` | RealAPI | Present | Present | Present | N/A | Missing | Implemented | "Request Review" disabled |
| `/contractor/projects/[id]` | RealAPI | Present | Present | N/A | N/A | Missing | Implemented | — |
| `/contractor/profile` | RealAPI | Present | Present | N/A | Present | Missing | Implemented | Settings toggles placeholder |

### 4.3 Web App — Buildings Manager Pages

| Route | Data Source | Loading | Error | Empty | i18n | Role Guard | Status |
|-------|-------------|---------|-------|-------|------|------------|--------|
| `/buildings-manager/dashboard` | RealAPI | Present | Fallback | Present | Yes | Correct | Implemented |
| `/buildings-manager/buildings` | RealAPI | Present | Fallback | Present | Yes | Correct | Implemented |
| `/buildings-manager/escalations` | RealAPI | Present | Fallback | Present | Yes | Correct | Implemented |

### 4.4 Admin App Pages

| Route | Data Source | Loading | Error | Empty | i18n | Status | Root Issues |
|-------|-------------|---------|-------|-------|------|--------|-------------|
| `/dashboard` | RealAPI | Missing | Missing | Present | No | Partial | `pendingPayments=0` hardcoded |
| `/agents` | RealAPI | Missing | Missing | Present | No | Partial | Approve/reject NOT wired (TODO) |
| `/escalations` | RealAPI | Present | Present | Present | No | Implemented | — |
| `/payments` | Hybrid | Present | Present | Present | No | Partial | 3 TODOs; empty array fallbacks |
| `/offers` | RealAPI | Present | Present | Present | No | Implemented | Type mismatch documented |
| `/users` | RealAPI | Present | Present | Present | No | Implemented | Type mismatch documented |
| `/contractors` | RealAPI | Present | Present | Present | No | Implemented | — |
| `/analytics` | Hybrid | Present | Missing | Present | No | Implemented | Proxy fallback route |
| `/settings` | Hybrid | Present | Present | N/A | No | Implemented | Hardcoded defaults |
| `/settings/audit-logs` | RealAPI | Present | Present | Present | No | Implemented | — |

---

## 5. Navigation / Redirect / Role Routing Findings

### 5.1 Role-to-Route Defaults

| Role | Expected Default | Actual Default (Login) | Actual Default (Signup) | Status |
|------|-----------------|----------------------|------------------------|--------|
| `resident` | `/dashboard` | `/dashboard` | `/dashboard` | Correct |
| `contractor` | `/contractor/dashboard` | `/contractor/dashboard` | `/contractor/dashboard` | Correct |
| `buildings_manager` | `/buildings-manager/dashboard` | `/dashboard` (WRONG) | `/buildings-manager/dashboard` | **Incorrect on Login** |
| `admin` | `/admin/dashboard` | `/admin/dashboard` | N/A | Correct |
| `super_admin` | `/admin/dashboard` | `/admin/dashboard` | N/A | Correct |

### 5.2 Role Guard Matrix

| Component | Auth Check | Role Validation | Correct? |
|-----------|-----------|----------------|----------|
| `middleware.ts` | refresh_token cookie | contractor/admin/buildings_manager guarded | **Partial** — resident routes NOT role-gated |
| `(resident)/layout.tsx` | token + isAuthenticated | **NONE** | **NO** — any role can access |
| `contractor/layout.tsx` | token + isAuthenticated | **NONE** | **NO** — any role can access |
| `admin/layout.tsx` | token + user role | admin/super_admin required | **YES** |
| `buildings-manager/layout.tsx` | token + user role | buildings_manager/admin/super_admin | **YES** |
| `admin app middleware.ts` | refresh_token + admin_role_verified | admin/super_admin/buildings_manager | **YES** |

### 5.3 Security Risks

1. **Resident layout accepts all authenticated users** — A contractor can navigate to `/dashboard`, `/offers`, `/orders` and see resident-specific UI
2. **Contractor layout accepts all authenticated users** — A resident can navigate to `/contractor/dashboard` and see contractor UI
3. **Middleware guards contractor/admin/BM routes but NOT resident routes** — Resident routes are open to all authenticated users
4. **Login page missing buildings_manager redirect** — Buildings managers logging in land on `/dashboard` instead of `/buildings-manager/dashboard`

---

## 6. Frontend ↔ Backend Integration Findings

### 6.1 Aligned Endpoints (Confirmed Working)

| Feature | Frontend Call | Backend Route | Status |
|---------|-------------|--------------|--------|
| Login | `POST /api/v1/auth/login/json` | `src/api/routes/auth.py` | **Aligned** |
| Signup | `POST /api/v1/auth/signup` | `src/api/routes/auth.py` | **Aligned** |
| Verify Email | `POST /api/v1/auth/verify-email/{token}` | `src/api/routes/auth.py` | **Aligned** |
| Resend Verification | `POST /api/v1/auth/resend-verification` | `src/api/routes/auth.py` | **Aligned** |
| Forgot Password | `POST /api/v1/auth/password/reset` | `src/api/routes/auth.py` | **Aligned** |
| Reset Password | `POST /api/v1/auth/password/reset/confirm` | `src/api/routes/auth.py` | **Aligned** |
| Change Password | `POST /api/v1/auth/password/change` | `src/api/routes/auth.py` | **Aligned** |
| Get Profile | `GET /api/v1/auth/me` | `src/api/routes/auth.py` | **Aligned** |
| Update Profile | `PUT /api/v1/auth/me` | `src/api/routes/auth.py` | **Aligned** |
| Delete Account | `DELETE /api/v1/auth/me` | `src/api/routes/auth.py` | **Aligned** |
| List Offers | `GET /api/v1/offers` | `src/api/routes/offers.py` | **Aligned** |
| Get Offer | `GET /api/v1/offers/{id}` | `src/api/routes/offers.py` | **Aligned** |
| Create Offer | `POST /api/v1/offers` | `src/api/routes/offers.py` | **Aligned** |
| Join Offer | `POST /api/v1/offers/{id}/join` | `src/api/routes/offers.py` | **Aligned** |
| Delete Offer | `DELETE /api/v1/offers/{id}` | `src/api/routes/offers.py` | **Aligned** |
| List Contractors | `GET /api/v1/contractors` | `src/api/routes/contractors.py` | **Aligned** |
| Get Contractor | `GET /api/v1/contractors/{id}` | `src/api/routes/contractors.py` | **Aligned** |
| Add Review | `POST /api/v1/contractors/{id}/reviews` | `src/api/routes/contractors.py` | **Aligned** |
| Search Contractors | `POST /api/v1/contractors/search` | `src/api/routes/contractors.py` | **Aligned** |
| Doc Requests | `GET /api/v1/contractors/me/doc-requests` | `src/api/routes/contractors.py` | **Aligned** |
| My Building | `GET /api/v1/buildings/me` | `src/api/routes/buildings.py` | **Aligned** |
| Join Building | `POST /api/v1/buildings/join` | `src/api/routes/buildings.py` | **Aligned** |
| My Payments | `GET /api/v1/payments/my` | `src/api/routes/payments.py` | **Aligned** |
| Initiate Payment | `POST /api/v1/payments/initiate` | `src/api/routes/payments.py` | **Aligned** |
| Get Payment | `GET /api/v1/payments/{id}` | `src/api/routes/payments.py` | **Aligned** |
| Approve Work | `POST /api/v1/payments/{id}/approve-work` | `src/api/routes/payments.py` | **Aligned** |
| Request Refund | `POST /api/v1/payments/{id}/refund` | `src/api/routes/payments.py` | **Aligned** |
| My Invoices | `GET /api/v1/payments/invoices/my` | `src/api/routes/payments.py` | **Aligned** |
| Get Invoice | `GET /api/v1/payments/invoices/{id}` | `src/api/routes/payments.py` | **Aligned** |
| Upload Architecture | `POST /api/v1/uploads/architecture` | `src/api/routes/uploads.py` | **Aligned** |
| Upload Contractor Docs | `POST /api/v1/uploads/contractor-docs` | `src/api/routes/uploads.py` | **Aligned** |
| Upload Avatar | `POST /api/v1/uploads/avatar` | `src/api/routes/uploads.py` | **Aligned** |
| Get Upload | `GET /api/v1/uploads/{id}` | `src/api/routes/uploads.py` | **Aligned** |
| Send Message | `POST /api/v1/message` | `src/api/main.py` | **Aligned** |
| Chat History | `GET /api/v1/conversations/{userId}/messages` | `src/api/routes/conversations.py` | **Aligned** |
| Onboarding | `POST /api/v1/onboarding` | `src/api/routes/onboarding.py` | **Aligned** |
| Admin Analytics | `GET /api/v1/admin/analytics` | `src/api/routes/admin.py` | **Aligned** |
| Admin Users | `GET /api/v1/admin/users` | `src/api/routes/admin.py` | **Aligned** |
| Admin Offers | `GET /api/v1/admin/offers` | `src/api/routes/admin.py` | **Aligned** |
| Admin Settings | `GET/PUT /api/v1/admin/settings` | `src/api/routes/admin.py` | **Aligned** |
| Admin Audit Logs | `GET /api/v1/admin/audit-logs` | `src/api/routes/admin.py` | **Aligned** |

### 6.2 Missing Endpoints

| Feature | Frontend Call | Expected Backend | Status | Impact |
|---------|-------------|-----------------|--------|--------|
| Leave Offer | `POST /api/v1/offers/{id}/leave` | No endpoint | **MissingEndpoint** | Resident cannot leave an offer after joining |
| Payment Receipt | `GET /api/v1/payments/{id}/receipt` | No endpoint | **MissingEndpoint** | No receipt download; invoices exist as workaround |
| Payment Confirm | `POST /api/v1/payments/{id}/confirm` | No endpoint | **MissingEndpoint** | Stripe webhook may handle this; unclear |
| Escrow Status | `GET /api/v1/payments/escrow-status` | Exists | **Aligned** | OK |

### 6.3 Type Mismatches (Documented in Code)

| Area | Evidence | Severity |
|------|----------|----------|
| Orders page Payment type | `TODO: Payment duplicates @groupio/types Payment` — `apps/web/app/(resident)/orders/page.tsx:27` | Low |
| Admin offers type | `TODO: Offer shape here differs from @groupio/types Offer` — `apps/admin/app/offers/page.tsx:34` | Low |
| Admin users type | `TODO: User duplicates admin API response shape` — `apps/admin/app/users/page.tsx:34` | Low |
| Admin payments types | `TODO: PaymentSummary, ContractorPayout, EscrowAccount... duplicate @groupio/types` — `apps/admin/app/payments/page.tsx:23` | Low |
| Contractor trust_score | `Backend trust_score_breakdown shape (snake_case from API)` — `apps/admin/app/contractors/page.tsx:108` | Low |

---

## 7. Feature Coverage Matrix

| Feature | Role | Status | Evidence | Blockers |
|---------|------|--------|----------|----------|
| **Authentication** | | | | |
| Email/password login | cross-role | Implemented | `POST /auth/login/json` wired end-to-end | — |
| Signup with role selection | cross-role | Implemented | resident/contractor/buildings_manager roles | — |
| Email verification | cross-role | Implemented | Token-based verify + resend | — |
| Password reset | cross-role | Implemented | Reset request + confirm endpoints | — |
| Password change | cross-role | Implemented | Requires current password | — |
| Account deletion (GDPR) | cross-role | Implemented | `DELETE /auth/me` with confirmation dialog | — |
| Token refresh | cross-role | Implemented | HTTP-only cookie, auto-refresh on 401 | — |
| **Onboarding** | | | | |
| Post-signup profile | resident/contractor | Implemented | `/onboarding` page + `POST /onboarding` | — |
| **Resident Flows** | | | | |
| Browse offers | resident | Implemented | Filter, search, pagination all working | — |
| View offer details | resident | Implemented | Pricing tiers, escrow badge, savings calc | — |
| Join offer | resident | Implemented | Modal confirmation, real API | — |
| Leave offer | resident | **MissingBackend** | Frontend calls `/offers/{id}/leave`; no backend | Backend endpoint needed |
| View orders | resident | Implemented | Tabs, timeline, inline review | — |
| View order detail | resident | Implemented | Work approval flow | — |
| Browse contractors | resident | Implemented | Advanced filtering, trust scores | — |
| Building management | resident | Implemented | Info display, invite code sharing | — |
| Join building | resident | Implemented | Code-based join form | — |
| Profile management | resident | Implemented | Multi-tab, avatar upload | — |
| AI chat | resident | Implemented | Real API, history, escalation detection | 30s hardcoded timeout |
| Checkout/payment | resident | Implemented | Stripe integration, escrow messaging | — |
| Payment history | resident | Implemented | Filter tabs, breakdown display | — |
| Architecture upload | resident | Implemented | Drag-drop, AI analysis polling | Not in sidebar nav |
| Notifications | resident | **MockOnly** | In-memory store only, no backend sync | Backend persistence needed |
| **Contractor Flows** | | | | |
| Contractor dashboard | contractor | Implemented | Stats, trust score, doc request alerts | — |
| Active offers | contractor | Implemented | Analytics panel, participants list | Mock view count |
| Create offer | contractor | Implemented | Multi-step wizard, zod validation, preview | — |
| Projects list | contractor | Implemented | Stats, timeline, milestones | "Request Review" disabled |
| Project detail | contractor | Implemented | Tier breakdown, timeline | — |
| Profile + doc upload | contractor | Implemented | Vetting timeline, trust score | Settings toggles placeholder |
| **Buildings Manager Flows** | | | | |
| BM dashboard | buildings_manager | Implemented | Real API, i18n, skeleton loading | — |
| Buildings list | buildings_manager | Implemented | Real API, filtering, region sort | — |
| Escalations | buildings_manager | Implemented | Real API, resolve mutation | Hardcoded resolution note |
| **Admin Flows** | | | | |
| Admin dashboard | admin | Partial | Real API hooks; no loading/error states rendered | `pendingPayments=0` hardcoded |
| AI agents management | admin | **Partial** | Real API; approve/reject decisions NOT wired | TODO markers |
| Escalations management | admin | Implemented | Real API, resolve mutation | — |
| Payments management | admin | Partial | Hybrid (defaults + API); 3 TODOs | Platform fee % not from settings |
| Offers management | admin | Implemented | Approve/cancel/flag/export | — |
| Users management | admin | Implemented | Suspend/activate/create | — |
| Contractors management | admin | Implemented | Verification, doc requests | — |
| Analytics | admin | Implemented | Real API with proxy fallback | No error state |
| Settings | admin | Implemented | Default settings + API persistence | — |
| Audit logs | admin | Implemented | Pagination, filtering, CSV export | — |
| **Cross-Role** | | | | |
| i18n (web) | cross-role | **Partial** | 8/146 components wired (5.5%) | 94.5% hardcoded |
| i18n (admin app) | admin | **Missing** | TODO marker; 0/40 components wired | 100% hardcoded English |
| i18n (mobile) | cross-role | **Partial** | ~30-40% screens wired | ~60% hardcoded |
| RTL support | cross-role | Partial | Layout/direction set to RTL; some components tested | Limited RTL-specific testing |
| Real-time offers | resident | Implemented | WebSocket subscription with auto-reconnect | — |
| Push notifications | cross-role | **Partial** | Mobile registration exists; backend FCM exists | No web push; delivery not verified |

---

## 8. Missing Pages and Missing Features

### 8.1 Critical Missing Items

| Type | Name | Expected From | Current Evidence | Severity | Recommended Action |
|------|------|--------------|-----------------|----------|-------------------|
| BackendEndpoint | Leave Offer (`POST /offers/{id}/leave`) | Frontend code in offerStore.ts | `leaveOffer()` calls endpoint that doesn't exist | **Critical** | Add backend endpoint |
| RoleGuard | Resident layout role check | Security requirement | `(resident)/layout.tsx` accepts all authenticated users | **Critical** | Add `user.role` check |
| RoleGuard | Contractor layout role check | Security requirement | `contractor/layout.tsx` accepts all authenticated users | **Critical** | Add `user.role` check |
| Flow | Login redirect for buildings_manager | Flow completeness | Login page doesn't handle BM role explicitly | **High** | Use `getDefaultRouteForRole()` |

### 8.2 High-Priority Missing Items

| Type | Name | Expected From | Current Evidence | Severity | Recommended Action |
|------|------|--------------|-----------------|----------|-------------------|
| Feature | Notification backend persistence | Common requirement | NotificationPanel uses in-memory store only | **High** | Add notification backend |
| Feature | Admin agent decision approval | Code usage | `handleApproveDecision` / `handleRejectDecision` have TODO markers | **High** | Wire to escalation API |
| Translation | Admin app i18n wiring | i18n requirement | Explicit TODO in layout.tsx; 0 components use translations | **High** | Wire next-intl to all admin components |
| Translation | Web app i18n wiring | i18n requirement | Only 8/146 components use useTranslations | **High** | Wire remaining 138 components |
| StateHandling | Admin dashboard loading state | UX requirement | No spinner/skeleton while data loads | **High** | Add loading skeleton |
| StateHandling | Admin dashboard error state | UX requirement | Error variables tracked but not rendered | **High** | Add error UI |

### 8.3 Medium-Priority Missing Items

| Type | Name | Expected From | Current Evidence | Severity | Recommended Action |
|------|------|--------------|-----------------|----------|-------------------|
| BackendEndpoint | Payment receipt | Frontend reference | `GET /payments/{id}/receipt` not found | **Medium** | Add or clarify invoice serves this purpose |
| BackendEndpoint | Payment confirm | Frontend reference | `POST /payments/{id}/confirm` not found | **Medium** | Clarify if Stripe webhook handles this |
| Feature | Contractor "Request Review" | UI button exists | Button disabled with "בקרוב" (coming soon) | **Medium** | Implement or remove |
| Feature | Profile notifications tab | UI exists | All toggles disabled with "בקרוב" | **Medium** | Implement or remove |
| Feature | Contractor settings toggles | UI exists | Placeholder section, non-functional | **Medium** | Implement or remove |
| Page | Admin web app pages | Navigation | Only 2 pages; real admin is separate app at port 3001 | **Medium** | Document architecture clearly |
| Feature | Streaming chat response | Code comment | Currently receives full response, not streaming | **Medium** | Implement SSE streaming |
| Feature | Social auth (Google/Facebook/Apple) | UI package has SocialAuthButtons component | Not wired in any auth page | **Medium** | Wire or remove from package |
| Navigation | Architecture page in sidebar | Page exists at `/architecture` | Not linked in ResidentLayout nav | **Medium** | Add to sidebar or document |

### 8.4 Low-Priority Missing Items

| Type | Name | Expected From | Current Evidence | Severity | Recommended Action |
|------|------|--------------|-----------------|----------|-------------------|
| Translation | Mobile i18n completeness | i18n requirement | ~60% of screens not using i18n.t() | **Low** | Complete mobile i18n wiring |
| Translation | Buildings-manager error.tsx i18n | Consistency | Hardcoded Hebrew, no translation keys | **Low** | Wire to i18n |
| Translation | NotificationPanel time formatting | Consistency | Hardcoded Hebrew time strings | **Low** | Use i18n |
| Feature | Admin payments platform fee from settings | Code TODO | `TODO(5.10): Move platform fee % to admin settings page` | **Low** | Implement in settings |
| Feature | Mock view count on contractor offers | Data accuracy | Hardcoded view count value | **Low** | Wire to real analytics |
| StateHandling | Admin analytics error state | UX requirement | No error rendered despite API call | **Low** | Add error UI |

---

## 9. UI/UX and Design Consistency Findings

| Area | Visual Consistency | Hierarchy Clarity | Navigation Clarity | Role Consistency | i18n Readiness | Major Problems |
|------|-------------------|-------------------|-------------------|-----------------|----------------|----------------|
| Landing Page | Strong | Strong | Strong | N/A | Weak | Hardcoded Hebrew, not wired to i18n |
| Auth Pages | Strong | Strong | Strong | Strong | Weak | Auth pages have consistent layout; not i18n-wired |
| Resident Dashboard | Strong | Strong | Strong | Weak | Weak | Any role can access; hardcoded text |
| Resident Sidebar | Strong | Strong | Strong | Weak | Partial | Missing `/architecture` link |
| Contractor Dashboard | Strong | Strong | Strong | Weak | Weak | Any role can access |
| Contractor Sidebar | Strong | Strong | Strong | Weak | Weak | Clean with CTA button |
| BM Dashboard | Strong | Strong | Strong | Strong | Strong | Properly i18n-wired |
| BM Sidebar | Strong | Strong | Strong | Strong | Strong | — |
| Admin (web) Dashboard | Partial | Weak | Weak | Strong | Partial | Only 2 cards; System Settings disabled |
| Admin App Dashboard | Strong | Strong | Strong | Strong | Weak | No loading/error states; no i18n |
| Admin App Sidebar | Strong | Strong | Strong | Strong | Weak | 10 nav items, well-organized in 3 sections |
| Offer Cards | Strong | Strong | N/A | N/A | Weak | Consistent design across pages |
| Payment Pages | Strong | Strong | N/A | N/A | Weak | Proper escrow explanations |
| Forms | Strong | Strong | N/A | N/A | Weak | Consistent zod validation |
| Modals | Strong | Strong | N/A | N/A | Weak | Consistent confirmation patterns |
| Error States | Partial | Strong | N/A | N/A | Weak | Some pages missing error UI (admin dashboard/agents) |
| Loading States | Strong | Strong | N/A | N/A | N/A | Skeleton loaders used consistently |
| Empty States | Strong | Strong | N/A | N/A | Partial | Good empty state messages |
| Mobile App | Strong | Strong | Strong | Partial | Partial | Material Design 3 consistent; partial i18n |

### Key UI/UX Issues
1. **Language toggle is non-functional for most pages** — Switching locale won't change UI text on 94.5% of web pages
2. **Admin web app feels incomplete** — 2 pages with one disabled; users may be confused about where admin features are
3. **No visual indicator of role mismatch** — If a contractor visits `/dashboard`, they see resident UI with no warning
4. **Buildings-manager error page hardcoded Hebrew** — Will not adapt to English locale
5. **Disabled features without explanation** — Notification toggles and "Request Review" button show "בקרוב" but no timeline

---

## 10. Test Coverage Findings

### 10.1 Backend Tests: STRONG

| Area | Test Type | Coverage | Important Gaps |
|------|-----------|----------|----------------|
| Authentication/Security | Unit + Integration | Strong | Rate limiting, PII redaction, RBAC well-tested |
| API Routes (all 14 route files) | Unit + Integration | Strong | All major routes have test classes |
| Payment System | Unit + Integration | Strong | VAT, escrow, providers, invoice generation |
| Agent System (12 agents) | Unit | Strong | All agents tested; orchestration covered |
| Database Clients | Unit | Strong | PostgreSQL, Redis, Qdrant, Neo4j |
| RAG Pipeline | Unit | Partial | Chunking/reranking tested; pipeline has 2 tests |
| Validators/Utils | Unit | Strong | 18 validator tests, Hebrew utils, PII |
| E2E Flows | Integration | Strong | Complete user flows, viral mechanics, security hardening |

### 10.2 Frontend Tests: MODERATE

| Area | Test Type | Coverage | Important Gaps |
|------|-----------|----------|----------------|
| Web Components | Unit (Vitest) | Partial | 12 test files; mostly happy paths |
| Web E2E | Playwright | Good | 8 spec files, ~70 scenarios |
| Admin Components | Unit (Vitest) | Good | 8 test files covering all major pages |
| Admin E2E | Playwright | Good | 2 spec files, 22 scenarios |
| Mobile Components | Unit (Vitest) | Weak | 3 test files only (CategoryChip, MobileOfferCard, StatCard) |
| i18n Validation | E2E | Weak | Only 2 E2E suites test i18n; no unit-level i18n tests |
| RTL Testing | E2E | Weak | 1 spec file (5 tests) for web RTL only |
| Role Routing Tests | Unit + E2E | Partial | Layout tests exist but don't verify role enforcement |

### 10.3 Missing Test Categories

| Category | Status | Why Important |
|----------|--------|---------------|
| Translation key parity (en/he) | Missing | Missing keys crash production |
| Admin i18n wiring | Missing | Admin is 100% untranslated |
| Mobile screen i18n | Missing | ~60% screens untranslated |
| Role-based route protection | Weak | Resident/contractor layouts don't validate role |
| Leave offer flow | Missing | Frontend calls non-existent endpoint |
| Payment receipt/confirm | Missing | Endpoints may not exist |
| WebSocket reconnection | Missing | Auto-reconnect not integration-tested |
| Push notification delivery | Missing | FCM integration not E2E tested |

---

## 11. Release Readiness Verdict

### Internal Testing Only
**Verdict: READY WITH CAVEATS**

**Blockers:** None
**Caveats:**
- Role guard gaps allow cross-role access (acceptable for internal testing with known users)
- Leave offer endpoint missing (document as known issue)
- i18n non-functional for most pages (test in Hebrew-only mode)

---

### Limited Pilot
**Verdict: NOT READY — 5 P0 Blockers**

**Blockers:**
1. Resident layout has no role guard — pilot users with contractor accounts can see resident UI
2. Contractor layout has no role guard — same issue
3. Login redirect wrong for buildings_manager role
4. Leave offer endpoint missing — users who join cannot leave
5. Notifications are in-memory only — users won't see notifications after page refresh

**Major Risks:**
- i18n locale switching is broken for most pages
- Admin agent decisions can't be approved/rejected
- Payment receipt endpoint missing

**Must Fix First:**
- Add role validation to resident and contractor layouts
- Add `POST /offers/{id}/leave` backend endpoint
- Fix login redirect for buildings_manager
- Add notification persistence (at minimum, localStorage)

---

### Broader Beta
**Verdict: NOT READY — 12+ Blockers**

All pilot blockers plus:
6. i18n must work for locale switching (at least core pages)
7. Admin agent approve/reject must be wired
8. Admin dashboard needs loading and error states
9. Notification system needs backend persistence
10. Push notifications need E2E verification
11. Payment receipt/confirm endpoints need resolution
12. Profile notifications tab needs implementation or removal
13. Contractor "Request Review" needs implementation or removal
14. Architecture page needs sidebar link or intentional omission documented

---

### Public Launch
**Verdict: NOT READY — 20+ Blockers**

All beta blockers plus:
15. Full i18n wiring for all web components (146 components)
16. Full i18n wiring for admin app (40 components)
17. Full i18n wiring for mobile app (all screens)
18. RTL testing for admin and mobile
19. Social auth integration (or remove SocialAuthButtons from package)
20. Streaming chat implementation
21. Translation key parity tests
22. Mobile E2E test suite
23. Role-based route protection tests
24. Performance testing under load
25. Security audit (rate limiting, CORS, CSP validation)

---

## 12. Priority Fix List

### P0 — Critical (Must fix before any external user access)

| # | Title | Category | Files/Routes | Why Broken | User Impact | Fix Direction |
|---|-------|----------|-------------|------------|-------------|---------------|
| 1 | **Resident layout missing role guard** | RoleGuard | `apps/web/app/(resident)/layout.tsx` | No `user.role` check; accepts any authenticated user | Contractors/admins see resident UI, data leakage risk | Add role check: `if (user.role !== 'resident' && !['admin','super_admin'].includes(user.role))` redirect |
| 2 | **Contractor layout missing role guard** | RoleGuard | `apps/web/app/contractor/layout.tsx` | No `user.role` check; accepts any authenticated user | Residents see contractor UI, potential data access | Add role check: `if (user.role !== 'contractor')` redirect |
| 3 | **Leave offer endpoint missing** | BackendEndpoint | `src/api/routes/offers.py` + `apps/web/lib/stores/offerStore.ts` | Frontend calls `POST /offers/{id}/leave`; no backend route | Users who join an offer CANNOT leave | Add `POST /offers/{id}/leave` endpoint in offers.py |
| 4 | **Login redirect wrong for buildings_manager** | Flow | `apps/web/app/(auth)/login/page.tsx` | Login doesn't explicitly handle `buildings_manager` role | BM users land on resident dashboard after login | Use `getDefaultRouteForRole(user.role)` in login redirect |
| 5 | **Notifications in-memory only** | Feature | `apps/web/components/shared/NotificationPanel.tsx` | Uses Zustand in-memory store; no backend persistence | Notifications lost on page refresh; no cross-device | Add notification API endpoints + persistence |

### P1 — High (Must fix before pilot/beta)

| # | Title | Category | Files/Routes | Why Broken | User Impact | Fix Direction |
|---|-------|----------|-------------|------------|-------------|---------------|
| 6 | **Admin agents approve/reject not wired** | Feature | `apps/admin/app/agents/page.tsx` | TODO markers; handlers not implemented | Admin cannot approve/reject agent decisions | Wire to `/escalations/{id}/resolve` or new endpoint |
| 7 | **Admin dashboard missing loading/error states** | StateHandling | `apps/admin/app/dashboard/page.tsx` | Uses 6+ API hooks but never shows loading or error UI | Dashboard appears blank or broken during loading | Add skeleton loading and error alert components |
| 8 | **Admin i18n not wired** | Translation | `apps/admin/app/layout.tsx` + all 40 components | Explicit TODO; 0 components use translations | Admin app cannot switch to Hebrew | Wire next-intl; expand message files from 13 to 150+ keys |
| 9 | **Web i18n only 5.5% wired** | Translation | 138 of 146 web components | Components use hardcoded text, not `useTranslations()` | Locale toggle does nothing on most pages | Incrementally wire components starting with high-traffic pages |
| 10 | **Admin pendingPayments hardcoded** | Feature | `apps/admin/app/dashboard/page.tsx:145` | `const pendingPayments = 0; // placeholder` | Admin dashboard always shows 0 pending payments | Wire to payments API hook |
| 11 | **Middleware doesn't gate resident routes** | RoleGuard | `apps/web/middleware.ts` | `/dashboard`, `/offers`, `/orders` etc. not role-gated | Combined with P0 #1, any role accesses resident routes | Add resident-route role check in middleware |

### P2 — Medium (Should fix before broader beta)

| # | Title | Category | Files/Routes | Why Broken | User Impact | Fix Direction |
|---|-------|----------|-------------|------------|-------------|---------------|
| 12 | **Payment receipt endpoint** | BackendEndpoint | Frontend references `GET /payments/{id}/receipt` | Endpoint not found in backend | Users cannot download payment receipts | Add endpoint or document that invoices serve this purpose |
| 13 | **Payment confirm endpoint** | BackendEndpoint | Frontend references `POST /payments/{id}/confirm` | Endpoint not found in backend | Unclear if Stripe webhook handles confirmation | Verify Stripe webhook flow; add if needed |
| 14 | **Profile notifications disabled** | Feature | `apps/web/app/(resident)/profile/page.tsx` | All toggles disabled with "(בקרוב)" | Users cannot configure notifications | Implement notification preferences or remove tab |
| 15 | **Contractor "Request Review" disabled** | Feature | `apps/web/app/contractor/projects/page.tsx` | Button disabled with "בקרוב" title | Contractors cannot request reviews | Implement or remove |
| 16 | **Contractor settings placeholder** | Feature | `apps/web/app/contractor/profile/page.tsx` | Settings section toggles non-functional | Contractor settings do nothing | Implement or remove |
| 17 | **Architecture page not in nav** | Navigation | `apps/web/components/layouts/ResidentLayout.tsx` | `/architecture` route exists but not in sidebar | Users cannot discover architecture upload feature | Add to sidebar nav or document as intentional |
| 18 | **Admin analytics missing error state** | StateHandling | `apps/admin/app/analytics/page.tsx` | No error UI despite real API call | Analytics page fails silently | Add error alert |
| 19 | **Mobile i18n ~60% unwired** | Translation | `apps/mobile/` screens | Many screens don't use `i18n.t()` | Mobile users see mixed language UI | Wire remaining screens |
| 20 | **Chat streaming not implemented** | Feature | `apps/web/components/features/chat/AIChat.tsx` | Receives full response, not streaming | Slower perceived response time | Implement SSE streaming |
| 21 | **Social auth buttons exist but unused** | Feature | `packages/ui/src/components/SocialAuthButtons.tsx` | UI component exists; not wired in any auth page | Dead code; user confusion if shown | Wire Google/Facebook/Apple auth or remove component |

### P3 — Low (Nice to have before public launch)

| # | Title | Category | Files/Routes | Why Broken | User Impact | Fix Direction |
|---|-------|----------|-------------|------------|-------------|---------------|
| 22 | **Mock view count on contractor offers** | Feature | `apps/web/app/contractor/offers/active/page.tsx:59` | Hardcoded view count value | Misleading analytics data | Wire to real view count endpoint |
| 23 | **Buildings-manager error.tsx hardcoded Hebrew** | Translation | `apps/web/app/buildings-manager/error.tsx` | Hardcoded Hebrew, not using i18n | English users see Hebrew error page | Wire to i18n |
| 24 | **NotificationPanel hardcoded time format** | Translation | `apps/web/components/shared/NotificationPanel.tsx` | `formatTime()` has hardcoded Hebrew strings | Doesn't adapt to English locale | Use i18n time formatting |
| 25 | **Admin payments TODOs** | Feature | `apps/admin/app/payments/page.tsx` | 3 TODO comments for platform fee settings | Platform fee % hardcoded, not from settings | Move to admin settings |
| 26 | **Hardcoded escalation resolution note** | Feature | `apps/web/app/buildings-manager/escalations/page.tsx:94` | Resolution note is "Resolved by buildings manager" | Not user-configurable | Add resolution note input |
| 27 | **Type mismatches between frontend and @groupio/types** | TypeSafety | Multiple admin app pages | 5 documented TODO comments about type divergence | Maintenance burden; potential runtime errors | Align types or create admin-specific types |
| 28 | **Translation key parity test** | Testing | No test file | No automated test verifying en.json/he.json key parity | Missing keys crash production in one locale | Add automated parity check |
| 29 | **Mobile E2E test suite** | Testing | `apps/mobile/` | Only 3 unit tests; no E2E | Mobile regressions go undetected | Add Detox or Maestro E2E tests |
| 30 | **Chat hardcoded 30s timeout** | Feature | `apps/web/components/features/chat/AIChat.tsx` | Hard timeout, not configurable | Complex queries may timeout prematurely | Make configurable via env var |

---

*Report generated from code analysis of dev branch commit `7130b1b`. All findings are evidence-based and tied to specific file paths. "Not Verifiable" is used where runtime behavior cannot be confirmed from static analysis alone.*
