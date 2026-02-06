import { test, expect } from "@playwright/test";

test.describe("Resident Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route("**/api/v1/health", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "healthy",
          services: { vector_db: true, graph_db: true, redis: true, postgres: true },
        }),
      })
    );
  });

  test("should display landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=גרופיו")).toBeVisible();
  });

  test("should navigate to login page", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="/login"]');
    await expect(page).toHaveURL(/login/);
  });

  test("should display resident dashboard", async ({ page }) => {
    // Mock auth
    await page.goto("/dashboard");
    await expect(page.locator("text=הצעות פעילות")).toBeVisible();
  });

  test("should display offers listing", async ({ page }) => {
    await page.route("**/api/v1/offers*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: "offer_001",
            category: "ac_installation",
            basePrice: 4500,
            status: "active",
            contractor: {
              id: "con_001",
              businessName: "Cool Air Ltd",
              rating: 4.8,
              verified: true,
            },
            participants: 5,
            currentTier: 0,
            tiers: [{ min: 3, max: 5, discount: 5, price: 4275 }],
          },
        ]),
      })
    );

    await page.goto("/offers");
    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
  });

  test("should join an offer successfully", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001/join", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
    );

    await page.goto("/offers/offer_001");
    await page.click("text=הצטרף להצעה");
    await expect(page.locator("text=הצטרפת")).toBeVisible();
  });

  test("should use AI chat", async ({ page }) => {
    await page.route("**/api/v1/message", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          conversationId: "conv_1",
          response: { type: "text", message: "מצאתי 3 קבלנים מתאימים" },
          metadata: {
            intent: "contractor_search",
            confidence: 0.95,
            agentsUsed: ["router", "matching"],
            tokensUsed: 200,
            durationMs: 800,
            needsHuman: false,
          },
        }),
      })
    );

    await page.goto("/dashboard");
    const chatInput = page.locator('input[placeholder*="הקלד"]');
    await chatInput.fill("מחפש קבלן מזגנים");
    await chatInput.press("Enter");
    await expect(page.locator("text=מצאתי 3 קבלנים מתאימים")).toBeVisible();
  });

  test("should share offer with neighbors", async ({ page }) => {
    await page.goto("/offers/offer_001");
    const shareButton = page.locator("text=שתף עם השכנים");
    await expect(shareButton).toBeVisible();
  });
});

test.describe("Contractor Flow", () => {
  test("should display contractor dashboard", async ({ page }) => {
    await page.goto("/contractor/dashboard");
    await expect(page.locator("text=הצעות פעילות")).toBeVisible();
  });

  test("should create new offer", async ({ page }) => {
    await page.goto("/contractor/offers/create");
    await expect(page.locator("text=יצירת הצעה")).toBeVisible();
  });
});
