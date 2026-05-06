import { test, expect } from "./api/test";
import type { Page } from "@playwright/test";
import { createAdminCredentials } from "./helpers/user.factory";
import { createSystemHealth } from "./helpers/factory.util";

/**
 * Admin buildings flow.
 *
 * Covers the new B4–B6 surface — list / create / rotate-invite-code —
 * with fully mocked backend so the spec is deterministic.
 *
 * Endpoints covered (route-mocked):
 *   GET  /api/v1/buildings/?page_size=100
 *   POST /api/v1/buildings/
 *   POST /api/v1/buildings/{id}/regenerate-invite
 */

const TEST_ADMIN = createAdminCredentials();
const MOCK_SYSTEM_HEALTH = createSystemHealth();

const MOCK_BUILDINGS = [
  {
    id: "b-001",
    name: "Sea View",
    address: "1 Main St",
    city: "Tel Aviv",
    region: "tel_aviv",
    total_units: 24,
    invite_code: "ABCDEFGH",
    admin_user_id: "admin_001",
  },
  {
    id: "b-002",
    name: "Mountain Peak",
    address: "9 Hill Rd",
    city: "Haifa",
    region: "north",
    total_units: 12,
    invite_code: "PEAK2345",
    admin_user_id: "admin_001",
  },
];

async function setupCommonMocks(page: Page) {
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify(MOCK_SYSTEM_HEALTH),
    }),
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "admin_001", email: TEST_ADMIN.email, role: "admin" }),
    }),
  );
  await page.route("**/api/v1/buildings/?**", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ items: MOCK_BUILDINGS, total: MOCK_BUILDINGS.length }),
    }),
  );
}

async function setupAdminAuth(page: Page) {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001";
  await page.context().addCookies([
    { name: "refresh_token", value: "e2e-admin-refresh", url: baseUrl },
    { name: "admin_role_verified", value: "1", url: baseUrl },
  ]);
}

test.describe("Admin buildings — list", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);
  });

  test("renders the buildings list with names + invite codes", async ({ page }) => {
    await page.goto("/buildings");
    await expect(
      page.getByTestId("admin-buildings-list").getByText("Sea View"),
    ).toBeVisible();
    await expect(
      page.getByTestId("admin-buildings-list").getByText("Mountain Peak"),
    ).toBeVisible();
    // Invite codes are rendered inline as small chips.
    await expect(page.getByText("ABCDEFGH")).toBeVisible();
    await expect(page.getByText("PEAK2345")).toBeVisible();
  });

  test("filters the list client-side via search", async ({ page }) => {
    await page.goto("/buildings");
    const search = page.getByPlaceholder(/search/i);
    await search.fill("haifa");
    await expect(page.getByText("Mountain Peak")).toBeVisible();
    await expect(page.getByText("Sea View")).toBeHidden();
  });
});

test.describe("Admin buildings — create", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);
  });

  test("create modal posts the typed payload to /buildings/", async ({ page }) => {
    let posted: unknown = null;
    await page.route("**/api/v1/buildings/", async (route) => {
      if (route.request().method() === "POST") {
        posted = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            id: "b-new",
            name: "New Tower",
            address: "1 Sea Rd",
            city: "Tel Aviv",
            region: "tel_aviv",
            invite_code: "NEW12345",
            admin_user_id: "admin_001",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ items: MOCK_BUILDINGS, total: MOCK_BUILDINGS.length }),
        });
      }
    });

    await page.goto("/buildings");
    await page.getByTestId("admin-open-building-create").click();
    await expect(page.getByTestId("admin-building-create-modal")).toBeVisible();

    await page.getByTestId("admin-create-name").fill("New Tower");
    await page.getByTestId("admin-create-address").fill("1 Sea Rd");
    await page.getByTestId("admin-create-city").fill("Tel Aviv");
    await page.getByTestId("admin-create-submit").click();

    await expect.poll(() => posted).not.toBeNull();
    expect(posted).toMatchObject({
      name: "New Tower",
      address: "1 Sea Rd",
      city: "Tel Aviv",
      region: "tel_aviv",
    });

    // After success the highlighted invite card surfaces the new code.
    await expect(page.getByTestId("admin-building-invite")).toBeVisible();
    await expect(page.getByText("NEW12345")).toBeVisible();
  });

  test("create modal blocks empty submissions client-side", async ({ page }) => {
    await page.goto("/buildings");
    await page.getByTestId("admin-open-building-create").click();
    // Submitting empty fires HTML5 required validation; the API should NOT
    // be called — assert by counting requests via a side channel.
    let calledOnce = false;
    await page.route("**/api/v1/buildings/", async (route) => {
      if (route.request().method() === "POST") calledOnce = true;
      await route.fulfill({ status: 200, body: JSON.stringify({}) });
    });
    await page.getByTestId("admin-create-submit").click();
    // Give Playwright a tick; the click should not have triggered a POST.
    await page.waitForTimeout(200);
    expect(calledOnce).toBe(false);
  });
});

test.describe("Admin buildings — rotate invite code", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);
  });

  test("rotate button calls /regenerate-invite and updates the card", async ({ page }) => {
    let rotateBody: unknown = null;
    await page.route(
      "**/api/v1/buildings/b-001/regenerate-invite",
      async (route) => {
        rotateBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ building_id: "b-001", invite_code: "ROTATED1" }),
        });
      },
    );

    await page.goto("/buildings");
    // Click the row to open the invite card.
    await page.getByText("Sea View").first().click();
    await expect(page.getByTestId("admin-building-invite")).toBeVisible();

    await page.getByTestId("admin-building-rotate").click();
    await expect(page.getByText("ROTATED1")).toBeVisible();
    expect(rotateBody).toEqual({});
  });

  test("rotate surfaces a 403 from the backend without crashing", async ({ page }) => {
    await page.route(
      "**/api/v1/buildings/b-001/regenerate-invite",
      (route) =>
        route.fulfill({
          status: 403,
          body: JSON.stringify({ detail: "Forbidden" }),
        }),
    );

    await page.goto("/buildings");
    await page.getByText("Sea View").first().click();
    await page.getByTestId("admin-building-rotate").click();

    // The page should keep showing the original code.
    await expect(page.getByText("ABCDEFGH")).toBeVisible();
  });
});
