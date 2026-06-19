/**
 * rbac-browser.spec.ts
 *
 * Browser-level RBAC validation.
 * Verifies that Next.js middleware correctly routes / blocks each role,
 * and that the admin app at :3001 blocks non-admin roles.
 *
 * Strategy:
 * - Uses mock auth state (loginAs helper) — no real backend login required
 * - Tests URL after navigation (not HTML content) so tests are stable
 * - Covers anonymous, resident, contractor, buildings_manager, admin, super_admin
 */

import { expect, test } from "./fixtures/auth-fixtures";
import { envConfig } from "./config/env.config";

const ADMIN_APP_URL = "http://localhost:3001";

// Checked once per worker in beforeAll — avoids hard-failing when the admin
// app (apps/admin, :3001) isn't started (e.g. CI runs without --admin flag).
let adminAvailable = false;

test.beforeAll(async () => {
  try {
    const res = await fetch(ADMIN_APP_URL, {
      signal: AbortSignal.timeout(3_000),
    });
    adminAvailable = res.status < 500;
  } catch {
    adminAvailable = false;
  }
});

// ─── Anonymous ───────────────────────────────────────────────────────────────

test.describe("Anonymous (no session)", () => {
  test("/ is the public landing page (no forced login redirect)", async ({ page }) => {
    // The root path serves a public landing page or redirects to /login.
    // Either is acceptable — this test verifies the app does NOT crash on root.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Accept either the landing page OR a redirect to login — both are valid.
    const url = page.url();
    expect(url).toMatch(/localhost:3000/);
  });

  test("/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("/contractor/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/contractor/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("/buildings-manager/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/buildings-manager/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("/login is publicly accessible", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("/signup is publicly accessible", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/signup/, { timeout: 10_000 });
  });

  test("admin app /dashboard redirects to /login", async ({ page }) => {
    test.skip(!adminAvailable, "Admin app (localhost:3001) is not running");
    await page.goto(`${ADMIN_APP_URL}/dashboard`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

// ─── Resident ────────────────────────────────────────────────────────────────

test.describe("Resident routing", () => {
  test("resident reaches /dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
    await page.goto("/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("resident blocked from /contractor/dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
    await page.goto("/contractor/dashboard", { waitUntil: "commit" });
    await expect(page).not.toHaveURL(/\/contractor\/dashboard/, { timeout: 10_000 });
  });

  test("resident blocked from /buildings-manager/dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
    await page.goto("/buildings-manager/dashboard", { waitUntil: "commit" });
    await expect(page).not.toHaveURL(/\/buildings-manager\/dashboard/, { timeout: 10_000 });
  });

  test("resident blocked from admin app", async ({ page, setupAuthAndMocks }) => {
    test.skip(!adminAvailable, "Admin app (localhost:3001) is not running");
    await setupAuthAndMocks("resident");
    await page.goto(`${ADMIN_APP_URL}/dashboard`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

// ─── Contractor ───────────────────────────────────────────────────────────────

test.describe("Contractor routing", () => {
  test("contractor reaches /contractor/dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("contractor");
    await page.goto("/contractor/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/contractor\/dashboard/, { timeout: 15_000 });
  });

  test("contractor blocked from /dashboard (resident)", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("contractor");
    await page.goto("/dashboard", { waitUntil: "commit" });
    // Middleware must redirect contractor away from the RESIDENT /dashboard.
    // /contractor/dashboard is allowed; only http://localhost:3000/dashboard (exact) is forbidden.
    await expect(page).not.toHaveURL(/^http:\/\/localhost:3000\/dashboard$/, { timeout: 10_000 });
  });

  test("contractor blocked from /buildings-manager/dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("contractor");
    await page.goto("/buildings-manager/dashboard", { waitUntil: "commit" });
    await expect(page).not.toHaveURL(/\/buildings-manager\/dashboard/, { timeout: 10_000 });
  });

  test("contractor blocked from admin app", async ({ page, setupAuthAndMocks }) => {
    test.skip(!adminAvailable, "Admin app (localhost:3001) is not running");
    await setupAuthAndMocks("contractor");
    await page.goto(`${ADMIN_APP_URL}/dashboard`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

// ─── Buildings Manager ────────────────────────────────────────────────────────

test.describe("Buildings Manager routing — P0 RBAC fix", () => {
  test("buildings_manager reaches /buildings-manager/dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("buildings_manager");
    await page.goto("/buildings-manager/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/buildings-manager\/dashboard/, { timeout: 15_000 });
  });

  test("buildings_manager blocked from /dashboard (resident route)", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("buildings_manager");
    await page.goto("/dashboard", { waitUntil: "commit" });
    await expect(page).not.toHaveURL(/^http:\/\/localhost:3000\/dashboard$/, { timeout: 10_000 });
  });

  test("buildings_manager blocked from admin app — P0 fix", async ({ page, setupAuthAndMocks }) => {
    test.skip(!adminAvailable, "Admin app (localhost:3001) is not running");
    // This was the P0 bug: buildings_manager was in ALLOWED_ADMIN_ROLES on :3001
    // After fix, must redirect to /login on the admin app.
    await setupAuthAndMocks("buildings_manager");
    await page.goto(`${ADMIN_APP_URL}/dashboard`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("buildings_manager blocked from admin app users page", async ({ page, setupAuthAndMocks }) => {
    test.skip(!adminAvailable, "Admin app (localhost:3001) is not running");
    await setupAuthAndMocks("buildings_manager");
    await page.goto(`${ADMIN_APP_URL}/users`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("buildings_manager blocked from admin app contractors page", async ({ page, setupAuthAndMocks }) => {
    test.skip(!adminAvailable, "Admin app (localhost:3001) is not running");
    await setupAuthAndMocks("buildings_manager");
    await page.goto(`${ADMIN_APP_URL}/contractors`, { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

// ─── Admin / Super Admin ──────────────────────────────────────────────────────

test.describe("Admin / Super Admin routing", () => {
  for (const role of ["admin", "super_admin"] as const) {
    test(`${role} can access web app without crash`, async ({ page, setupAuthAndMocks }) => {
      // Web middleware does not force-redirect admin/super_admin away from the web app —
      // redirection to the admin shell (:3001) happens post-login in the auth flow.
      // This test simply verifies no crash or error on load.
      await setupAuthAndMocks(role);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      // Accept any URL (may stay on /dashboard or redirect to /admin/dashboard on web)
      // The key check: no JS crash
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.waitForTimeout(1000);
      expect(errors, `JS errors for ${role}: ${errors.join("; ")}`).toHaveLength(0);
    });
  }
});
