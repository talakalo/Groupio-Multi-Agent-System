# Cursor Implementation Prompt — Groupio Implementation Gap Fixes

> **How to use:** Copy the relevant section(s) into Cursor's composer or chat. Each section is self-contained with exact file paths, code patterns, and acceptance criteria. Work through P0 → P1 → P2 → P3 in order. Each fix includes a verification step.

---

## CONTEXT — Read This First

You are working on the **Groupio Multi-Agent System** — a multi-tenant group purchasing marketplace platform for Israeli residential buildings. The stack is:

- **Backend:** Python 3.11+ / FastAPI at `src/` — PostgreSQL (Supabase), Redis, Qdrant (vector), Neo4j (graph)
- **Web App:** Next.js 15 / React 19 at `apps/web/` — port 3000
- **Admin App:** Next.js 14 / React 18 at `apps/admin/` — port 3001
- **Mobile App:** Expo 51 / React Native 0.74 at `apps/mobile/`
- **Shared Packages:** `packages/api-client`, `packages/types`, `packages/ui`, `packages/utils`
- **i18n:** `next-intl` (web + admin), custom `i18n-js` (mobile). Default locale: Hebrew (`he`). Supported: `he`, `en`.
- **Roles:** `resident`, `contractor`, `buildings_manager`, `admin`, `super_admin`

### Key Architectural Patterns to Follow
- API client: `packages/api-client/src/client.ts` — `GroupioApiClient` class with methods like `getOffers()`, `getPayments()`, etc.
- Auth store: `apps/web/lib/stores/authStore.ts` — Zustand store with `user`, `token`, `isAuthenticated`
- Translation: `useTranslations("namespace")` from `next-intl` in web/admin; `i18n.t("key")` in mobile
- Route guards: `apps/web/middleware.ts` for server-side; layout components for client-side
- Design tokens: `packages/ui/src/tokens/` — colors, typography, spacing, shadows
- API prefix: All backend routes under `/api/v1/`

---

## P0 — CRITICAL FIXES (Must complete before any external user access)

---

### P0-1: Add Role Validation to Resident Layout

**Problem:** `apps/web/app/(resident)/layout.tsx` checks `isAuthenticated` but never validates that `user.role === 'resident'`. A contractor or buildings_manager who manually navigates to `/dashboard` sees resident-specific UI and data.

**File:** `apps/web/app/(resident)/layout.tsx`

**Current behavior:** The layout fetches `user` and `isAuthenticated` from the auth store, redirects to `/login` if not authenticated, but never checks `user.role`.

**Required fix:**
After the existing authentication check (the block that redirects to `/login` when not authenticated), add a role validation check:

```typescript
// After the existing auth redirect logic:
useEffect(() => {
  if (isAuthenticated && user && user.role !== 'resident') {
    // Allow admin/super_admin to view resident pages (for support/debugging)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      const roleRoutes: Record<string, string> = {
        contractor: '/contractor/dashboard',
        buildings_manager: '/buildings-manager/dashboard',
      };
      const redirectTo = roleRoutes[user.role] || '/login';
      router.push(redirectTo);
    }
  }
}, [isAuthenticated, user, router]);
```

**Acceptance criteria:**
- A user with `role: "contractor"` who navigates to `/dashboard` is redirected to `/contractor/dashboard`
- A user with `role: "buildings_manager"` who navigates to `/dashboard` is redirected to `/buildings-manager/dashboard`
- A user with `role: "admin"` or `role: "super_admin"` can still access resident pages (for support)
- A user with `role: "resident"` sees the page normally
- No flash of resident content before redirect (add loading state during role check)

**Test:** Update `apps/web/__tests__/ResidentLayout.test.tsx` to add test cases:
- "redirects contractor to /contractor/dashboard"
- "redirects buildings_manager to /buildings-manager/dashboard"
- "allows admin to view resident pages"

---

### P0-2: Add Role Validation to Contractor Layout

**Problem:** `apps/web/app/contractor/layout.tsx` checks `isAuthenticated` but never validates `user.role === 'contractor'`. A resident who navigates to `/contractor/dashboard` sees contractor-specific UI.

**File:** `apps/web/app/contractor/layout.tsx`

**Required fix:** Same pattern as P0-1, but check for contractor role:

