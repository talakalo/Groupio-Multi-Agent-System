import { expect, test } from "./fixtures/auth-fixtures";

test.describe("Critical user flow", () => {
  test("landing page loads correctly", async ({ landingPage }) => {
    await landingPage.goto();
    await landingPage.expectLandingLoaded();
  });

  test("offers page loads", async ({ setupAuthAndMocks, offersPage, page }) => {
    await setupAuthAndMocks("resident");
    await offersPage.goto();
    await expect(page).toHaveTitle(/הצעות|offers/i);
  });
});
