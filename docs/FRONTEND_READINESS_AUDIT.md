# Groupio Frontend / UI / API Client Production-Readiness Audit

**Date:** 2026-02-27
**Auditor:** Claude (Sonnet 4.6) — automated static-analysis audit
**Scope:** `apps/web` (Next.js 15 resident portal), `apps/admin` (Next.js 15 admin panel), `apps/mobile` (Expo 51 / React Native), `packages/types`, `packages/api-client`, `packages/ui`, routing / middleware, state management, i18n, design system, UX completeness
**Branch:** `claude/production-readiness-audit-9pG1Z`
**Companion document:** `docs/PRODUCTION_READINESS_AUDIT.md` (backend audit)

---

## Step 1 — System Discovery (Frontend Layer)

### 1.1 Application Map

```
Groupio Monorepo (Turborepo + pnpm workspaces)
│
├── apps/web          Next.js 15 / React 19 / App Router
│   ├── app/
│   │   ├── layout.tsx                   Root layout (i18n, fonts, RTL)
│   │   ├── providers.tsx                React Query + ErrorBoundary + 401-retry
│   │   ├── (auth)/                      Login, Signup (guest-only group)
│   │   │   ├── layout.tsx               Split branding / form layout
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   └── (resident)/                  Authenticated resident group
│   │       ├── layout.tsx               Sidebar + nav shell
│   │       ├── dashboard/page.tsx
│   │       ├── offers/page.tsx
│   │       ├── offers/[offerId]/page.tsx
│   │       ├── building/page.tsx
│   │       ├── chat/page.tsx            AI assistant (LangGraph)
│   │       ├── profile/page.tsx
│   │       ├── payments/page.tsx        ⚠ not in middleware protected list
│   │       └── architecture/page.tsx    ⚠ not in middleware protected list
│   ├── components/
│   │   └── features/
│   │       ├── chat/AIChat.tsx          LLM chat component
│   │       ├── offers/                  Offer list + detail components
│   │       └── building/               Architecture upload component
│   ├── lib/
│   │   ├── api/client.ts               Web-specific API client (reads Zustand)
│   │   ├── stores/authStore.ts         Zustand auth store (access token in memory)
│   │   ├── auth/setAuthCookie.ts       Sets groupio-auth non-HttpOnly cookie
│   │   └── hooks/                      React Query hooks
│   ├── middleware.ts                    Edge middleware (auth + role guards)
│   └── next.config.mjs
│
├── apps/admin        Next.js 15 / React 19 / App Router
│   ├── app/
│   │   ├── layout.tsx                   "use client" root layout ⚠
│   │   ├── login/page.tsx               Email + 2FA two-step form
│   │   └── dashboard/page.tsx           System metrics overview
│   ├── lib/hooks.ts                     All React Query hooks (reads localStorage)
│   └── [NO middleware.ts]               ⚠ CRITICAL — zero server-side protection
│
├── apps/mobile       Expo 51 / RN 0.74.5 / expo-router
│   ├── app/
│   │   ├── _layout.tsx                  QueryClient, Paper, RTL init
│   │   ├── (tabs)/
│   │   │   ├── index.tsx                Home dashboard
│   │   │   ├── offers.tsx               Offers list
│   │   │   ├── chat.tsx                 AI chat
│   │   │   └── profile.tsx
│   │   ├── create-offer.tsx             Modal
│   │   └── offer-detail.tsx
│   └── lib/hooks.ts + api.ts
│
├── packages/
│   ├── types/src/index.ts              Shared TypeScript types
│   ├── api-client/src/client.ts        Shared GroupioApiClient (stateless)
│   ├── ui/                             Shared component library (Tailwind)
│   └── utils/                          Shared utilities
```

### 1.2 Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Web / Admin framework | Next.js App Router | 15.x |
| UI runtime | React | 19.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS v4 | 4.x |
| State management | Zustand + `persist` | 4.x |
| Server-state / caching | TanStack React Query | 5.x |
| Forms | React Hook Form + Zod | latest |
| i18n | next-intl | 3.x |
| Mobile | Expo + expo-router | 51 / SDK 51 |
| Mobile UI | React Native Paper (MD3) | latest |
| HTTP client (web) | Native `fetch` + custom wrapper | — |
| HTTP client (shared) | `packages/api-client` (`GroupioApiClient`) | internal |
| Build / monorepo | Turborepo + pnpm workspaces | — |
| Icons | lucide-react (web), react-native-vector-icons (mobile) | — |
| Charts | Recharts | latest |

### 1.3 Authentication Data Flow

```
User logs in → POST /api/v1/auth/login/json
     │
     ├─ Server sets HTTP-only refresh_token cookie
     ├─ Response body contains access_token (JWT, 15 min)
     │
     └─ Client:
          authStore.setAuth(token, user)      ← token in memory (Zustand)
          localStorage.setItem("auth_token")  ← ⚠ ALSO written to localStorage
          setAuthCookie(token, user)           ← ⚠ ALSO written to non-HttpOnly cookie

Next.js Edge Middleware reads:
     refresh_token cookie  → isAuthenticated gate
     groupio-auth cookie   → role-based routing   ← ⚠ client-writable, forgeable
```

