import { expect, test } from "./fixtures/auth-fixtures";

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

  test("should login successfully", async ({ loginPageReady, page }) => {
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

    await loginPageReady.expectOnLoginPage();
    await loginPageReady.login("test@example.com", "SecurePass123!");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("should display error message for invalid credentials", async ({ loginPageReady, page }) => {
    await page.route("**/api/v1/auth/login/json", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid credentials" }),
      }),
    );

    await loginPageReady.expectOnLoginPage();
    await loginPageReady.login("invalid@example.com", "invalidpassword");
    await loginPageReady.expectError(/שגויים|invalid|credentials/i);
  });

  test("should navigate to signup page", async ({ loginPageReady, page }) => {
    await loginPageReady.expectOnLoginPage();
    await loginPageReady.signUpLink.click();
    await expect(page).toHaveURL(/\/signup/);
  });
});
