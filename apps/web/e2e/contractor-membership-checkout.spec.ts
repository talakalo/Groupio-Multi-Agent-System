import { expect, test } from "./fixtures/auth-fixtures";
import type { Page } from "@playwright/test";
import { createMockResponse } from "./helpers/factory.util";

async function setupContractorProfileMocks(page: Page) {
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        status: "healthy",
        services: { vector_db: true, graph_db: true, redis: true, postgres: true },
      }),
    }),
  );

  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "e2e-access-token" }),
    }),
  );

  await page.context().addCookies([
    { name: "refresh_token", value: "e2e-contractor-refresh", url: "http://localhost:3000" },
    {
      name: "groupio-auth",
      value: encodeURIComponent(
        JSON.stringify({
          state: { user: { role: "contractor" }, isAuthenticated: true },
        }),
      ),
      url: "http://localhost:3000",
    },
  ]);

  await page.addInitScript(() => {
    localStorage.setItem(
      "groupio-auth",
      JSON.stringify({
        state: {
          user: {
            id: "con_001",
            email: "moshe@coolair.co.il",
            fullName: "Moshe",
            phone: "0521234567",
            role: "contractor",
            preferredLanguage: "he",
            isVerified: true,
            contractorId: "con_001",
          },
          accessToken: "jwt_token",
          isAuthenticated: true,
        },
        version: 0,
      }),
    );
  });

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "con_001",
        contractor_id: "con_001",
        role: "contractor",
        email: "moshe@coolair.co.il",
        full_name: "Moshe",
        phone: "0521234567",
        preferred_language: "he",
        is_verified: true,
      }),
    }),
  );

  await page.route("**/api/v1/contractors/con_001", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "minimal mock" }),
    }),
  );

  await page.route("**/api/v1/contractors/me/doc-requests", (route) =>
    route.fulfill(createMockResponse({ pending: false, items: [] })),
  );

  await page.route("**/api/v1/contractors/me/membership", (route) =>
    route.fulfill(
      createMockResponse({
        membership_status: "inactive",
        current_period_end: null,
        next_billing_at: null,
      }),
    ),
  );
}

test.describe("Contractor membership checkout (mock API)", () => {
  test("Settings tab: subscribe triggers checkout session URL navigation", async ({ page }) => {
    await setupContractorProfileMocks(page);

    let checkoutPosts = 0;
    await page.route("**/api/v1/contractors/me/membership/checkout-session", async (route) => {
      checkoutPosts += 1;
      await route.fulfill(
        createMockResponse({
          url: "https://example.com/stripe-checkout-mock",
          session_id: "cs_test_e2e",
        }),
      );
    });

    await page.goto("/contractor/profile");
    await page.getByRole("button", { name: "הגדרות" }).click();

    await expect(page.getByTestId("contractor-membership-subscribe")).toBeVisible({
      timeout: 15_000,
    });

    await Promise.all([
      page.waitForURL("**/example.com/stripe-checkout-mock**", { timeout: 15_000 }),
      page.getByTestId("contractor-membership-subscribe").click(),
    ]);

    expect(checkoutPosts).toBe(1);
  });
});