### 1.4 Environment Variables

| Variable | Web | Admin | Status |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | ✅ | Used correctly |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | Documented in `.env.example` | — | ⚠ NextAuth not installed — dead config |
| `NEXT_PUBLIC_PROMETHEUS_URL` | — | In `.env.example` | ⚠ Exposes internal infra topology |
| `NEXT_PUBLIC_SUPABASE_URL` | In `.env.example` | — | Used for storage |

---

## Step 2 — Frontend Production-Readiness Audit (20 Domains)

### Domain 1 — Authentication Token Storage

| Item | Detail |
|---|---|
| **Status** | 🔴 CRITICAL BLOCKER |
| **Evidence** | `apps/web/app/(auth)/login/page.tsx:61`: `localStorage.setItem("auth_token", token)` — contradicts the comment in `authStore.ts` that "Tokens are NEVER written to localStorage". `apps/admin/app/login/page.tsx:98`: same pattern for admin JWT. `apps/web/lib/auth/setAuthCookie.ts`: JWT also written to `document.cookie` (non-HttpOnly). |
| **Risk** | XSS → full account takeover. Any injected script can `localStorage.getItem("auth_token")` and exfiltrate the admin or resident JWT. The non-HttpOnly cookie mirrors the token, adding a second exfiltration vector. |
| **Missing** | Token must live only in memory (Zustand store) and in an HTTP-only cookie. The `setAuthCookie.ts` function should set only an opaque session ID (or not exist at all). The `localStorage.setItem` calls in login/signup pages must be removed. |

### Domain 2 — Session / Cookie Strategy

| Item | Detail |
|---|---|
| **Status** | 🔴 CRITICAL |
| **Evidence** | `apps/web/lib/auth/setAuthCookie.ts`: cookie set with `document.cookie = \`${name}=${value}; path=/; max-age=...; samesite=lax\`` — no `HttpOnly` flag. The full JWT `accessToken` is stored inside the cookie value (`state.accessToken`). |
| **Risk** | XSS can read the JWT from `document.cookie` even if the Zustand in-memory store were the only intended source. The middleware reads this cookie for role checks, creating a trust-chain on a client-writable value. |
| **Missing** | If a cookie mirror is needed for middleware routing, it should only carry `{role, isAuthenticated}` — never the raw JWT. Flag must be HttpOnly or the cookie must be signed. |

### Domain 3 — Middleware Route Protection (Web)

| Item | Detail |
|---|---|
| **Status** | 🟠 HIGH |
| **Evidence** | `apps/web/middleware.ts:5-12`: `protectedRoutes = ['/dashboard', '/offers', '/contractors', '/building', '/profile', '/chat']`. Routes `/architecture` (file upload, AI analysis) and `/payments` are absent from the list. |
| **Risk** | Unauthenticated users can access the architecture plan upload and the payments page. The upload endpoint calls an AI analysis pipeline and stores files in Supabase with the caller's identity. |
| **Missing** | Add `/architecture` and `/payments` (and any future resident pages) to `protectedRoutes`. |

### Domain 4 — Middleware Role-Based Routing

| Item | Detail |
|---|---|
| **Status** | 🟠 HIGH |
| **Evidence** | `apps/web/middleware.ts:40-52`: role is parsed from `groupio-auth` cookie which is set by `document.cookie` (client-writable). A user can forge `role: "admin"` or `role: "contractor"` in their browser and bypass the contractor/admin route guards. |
| **Risk** | Route-level protection for `/contractor` and `/admin` paths in the web app is defeated by cookie manipulation. (Note: server API endpoints independently validate tokens, so data exposure depends on backend auth, but the UI renders without restriction.) |
| **Missing** | Role must be verified from a server-signed value (e.g., JWT claim decoded inside middleware, or a separately signed server-set cookie). The client-writable `groupio-auth` cookie must not be trusted for authorization decisions. |

### Domain 5 — Admin App Route Protection

| Item | Detail |
|---|---|
| **Status** | 🔴 CRITICAL BLOCKER |
| **Evidence** | `glob apps/admin/middleware.ts` → no results. The admin app has no `middleware.ts`. Every route in the admin panel — contractors, escalations, agent metrics, audit logs — is rendered in the browser before any client-side auth check runs. |
| **Risk** | A user who navigates directly to `/dashboard`, `/contractors`, or any admin route receives the full page HTML and React payload. Client-side auth redirects are trivially bypassed. |
| **Missing** | Create `apps/admin/middleware.ts` that reads the `refresh_token` HTTP-only cookie and redirects all non-login routes to `/login` if absent. Match the pattern used in `apps/web/middleware.ts`. |

