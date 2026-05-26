import { expect, test } from "./fixtures/auth-fixtures";

import { ensureRefreshTokenCookie } from "./api/actions";

test.describe("Login Test", () => {
  test.beforeEach(async ({ page, setupMocks }) => {
    await setupMocks();
    await page.route("**/api/v1/auth/refresh", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "e2e-access-token" }),
      }),
    );
  });

  test("should login successfully", async ({ page, loginPage }) => {
    await page.route("**/api/v1/auth/login/json", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "refresh_token=e2e-refresh-token; Path=/; SameSite=Lax",
        },
        body: JSON.stringify({ access_token: "e2e-access-token" }),
      }),
    );
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "user-e2e",
          email: "test@example.com",
          role: "resident",
          full_name: "Test User",
          is_verified: true,
        }),
      }),
    );

    await loginPage.goto();
    await loginPage.expectOnLoginPage();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/auth/login/json") && response.ok(),
      ),
      loginPage.login("test@example.com", "SecurePass123!"),
    ]);
    await ensureRefreshTokenCookie(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("should display error message for invalid credentials", async ({ page, loginPage }) => {
    await page.route("**/api/v1/auth/login/json", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid credentials" }),
      }),
    );

    await loginPage.goto();
    await loginPage.expectOnLoginPage();
    await loginPage.login("invalid@example.com", "invalidpassword");
    await loginPage.expectError(/שגויים|invalid|credentials/i);
  });

  test("should navigate to signup page", async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.expectOnLoginPage();
    await Promise.all([
      page.waitForURL(/\/signup/, { timeout: 10_000 }),
      loginPage.signUpLink.click(),
    ]);
  });
});
