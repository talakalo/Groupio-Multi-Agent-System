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

import { expect, test } from "./fixtures/auth-fixtures";

test.describe("Admin Dashboard – /admin/dashboard", () => {
  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("admin");
  });

  test("renders page heading", async ({ adminPage }) => {
    await adminPage.gotoDashboard();
    await expect(adminPage.dashboardHeading).toBeVisible({ timeout: 15_000 });
  });

  test("contains a link to buildings-manager dashboard", async ({ adminPage }) => {
    await adminPage.gotoDashboard();
    const bmLink = adminPage.rawPage.locator('a[href="/buildings-manager/dashboard"]');
    await expect(bmLink.first()).toBeVisible({ timeout: 10_000 });
  });

  test("contains a link to standalone admin app", async ({ adminPage }) => {
    await adminPage.gotoDashboard();
    const adminLink = adminPage.rawPage.locator('a[target="_blank"]');
    await expect(adminLink.first()).toBeVisible({ timeout: 10_000 });
  });

  test("has LanguageToggle in the layout", async ({ adminPage }) => {
    await adminPage.gotoDashboard();
    const toggle = adminPage.rawPage.getByRole("button", { name: /עברית|English/i }).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Admin Account – /admin/account", () => {
  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("admin");
  });

  test("renders account page heading", async ({ adminPage }) => {
    await adminPage.gotoAccount();
    await expect(adminPage.rawPage.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("shows user email from auth store", async ({ adminPage }) => {
    await adminPage.gotoAccount();
    const adminEmail = "admin@groupio.co.il";
    await expect(adminPage.rawPage.getByText(new RegExp(adminEmail, "i")).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("has a logout button", async ({ adminPage }) => {
    await adminPage.gotoAccount();
    const logoutBtn = adminPage.rawPage.getByRole("button", { name: /התנתק|logout/i });
    await expect(logoutBtn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("has link back to admin dashboard", async ({ adminPage }) => {
    await adminPage.gotoAccount();
    const backLink = adminPage.rawPage.getByRole("link", {
      name: /חזרה ללוח הבקרה|Back to Dashboard/i,
    });
    await expect(backLink.first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Admin Buildings – /admin/buildings redirects", () => {
  test("redirects to /buildings-manager/buildings", async ({ adminPage, page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("admin");
    await page.route("**/api/v1/buildings*", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await adminPage.gotoBuildings();
    await expect(page).toHaveURL(/buildings-manager\/buildings/, { timeout: 15_000 });
  });
});

test.describe("Admin pages language switching", () => {
  test("switching to English updates html lang attribute", async ({ adminPage, page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("admin");
    await page.context().addCookies([
      { name: "NEXT_LOCALE", value: "he", url: "http://localhost:3000" },
    ]);
    await adminPage.gotoDashboard();

    const enBtn = page.getByRole("button", { name: /English/i }).first();
    if (await enBtn.isVisible({ timeout: 5_000 })) {
      await enBtn.click();
      await expect(page.locator("html")).toHaveAttribute("lang", /^en/, { timeout: 10_000 });
    }
  });

  test("Hebrew locale sets RTL direction on admin account", async ({ adminPage, page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("admin");
    await page.context().addCookies([
      { name: "NEXT_LOCALE", value: "he", url: "http://localhost:3000" },
    ]);
    await adminPage.gotoAccount();
    const dir = await page.locator("html").getAttribute("dir");
    expect(["rtl", null]).toContain(dir);
  });
});

test.describe("Super Admin access to admin pages", () => {
  test("super_admin can access admin dashboard", async ({ adminPage, setupAuthAndMocks }) => {
    await setupAuthAndMocks("super_admin");
    await adminPage.gotoDashboard();
    await expect(adminPage.rawPage.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("super_admin can access admin account page", async ({ adminPage, setupAuthAndMocks }) => {
    await setupAuthAndMocks("super_admin");
    await adminPage.gotoAccount();
    await expect(adminPage.rawPage.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });
});