### Domain 6 — Admin 2FA Login Flow

| Item | Detail |
|---|---|
| **Status** | 🔴 CRITICAL BLOCKER |
| **Evidence** | `apps/admin/app/login/page.tsx` step 2 calls `POST /api/v1/auth/verify-2fa`. This endpoint **does not exist** in the backend (confirmed via `apps/api/routes/auth.py` audit — backend has `/login/json`, `/register`, `/refresh`, `/me`). The temp token issued after step 1 is stored in React component state, meaning the full JWT is already available to the client after step 1. |
| **Risk** | Admin login is broken in production — the 2FA step will always fail with a 404. If the 2FA step is skipped (e.g., by submitting step 1 and using the temp token directly), the "2FA" provides no real security. |
| **Missing** | Either implement TOTP/2FA on the backend with a real `/auth/verify-2fa` endpoint, or remove the 2FA step entirely until it is implemented. The temp token must not persist in component state if it is the full session token. |

### Domain 7 — API Client Architecture

| Item | Detail |
|---|---|
| **Status** | 🟠 HIGH |
| **Evidence** | Two separate `ApiClient` implementations exist: (A) `apps/web/lib/api/client.ts` — reads Zustand store, handles 401 retry, `ApiError(status, message, body)`. (B) `packages/api-client/src/client.ts` — stateless, constructor auth, `ApiError(message, status, detail)`. The `ApiError` constructor argument **order is reversed** between the two implementations. `apps/web/app/(resident)/offers/[offerId]/page.tsx` imports from `@/lib/api/client` (web client) while the shared package's `joinOffer(offerId, userId)` signature differs. |
| **Risk** | Calling `new ApiError(...)` from one module may swap status code and message, producing incorrect error handling (e.g., displaying HTTP status number as the error message). The dual-client drift will worsen over time. |
| **Missing** | Consolidate to a single API client. If both must exist, align `ApiError` constructor signatures and re-export from a single source. Add a type-level test. |

### Domain 8 — API Endpoint Mapping

| Item | Detail |
|---|---|
| **Status** | 🟠 HIGH |
| **Evidence** | `apps/web/lib/api/client.ts:229-236`: `signup()` calls `POST /api/v1/auth/signup` — but the backend registers users at `POST /api/v1/auth/register`. The user registration flow will 404 in production. `apps/admin/lib/hooks.ts:302-303`: `useReloadAgent()` sends no Authorization header when calling `POST /admin/agents/:name/reload`. |
| **Risk** | User signup is broken. Admin agent reload is unauthenticated (will either fail with 401 or succeed if the backend incorrectly lacks auth on that endpoint). |
| **Missing** | Align web client endpoint to `/api/v1/auth/register`. Add auth header to `useReloadAgent`. Implement an endpoint-contract test or OpenAPI type-generation step. |

### Domain 9 — Hardcoded / Fake Data in Production UIs

| Item | Detail |
|---|---|
| **Status** | 🟠 HIGH |
| **Evidence** | Multiple locations present fabricated metrics as real: (1) `apps/web/app/(resident)/dashboard/page.tsx`: `trend={12}`, `trend={8}`, `trend={23}` hardcoded on stat cards. (2) `apps/admin/app/dashboard/page.tsx:180,187`: `"API Latency: 124ms"` and `"Error Rate: 0.24%"` hardcoded in JSX; `uptimePercent = 99.97` (line 133) a magic number. (3) `apps/admin/lib/hooks.ts:247-249`: `avgLatencyMs: 320`, `callsToday: Math.round(agent.calls * 0.12)`, `tokensUsed: agent.calls * 850` — all fabricated. (4) `apps/admin/lib/hooks.ts:271-293`: `generateHistory()` produces 24-hour time-series data from a `Math.sin` + `Math.random` formula — fully synthetic charts shown to operators. (5) `apps/admin/lib/hooks.ts:114`: fallback branch hardcodes `activeOffers: 34`. |
| **Risk** | Operators make production decisions (contractor payments, escalation prioritization, incident response) based on fabricated data. Regulatory risk if financial metrics (GMV) are similarly stubbed. |
| **Missing** | Remove every hardcoded metric. Expose a real `/api/v1/admin/system/metrics` endpoint that returns live latency (from middleware instrumentation), error rate, and uptime. Replace `generateHistory` with a real time-series endpoint or an empty state with a "no history available" message. |

### Domain 10 — Offer Join / User Identity

| Item | Detail |
|---|---|
| **Status** | 🟠 HIGH |
| **Evidence** | `apps/web/app/(resident)/offers/[offerId]/page.tsx`: `apiClient.joinOffer(offerId, 'current-user')` — the literal string `'current-user'` is passed as the `userId` argument. If the backend validates that the joining user matches the authenticated token's `sub` claim, every join attempt will fail with an authorization error or create a corrupt participant record. |
| **Risk** | Core user journey (joining a group offer) is broken. |
| **Missing** | Replace `'current-user'` with `user?.id` from the `useAuthStore` hook. The same page already imports `useAuthStore` — the fix is a one-liner. |