```typescript
useEffect(() => {
  if (isAuthenticated && user && user.role !== 'contractor') {
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      const roleRoutes: Record<string, string> = {
        resident: '/dashboard',
        buildings_manager: '/buildings-manager/dashboard',
      };
      const redirectTo = roleRoutes[user.role] || '/login';
      router.push(redirectTo);
    }
  }
}, [isAuthenticated, user, router]);
```

**Acceptance criteria:**
- A user with `role: "resident"` navigating to `/contractor/dashboard` is redirected to `/dashboard`
- Admin/super_admin can still access contractor pages
- No flash of contractor content before redirect

**Test:** Update `apps/web/__tests__/ContractorLayout.test.tsx` with matching test cases.

---

### P0-3: Add Resident Route Protection in Middleware

**Problem:** `apps/web/middleware.ts` role-gates contractor routes (`/contractor/*`), admin routes (`/admin/*`), and buildings-manager routes (`/buildings-manager/*`), but resident routes (`/dashboard`, `/offers`, `/orders`, `/contractors`, `/building`, `/profile`, `/chat`, `/checkout`, `/payments`, `/architecture`, `/change-password`) are only auth-gated, not role-gated. This means any authenticated user (regardless of role) passes middleware for resident routes.

**File:** `apps/web/middleware.ts`

**Current behavior:** The middleware checks for `refresh_token` cookie on protected routes and redirects to login if missing. For role-specific routes, it reads the `groupio-auth` Zustand cookie to extract role and redirects mismatched roles. But resident routes are not in any role-gated block.

**Required fix:** Add resident routes to the role-gating logic. After the existing role-gated route checks, add:

```typescript
// Resident-only routes (allow admin/super_admin for support access)
const residentRoutes = ['/dashboard', '/offers', '/orders', '/contractors', '/building', '/profile', '/chat', '/checkout', '/payments', '/architecture', '/change-password'];
const isResidentRoute = residentRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));

if (isResidentRoute && authData) {
  const role = authData.state?.user?.role;
  if (role && !['resident', 'admin', 'super_admin'].includes(role)) {
    const roleDefaults: Record<string, string> = {
      contractor: '/contractor/dashboard',
      buildings_manager: '/buildings-manager/dashboard',
    };
    return NextResponse.redirect(new URL(roleDefaults[role] || '/', request.url));
  }
}
```

**Important:** The `groupio-auth` cookie is used for UX routing only (as documented in the middleware comments). The `refresh_token` HTTP-only cookie is the authoritative auth check. This middleware role-gating is a UX improvement, not a security boundary — the layout-level checks (P0-1, P0-2) are the actual enforcement.

**Acceptance criteria:**
- Middleware redirects a contractor visiting `/dashboard` to `/contractor/dashboard`
- Middleware redirects a buildings_manager visiting `/offers` to `/buildings-manager/dashboard`
- Admin and super_admin can visit any route
- Resident can visit all resident routes normally
- If `groupio-auth` cookie is missing/corrupt, middleware does NOT block (falls through to layout check)

---

### P0-4: Implement Notification Backend Persistence

**Problem:** `apps/web/components/shared/NotificationPanel.tsx` uses a Zustand in-memory store. Notifications are lost on page refresh and are not synced across devices/tabs.

**Files to modify:**
1. `src/api/routes/` — Create `notifications.py` route file
2. `src/api/main.py` — Register the new router
3. `apps/web/lib/stores/notificationStore.ts` — Wire to API instead of in-memory
4. `apps/web/components/shared/NotificationPanel.tsx` — Update to fetch from API

**Step 1: Create backend notifications API**

Create `src/api/routes/notifications.py` with these endpoints:
```python
from fastapi import APIRouter, Depends
from src.api.middleware.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/")
async def get_notifications(
    user=Depends(get_current_user),
    limit: int = 50,
    offset: int = 0,
    unread_only: bool = False
):
    """Get user's notifications with pagination."""
    # Query from postgres: notifications table filtered by user_id
    pass

@router.post("/{notification_id}/read")
async def mark_notification_read(notification_id: str, user=Depends(get_current_user)):
    """Mark a single notification as read."""
    pass

@router.post("/read-all")
async def mark_all_notifications_read(user=Depends(get_current_user)):
    """Mark all notifications as read for the current user."""
    pass

@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, user=Depends(get_current_user)):
    """Delete a notification."""
    pass

@router.delete("/")
async def clear_all_notifications(user=Depends(get_current_user)):
    """Clear all notifications for the current user."""
    pass
```

