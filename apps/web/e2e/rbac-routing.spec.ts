import { setupAuthAndMocks } from "./api/actions";
import { test, expect } from "./api/test";

/**
 * Next.js middleware role hints (cookie + refresh_token) — UX routing only.
 * API authorization is covered in backend integration tests.
 */
test.describe("RBAC routing (middleware)", () => {
  test("resident is redirected away from /admin", async ({ page }) => {
    await setupAuthAndMocks(page, "resident");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("resident is redirected away from /contractor", async ({ page }) => {
    await setupAuthAndMocks(page, "resident");
    await page.goto("/contractor/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("contractor is redirected away from /admin", async ({ page }) => {
    await setupAuthAndMocks(page, "contractor");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("buildings_manager is redirected away from /admin", async ({ page }) => {
    await setupAuthAndMocks(page, "buildings_manager");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("buildings_manager can open buildings-manager dashboard", async ({ page }) => {
    await setupAuthAndMocks(page, "buildings_manager");
    await page.goto("/buildings-manager/dashboard");
    await expect(page).toHaveURL(/\/buildings-manager\/dashboard/, { timeout: 15_000 });
  });

  test("admin can open /admin/dashboard", async ({ page }) => {
    await setupAuthAndMocks(page, "admin");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("super_admin can open /admin/dashboard", async ({ page }) => {
    await setupAuthAndMocks(page, "super_admin");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("contractor is redirected away from /buildings-manager", async ({ page }) => {
    await setupAuthAndMocks(page, "contractor");
    await page.goto("/buildings-manager/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