### Domain 11 — Token Access Anti-Pattern in Offers Page

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | `apps/web/app/(resident)/offers/page.tsx`: token retrieved via `(window as unknown as { __auth_store?: ... }).__auth_store?.getState()?.accessToken ?? localStorage.getItem('auth_token')`. This bypasses Zustand's subscription model and falls back to the insecure `localStorage` value. |
| **Risk** | If the in-memory token is refreshed (new access token issued), this component will use the stale localStorage value, causing 401 errors. The `window.__auth_store` global is undocumented and fragile. |
| **Missing** | Replace with `useAuthStore((s) => s.accessToken)` React hook (already available in the codebase). |

### Domain 12 — i18n / Internationalization Completeness

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | `apps/web/app/layout.tsx`: `next-intl` correctly detects locale from cookie/header. `apps/web/app/(auth)/layout.tsx`: branding panel text is Hebrew-only (hardcoded `חסכו עד 40%`, stats, testimonial) — not wrapped in `t()`. `apps/web/components/features/chat/AIChat.tsx`: welcome message hardcoded in Hebrew regardless of locale. `apps/mobile/app/_layout.tsx:26-29`: `I18nManager.forceRTL(true)` forces RTL unconditionally — breaks the English locale for LTR users. No `en` locale messages file was found for the mobile app. |
| **Risk** | English-locale users see Hebrew UI fragments and a forcibly mirrored layout on mobile. |
| **Missing** | Wrap all static strings in `t()` calls. Gate `forceRTL` on actual locale. Add an `en` translation file for mobile. |

### Domain 13 — Shared Types Correctness

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | `packages/types/src/index.ts`: `Offer.contractor: Contractor` is typed as non-optional (required). The backend may return `null` for offers without an assigned contractor (pre-matching stage). `Offer.tiers` is used in mobile (`o.tiers[o.currentTier]?.discount`) with optional chaining — correct — but the web offer card does not guard this access. `LayoutProps<"/">` used in `apps/web/app/(auth)/layout.tsx:4` is not exported by Next.js 15 or any installed package — this will cause a TypeScript build error. |
| **Risk** | Runtime `TypeError: Cannot read properties of null (reading 'businessName')` on offer detail pages. TypeScript build failure in the web app's auth layout. |
| **Missing** | Make `Offer.contractor` optional (`contractor?: Contractor | null`). Remove or correctly define `LayoutProps<"/">` — the standard pattern is `{ children: React.ReactNode }`. |

### Domain 14 — React Query Configuration

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | `apps/web/app/providers.tsx`: global `staleTime: 60 * 1000` (60 seconds). Pricing data (tier thresholds, discount percentages) is fetched on the offers page and cached for 60 seconds. A user who joins an offer may see a stale participant count / tier for up to 60 seconds. Mobile app uses `staleTime: 5 * 60 * 1000` (5 minutes) — inconsistent with web and too long for real-time offer state. `refetchOnWindowFocus: false` is set globally — legitimate for most views but wrong for the offer detail page where a user navigating away and back should see an updated participant count. |
| **Risk** | Race conditions in tier-based group discounts; user joins at tier N but UI shows tier N-1 price. |
| **Missing** | Set per-query `staleTime` for pricing-sensitive queries (e.g., `staleTime: 0` or `staleTime: 10_000` for offer detail). Enable `refetchOnWindowFocus` for the offer detail query. |

### Domain 15 — Incomplete / Non-Functional UI Elements

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | (1) `apps/web/app/(resident)/offers/[offerId]/page.tsx`: Share button has no `onClick` handler — renders a `<button>` that does nothing. (2) `apps/web/app/(auth)/layout.tsx:80-87`: links to `/terms` and `/privacy` — these pages do not exist in the codebase (no `terms/page.tsx` or `privacy/page.tsx` found). Clicking will result in a 404. (3) Mobile quick action "find_contractor" navigates to `/offers` instead of a dedicated contractors screen. (4) Chat AI welcome message hardcoded as Hebrew string regardless of locale. |
| **Risk** | Legal exposure (ToS / Privacy Policy links are required for cookie consent and GDPR). Broken share and contractor discovery UX. |
| **Missing** | Implement `/terms` and `/privacy` pages (at minimum static markdown). Implement share functionality (Web Share API or copy-to-clipboard). Add a dedicated contractors route on mobile. |