**Step 2: Create database table**

Create an Alembic migration for a `notifications` table:
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('success', 'error', 'warning', 'info')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read = FALSE;
```

**Step 3: Add methods to `packages/api-client/src/client.ts`**
```typescript
async getNotifications(params?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<Notification[]>
async markNotificationRead(id: string): Promise<void>
async markAllNotificationsRead(): Promise<void>
async deleteNotification(id: string): Promise<void>
async clearAllNotifications(): Promise<void>
```

**Step 4: Update the Zustand notification store** to persist to and hydrate from the API. Keep the in-memory store as a write-through cache for instant UI updates while the API call is in flight.

**Step 5: Register the new router in `src/api/main.py`:**
```python
from src.api.routes.notifications import router as notifications_router
app.include_router(notifications_router, prefix="/api/v1")
```

**Acceptance criteria:**
- Notifications persist across page refreshes
- Notifications sync when user logs in on a different device
- Mark-as-read, mark-all-read, delete, and clear-all work against backend
- NotificationPanel loads with skeleton while fetching
- Error state shown if API fails
- Existing notification creation logic (wherever notifications are dispatched) writes to the API
- Backward compatible: if API is unreachable, falls back to in-memory

**Test:** Add `tests/unit/test_route_notifications.py` with tests for all 5 endpoints. Add `tests/integration/test_notification_routes.py` for the full CRUD flow.

---

### P0-5: Wire Admin Agent Decision Approve/Reject Handlers

**Problem:** `apps/admin/app/agents/page.tsx` renders "Approve" and "Override" buttons for pending agent decisions, but the buttons have **no onClick handlers**. The admin cannot approve or reject autonomous agent decisions.

**File:** `apps/admin/app/agents/page.tsx`

**Current code (around lines 388-393):** The buttons are rendered but have no click handlers attached.

**Required fix:**

1. Add two handler functions that call the existing admin API endpoints:
   - `POST /api/v1/admin/agents/pending-decisions/{id}/approve` — already exists in `src/api/routes/admin.py`
   - `POST /api/v1/admin/agents/pending-decisions/{id}/reject` — already exists in `src/api/routes/admin.py`

2. Add the API client methods if they don't exist in `packages/api-client/src/client.ts`:
```typescript
async approveAgentDecision(decisionId: string): Promise<void> {
  return this.post(`/admin/agents/pending-decisions/${decisionId}/approve`);
}
async rejectAgentDecision(decisionId: string, reason?: string): Promise<void> {
  return this.post(`/admin/agents/pending-decisions/${decisionId}/reject`, { reason });
}
```

3. Wire the buttons:
```tsx
<button
  onClick={() => handleApproveDecision(decision.id)}
  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
>
  Approve
</button>
<button
  onClick={() => handleRejectDecision(decision.id)}
  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors"
>
  Override
</button>
```

4. Add state feedback: loading spinner on button during API call, success toast, error toast, and refresh the pending decisions list after action.

**Acceptance criteria:**
- Clicking "Approve" calls the approve endpoint and removes the decision from the list
- Clicking "Override" opens a confirmation dialog (with optional reason field), then calls reject
- Loading state shown on the button during the API call
- Error displayed if the API call fails
- Decision list refreshes after approve/reject
- Audit log entry created (backend already handles this)

---

## P1 — HIGH PRIORITY (Must fix before pilot/beta)

---

### P1-1: Add Loading and Error States to Admin Dashboard

**Problem:** `apps/admin/app/dashboard/page.tsx` uses 6+ API hooks (`useAdminAnalytics`, `useAdminStatus`, `useAdminOffers`, `useAgentMetrics`, `useEscalations`, `useAdminVettingStatus`) but never renders loading or error states. The page shows blank/default content while data is loading, and silently fails if APIs error.

**File:** `apps/admin/app/dashboard/page.tsx`

**Required fix:**

1. Add a loading skeleton that covers the dashboard grid while any critical API hook is loading:
```tsx
if (analyticsLoading || statusLoading) {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 bg-surface-100 rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-surface-100 rounded-xl animate-pulse" />
        <div className="h-64 bg-surface-100 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
```

2. Add error state:
```tsx
const criticalError = analyticsError || statusError;
if (criticalError) {
  return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <h3 className="text-lg font-semibold text-red-800">Failed to load dashboard</h3>
        <p className="text-red-600 mt-2">{criticalError.message || 'An error occurred'}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-100 rounded-lg text-red-700 hover:bg-red-200">
          Retry
        </button>
      </div>
    </div>
  );
}
```

3. Fix the hardcoded `pendingPayments = 0` placeholder. Wire it to the payments API:
```typescript
const pendingPayments = paymentsData?.filter(p => p.status === 'pending')?.length ?? 0;
```

**Acceptance criteria:**
- Dashboard shows skeleton loader while data is loading
- Dashboard shows error alert with retry button if any critical API fails
- Pending payments count comes from real API data, not hardcoded 0
- Non-critical data (agent metrics, vetting status) can fail silently without blocking the whole page

---

### P1-2: Wire Admin App i18n (next-intl)

**Problem:** The admin app (`apps/admin/`) has `messages/en.json` and `messages/he.json` but next-intl is NOT wired. The layout has a TODO comment about this. Zero of 40 admin components use `useTranslations()`. All UI text is hardcoded English.

**Files to modify:**
1. `apps/admin/app/layout.tsx` — Set up `NextIntlClientProvider`
2. `apps/admin/i18n/` — Create config and request files (mirror `apps/web/i18n/`)
3. `apps/admin/messages/en.json` — Expand from 13 keys to full coverage
4. `apps/admin/messages/he.json` — Expand to match en.json
5. All 40 admin components — Add `useTranslations()` calls

**Step 1: Set up i18n infrastructure**

Create `apps/admin/i18n/config.ts`:
```typescript
export const locales = ["he", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "he";
```

Create `apps/admin/i18n/request.ts`:
```typescript
import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

export default getRequestConfig(async () => {
  const locale = defaultLocale; // TODO: Read from cookie/header
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

**Step 2: Wrap layout with NextIntlClientProvider**

In `apps/admin/app/layout.tsx`, import and wrap:
```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AdminShell>{children}</AdminShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 3: Expand message files**

The current `messages/en.json` only has 13 keys. Expand it to cover all admin pages. Required namespaces:
```json
{
  "nav": { "dashboard": "Dashboard", "agents": "AI Agents", "escalations": "Escalations", "payments": "Payments", "offers": "Offers", "users": "Users", "contractors": "Contractors", "analytics": "Analytics", "settings": "Settings", "auditLogs": "Audit Logs", "logout": "Logout" },
  "common": { "loading": "Loading...", "error": "Error", "retry": "Retry", "save": "Save", "cancel": "Cancel", "confirm": "Confirm", "search": "Search", "filter": "Filter", "export": "Export", "noData": "No data available", "actions": "Actions" },
  "dashboard": { "title": "Dashboard", "totalUsers": "Total Users", "activeOffers": "Active Offers", "totalGMV": "Total GMV", "pendingPayments": "Pending Payments", "systemStatus": "System Status", "agentStatus": "Agent Status", "recentEscalations": "Recent Escalations", "pendingApprovals": "Pending Approvals" },
  "agents": { "title": "AI Agents", "subtitle": "Monitor, configure, and manage the Groupio AI agents", "status": "Status", "active": "Active", "idle": "Idle", "error": "Error", "approve": "Approve", "override": "Override", "pendingDecisions": "Pending Decisions", "noDecisions": "No pending decisions", "autonomyMode": "Autonomy Mode" },
  "escalations": { "title": "Escalations", "priority": "Priority", "status": "Status", "assignee": "Assignee", "resolve": "Resolve", "assign": "Assign", "reply": "Reply", "noEscalations": "No escalations" },
  "payments": { "title": "Payments", "escrow": "Escrow", "payouts": "Payouts", "summary": "Summary", "status": "Status", "amount": "Amount", "platformFee": "Platform Fee", "override": "Override Status", "noPayments": "No payments" },
  "offers": { "title": "Offers", "status": "Status", "category": "Category", "participants": "Participants", "approve": "Approve", "flag": "Flag", "cancel": "Cancel", "export": "Export", "noOffers": "No offers" },
  "users": { "title": "Users", "role": "Role", "status": "Status", "suspend": "Suspend", "activate": "Activate", "createAdmin": "Create Admin", "noUsers": "No users" },
  "contractors": { "title": "Contractors", "verification": "Verification", "trustScore": "Trust Score", "requestDocs": "Request Documents", "approve": "Approve", "reject": "Reject", "noContractors": "No contractors" },
  "analytics": { "title": "Analytics", "gmv": "GMV", "users": "Users", "offers": "Offers", "retention": "Retention" },
  "settings": { "title": "Settings", "general": "General", "notifications": "Notifications", "security": "Security", "agents": "Agents", "saved": "Settings saved successfully" },
  "auditLogs": { "title": "Audit Logs", "action": "Action", "actor": "Actor", "timestamp": "Timestamp", "details": "Details", "exportCsv": "Export CSV", "noLogs": "No audit logs" }
}
```

Create matching Hebrew translations in `messages/he.json`.

**Step 4: Update each component to use `useTranslations()`**

For each admin page/component, replace hardcoded strings. Example for dashboard:
```tsx
// Before:
<h1>Dashboard</h1>
<span>Total Users</span>

// After:
const t = useTranslations('dashboard');
<h1>{t('title')}</h1>
<span>{t('totalUsers')}</span>
```

**Acceptance criteria:**
- All 40 admin components use `useTranslations()` with appropriate namespace
- Language toggle in admin app switches between Hebrew and English
- RTL direction set when Hebrew is active (`dir="rtl"` on `<html>`)
- No raw English strings left in components (all go through `t()`)
- Both `en.json` and `he.json` have identical key structures
- Admin app renders correctly in both languages

---

### P1-3: Wire Web App i18n for Core Pages

**Problem:** Only 8 of 146 web components use `useTranslations()`. The i18n infrastructure is set up (`apps/web/i18n/config.ts`, `next-intl` configured) and comprehensive translation files exist (`apps/web/messages/en.json` — 762 lines, `apps/web/messages/he.json` — 765 lines), but 94.5% of components have hardcoded text.

**Priority order for wiring (highest-traffic pages first):**

1. **Auth pages** (login, signup, forgot-password, reset-password, verify-email, onboarding)
   - Namespace: `auth`
   - Files: `apps/web/app/(auth)/*.tsx`

2. **Resident dashboard and offers**
   - Namespace: `resident`, `offers`
   - Files: `apps/web/app/(resident)/dashboard/page.tsx`, `offers/page.tsx`, `offers/[offerId]/page.tsx`

3. **Payment pages**
   - Namespace: `payments`
   - Files: `apps/web/app/(resident)/payments/page.tsx`, `checkout/page.tsx`

4. **Contractor pages**
   - Namespace: `contractor`
   - Files: `apps/web/app/contractor/**/*.tsx`

5. **Profile and settings**
   - Namespace: `profile`
   - Files: `apps/web/app/(resident)/profile/page.tsx`, `change-password/page.tsx`

6. **Chat, building, orders, contractors**
   - Remaining pages

**Pattern to follow** (use existing wired components as reference):
```tsx
import { useTranslations } from 'next-intl';

export default function SomePage() {
  const t = useTranslations('namespace');

  return <h1>{t('pageTitle')}</h1>;
}
```

**Important:** The translation keys already exist in `messages/en.json` and `messages/he.json`. Check the existing keys before adding new ones. The files are organized by namespace (e.g., `auth.login.title`, `offers.browse.title`, `payments.history.title`).

**Acceptance criteria:**
- All auth pages use translations
- Dashboard, offers, and payments pages use translations
- Language toggle at top of page switches all visible text
- No new untranslated keys (if you add text, add it to both en.json and he.json)
- RTL layout works correctly when Hebrew is active

---

### P1-4: Fix Admin Dashboard Pending Payments Hardcoded Value

**Problem:** `apps/admin/app/dashboard/page.tsx` around line 145 has `const pendingPayments = 0; // placeholder`. This means the admin dashboard always shows 0 pending payments regardless of actual state.

**File:** `apps/admin/app/dashboard/page.tsx`

**Required fix:** Use the payments API hook to compute pending payments count:
```typescript
// Replace: const pendingPayments = 0;
// With:
const { data: paymentsData } = useAdminPayments(); // if this hook exists
const pendingPayments = paymentsData?.filter((p: any) => p.status === 'pending' || p.status === 'processing').length ?? 0;
```

If `useAdminPayments` doesn't exist, create a hook that calls `GET /api/v1/admin/payments` or `GET /api/v1/payments/my` (depending on admin context).

**Acceptance criteria:**
- Pending payments card shows real count from API
- Shows 0 only if there are genuinely 0 pending payments
- Loading state while fetching

---

## P2 — MEDIUM PRIORITY (Should fix before broader beta)

---

### P2-1: Add Profile Notification Preferences Implementation (or Remove Disabled Tab)

**Problem:** `apps/web/app/(resident)/profile/page.tsx` has a "Notifications" tab where all toggles are disabled with "בקרוב" (coming soon) text. This is confusing for users.

**File:** `apps/web/app/(resident)/profile/page.tsx`

**Option A — Implement notification preferences:**
1. Add `notification_preferences` field to user profile (backend `PUT /auth/me`)
2. Create preferences schema: `{ email_offers: boolean, email_payments: boolean, push_offers: boolean, push_payments: boolean, push_chat: boolean }`
3. Wire toggles to save preferences via API
4. Backend notification service reads preferences before sending

**Option B — Remove the tab until ready:**
1. Remove the "Notifications" tab from the profile page tabs array
2. Add a comment: `// TODO: Re-add notifications tab when notification preferences are implemented`

**Acceptance criteria (Option A):** Toggles save to backend, reflect on reload, and actually control notification delivery.
**Acceptance criteria (Option B):** Tab is removed; no broken UI visible to users.

---

### P2-2: Implement or Remove Contractor "Request Review" Button

**Problem:** `apps/web/app/contractor/projects/page.tsx` has a "Request Review" button that is disabled with a `title="בקרוב"` tooltip (coming soon). This dead button confuses contractors.

**File:** `apps/web/app/contractor/projects/page.tsx`

**Option A — Implement:**
1. Add `POST /api/v1/contractors/{id}/request-review` backend endpoint
2. Wire button to call endpoint
3. Show success toast after request
4. Disable button for already-reviewed projects

**Option B — Remove:**
1. Remove the disabled button entirely
2. Add comment: `// TODO: Add request review feature`

**Acceptance criteria:** Either the button works end-to-end, or it's removed from the UI.

---

### P2-3: Implement or Remove Contractor Settings Toggles Placeholder

**Problem:** `apps/web/app/contractor/profile/page.tsx` has a settings section with non-functional toggle switches (email notifications, availability, etc.).

**File:** `apps/web/app/contractor/profile/page.tsx`

**Required fix:** Same approach as P2-1 — either wire to real backend preferences or remove the placeholder section.

---

### P2-4: Add Architecture Page to Resident Sidebar Navigation

**Problem:** The architecture upload page at `/architecture` exists and works (drag-drop upload, AI analysis polling) but is NOT linked in the resident sidebar navigation in `apps/web/app/(resident)/layout.tsx`.

**File:** `apps/web/app/(resident)/layout.tsx`

**Required fix:** Add Architecture to the navigation items array. Use a building/blueprint icon. Place it after "Building" in the nav order:

```typescript
// In the navigation items array, add:
{ href: '/architecture', label: t('architecture'), icon: BuildingIcon } // or appropriate icon
```

Also add the translation key `residentNav.architecture` to both `messages/en.json` ("Architecture") and `messages/he.json` ("אדריכלות").

**Acceptance criteria:**
- Architecture page appears in resident sidebar
- Icon is consistent with other nav items
- Active state highlights correctly when on `/architecture`
- Works on mobile sidebar too

---

### P2-5: Add Error State to Admin Analytics Page

**Problem:** `apps/admin/app/analytics/page.tsx` makes real API calls but has no error UI. If the analytics API fails, the page shows nothing with no explanation.

**File:** `apps/admin/app/analytics/page.tsx`

**Required fix:** Add error handling similar to other admin pages:
```tsx
if (analyticsError) {
  return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <h3 className="text-lg font-semibold text-red-800">Failed to load analytics</h3>
        <p className="text-red-600 mt-2">{analyticsError.message}</p>
        <button onClick={refetchAnalytics} className="mt-4 px-4 py-2 bg-red-100 rounded-lg text-red-700 hover:bg-red-200">
          Retry
        </button>
      </div>
    </div>
  );
}
```

---

### P2-6: Wire Mobile App i18n for Remaining Screens

**Problem:** The mobile app (`apps/mobile/`) has comprehensive translation files (`messages/en.json` — 323 lines, `messages/he.json` — 331 lines) and uses `i18n-js` (configured in `apps/mobile/lib/i18n.ts`), but only ~30-40% of screens use `i18n.t()`. The rest have hardcoded text.

**Files:** All screen files in `apps/mobile/app/`

**Pattern to follow:**
```typescript
import { i18n } from '../lib/i18n';

// Replace hardcoded text:
// Before: <Text>My Offers</Text>
// After:  <Text>{i18n.t('tabs.offers')}</Text>
```

**Priority screens to wire:**
1. `(tabs)/index.tsx` — Home screen
2. `(tabs)/offers.tsx` — Offers list
3. `(tabs)/orders.tsx` — Orders list
4. `(tabs)/chat.tsx` — Chat
5. `(tabs)/profile.tsx` — Profile
6. `offer-detail.tsx` — Offer detail
7. `order-detail.tsx` — Order detail
8. `building.tsx` — Building info
9. `payments.tsx` — Payment history
10. `create-offer.tsx` — Create offer (contractor)
11. `contractor-offers.tsx` — Contractor offers
12. `contractor-projects.tsx` — Contractor projects

**Acceptance criteria:**
- All screens use `i18n.t()` for user-visible text
- Language toggle in profile switches all text
- No crashes from missing translation keys (verify all keys exist in both JSON files)

---

### P2-7: Fix Mock View Count on Contractor Active Offers

**Problem:** `apps/web/app/contractor/offers/active/page.tsx` around line 59 has a hardcoded view count value in the analytics panel. This shows misleading data to contractors.

**File:** `apps/web/app/contractor/offers/active/page.tsx`

**Required fix:** Either:
1. Wire to a real analytics endpoint (e.g., `GET /api/v1/offers/{id}/stats`) if it exists
2. Or remove the view count from the UI until real analytics are available

**Acceptance criteria:** View count reflects real data, or the metric is removed.

---

### P2-8: Implement Chat Streaming (SSE)

**Problem:** `apps/web/components/features/chat/AIChat.tsx` sends a message and waits for the complete response. For long AI responses, the user sees nothing until the full response arrives (up to 30 seconds, which is also hardcoded).

**File:** `apps/web/components/features/chat/AIChat.tsx`

**Required fix:**
1. Backend: Add SSE streaming to `POST /api/v1/message` (or create `POST /api/v1/message/stream`)
2. Frontend: Use `EventSource` or `fetch` with `ReadableStream` to incrementally render tokens
3. Show typing indicator while streaming
4. Make timeout configurable via environment variable

**Acceptance criteria:**
- Chat responses stream token-by-token
- User sees partial response immediately
- Typing indicator shown during streaming
- Timeout is configurable (default 60s for streaming)

---

## P3 — LOW PRIORITY (Nice to have before public launch)

---

### P3-1: Fix Buildings-Manager Error Page i18n

**Problem:** `apps/web/app/buildings-manager/error.tsx` has hardcoded Hebrew text instead of using translation keys.

**File:** `apps/web/app/buildings-manager/error.tsx`

**Required fix:** Replace hardcoded Hebrew with `useTranslations('common')` calls.

---

### P3-2: Fix NotificationPanel Hardcoded Time Formatting

**Problem:** `apps/web/components/shared/NotificationPanel.tsx` has a `formatTime()` function with hardcoded Hebrew strings ("עכשיו", "לפני X דקות", etc.).

**File:** `apps/web/components/shared/NotificationPanel.tsx`

**Required fix:** Use `useTranslations('notifications')` and add time-related keys to both locale files. Or use `next-intl`'s `useFormatter()` for relative time formatting.

---

### P3-3: Add Translation Key Parity Test

**Problem:** No automated test verifies that `en.json` and `he.json` have identical key structures. A missing key in one locale would crash the app in production.

**Required fix:** Create a test file that:
1. Loads both JSON files
2. Recursively compares all keys
3. Fails if any key exists in one but not the other
4. Fails if any value is an empty string

Create test files:
- `apps/web/__tests__/i18n-parity.test.ts`
- `apps/admin/__tests__/i18n-parity.test.ts`
- `apps/mobile/__tests__/i18n-parity.test.ts`

```typescript
import en from '../messages/en.json';
import he from '../messages/he.json';

function getKeys(obj: Record<string, any>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null
      ? getKeys(value, fullKey)
      : [fullKey];
  });
}

describe('i18n key parity', () => {
  const enKeys = getKeys(en);
  const heKeys = getKeys(he);

  test('en.json and he.json have the same keys', () => {
    const missingInHe = enKeys.filter(k => !heKeys.includes(k));
    const missingInEn = heKeys.filter(k => !enKeys.includes(k));
    expect(missingInHe).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  test('no empty string values', () => {
    const emptyEn = enKeys.filter(k => {
      const val = k.split('.').reduce((o: any, p) => o?.[p], en);
      return val === '';
    });
    const emptyHe = heKeys.filter(k => {
      const val = k.split('.').reduce((o: any, p) => o?.[p], he);
      return val === '';
    });
    expect(emptyEn).toEqual([]);
    expect(emptyHe).toEqual([]);
  });
});
```

---

### P3-4: Align Type Definitions Between Admin App and @groupio/types

**Problem:** 5 admin app pages have documented TODOs about type mismatches with `@groupio/types`. Each page defines its own local type that partially duplicates the shared types.

**Files with type TODOs:**
1. `apps/web/app/(resident)/orders/page.tsx:27` — `Payment` type duplication
2. `apps/admin/app/offers/page.tsx:34` — `Offer` shape differs
3. `apps/admin/app/users/page.tsx:34` — `User` duplicates admin API shape
4. `apps/admin/app/payments/page.tsx:23` — `PaymentSummary`, `ContractorPayout`, `EscrowAccount` duplication
5. `apps/admin/app/contractors/page.tsx:108` — `trust_score_breakdown` snake_case mismatch

**Required fix:**
1. Identify which fields the admin API returns that differ from `@groupio/types`
2. Either:
   - Extend the shared types to cover admin-specific fields
   - Create `packages/types/src/admin.ts` with admin-specific type extensions
3. Update all 5 files to import from `@groupio/types` instead of defining locally
4. Remove the TODO comments

---

### P3-5: Add Mobile E2E Test Suite

**Problem:** The mobile app has only 3 unit test files. There are no E2E tests for mobile flows.

**Required fix:** Add Maestro or Detox E2E tests covering:
1. Login flow
2. Browse offers
3. Join offer
4. Checkout/payment
5. Chat
6. Profile/language toggle
7. Contractor create offer (if contractor role)

---

### P3-6: Remove or Wire Social Auth Buttons

**Problem:** `packages/ui/src/components/SocialAuthButtons.tsx` exists with Google, Facebook, and Apple sign-in buttons, but no auth page uses this component.

**Required fix:** Either:
1. Wire into login/signup pages with real OAuth providers
2. Or delete the component to avoid dead code

---

### P3-7: Fix Hardcoded Escalation Resolution Note

**Problem:** `apps/web/app/buildings-manager/escalations/page.tsx` line 94 has a hardcoded resolution note: `"Resolved by buildings manager"`.

**File:** `apps/web/app/buildings-manager/escalations/page.tsx`

**Required fix:** Add a text input or textarea to the resolve dialog so the buildings manager can enter a custom resolution note.

---

### P3-8: Make Chat Timeout Configurable

**Problem:** `apps/web/components/features/chat/AIChat.tsx` has a hardcoded 30-second timeout for AI responses.

**File:** `apps/web/components/features/chat/AIChat.tsx`

**Required fix:**
```typescript
const CHAT_TIMEOUT_MS = parseInt(process.env.NEXT_PUBLIC_CHAT_TIMEOUT_MS || '30000', 10);
```

Add `NEXT_PUBLIC_CHAT_TIMEOUT_MS` to `.env.example`.

---

## VERIFICATION CHECKLIST

After completing all fixes, verify:

- [ ] **P0-1/2/3:** Navigate to `/dashboard` as a contractor → redirected to `/contractor/dashboard`
- [ ] **P0-1/2/3:** Navigate to `/contractor/dashboard` as a resident → redirected to `/dashboard`
- [ ] **P0-4:** Create a notification, refresh the page → notification persists
- [ ] **P0-5:** Go to admin agents page → approve/reject buttons work
- [ ] **P1-1:** Admin dashboard shows skeleton while loading, error on failure
- [ ] **P1-2:** Admin app switches between Hebrew and English
- [ ] **P1-3:** Web app core pages switch between Hebrew and English
- [ ] **P1-4:** Admin dashboard pending payments shows real count
- [ ] All existing tests still pass: `pytest tests/` and `npm test` in each app
- [ ] No TypeScript errors: `npx tsc --noEmit` in `apps/web`, `apps/admin`
- [ ] No new console errors in browser dev tools
- [ ] RTL layout correct when Hebrew locale is active
