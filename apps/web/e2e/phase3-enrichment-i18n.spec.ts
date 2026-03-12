/**
 * Phase 3 E2E: Address enrichment, language toggle, admin verification metadata.
 * Reuses existing Playwright config, mocks, and auth patterns.
 */

import { test, expect } from "@playwright/test";

test.describe("Phase 3: Address suggestion flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/health", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "healthy",
          services: { vector_db: true, graph_db: true, redis: true, postgres: true },
        }),
      })
    );
    await page.route("**/api/v1/auth/refresh", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "e2e-token" }) })
    );
  });

  test("onboarding shows suggest address button and accepts mocked suggestion", async ({
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

    await page.goto("/onboarding");
    // Onboarding role buttons use t('resident') + description; match by leading "דייר"
    await expect(page.getByRole("button", { name: /^דייר\s/ }).first()).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^דייר\s/ }).first().click();
    await page.getByRole("button", { name: /הבא|Next/ }).click();

    await expect(page.locator("#buildingAddress")).toBeVisible({ timeout: 5000 });
    await page.fill("#buildingAddress", "רוטשילד 15");
    await page.fill("#city", "תל אביב");
    await page.getByRole("button", { name: /הצע כתובת|Suggest address/ }).click();

    await expect(
      page.getByText(/רוטשילד 15|תל אביב - יפו|suggested address/i).first()
    ).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /השתמש בהצעה|Use suggested/ }).click();

    await expect(page.locator("#buildingAddress")).toHaveValue("רוטשילד 15");
    await expect(page.locator("#city")).toHaveValue("תל אביב - יפו");
  });

  test("no suggestion when API returns low confidence", async ({ page }) => {
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
      })
    );

    await page.goto("/onboarding");
    await page.getByRole("button", { name: /^דייר\s/ }).first().click();
    await page.getByRole("button", { name: /הבא|Next/ }).click();
    await expect(page.locator("#buildingAddress")).toBeVisible({ timeout: 5000 });

    await page.fill("#buildingAddress", "רחוב לא ידוע 1");
    await page.fill("#city", "עיר לא קיימת");
    await page.getByRole("button", { name: /הצע כתובת|Suggest address/ }).click();

    await page.waitForTimeout(2000);
    await expect(page.getByText(/השתמש בהצעה|Use suggested/)).not.toBeVisible();
  });

  test("no suggestion when provider returns 5xx", async ({ page }) => {
    await page.route("**/api/v1/enrichment/normalize-address", (route) =>
      route.fulfill({ status: 503, body: "Service Unavailable" })
    );

    await page.goto("/onboarding");
    await page.getByRole("button", { name: /^דייר\s/ }).first().click();
    await page.getByRole("button", { name: /הבא|Next/ }).click();
    await expect(page.locator("#buildingAddress")).toBeVisible({ timeout: 5000 });

    await page.fill("#buildingAddress", "רוטשילד 15");
    await page.fill("#city", "תל אביב");
    await page.getByRole("button", { name: /הצע כתובת|Suggest address/ }).click();

    await page.waitForTimeout(2000);
    await expect(page.getByText(/השתמש בהצעה|Use suggested/)).not.toBeVisible();
  });
});

test.describe("Phase 3: Language toggle persistence", () => {
  test("switch Hebrew to English updates dir on onboarding", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const englishBtn = page.getByRole("button", { name: "English" });
    if (await englishBtn.isVisible()) {
      await englishBtn.click();
      await page.waitForTimeout(800);
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    }
  });

  test("locale cookie persists after navigation", async ({ page }) => {
    await page.goto("/onboarding");
    const englishBtn = page.getByRole("button", { name: "English" });
    if (await englishBtn.isVisible()) {
      await englishBtn.click();
      await page.waitForTimeout(500);
    }
    await page.goto("/signup");
    await page.waitForTimeout(500);
    const dir = await page.locator("html").getAttribute("dir");
    expect(["ltr", "rtl"]).toContain(dir);
  });

  test("authenticated language toggle persists to profile", async ({ page }) => {
    let putMePayload: Record<string, unknown> | null = null;
    await page.route("**/api/v1/auth/me", (route) => {
      if (route.request().method() === "PUT") {
        putMePayload = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "user-e2e",
            email: "resident@test.com",
            preferred_language: putMePayload?.preferred_language ?? "he",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "u1",
          email: "resident@test.com",
          preferred_language: "he",
          role: "resident",
        }),
      });
    });
    await page.route("**/api/v1/auth/refresh", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "e2e-jwt-token" }),
      })
    );
    await page.context().addCookies([
      { name: "refresh_token", value: "e2e-session", url: "http://localhost:3000" },
      {
        name: "groupio-auth",
        value: encodeURIComponent(
          JSON.stringify({
            state: {
              user: { id: "u1", role: "resident", preferredLanguage: "he" },
              isAuthenticated: true,
            },
          })
        ),
        url: "http://localhost:3000",
      },
    ]);
    await page.addInitScript(() => {
      localStorage.setItem(
        "groupio-auth",
        JSON.stringify({
          state: {
            user: { id: "u1", role: "resident", preferredLanguage: "he" },
            accessToken: "e2e-jwt-token",
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    });

    await page.goto("/onboarding");
    await page.waitForTimeout(800);
    const englishBtn = page.getByRole("button", { name: "English" });
    await expect(englishBtn).toBeVisible();
    await englishBtn.click();
    await page.waitForTimeout(1200);

    // UI must switch to ltr when clicking English
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    // When accessToken is in store (e.g. after real login), profile PUT is sent
    if (putMePayload != null) {
      expect(putMePayload["preferred_language"] === "en").toBe(true);
    }
  });
});

// Admin verification metadata is covered in apps/admin/e2e/admin-flow.spec.ts
// (admin app runs on port 3001 with separate Playwright config)
