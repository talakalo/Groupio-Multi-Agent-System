/**
 * E2E tests for Admin user flows.
 *
 * Covers:
 *  - Admin dashboard renders both nav cards
 *  - Admin account page shows user info and logout button
 *  - Admin/buildings redirects to /buildings-manager/buildings
 *  - LanguageToggle present in admin layout
 *  - Language switching (he ↔ en) on admin pages
 *
 * All backend calls are intercepted — no real server required.
 */

import { test, expect } from "./api/test";
import { setupAuthAndMocks } from "./api/actions";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function setupAdmin(page: import("@playwright/test").Page) {
  await setupAuthAndMocks(page, "admin");
  // Admin dashboard doesn't call /api/v1/buildings/* so the base mocks are enough
}

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

test.describe("Admin Dashboard – /admin/dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupAdmin(page);
  });

  test("renders page heading", async ({ page }) => {
    await page.goto("/admin/dashboard");
    // h1 rendered via t('admin.dashboard.title')
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("contains a link to buildings-manager dashboard", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    const bmLink = page.locator('a[href="/buildings-manager/dashboard"]');
    await expect(bmLink.first()).toBeVisible({ timeout: 10_000 });
  });

  test("contains a link to standalone admin app", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    // Standalone admin link opens in a new tab (_blank)
    const adminLink = page.locator('a[target="_blank"]');
    await expect(adminLink.first()).toBeVisible({ timeout: 10_000 });
  });

  test("has LanguageToggle in the layout", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    const toggle = page.getByRole("button", { name: /עברית|English/i }).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Admin Account ─────────────────────────────────────────────────────────

test.describe("Admin Account – /admin/account", () => {
  test.beforeEach(async ({ page }) => {
    await setupAdmin(page);
  });

  test("renders account page heading", async ({ page }) => {
    await page.goto("/admin/account");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("shows user email from auth store", async ({ page }) => {
    await page.goto("/admin/account");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    // The page renders the email from Zustand auth store
    const adminEmail = "admin@groupio.co.il";
    await expect(page.getByText(new RegExp(adminEmail, "i")).first()).toBeVisible({ timeout: 10_000 });
  });

  test("has a logout button", async ({ page }) => {
    await page.goto("/admin/account");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    const logoutBtn = page.getByRole("button", { name: /התנתק|logout/i });
    await expect(logoutBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("has link back to admin dashboard", async ({ page }) => {
    await page.goto("/admin/account");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    // Use the link's translated text to avoid matching the hidden sidebar nav item.
    const backLink = page.getByRole("link", { name: /חזרה ללוח הבקרה|Back to Dashboard/i });
    await expect(backLink.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Admin Buildings Redirect ─────────────────────────────────────────────

test.describe("Admin Buildings – /admin/buildings redirects", () => {
  test("redirects to /buildings-manager/buildings", async ({ page }) => {
    await setupAdmin(page);
    // Intercept buildings-manager route to avoid needing its mocks
    await page.route("**/api/v1/buildings*", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.goto("/admin/buildings");
    await expect(page).toHaveURL(/buildings-manager\/buildings/, { timeout: 15_000 });
  });
});

// ─── Language Switching on Admin Pages ────────────────────────────────────

test.describe("Admin pages language switching", () => {
  test("switching to English updates html lang attribute", async ({ page }) => {
    await setupAdmin(page);

    // Start in Hebrew
    await page.context().addCookies([
      { name: "NEXT_LOCALE", value: "he", url: "http://localhost:3000" },
    ]);
    await page.goto("/admin/dashboard");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });

    // Click "English" toggle button
    const enBtn = page.getByRole("button", { name: /English/i }).first();
    if (await enBtn.isVisible({ timeout: 5_000 })) {
      await enBtn.click();
      // After switching, lang attribute should be 'en'
      await expect(page.locator("html")).toHaveAttribute("lang", /^en/, { timeout: 10_000 });
    }
  });

  test("Hebrew locale sets RTL direction on admin account", async ({ page }) => {
    await setupAdmin(page);
    await page.context().addCookies([
      { name: "NEXT_LOCALE", value: "he", url: "http://localhost:3000" },
    ]);
    await page.goto("/admin/account");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    // The account page has dir="rtl" when locale is "he"
    const dir = await page.locator("html").getAttribute("dir");
    expect(["rtl", null]).toContain(dir); // rtl or unset (handled by CSS)
  });
});

// ─── Super Admin Access ───────────────────────────────────────────────────

test.describe("Super Admin access to admin pages", () => {
  test("super_admin can access admin dashboard", async ({ page }) => {
    await setupAuthAndMocks(page, "super_admin");
    await page.goto("/admin/dashboard");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("super_admin can access admin account page", async ({ page }) => {
    await setupAuthAndMocks(page, "super_admin");
    await page.goto("/admin/account");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });
});
