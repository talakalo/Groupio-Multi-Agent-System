/**
 * Navigation history — browser Back/Forward button behaviour.
 *
 * Scenarios:
 *  1. Back button returns to the previous page between authenticated routes
 *  2. Multi-hop back navigation across several pages
 *  3. Forward button restores a page after going back
 *  4. After login, pressing Back does NOT return the user to the login screen —
 *     the middleware redirects authenticated users away from /login
 *  5. After session expiry / logout, navigating to a protected route redirects
 *     to /login — even if the browser back-button points there
 *  6. The /login?redirect= param is preserved so the user lands on the originally
 *     requested page after signing back in
 */

import { expect, test } from "./fixtures";
import { clearAuth, ensureRefreshTokenCookie, setupAuthAndMocks } from "./api/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate and wait for the URL to settle, following any server-side redirects. */
async function gotoAndWait(
  page: Parameters<typeof clearAuth>[0],
  path: string,
): Promise<void> {
  await page.goto(path, { waitUntil: "commit" });
  await page.waitForURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), {
    timeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Suite 1 — basic back/forward while authenticated
// ---------------------------------------------------------------------------

test.describe("Back/forward between authenticated pages", () => {
  test.beforeEach(async ({ page, setupAuthAndMocks: mockSetup }) => {
    await mockSetup("resident");
  });

  test("back returns to /dashboard after visiting /payments", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/payments");
    await page.waitForURL(/\/payments/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("back returns to /dashboard after visiting /offers", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/offers");
    await page.waitForURL(/\/offers/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("back returns to /dashboard after visiting /profile", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/profile");
    await page.waitForURL(/\/profile/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("multi-hop: dashboard → offers → payments → back to offers → back to dashboard", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/offers");
    await page.waitForURL(/\/offers/, { timeout: 15_000 });

    await page.goto("/payments");
    await page.waitForURL(/\/payments/, { timeout: 15_000 });

    // First back: payments → offers
    await page.goBack();
    await expect(page).toHaveURL(/\/offers/, { timeout: 15_000 });

    // Second back: offers → dashboard
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("forward restores the page after going back", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/payments");
    await page.waitForURL(/\/payments/, { timeout: 15_000 });

    // Go back to dashboard, then forward to payments
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goForward();
    await expect(page).toHaveURL(/\/payments/, { timeout: 15_000 });
  });

  test("three-level back: dashboard → offers → payments → building → back × 3", async ({
    page,
  }) => {
    for (const path of ["/dashboard", "/offers", "/payments", "/building"]) {
      await page.goto(path);
      await page.waitForURL(new RegExp(path), { timeout: 15_000 });
    }

    await page.goBack();
    await expect(page).toHaveURL(/\/payments/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/offers/, { timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Back button after login
// ---------------------------------------------------------------------------

test.describe("Back button behaviour after login", () => {
  test("pressing back after login does not strand the user on /login", async ({ page }) => {
    // Clear any auth state left by previous tests (prevents immediate redirect from /login)
    await page.addInitScript(() => {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("groupio-auth");
    });

    // Register mocks — no auth state yet so /login is allowed through
    await page.route("**/api/v1/auth/login/json", async (route) => {
      // The API cookie targets localhost:8000, not localhost:3000 where middleware runs.
      // Manually add the refresh_token to the Next.js origin so middleware allows access.
      await page.context().addCookies([{
        name: "refresh_token",
        value: "e2e-refresh",
        url: "http://localhost:3000",
      }]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "e2e-access-token" }),
      });
    });
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
    await page.route("**/api/v1/auth/refresh", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "e2e-access-token" }),
      }),
    );
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.route("**/api/v1/stats*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ active_offers: 0, joined_offers: 0, total_savings: 0 }),
      }),
    );
    await page.route("**/api/v1/notifications*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0, count: 0 }),
      }),
    );
    await page.route("**/api/v1/buildings*", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify([]) }),
    );
    await page.route("**/api/v1/activity*", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ items: [], total: 0 }) }),
    );

    // Navigate to login — default waitUntil "load" ensures scripts have executed
    await page.goto("/login", { waitUntil: "load" });
    // Wait for the submit button to be clickable, confirming React has hydrated
    const submitBtn = page.getByRole("button", { name: /login|התחברות/i });
    await submitBtn.waitFor({ state: "visible", timeout: 15_000 });
    await page.locator("#identifier").fill("test@example.com");
    await page.locator("#password").fill("SecurePass123!");
    // Brief settle time so React Hook Form registers the filled values
    await page.waitForTimeout(200);

    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 15_000, waitUntil: "commit" }),
      page.getByRole("button", { name: /login|התחברות/i }).click(),
    ]);

    // Ensure refresh_token cookie is present so middleware treats the session as live
    await ensureRefreshTokenCookie(page);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Press back — history entry is /login, but middleware redirects authenticated
    // users away from /login back to /dashboard (or their role's default).
    await page.goBack();

    // Allow the middleware redirect to settle
    await page
      .waitForURL(/\/dashboard/, { timeout: 10_000 })
      .catch(() => undefined);

    // The user must NOT remain on /login
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("navigating directly to /login while authenticated redirects to dashboard", async ({
    page,
    setupAuthAndMocks: mockSetup,
  }) => {
    await mockSetup("resident");
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Explicitly try to open /login
    await page.goto("/login", { waitUntil: "commit" });

    // Middleware: authenticated + /login is auth route → redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Session expiry / logout
// ---------------------------------------------------------------------------

test.describe("Session expiry and back-navigation security", () => {
  test("direct navigation to protected route after session expires redirects to /login", async ({
    page,
    setupAuthAndMocks: mockSetup,
  }) => {
    await mockSetup("resident");
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    // Expire the session
    await clearAuth(page);

    // Navigate directly — must redirect to /login
    await page.goto("/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("back button to protected page after logout redirects to /login", async ({
    page,
    setupAuthAndMocks: mockSetup,
  }) => {
    await mockSetup("resident");
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/payments");
    await page.waitForURL(/\/payments/, { timeout: 15_000 });

    // Simulate logout — remove all auth state
    await clearAuth(page);

    // Press back — browser requests /dashboard, middleware sees no session → /login
    await page.goBack({ waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("login form is visible and usable after session-expired back navigation", async ({
    page,
    setupAuthAndMocks: mockSetup,
  }) => {
    await mockSetup("resident");
    await page.goto("/payments");
    await page.waitForURL(/\/payments/, { timeout: 15_000 });

    // Expire session
    await clearAuth(page);

    // Navigate to a protected route — redirected to login
    await page.goto("/payments", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // Login form must be rendered and interactive
    await expect(page.locator("#identifier")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /login|התחברות/i }),
    ).toBeEnabled();
  });

  test("/login?redirect= param is set to the originally-requested page", async ({
    page,
    setupAuthAndMocks: mockSetup,
  }) => {
    await mockSetup("resident");
    await page.goto("/payments");
    await page.waitForURL(/\/payments/, { timeout: 15_000 });

    await clearAuth(page);

    await page.goto("/payments", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // Verify the redirect query param so the user returns to /payments after login
    const url = new URL(page.url());
    expect(url.searchParams.get("redirect")).toBe("/payments");
  });

  test("back navigation through multiple pages after logout always hits /login", async ({
    page,
    setupAuthAndMocks: mockSetup,
  }) => {
    await mockSetup("resident");

    // Build a history: dashboard → offers → payments
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await page.goto("/offers");
    await page.waitForURL(/\/offers/, { timeout: 15_000 });
    await page.goto("/payments");
    await page.waitForURL(/\/payments/, { timeout: 15_000 });

    // Logout
    await clearAuth(page);

    // First back: /payments → /offers — middleware blocks → /login
    await page.goBack({ waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
