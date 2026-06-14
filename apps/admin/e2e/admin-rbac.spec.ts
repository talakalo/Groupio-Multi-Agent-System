/**
 * admin-rbac.spec.ts
 *
 * Browser-level RBAC tests for the admin app (:3001).
 *
 * Tests the P0 security fix: buildings_manager, resident, and contractor must
 * NOT access the admin app shell. Only admin and super_admin are allowed.
 *
 * Strategy:
 *   - Inject forged role cookies to simulate each role session
 *   - The admin app middleware reads the `groupio-auth` cookie for the role hint
 *   - Verify that protected pages redirect to /login for non-admin roles
 *   - Verify that admin / super_admin can reach the dashboard
 *
 * This mirrors the unit test in apps/admin/__tests__/middleware.test.ts but at
 * the real browser + Next.js middleware level (full end-to-end).
 */

import { test, expect } from "@playwright/test";
import { envConfig } from "./config/env.config";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Role = "resident" | "contractor" | "buildings_manager" | "admin" | "super_admin";

/**
 * Encode the role cookie in the Zustand persist format that middleware.ts reads.
 *
 * middleware.ts does:
 *   JSON.parse(decodeURIComponent(cookie.value))?.state?.user?.role
 *
 * So the cookie must be a raw JSON string in Zustand store shape — NOT base64.
 */
function encodeAuthCookie(role: Role): string {
  return JSON.stringify({
    state: {
      user: { id: `test-${role}`, email: `${role}@groupio.test`, role },
      isAuthenticated: true,
    },
    version: 0,
  });
}

/**
 * Inject auth cookies for a given role.
 * - `groupio-auth` is the role hint cookie read by Next.js middleware
 * - `refresh_token` signals an active session exists
 * - `admin_role_verified` is set to "1" only for actual admin roles
 */
async function injectRoleCookies(
  page: import("@playwright/test").Page,
  role: Role,
): Promise<void> {
  const isAdmin = role === "admin" || role === "super_admin";
  const cookies: Array<{ name: string; value: string; url: string }> = [
    { name: "groupio-auth", value: encodeAuthCookie(role), url: envConfig.baseURL },
    { name: "refresh_token", value: `e2e-${role}-refresh`, url: envConfig.baseURL },
  ];
  if (isAdmin) {
    cookies.push({ name: "admin_role_verified", value: "1", url: envConfig.baseURL });
  }
  await page.context().addCookies(cookies);
}

// ─── Non-admin roles must be blocked ─────────────────────────────────────────

test.describe("Non-admin roles blocked from admin app (P0 RBAC fix)", () => {
  const blockedRoles: Role[] = ["buildings_manager", "resident", "contractor"];
  const protectedPaths = ["/dashboard", "/users", "/contractors", "/offers", "/payments"];

  for (const role of blockedRoles) {
    test.describe(`${role}`, () => {
      test.beforeEach(async ({ page }) => {
        await injectRoleCookies(page, role);
      });

      for (const path of protectedPaths) {
        test(`blocked from ${path} → redirected to /login`, async ({ page }) => {
          await page.goto(`${envConfig.baseURL}${path}`, { waitUntil: "commit" });
          await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
        });
      }
    });
  }
});

// ─── P0 Critical: buildings_manager specifically ──────────────────────────────

test.describe("buildings_manager — P0 critical (was in ALLOWED_ADMIN_ROLES before fix)", () => {
  test.beforeEach(async ({ page }) => {
    await injectRoleCookies(page, "buildings_manager");
  });

  test("admin app root / redirects to /login", async ({ page }) => {
    await page.goto(envConfig.baseURL, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("admin app /dashboard redirects to /login", async ({ page }) => {
    await page.goto(`${envConfig.baseURL}/dashboard`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("admin app /users redirects to /login", async ({ page }) => {
    await page.goto(`${envConfig.baseURL}/users`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("admin app /contractors redirects to /login", async ({ page }) => {
    await page.goto(`${envConfig.baseURL}/contractors`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("admin app /escalations redirects to /login", async ({ page }) => {
    // buildings_manager has escalations access on web (:3000), not admin (:3001)
    await page.goto(`${envConfig.baseURL}/escalations`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

// ─── Admin roles allowed ──────────────────────────────────────────────────────

test.describe("Admin / Super Admin allowed into admin app", () => {
  for (const role of ["admin", "super_admin"] as Role[]) {
    test.describe(role, () => {
      test.beforeEach(async ({ page }) => {
        await injectRoleCookies(page, role);

        // Mock out backend API calls so the dashboard loads even without a real server response
        await page.route("**/api/v1/health", (r) =>
          r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              status: "ok",
              services: { postgres: true, redis: true, vector_db: true, graph_db: true },
            }),
          }),
        );
        await page.route("**/api/v1/admin/**", (r) =>
          r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: [], total: 0 }),
          }),
        );
        await page.route("**/api/v1/auth/me", (r) =>
          r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "admin-01", email: "admin@groupio.co.il", role }),
          }),
        );
      });

      test(`${role} can reach /dashboard (not redirected to /login)`, async ({ page }) => {
        await page.goto(`${envConfig.baseURL}/dashboard`, { waitUntil: "commit" });
        // Should NOT end up at /login
        await page.waitForTimeout(1000); // allow middleware redirect to settle
        expect(page.url()).not.toMatch(/\/login/);
      });
    });
  }
});

// ─── Anonymous blocked ────────────────────────────────────────────────────────

test.describe("Anonymous (no session)", () => {
  test("root redirects to /login", async ({ page }) => {
    await page.goto(envConfig.baseURL, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("/dashboard redirects to /login", async ({ page }) => {
    await page.goto(`${envConfig.baseURL}/dashboard`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("/users redirects to /login", async ({ page }) => {
    await page.goto(`${envConfig.baseURL}/users`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
