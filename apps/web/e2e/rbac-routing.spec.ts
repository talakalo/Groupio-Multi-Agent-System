import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth-fixtures";

/**
 * Next.js middleware role hints (cookie + refresh_token) — UX routing only.
 * API authorization is covered in backend integration tests.
 */
async function gotoCommit(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "commit" });
}

test.describe("RBAC routing (middleware)", () => {
  test("resident is redirected away from /admin", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("resident is redirected away from /contractor", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
    await gotoCommit(page, "/contractor/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("contractor is redirected away from /admin", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("contractor");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("buildings_manager is redirected away from /admin", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("buildings_manager");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("buildings_manager can open buildings-manager dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("buildings_manager");
    await gotoCommit(page, "/buildings-manager/dashboard");
    await expect(page).toHaveURL(/\/buildings-manager\/dashboard/, { timeout: 15_000 });
  });

  test("admin can open /admin/dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("admin");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("super_admin can open /admin/dashboard", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("super_admin");
    await gotoCommit(page, "/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("contractor is redirected away from /buildings-manager", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("contractor");
    await gotoCommit(page, "/buildings-manager/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});