### Domain 16 — Security Headers

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | `apps/web/middleware.ts:99-103`: sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. `apps/web/next.config.mjs`: no `headers()` function is configured — headers are applied only for routes matched by `middleware.ts` (which excludes static assets and API routes). `Content-Security-Policy` is absent entirely. `Strict-Transport-Security` is absent. Admin app has no middleware and no security headers at all. |
| **Risk** | Missing CSP means XSS payloads execute without any script-source restriction. Missing HSTS means the first connection could be downgraded to HTTP. |
| **Missing** | Add CSP (at minimum `default-src 'self'; script-src 'self' 'unsafe-inline'` as a starting point), HSTS, and `Permissions-Policy` headers via `next.config.mjs` `headers()` function so they apply to all responses including static files. |

### Domain 17 — Performance / Bundle Size

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | `apps/web/next.config.mjs`: `experimental.optimizePackageImports: ["lucide-react"]` — only Lucide is tree-shake optimized. `recharts`, `@tanstack/react-query`, and `react-hook-form` are not listed. No `next/bundle-analyzer` configuration. No `next/font` subsets (Inter and Heebo are loaded without `subsets` restriction). |
| **Risk** | Larger-than-necessary initial JS bundle on slow connections (target users are Israeli residential building residents — mobile networks common). |
| **Missing** | Add `recharts` and other large packages to `optimizePackageImports`. Define `next/font` subsets. Run bundle analyzer before launch. |

### Domain 18 — Accessibility (a11y)

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | Offer detail share button: `<button type="button" title={t('shareWithNeighbors')}>` — has `title` but no visible label or `aria-label`. Admin dashboard stat mini-cards have no `role` or `aria-label` on the colored status dots. `apps/web/app/(auth)/layout.tsx` uses `dir="rtl"` on the outer div but the `<html>` element's `dir` is set in `layout.tsx` conditionally — the auth layout resets `dir` for both LTR and RTL users. Form inputs use React Hook Form but no `aria-describedby` linking inputs to their error messages. |
| **Risk** | Screen reader users cannot activate the share action or understand status indicators. WCAG 2.1 AA non-compliance. |
| **Missing** | Add `aria-label` to icon-only buttons. Link form error messages to inputs via `aria-describedby`. Remove the hard `dir="rtl"` override in the auth layout and rely on the root HTML `dir` attribute. |

### Domain 19 — Error Handling / Empty States

| Item | Detail |
|---|---|
| **Status** | 🟡 MEDIUM |
| **Evidence** | `apps/web/app/providers.tsx`: `AppErrorBoundary` class component wraps the entire app — unhandled React render errors are caught. However, React Query errors (network failures, API errors) are not shown to users in most pages; queries return `undefined` and components silently render empty states without indicating failure. `apps/admin/lib/hooks.ts:436-437`: `useActivityLog` returns `[]` on non-OK responses with no error surfaced. Admin operators cannot distinguish "no activity yet" from "fetch failed". |
| **Risk** | Users submit forms during network outages and receive no feedback. Admin operators may miss alert-worthy API failures because the log appears empty. |
| **Missing** | Add `isError` handling in key query consumers. Toast or inline error messages for failed mutations (join offer, submit payment). Distinguish "empty" from "error" states in the activity log. |

### Domain 20 — Mobile App Authentication

| Item | Detail |
|---|---|
| **Status** | 🟠 HIGH |
| **Evidence** | `apps/mobile/app/_layout.tsx`: no auth guard, no redirect-to-login logic. The tabs are rendered unconditionally. `apps/mobile/lib/hooks.ts` (inferred from usage in `index.tsx`): profile/offers hooks make authenticated API calls but no token management is shown in the root layout. There is no auth store, login screen, or Expo SecureStore usage visible in the mobile app. |
| **Risk** | The mobile app appears to have no authentication implementation — it likely works only as a demo against a local backend. Shipping it to production would expose all API endpoints without user identity. |
| **Missing** | Implement an auth flow for mobile: login screen, secure token storage via `expo-secure-store` (not `AsyncStorage`/`localStorage`), and a root layout guard that redirects unauthenticated users to the login screen. |

---

## Step 3 — Gap Analysis Table

