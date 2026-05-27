/**
 * E2E tests — Resident: Join Building with Invite Code
 *
 * Covers:
 *  1. Resident can navigate to /building/join
 *  2. Submitting a valid invite code calls POST /api/v1/buildings/join and shows success state
 *  3. Submitting an invalid/unknown code shows an error message
 *  4. Submitting an empty code shows a validation error (no API call)
 *  5. Building manager cannot access /building/join (wrong role)
 *  6. Hebrew RTL layout renders correctly on the join page
 */

import { expect, test } from "./fixtures/auth-fixtures";
import { createMockResponse } from "./helpers/factory.util";

const JOIN_PAGE = "/building/join";
const VALID_CODE = "INV-ABCD-1234";

test.describe("Resident — Join Building with Invite Code", () => {
  test.beforeEach(async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
  });

  test("resident can load the join page", async ({ page }) => {
    await page.goto(JOIN_PAGE);
    await page.waitForLoadState("networkidle");

    // Input for invite code should be visible
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
  });

  test("submitting a valid invite code shows success state", async ({ page }) => {
    await page.route("**/api/v1/buildings/join", (r) =>
      r.fulfill(createMockResponse({ success: true })),
    );

    await page.goto(JOIN_PAGE);
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox").fill(VALID_CODE);
    await page.getByRole("button", { name: /join|הצטרף/i }).click();

    // Success state: heading or message indicating joined successfully
    await expect(
      page.getByRole("heading").filter({ hasText: /success|הצלחה|הצטרפת/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("submitting an invalid code shows API error message", async ({ page }) => {
    await page.route("**/api/v1/buildings/join", (r) =>
      r.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invite code not found" }),
      }),
    );

    await page.goto(JOIN_PAGE);
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox").fill("INV-BAD-0000");
    await page.getByRole("button", { name: /join|הצטרף/i }).click();

    await expect(page.getByText(/not found|לא נמצא|invalid|שגוי/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("submitting an empty code shows validation error without calling API", async ({ page }) => {
    let apiCalled = false;
    await page.route("**/api/v1/buildings/join", () => {
      apiCalled = true;
    });

    await page.goto(JOIN_PAGE);
    await page.waitForLoadState("networkidle");

    // Submit without filling the input
    await page.getByRole("button", { name: /join|הצטרף/i }).click();

    // Validation error visible, API not called
    await expect(page.getByText(/required|שדה חובה|הכנס קוד/i)).toBeVisible({ timeout: 3000 });
    expect(apiCalled).toBe(false);
  });

  test("buildings-manager cannot access resident join page (redirected)", async ({
    page,
    loginAs,
  }) => {
    await loginAs("buildings_manager");
    await page.goto(JOIN_PAGE);
    await page.waitForLoadState("networkidle");

    // Should be redirected away from the resident join page
    expect(page.url()).not.toContain(JOIN_PAGE);
  });
});

test.describe("Resident — Join Building with Invite Code (Hebrew locale)", () => {
  test.use({ locale: "he-IL" });

  test("join page renders correctly in RTL Hebrew layout", async ({
    page,
    setupAuthAndMocks,
  }) => {
    await setupAuthAndMocks("resident");

    await page.route("**/api/v1/buildings/join", (r) =>
      r.fulfill(createMockResponse({ success: true })),
    );

    await page.goto(JOIN_PAGE);
    await page.waitForLoadState("networkidle");

    // Input and submit button visible
    await expect(page.getByRole("textbox")).toBeVisible();

    // Page should have RTL direction set
    const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
    expect(dir).toBe("rtl");
  });

  test("success state renders in Hebrew after valid code submission", async ({
    page,
    setupAuthAndMocks,
  }) => {
    await setupAuthAndMocks("resident");

    await page.route("**/api/v1/buildings/join", (r) =>
      r.fulfill(createMockResponse({ success: true })),
    );

    await page.goto(JOIN_PAGE);
    await page.waitForLoadState("networkidle");

    await page.getByRole("textbox").fill(VALID_CODE);
    await page.getByRole("button", { name: /join|הצטרף/i }).click();

    // Hebrew success message should appear
    await expect(page.getByText(/הצטרפת|הצלחה/)).toBeVisible({ timeout: 5000 });
  });
});
