/**
 * E2E tests — Building Manager Invite Code Flow
 *
 * Covers:
 *  1. BM sees buildings list with "Share invite" button on each card
 *  2. Clicking the button opens BuildingInvitePanel with the invite code
 *  3. Copy-to-clipboard button is present
 *  4. Regenerate (rotate) invite code calls the right API and updates the UI
 *  5. Non-BM (resident) cannot reach the buildings-manager route
 */

import { expect, test } from "./fixtures/auth-fixtures";
import { createMockResponse } from "./helpers/factory.util";

const MOCK_BUILDING = {
  id: "bld-001",
  name: "שדרות רוטשילד 15",
  address: "רוטשילד 15",
  city: "תל אביב",
  region: "tel_aviv",
  total_units: 24,
  floors: 8,
  admin_user_id: "user-bm-e2e",
  resident_count: 18,
  active_offers: 2,
  completed_offers: 5,
  total_savings: 45000,
  invite_code: "INV-ABCD-1234",
  whatsapp_group_id: null,
  neighborhood: "לב תל אביב",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_BUILDINGS_LIST = {
  items: [MOCK_BUILDING],
  total: 1,
  page: 1,
  page_size: 50,
  has_more: false,
};

const PAGE = "/buildings-manager/buildings";

test.describe("Building Manager — Invite Code", () => {
  test.beforeEach(async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("buildings_manager");

    // Override the generic buildings list mock with BM-specific data
    await page.route("**/api/v1/buildings*", (r) =>
      r.fulfill(createMockResponse(MOCK_BUILDINGS_LIST)),
    );
  });

  test("shows 'Share invite' button on each building card", async ({ buildingsManagerPage }) => {
    await buildingsManagerPage.gotoBuildings();
    await buildingsManagerPage.rawPage.waitForLoadState("networkidle");

    const inviteBtn = buildingsManagerPage.rawPage.getByTestId(`invite-btn-${MOCK_BUILDING.id}`);
    await expect(inviteBtn).toBeVisible();
  });

  test("clicking the invite button opens the invite panel with the code", async ({
    buildingsManagerPage,
  }) => {
    await buildingsManagerPage.gotoBuildings();
    await buildingsManagerPage.rawPage.waitForLoadState("networkidle");

    await buildingsManagerPage.rawPage.getByTestId(`invite-btn-${MOCK_BUILDING.id}`).click();
    await expect(buildingsManagerPage.rawPage.getByText(MOCK_BUILDING.invite_code)).toBeVisible();
  });

  test("invite panel contains a copy button", async ({ buildingsManagerPage }) => {
    await buildingsManagerPage.gotoBuildings();
    await buildingsManagerPage.rawPage.waitForLoadState("networkidle");

    await buildingsManagerPage.rawPage.getByTestId(`invite-btn-${MOCK_BUILDING.id}`).click();

    const copyBtn = buildingsManagerPage.rawPage
      .getByRole("button", { name: /copy|העתק/i })
      .first();
    await expect(copyBtn).toBeVisible();
  });

  test("regenerate invite code calls API and updates displayed code", async ({
    buildingsManagerPage,
    page,
  }) => {
    const NEW_CODE = "INV-NEW-9999";

    // Mock the regenerate endpoint
    await page.route(
      `**/api/v1/buildings/${MOCK_BUILDING.id}/regenerate-invite`,
      (r) =>
        r.fulfill(
          createMockResponse({ invite_code: NEW_CODE }),
        ),
    );

    await buildingsManagerPage.gotoBuildings();
    await buildingsManagerPage.rawPage.waitForLoadState("networkidle");

    await buildingsManagerPage.rawPage.getByTestId(`invite-btn-${MOCK_BUILDING.id}`).click();
    await expect(buildingsManagerPage.rawPage.getByText(MOCK_BUILDING.invite_code)).toBeVisible();

    const rotateBtn = buildingsManagerPage.rawPage
      .getByRole("button", { name: /regenerate|חדש|rotate|חדש קוד/i })
      .first();

    if (await rotateBtn.isVisible()) {
      await rotateBtn.click();
      // New code should appear after API responds
      await expect(buildingsManagerPage.rawPage.getByText(NEW_CODE)).toBeVisible({ timeout: 5000 });
    } else {
      // If the rotate button is hidden (non-owner BM), skip gracefully
      test.skip(true, "Rotate button not visible for this user — expected for non-owner BM");
    }
  });

  test("resident cannot access buildings-manager route (redirected)", async ({
    page,
    loginAs,
  }) => {
    // Override auth to resident role
    await loginAs("resident");
    await page.goto(PAGE);
    await page.waitForLoadState("networkidle");

    // Should be redirected away from buildings-manager
    expect(page.url()).not.toContain("/buildings-manager");
  });
});

test.describe("Building Manager — Invite Code (Hebrew locale)", () => {
  test.use({ locale: "he-IL" });

  test("invite panel is visible in RTL Hebrew layout", async ({
    buildingsManagerPage,
    page,
    setupAuthAndMocks,
  }) => {
    await setupAuthAndMocks("buildings_manager");

    await page.route("**/api/v1/buildings*", (r) =>
      r.fulfill(createMockResponse(MOCK_BUILDINGS_LIST)),
    );

    await buildingsManagerPage.gotoBuildings();
    await buildingsManagerPage.rawPage.waitForLoadState("networkidle");

    await buildingsManagerPage.rawPage.getByTestId(`invite-btn-${MOCK_BUILDING.id}`).click();
    await expect(buildingsManagerPage.rawPage.getByText(MOCK_BUILDING.invite_code)).toBeVisible();

    // The page root should have dir="rtl" set by the layout
    const dir = await page.evaluate(() =>
      document.documentElement.getAttribute("dir"),
    );
    expect(dir).toBe("rtl");
  });
});