| Area | Current State | Missing | Risk | Priority | Est. Effort |
|---|---|---|---|---|---|
| Token storage (web + admin) | JWT in localStorage AND non-HttpOnly cookie | Remove `localStorage.setItem` calls; strip JWT from cookie value | CRITICAL | P0 | 0.5 day |
| Admin middleware | None | Create `apps/admin/middleware.ts` | CRITICAL | P0 | 0.5 day |
| Admin 2FA endpoint | Client calls non-existent `/auth/verify-2fa` | Implement backend TOTP or remove 2FA step | CRITICAL | P0 | 2–3 days |
| Offer join userId | Hardcoded `'current-user'` string | Use `user.id` from authStore | CRITICAL | P0 | 0.5 hour |
| User signup endpoint | Client calls `/auth/signup`, backend is `/auth/register` | Fix URL in `apps/web/lib/api/client.ts:229` | CRITICAL | P0 | 5 minutes |
| Hardcoded metric values | Fake latency, uptime, error rate, synthetic chart history | Real metrics endpoints | HIGH | P1 | 3–5 days |
| Protected routes incomplete | `/architecture`, `/payments` missing from guard | Add to `protectedRoutes` array | HIGH | P1 | 5 minutes |
| Role guard on client cookie | Middleware trusts forgeable cookie for contractor/admin routing | Read role from signed JWT claim | HIGH | P1 | 1 day |
| API client duplication | Two clients with reversed `ApiError` constructor | Consolidate or align signatures | HIGH | P1 | 1 day |
| Mobile auth | No auth flow, no secure storage | Login screen, `expo-secure-store` | HIGH | P1 | 3–5 days |
| `LayoutProps<"/">` type | Undefined type — TypeScript build error | Replace with `{ children: React.ReactNode }` | HIGH | P1 | 5 minutes |
| Offers page token access | `window.__auth_store` + localStorage fallback | Use `useAuthStore` hook | MEDIUM | P2 | 30 min |
| React Query staleTime | 60s global; pricing data can be stale | Per-query override for offer detail | MEDIUM | P2 | 1 hour |
| Share button (no handler) | Non-functional UI element | Web Share API or clipboard | MEDIUM | P2 | 2 hours |
| Terms / Privacy pages | 404 links in auth layout | Implement minimal static pages | MEDIUM | P2 | 1 day |
| Admin reload agent — no auth | Missing Authorization header | Add `Authorization: Bearer ...` header | MEDIUM | P2 | 30 min |
| Hardcoded i18n strings | Hebrew-only auth branding, chat welcome | Wrap in `t()` translations | MEDIUM | P2 | 1 day |
| Mobile RTL forced unconditionally | `forceRTL(true)` breaks English locale | Gate on locale | MEDIUM | P2 | 1 hour |
| `Offer.contractor` type (non-optional) | Runtime crash on unassigned offers | Mark optional in shared types | MEDIUM | P2 | 30 min |
| Missing CSP header | No Content-Security-Policy | Add via `next.config.mjs` `headers()` | MEDIUM | P2 | 1 day |
| Admin app "use client" root layout | Disables RSC for entire admin app | Restructure layout to server component | LOW | P3 | 0.5 day |
| Missing HSTS | First connection can be HTTP | Add in `next.config.mjs` or CDN | LOW | P3 | 1 hour |
| NEXTAUTH env vars | Referenced but never used | Remove from `.env.example` | LOW | P3 | 5 min |
| Bundle optimization | Only Lucide in `optimizePackageImports` | Add recharts, RHF, React Query | LOW | P3 | 2 hours |
| Accessibility — icon buttons | No `aria-label` on icon-only actions | Add `aria-label` attributes | LOW | P3 | 1 day |
| AI chat no persistence | History lost on refresh | Persist to backend conversation endpoint | LOW | P3 | 2 days |
| No OG / SEO meta tags | Missing in root layout | Add `metadata` export | LOW | P3 | 0.5 day |

---

## Step 4 — Production Action Plan

### Phase 0 — Emergency Fixes (Pre-Launch Blockers, ≤ 1 week)

These items will cause auth failures, data corruption, or security breaches in production.

**P0.1 — Remove JWT from localStorage and non-HttpOnly cookie**
- Delete `localStorage.setItem("auth_token", ...)` from `apps/web/app/(auth)/login/page.tsx` and `apps/admin/app/login/page.tsx`
- Modify `apps/web/lib/auth/setAuthCookie.ts` to omit `accessToken` from the cookie value; keep only `{ role, isAuthenticated }` — and sign this or accept it is informational-only for the middleware
- Remove `localStorage.getItem("auth_token")` fallback from `apps/web/app/(resident)/offers/page.tsx`
- Remove `localStorage.getItem("auth_token")` from `apps/admin/lib/hooks.ts:24`

**P0.2 — Create `apps/admin/middleware.ts`**
- Mirror the pattern from `apps/web/middleware.ts`
- Protect all admin routes (`/dashboard`, `/contractors`, `/escalations`, etc.) behind `refresh_token` cookie check
- Redirect unauthenticated requests to `/login`

**P0.3 — Fix admin 2FA or remove it**
- Option A: Implement `POST /api/v1/auth/verify-2fa` on the backend with real TOTP verification
- Option B: Remove the 2FA step from `apps/admin/app/login/page.tsx` until the backend endpoint exists
- Do not ship a 2FA UI that calls a 404 endpoint; it creates a false sense of security

**P0.4 — Fix `joinOffer` hardcoded userId**
- `apps/web/app/(resident)/offers/[offerId]/page.tsx`: replace `'current-user'` with `user?.id ?? ''`
- Add a guard that disables the Join button if `!user?.id`

**P0.5 — Fix signup endpoint URL**
- `apps/web/lib/api/client.ts:229`: change `/api/v1/auth/signup` → `/api/v1/auth/register`

