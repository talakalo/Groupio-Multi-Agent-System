import { test, expect } from "./api/test";

test.describe("Critical user flow", () => {
  test("landing page loads correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("link", { name: /הרשמ/ })).toBeVisible();
  });

  test("offers page loads", async ({ page }) => {
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "user-e2e",
          email: "e2e@example.com",
          full_name: "E2E User",
          role: "resident",
          is_verified: true,
        }),
      })
    );
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      })
    );
    await page.context().addCookies([
      { name: "refresh_token", value: "e2e-refresh", url: "http://localhost:3000" },
      {
        name: "groupio-auth",
        value: encodeURIComponent(
          JSON.stringify({ state: { user: { role: "resident" }, isAuthenticated: true } })
        ),
        url: "http://localhost:3000",
      },
    ]);

    await page.goto("/offers");
    await expect(page).toHaveTitle(/הצעות|offers/i);
  });
});
