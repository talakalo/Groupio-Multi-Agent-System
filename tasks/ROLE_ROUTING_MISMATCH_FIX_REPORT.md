# Groupio Role Routing Mismatch Report

## 1. Executive Summary

**Root cause:** The login redirect logic and middleware routed `admin`, `super_admin`, and `buildings_manager` to the same default route (`/buildings-manager/dashboard`). Super Admin and Admin users were landing in the buildings-manager shell instead of a distinct admin shell.

**Why superadmin landed on buildings-manager:** The app previously had no `/admin` route. All three admin-family roles were intentionally sent to the only admin-style UI (buildings-manager). This violated the requirement that "allowed access to another role family must not imply default landing on that family."

**What was fixed:**
1. Created `/admin` route with its own layout and dashboard (admin/super_admin only).
2. Introduced `getDefaultRouteForRole()` in `lib/constants/roleRouting.ts` as the single source of truth for role → default route.
3. Updated login page and middleware to route:
   - `super_admin`, `admin` → `/admin/dashboard`
   - `buildings_manager` → `/buildings-manager/dashboard`
   - `contractor` → `/contractor/dashboard`
   - `resident` → `/dashboard`

---

## 2. Role Resolution Root Cause

| Field | Value |
|-------|-------|
| **Backend role** | `super_admin` (from `users.role`, returned by `/api/v1/auth/me`) |
| **Frontend normalized role** | Same string `super_admin` (no normalization; passed through) |
| **Wrong route chosen** | `/buildings-manager/dashboard` |
| **Correct route expected** | `/admin/dashboard` |
| **Exact files** | `apps/web/app/(auth)/login/page.tsx`, `apps/web/middleware.ts` |
| **Exact functions** | `onSubmit` (login), middleware `if (isAuthRoute && isAuthenticated)` block |
| **Mismatch reason** | All three roles (`admin`, `super_admin`, `buildings_manager`) were lumped into one redirect branch |

---

## 3. Shell / Layout Findings

| Field | Value |
|-------|-------|
| **pathname** | `/buildings-manager/dashboard` |
| **activeUserRole** | `super_admin` |
| **selectedLayout** | `BuildingsManagerLayout` |
| **selectedSidebar** | buildings-manager sidebar (emerald theme) |
| **expectedLayout** | `AdminLayout` (indigo theme) |
| **expectedSidebar** | admin sidebar ("Super Admin" / "Admin") |
| **rootCause** | Default route was `/buildings-manager/dashboard` for super_admin; shell is chosen by pathname, so buildings-manager layout rendered |

**Shell selection logic:** Layout is chosen by pathname (Next.js file-based routing). `/admin/*` uses `app/admin/layout.tsx`; `/buildings-manager/*` uses `app/buildings-manager/layout.tsx`. The bug was purely in the default landing route, not in layout selection.

---

## 4. Session / Hydration Findings

- **Stale persisted state:** Not observed. Role is read from `/me` after login and stored in auth store + `groupio-auth` cookie.
- **Hydration:** No timing issues. Role is available when redirect runs.
- **No changes** to auth store or session handling.

---

## 5. Fixes Implemented

### Routing
- **`lib/constants/roleRouting.ts`** (new): Central `getDefaultRouteForRole()` for role → default route.
- **`app/(auth)/login/page.tsx`**: Replaced inline redirect logic with `getDefaultRouteForRole(role)`.
- **`middleware.ts`**: Replaced inline redirect logic with `getDefaultRouteForRole(userRole || '')`.

### Admin Section (new)
- **`app/admin/layout.tsx`**: Admin shell (indigo theme), admin + super_admin only.
- **`app/admin/dashboard/page.tsx`**: Admin dashboard with link to Buildings Manager.
- **`app/admin/dashboard/loading.tsx`**: Loading skeleton.
- **`app/admin/buildings/page.tsx`**: Redirect to `/buildings-manager/buildings`.

### i18n
- **`messages/en.json`, `messages/he.json`**: Added `admin.dashboard`, `adminNav` keys.

### Tests
- **`__tests__/roleRouting.test.ts`** (new): Unit tests for `getDefaultRouteForRole`.
- **`__tests__/LoginPage.test.tsx`**: Updated super_admin redirect expectation to `/admin/dashboard`; added admin and buildings_manager redirect tests.
- **`__tests__/buildingsManagerI18n.test.ts`**: Added admin i18n key checks.

---

## 6. Role Verification Matrix

| Role | Login Works | Lands On Correct Default Route | Sees Correct Shell | Sees Correct Sidebar | Route Guard Correct |
|------|-------------|--------------------------------|--------------------|----------------------|---------------------|
| resident | Yes | `/dashboard` | ResidentLayout | residentNav | Yes |
| contractor | Yes | `/contractor/dashboard` | ContractorLayout | contractorNav | Yes |
| buildings_manager | Yes | `/buildings-manager/dashboard` | BuildingsManagerLayout | buildingsManagerNav | Yes |
| admin | Yes | `/admin/dashboard` | AdminLayout | adminNav | Yes |
| super_admin | Yes | `/admin/dashboard` | AdminLayout | adminNav | Yes |

---

## 7. Tests Added or Updated

| Test File | Change |
|-----------|--------|
| `__tests__/roleRouting.test.ts` | New: `getDefaultRouteForRole` for all roles |
| `__tests__/LoginPage.test.tsx` | super_admin → `/admin/dashboard`; added admin, buildings_manager tests |
| `__tests__/buildingsManagerI18n.test.ts` | Added admin.dashboard, adminNav key checks |

---

## 8. Validation

- **Manual:** Log in as super_admin → should land on `/admin/dashboard` with indigo admin shell.
- **Manual:** Log in as admin → same.
- **Manual:** Log in as buildings_manager → should land on `/buildings-manager/dashboard` with emerald shell.
- **Tests:** `pnpm test` in apps/web (roleRouting, LoginPage, buildingsManagerI18n).

---

## 9. Remaining Risks

- **Admin app (`apps/admin`):** If used, admin/super_admin could optionally redirect to `NEXT_PUBLIC_ADMIN_URL`; not implemented.
- **Admin dashboard scope:** Currently a hub with link to Buildings Manager; system settings is placeholder.