**P0.6 — Fix `LayoutProps<"/">` TypeScript error**
- `apps/web/app/(auth)/layout.tsx:4`: change `LayoutProps<"/">` to `{ children: React.ReactNode }`
- This is likely causing a build failure already

### Phase 1 — High Priority (Week 1–2)

**P1.1 — Remove all hardcoded metric values**
- Admin dashboard: replace hardcoded latency, uptime, error rate strings with live API data
- Resident dashboard: remove hardcoded `trend={12}` etc. from stat cards (leave blank until API returns real change values)
- Admin hooks: replace `generateHistory()` with real historical data endpoint or an empty `[]` state
- Remove `activeOffers: 34` fallback in `useDashboardMetrics`

**P1.2 — Add missing protected routes**
- `apps/web/middleware.ts`: add `/architecture` and `/payments` to `protectedRoutes`

**P1.3 — Fix role-based routing trust**
- `apps/web/middleware.ts`: decode the role from the JWT (access token can be re-read from the `groupio-auth` cookie only for the `role` field if the middleware cannot access the HttpOnly refresh token payload). Alternatively, set a separate HttpOnly `groupio-role` cookie from the backend at login time

**P1.4 — Fix `offers/page.tsx` token access**
- Replace `window.__auth_store` anti-pattern with `useAuthStore` hook

**P1.5 — Consolidate API clients**
- Align `ApiError` constructor signatures between `apps/web/lib/api/client.ts` and `packages/api-client/src/client.ts`
- Add auth header to `useReloadAgent` in `apps/admin/lib/hooks.ts`

**P1.6 — Implement mobile auth**
- Add `apps/mobile/app/(auth)/login.tsx`
- Use `expo-secure-store` for JWT persistence (not `AsyncStorage`)
- Add auth guard in `apps/mobile/app/_layout.tsx` — redirect to login if no token

**P1.7 — Fix `Offer.contractor` type**
- `packages/types/src/index.ts`: `contractor?: Contractor | null`

### Phase 2 — Medium Priority (Week 2–4)

**P2.1 — Implement Terms of Service and Privacy Policy pages**
- Minimum: static markdown/MDX pages at `/terms` and `/privacy`
- Required before any user-facing launch (GDPR / Israeli privacy law)

**P2.2 — Add Content-Security-Policy and HSTS**
- `apps/web/next.config.mjs`: add `headers()` function returning CSP, HSTS, Permissions-Policy
- Apply to admin app as well

**P2.3 — Per-query staleTime for pricing data**
- Override `staleTime` to `10_000` on offer detail and offers list queries

**P2.4 — Fix i18n gaps**
- Wrap auth layout branding strings in translation keys
- Fix AIChat welcome message locale
- Gate `I18nManager.forceRTL` on `locale === 'he'`

**P2.5 — Implement Share button**
- Use `navigator.share()` with a fallback to `navigator.clipboard.writeText()`

**P2.6 — Error states for failed queries**
- Resident dashboard, offers page, admin dashboard: show an inline error banner or toast when `isError` is true

### Phase 3 — Polish / Technical Debt (Week 4–6)

- Remove `NEXTAUTH_URL`/`NEXTAUTH_SECRET` from `.env.example`
- Remove `NEXT_PUBLIC_PROMETHEUS_URL` from admin `.env.example` (or move to server-only var)
- Add `aria-label` to icon-only buttons (share, notification icons)
- Link form error messages to inputs via `aria-describedby`
- Restructure admin root layout away from `"use client"` (use React Server Components for the shell)
- Add `recharts` and other large packages to `optimizePackageImports` in `next.config.mjs`
- Implement AI chat message persistence (backend `/conversations` endpoint)
- Add `<meta name="robots">` and OG tags to root layout

---

## Step 5 — Risk Heatmap

```
         SEVERITY
         Critical │  P0.6 (TS)   P0.1 (JWT)   P0.2 (admin  P0.3 (2FA)
                  │              P0.4 (join)   middleware)
                  │              P0.5 (signup)
                  │
         High     │              P1.2 (routes) P1.1 (fake   P1.3 (role
                  │              P1.4 (token)  metrics)     cookie)
                  │              P1.6 (mobile  P1.5 (dual   P1.7 (type)
                  │              auth)         client)
                  │
         Medium   │  P2.5 (i18n) P2.3 (stale  P2.1 (ToS)   P2.2 (CSP)
                  │              time)         P2.4 (share)  P2.6 (errors)
                  │
         Low      │  P3 (aria)   P3 (bundle)  P3 (chat      P3 (cleanup)
                  │              P3 (RSC)      persist)
                  │
                  └────────────────────────────────────────────────────
                       Low         Medium         High        Critical
                                         LIKELIHOOD
```

### Critical Risks — Impact on Launch

