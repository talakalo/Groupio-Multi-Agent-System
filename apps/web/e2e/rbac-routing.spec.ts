import type { Page } from "@playwright/test";
import { setupAuthAndMocks } from "./api/actions";
import { test, expect } from "./api/test";

/**
 * Next.js middleware role hints (cookie + refresh_token) — UX routing only.
 * API authorization is covered in backend integration tests.
 *
 * Next.js App Router middleware redirects abort the initial navigation before
 * the "load" event fires in Chromium. Using waitUntil:"commit" stops after
 * the final response headers are received so goto resolves cleanly.
 */
async function gotoCommit(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "commit" });
}

test.describe("RBAC routing (middleware)", () => {
  test("resident is redirected away from /admin", async ({ page }) => {
    await setupAuthAndMocks(page, "resident");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("resident is redirected away from /contractor", async ({ page }) => {
    await setupAuthAndMocks(page, "resident");
    await gotoCommit(page, "/contractor/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("contractor is redirected away from /admin", async ({ page }) => {
    await setupAuthAndMocks(page, "contractor");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("buildings_manager is redirected away from /admin", async ({ page }) => {
    await setupAuthAndMocks(page, "buildings_manager");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("buildings_manager can open buildings-manager dashboard", async ({ page }) => {
    await setupAuthAndMocks(page, "buildings_manager");
    await gotoCommit(page, "/buildings-manager/dashboard");
    await expect(page).toHaveURL(/\/buildings-manager\/dashboard/, { timeout: 15_000 });
  });

  test("admin can open /admin/dashboard", async ({ page }) => {
    await setupAuthAndMocks(page, "admin");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("super_admin can open /admin/dashboard", async ({ page }) => {
    await setupAuthAndMocks(page, "super_admin");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("contractor is redirected away from /buildings-manager", async ({ page }) => {
    await setupAuthAndMocks(page, "contractor");
    await gotoCommit(page, "/buildings-manager/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
