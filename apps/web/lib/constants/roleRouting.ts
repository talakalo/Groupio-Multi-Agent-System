/**
 * Role-based default landing routes.
 * Used by login page, middleware, and signup to route users after auth.
 *
 * Rules:
 * - super_admin, admin → /admin/dashboard (admin shell)
 * - buildings_manager → /buildings-manager/dashboard (buildings-manager shell)
 * - contractor → /contractor/dashboard
 * - resident → /dashboard
 */

export type AdminRole = 'admin' | 'super_admin';
export type BuildingsManagerRole = 'buildings_manager';
export type ContractorRole = 'contractor';
export type ResidentRole = 'resident';

const ADMIN_ROLES: AdminRole[] = ['admin', 'super_admin'];
const BUILDINGS_MANAGER_ROLE: BuildingsManagerRole = 'buildings_manager';

/** Roles that default to admin dashboard (NOT buildings-manager). */
export const ADMIN_DEFAULT_ROLES = ADMIN_ROLES;

/** Roles that default to buildings-manager dashboard. */
export const BUILDINGS_MANAGER_DEFAULT_ROLES = [BUILDINGS_MANAGER_ROLE];

/** Roles allowed to access /admin routes (admin + super_admin only). */
export const ADMIN_ROUTE_ROLES = ADMIN_ROLES;

/** Roles allowed to access /buildings-manager routes. */
export const BUILDINGS_MANAGER_ROUTE_ROLES = [...ADMIN_ROLES, BUILDINGS_MANAGER_ROLE];

/**
 * Returns the default landing route for a role after login.
 */
export function getDefaultRouteForRole(role: string): string {
  if (ADMIN_DEFAULT_ROLES.includes(role as AdminRole)) {
    return '/admin/dashboard';
  }
  if (BUILDINGS_MANAGER_DEFAULT_ROLES.includes(role as BuildingsManagerRole)) {
    return '/buildings-manager/dashboard';
  }
  if (role === 'contractor') {
    return '/contractor/dashboard';
  }
  return '/dashboard';
}