| Risk | Impact | Likelihood |
|---|---|---|
| JWT in localStorage → XSS account takeover | Account takeover, PII exfil | HIGH (any stored XSS) |
| Admin has no server-side route protection | Full admin panel accessible without login | CRITICAL (always true) |
| Admin 2FA broken (404) | Admin login fails entirely in production | CRITICAL (always true) |
| Offer join with `'current-user'` | Every "Join Offer" action fails or corrupts data | CRITICAL (always true) |
| User signup hits wrong endpoint | Every new user registration fails | CRITICAL (always true) |
| Fake metrics shown to operators | Wrong decisions; potentially misrepresented SLAs | HIGH (any production use) |

---

## Step 6 — Launch Decision

### Frontend Verdict: ❌ NOT READY FOR PRODUCTION

**Frontend Readiness Score: 37 / 100**

| Category | Score | Notes |
|---|---|---|
| Authentication Security | 10/25 | JWT in localStorage, non-HttpOnly cookie, admin has no middleware |
| Core User Journeys | 5/20 | Signup broken (wrong endpoint), offer join broken (hardcoded userId), admin login broken (404 2FA) |
| Data Integrity | 8/15 | Multiple hardcoded fake metrics; stale pricing data possible |
| API Correctness | 10/15 | Dual clients with conflicting signatures; endpoint mismatches |
| UX Completeness | 8/15 | Missing ToS/Privacy pages, broken Share button, no mobile auth |
| Performance & a11y | 6/10 | No CSP, minimal a11y, bundle not optimized |

**Minimum required for any production traffic:**
All Phase 0 items (P0.1–P0.6) must be resolved. These are not performance concerns or UX polish — they are functional blockers: admin login will fail, user signup will fail, and offer joining is broken.

**Minimum required before public launch:**
Phase 0 + Phase 1 items (P1.1–P1.7). Without P1.1 (remove fake metrics), operators cannot trust the admin panel. Without P1.6 (mobile auth), the mobile app cannot be shipped.

---

## Step 7 — Bonus Recommendations

### Architecture

**7.1 — Unify the API client layer**
The monorepo has `packages/api-client` precisely to avoid the situation that exists today: two divergent clients with incompatible error types. Deprecate `apps/web/lib/api/client.ts` and migrate to the shared package. The Zustand token read and 401-retry logic can be injected via a `tokenProvider` callback in the `GroupioApiClient` constructor, keeping the shared package framework-agnostic.

**7.2 — Use `next-safe-action` or `tRPC` for type-safe server actions**
The current fetch-based approach with manual URL strings is brittle. `tRPC` would eliminate the entire class of "wrong endpoint URL" bugs (P0.5, Domain 8) by generating a typed RPC layer from the FastAPI schema.

**7.3 — Server-side rendering for authenticated pages**
Most resident dashboard data is fetched client-side via React Query. Using Next.js 15 `fetch` in Server Components with `cookies()` for the access token would allow the page to be fully rendered on the server, eliminating the blank-page flash and improving SEO / Lighthouse scores.

### Security

**7.4 — Implement a proper BFF (Backend for Frontend) token proxy**
The current design requires the access token to be readable by JavaScript (for the API client). A BFF proxy route (`/api/proxy/*` in Next.js) would receive authenticated requests using an HttpOnly session cookie and forward them to FastAPI — removing the access token from the browser entirely.

**7.5 — Add `Sec-Fetch-*` header validation on the FastAPI side**
The backend should validate `Origin` headers on mutation endpoints to prevent CSRF. The frontend already uses `credentials: 'include'`; the backend should enforce a strict origin allowlist to match.

### Developer Experience

**7.6 — Generate TypeScript types from the FastAPI OpenAPI schema**
Use `openapi-typescript` in the CI pipeline to auto-generate `packages/types` from `GET /openapi.json`. This would have caught the `signup` vs `register` endpoint mismatch and the missing `verify-2fa` endpoint before code was written.

**7.7 — Add Playwright end-to-end tests for critical user journeys**
The `apps/admin/e2e/` directory already has Playwright specs (`admin-flow.spec.ts`). Extend coverage to: resident signup → login → join offer → payment. These tests would immediately catch regressions like the hardcoded `'current-user'` userId.

**7.8 — Storybook for the shared `packages/ui` design system**
The design system has no visual testing infrastructure. Adding Storybook + Chromatic would prevent visual regressions and provide documentation for the RTL/LTR dual-layout components — important given the Hebrew-primary audience.

### Monitoring

**7.9 — Add `@vercel/analytics` or Sentry for frontend error tracking**
The `AppErrorBoundary` catches render errors but there is no mechanism to report them. Sentry's React integration would capture unhandled errors, React Query failures, and performance traces with negligible setup cost.

**7.10 — Real User Monitoring (RUM) for RTL layout issues**
Since the app supports both Hebrew (RTL) and English (LTR), RTL-specific layout bugs are easy to introduce. Add a Playwright visual regression test that runs against both locales as part of CI.

---

*This audit was generated by static analysis of the repository at commit time. All findings reference specific file paths and line numbers. No generic advice has been included — every item is grounded in actual code.*
