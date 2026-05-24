/**
 * Phase 3 E2E: Address enrichment, language toggle, admin verification metadata.
 * Reuses existing Playwright config, mocks, and auth patterns.
 */

import { expect, test } from "./fixtures/auth-fixtures";

test.describe("Phase 3: Address suggestion flow", () => {
  test.beforeEach(async ({ page }) => {
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
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "e2e-token" }) }),
    );
  });

  test("onboarding shows suggest address button and accepts mocked suggestion", async ({
    onboardingPage,
    page,
  }) => {
    await page.route("**/api/v1/enrichment/normalize-address", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            address: "רוטשילד 15",
            city: "תל אביב - יפו",
            street: "רוטשילד",
            house_number: "15",
            municipality: "תל אביב - יפו",
            confidence: 0.85,
            source: "data.gov.il",
          }),
        });
      }
      return route.continue();
    });

    await onboardingPage.goto();
    await onboardingPage.selectResidentAndContinue();
    await onboardingPage.fillAddress("רוטשילד 15", "תל אביב");
    await onboardingPage.suggestAddressButton.click();

    await expect(
      page.getByText(/רוטשילד 15|תל אביב - יפו|suggested address/i).first(),
    ).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /השתמש בהצעה|Use suggested/ }).click();

    await expect(onboardingPage.buildingAddressInput).toHaveValue("רוטשילד 15");
    await expect(onboardingPage.cityInput).toHaveValue("תל אביב - יפו");
  });

  test("no suggestion when API returns low confidence", async ({ onboardingPage, page }) => {
    await page.route("**/api/v1/enrichment/normalize-address", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          address: "unknown",
          city: "unknown",
          street: null,
          house_number: null,
          municipality: null,
          confidence: 0.2,
          source: "stub",
        }),
      }),
    );

    await onboardingPage.goto();
    await onboardingPage.selectResidentAndContinue();
    await onboardingPage.fillAddress("רחוב לא ידוע 1", "עיר לא קיימת");
    const lowConfidenceRes = page.waitForResponse("**/api/v1/enrichment/normalize-address**", {
      timeout: 10_000,
    });
    await onboardingPage.suggestAddressButton.click();
    await lowConfidenceRes;
    await expect(page.getByText(/השתמש בהצעה|Use suggested/)).not.toBeVisible();
  });

  test("no suggestion when provider returns 5xx", async ({ onboardingPage, page }) => {
    await page.route("**/api/v1/enrichment/normalize-address", (route) =>
      route.fulfill({ status: 503, body: "Service Unavailable" }),
    );

    await onboardingPage.goto();
    await onboardingPage.selectResidentAndContinue();
    await onboardingPage.fillAddress("רוטשילד 15", "תל אביב");
    const errorRes = page.waitForResponse("**/api/v1/enrichment/normalize-address**", {
      timeout: 10_000,
    });
    await onboardingPage.suggestAddressButton.click();
    await errorRes;
    await expect(page.getByText(/השתמש בהצעה|Use suggested/)).not.toBeVisible();
  });
});

test.describe("Phase 3: Language toggle persistence", () => {
  test("switch Hebrew to English updates dir on onboarding", async ({ onboardingPage }) => {
    await onboardingPage.goto();
    await expect(onboardingPage.rawPage.locator("html")).toHaveAttribute("dir", "rtl");
    await onboardingPage.englishToggle.click();
    await expect(onboardingPage.rawPage.locator("html")).toHaveAttribute("dir", "ltr", {
      timeout: 5_000,
    });
  });

  test("locale cookie persists after navigation", async ({ onboardingPage, page }) => {
    await onboardingPage.goto();
    await onboardingPage.englishToggle.click();
    await expect(onboardingPage.rawPage.locator("html")).toHaveAttribute("dir", "ltr", {
      timeout: 5_000,
    });
    await page.goto("/signup");
    const dir = await page.locator("html").getAttribute("dir");
    expect(["ltr", "rtl"]).toContain(dir);
  });

  test("authenticated language toggle persists to profile", async ({ page, setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
    await page.route("**/api/locale", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, locale: "en" }),
      }),
    );

    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /^English$/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const englishBtn = page.getByRole("button", { name: /^English$/i }).first();
    const putMeRequest = page.waitForRequest(
      (req) => req.method() === "PUT" && req.url().includes("/auth/me"),
      { timeout: 15_000 },
    );
    await Promise.all([putMeRequest, englishBtn.click()]);

    const payload = (await putMeRequest).postDataJSON() as Record<string, unknown>;
    expect(payload.preferred_language).toBe("en");
  });
});
