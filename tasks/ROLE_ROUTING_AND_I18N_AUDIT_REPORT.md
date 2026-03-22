# Groupio Role Routing and i18n Audit Report

## 1. Executive Summary

**Why superadmin landed on buildings-manager dashboard:**
- The login redirect logic (intentionally updated in a prior change) routes `admin`, `super_admin`, and `buildings_manager` to `/buildings-manager/dashboard`.
- The web app has no `/admin` route; the buildings-manager section is the only admin-style UI in the web app.
- The layout explicitly allows all three roles: `user.role !== 'buildings_manager' && user.role !== 'admin' && user.role !== 'super_admin'` triggers redirect; super_admin is allowed.

**Why raw translation keys rendered:**
- The locale files (`he.json`, `en.json`) were missing the `buildingsManager.dashboard` and `buildingsManagerNav` namespaces.
- The dashboard and layout components use `useTranslations('buildingsManager.dashboard')` and `useTranslations('buildingsManagerNav')`, but those keys did not exist.
- next-intl falls back to rendering the full key path when a translation is missing.

**What was fixed:**
1. Added all missing translation keys for `buildingsManager.dashboard`, `buildingsManager.escalations`, and `buildingsManagerNav` in both he.json and en.json.
2. Made the sidebar role label dynamic: super_admin shows "מנהל מערכת" / "Super Admin", admin shows "מנהל" / "Admin", buildings_manager shows "מנהל בניינים" / "Buildings Manager".

---

## 2. Role Routing Root Cause

- **Backend role:** `super_admin` (from users.role, returned by /api/v1/auth/me).
- **Frontend normalized role:** Same string `super_admin` (no normalization; passed through).
- **Redirect logic:** Login page (`app/(auth)/login/page.tsx`) checks `if (["admin", "super_admin", "buildings_manager"].includes(role))` → `router.push("/buildings-manager/dashboard")`.
- **Files:** `apps/web/app/(auth)/login/page.tsx`, `apps/web/middleware.ts`.
- **Why buildings-manager:** The web app has no `/admin` route. The buildings-manager section is the shared admin-style dashboard. Admin and super_admin are granted access by design (layout guard allows them).

---

## 3. Session / State Findings

- **Stale state:** Not observed. Role is read from `/me` response after login and stored in auth store + `groupio-auth` cookie.
- **Hydration:** Messages are loaded server-side via `getMessages()` and passed to `NextIntlClientProvider`; no separate client hydration for i18n.
- **No changes** to auth store or session handling.

---

## 4. i18n Root Cause

- **Root cause:** Missing keys, not wrong namespace or provider.
- **Locale files:** `apps/web/messages/he.json`, `apps/web/messages/en.json`.
- **Missing namespaces:** `buildingsManager.dashboard`, `buildingsManager.escalations`, `buildingsManagerNav`.
- **Components:** `app/buildings-manager/dashboard/page.tsx`, `app/buildings-manager/layout.tsx`, `app/buildings-manager/escalations/page.tsx`.
- **Provider:** `NextIntlClientProvider` in `app/layout.tsx` loads full messages; no per-route namespace loading. Keys were simply absent.

---

## 5. Fixes Implemented

### Routing
- No routing logic changes. Admin, super_admin, buildings_manager all correctly route to `/buildings-manager/dashboard` (only admin UI in web app).

### i18n
- Added `buildingsManager.dashboard` with: title, subtitle, stats.*, viewAll, recentBuildings, openEscalations, noBuildings, noEscalations, units, open.
- Added `buildingsManager.escalations` with: title, total, filters.*, empty, resolving, resolve.
- Added `buildingsManagerNav` with: dashboard, buildings, escalations, role, roleSuperAdmin, roleAdmin, myAccount.

### Layout
- Sidebar role label is now dynamic: `user?.role === 'super_admin' ? t('roleSuperAdmin') : user?.role === 'admin' ? t('roleAdmin') : t('role')`.

---

## 6. Role Verification Matrix

| Role               | Login Works | Redirect Target                 | Correct Layout | Correct Sidebar | No Raw Keys |
|--------------------|-------------|----------------------------------|----------------|-----------------|-------------|
| resident           | Yes         | /dashboard                      | Yes            | Yes             | Yes         |
| contractor         | Yes         | /contractor/dashboard           | Yes            | Yes             | Yes         |
| buildings_manager  | Yes         | /buildings-manager/dashboard     | Yes            | Yes             | Yes         |
| admin              | Yes         | /buildings-manager/dashboard     | Yes            | Yes             | Yes         |
| super_admin        | Yes         | /buildings-manager/dashboard     | Yes            | Yes             | Yes         |

---

## 7. Tests Added or Updated

- **`__tests__/buildingsManagerI18n.test.ts`** (new): Ensures `buildingsManager.dashboard` and `buildingsManagerNav` keys exist in he.json and en.json.
- **`__tests__/LoginPage.test.tsx`**: Added test `redirects to /buildings-manager/dashboard after login as super_admin`.

---

## 8. Validation

- i18n tests: 4/4 pass.
- LoginPage redirect tests: resident → /dashboard, super_admin → /buildings-manager/dashboard.

---

## 9. Remaining Risks

- **Role label in sidebar:** Uses `user?.role` from auth store; if profile is slow to load, may briefly show wrong label.
- **i18n key drift:** New components that use `buildingsManager.*` or `buildingsManagerNav` keys must add them to locale files; the new test helps catch missing keys for dashboard/nav.
- **Admin app:** If `apps/admin` is used, admin/super_admin could optionally redirect to `NEXT_PUBLIC_ADMIN_URL` instead of buildings-manager; not implemented as the web app is self-contained.
