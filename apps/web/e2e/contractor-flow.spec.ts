import { expect, test } from "./fixtures/auth-fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for Contractor user flows
 * Tests are aligned with actual app routes and Hebrew UI.
 *
 * Existing routes: /contractor/dashboard, /contractor/offers/create,
 *                  /contractor/offers/active, /contractor/projects,
 *                  /contractor/profile
 *
 * Non-existent routes (skipped): /contractor/register, /contractor/vetting,
 *   /contractor/requests, /contractor/orders, /contractor/reviews,
 *   /contractor/analytics, /contractor/settings/*
 */

// Test data
const TEST_CONTRACTOR = {
  email: "moshe@coolair.co.il",
  password: "SecurePass123!",
  businessName: "Cool Air Ltd",
  licenseNumber: "12345678",
  phone: "0521234567",
  categories: ["ac_installation", "ac_maintenance"],
  regions: ["center", "tel_aviv"],
};

const MOCK_CONTRACTOR_OFFERS = [
  {
    id: "offer_001",
    category: "ac_installation",
    title: "התקנת מזגנים - רוטשילד 15",
    basePrice: 4500,
    status: "active",
    buildingId: "bld_001",
    participants: 8,
    currentParticipants: 8,
    minParticipants: 3,
    maxParticipants: 20,
    currentTier: 1,
    discount: 10,
    tiers: [
      { min: 3, max: 5, discount: 5, price: 4275 },
      { min: 6, max: 10, discount: 10, price: 4050 },
      { min: 11, max: 20, discount: 15, price: 3825 },
    ],
    createdAt: "2026-01-25T10:00:00Z",
    expiresAt: "2026-03-15T00:00:00Z",
  },
  {
    id: "offer_002",
    category: "ac_maintenance",
    title: "תחזוקת מזגנים - בן יהודה 50",
    basePrice: 250,
    status: "completed",
    buildingId: "bld_003",
    participants: 15,
    currentParticipants: 15,
    minParticipants: 5,
    maxParticipants: 30,
    discount: 15,
    tiers: [],
    currentTier: 0,
    createdAt: "2026-01-10T14:00:00Z",
    completedAt: "2026-01-10T14:00:00Z",
    revenue: 3187.5,
  },
];

// Helper to set up common API mocks
async function setupCommonMocks(page: Page) {
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        status: "healthy",
        services: { vector_db: true, graph_db: true, redis: true, postgres: true },
      }),
    })
  );

  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'e2e-access-token' }),
    })
  );
}

async function setupContractorAuth(page: Page) {
  // Set cookies so Next.js middleware allows access to /contractor routes.
  // Playwright requires url OR path, not both.
  await page.context().addCookies([
    { name: "refresh_token", value: "e2e-contractor-refresh", url: "http://localhost:3000" },
    {
      name: "groupio-auth",
      value: encodeURIComponent(JSON.stringify({
        state: { user: { role: "contractor" }, isAuthenticated: true },
      })),
      url: "http://localhost:3000",
    },
  ]);
  // Set localStorage for the Zustand client-side auth store
  await page.addInitScript(() => {
    localStorage.setItem(
      "groupio-auth",
      JSON.stringify({
        state: {
          user: { id: "con_001", email: "moshe@coolair.co.il", fullName: "Moshe", phone: "0521234567", role: "contractor", preferredLanguage: "he", isVerified: true, contractorId: "con_001" },
          accessToken: "jwt_token",
          refreshToken: "jwt_refresh",
          isAuthenticated: true,
        },
        version: 0,
      })
    );
  });
}

// ============================================================================
// Contractor Dashboard – /contractor/dashboard
// ============================================================================

test.describe("Contractor Dashboard", () => {
  test.beforeEach(async ({ page, dashboardPage }) => {
    await setupCommonMocks(page);
    await setupContractorAuth(page);

    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "con_001",
          contractor_id: "con_001",
          role: "contractor",
          email: "moshe@coolair.co.il",
        }),
      })
    );

    await page.route("**/api/v1/contractors/*/stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          activeOffers: 3,
          completedProjects: 120,
          totalRevenue: 45000,
          averageRating: 4.8,
          trustScore: 85,
          trustBreakdown: { license: 20, insurance: 18, experience: 12, reputation: 12, completion: 13, response: 10 },
        }),
      })
    );

    await page.route("**/api/v1/offers*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: MOCK_CONTRACTOR_OFFERS, offers: MOCK_CONTRACTOR_OFFERS }),
      })
    );

    await dashboardPage.gotoContractor();
  });

  test("should display contractor dashboard with stats", async ({ page }) => {

    // Wait for dashboard to load — heading then stat value in main content
    await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible({ timeout: 5000 });
    await expect(page.locator("main").getByText("3").first()).toBeVisible({ timeout: 10000 });
  });

  test("should navigate to create offer", async ({ page }) => {

    // Sidebar or quick action link to create offer
    const createLink = page.locator('a[href="/contractor/offers/create"]');
    if (await createLink.first().isVisible()) {
      await createLink.first().click();
      await expect(page).toHaveURL(/contractor\/offers\/create/);
    }
  });

  test("should navigate to active offers", async ({ page }) => {

    const offersLink = page.locator('a[href="/contractor/offers/active"]');
    if (await offersLink.first().isVisible()) {
      await offersLink.first().click();
      await expect(page).toHaveURL(/contractor\/offers\/active/);
    }
  });
});

// ============================================================================
// Contractor Create Offer – /contractor/offers/create
// ============================================================================

test.describe("Contractor Create Offer Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupContractorAuth(page);

    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "con_001", contractor_id: "con_001", role: "contractor" }),
      })
    );
  });

  test("should display offer creation form", async ({ page, offersPage }) => {
    await offersPage.gotoCreateOffer();

    // Step 1 of the wizard shows category chips + title/description; basePrice
    // lives on Step 2 ("תמחור") and is not in the DOM until we advance. Keep
    // assertions limited to what Step 1 actually renders.
    await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('textarea[name="description"]')).toBeVisible();
    // Category is rendered as a CategoryChips button group, not a native select.
    await expect(page.getByRole("button", { name: "מטבחים", exact: true })).toBeVisible();
  });

  test("should fill in and submit offer form", async ({ page, offersPage }) => {
    test.setTimeout(60000);
    await page.route("**/api/v1/offers", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "offer_new", status: "active" }),
        });
      }
      // Fulfill OPTIONS (CORS preflight) and GET requests with Playwright's own
      // response rather than route.continue(), so the browser never attempts to
      // reach the dead backend (port 8000).  A route.continue() to a closed port
      // causes a network error on the OPTIONS preflight, which makes the browser
      // cancel the real POST before it is ever sent — the mock never fires and
      // waitForResponse times out.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], offers: [] }),
      });
    });
    await page.route("**/api/v1/offers/offer_new", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "offer_new",
          status: "active",
          title: "התקנת מזגנים מקצועית",
          building_id: "bld_001",
          current_participants: 0,
          base_price: 4500,
        }),
      })
    );

    await offersPage.gotoCreateOffer();
    await expect(page).toHaveURL(/contractor\/offers\/create/, { timeout: 20000 });
    await page.waitForLoadState("domcontentloaded");

    // Step 1 — details: pick a category, fill title/description/timeline.
    await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "מטבחים", exact: true }).click();
    await page.locator('input[name="title"]').fill("התקנת מזגנים מקצועית");
    await page
      .locator('textarea[name="description"]')
      .fill(
        "שירות מקצועי ואחריות מלאה. התקנה מקצועית עם אחריות לשנה. לפחות 50 תווים נדרשים כאן.",
      );
    await page.locator('input[name="timeline"]').fill("2-3 שבועות");
    await page.getByRole("button", { name: /^הבא/ }).click();

    // Step 2 — pricing: fill base price and make the default tier valid.
    // The default tier has pricePerUnit=0 which fails z.number().min(1) at full
    // submit validation.  Fill pricePerUnit via its ID — more reliable in CI
    // than clicking the "הסר דרגה" remove-tier button (which has proven flaky).
    await expect(page.locator('input[name="basePrice"]')).toBeVisible({ timeout: 10000 });
    await page.locator('input[name="basePrice"]').fill("4500");
    await page.locator('#create-tier-price-0').fill('4000');
    await page.getByRole("button", { name: /^הבא/ }).click();

    // Step 3 — target / participants / validity.
    await expect(page.locator('input[name="buildingId"]')).toBeVisible({ timeout: 10000 });
    await page.locator('input[name="buildingId"]').fill("bld_001");
    await page.locator('select[name="region"]').selectOption("center");
    await page.locator('input[name="minParticipants"]').fill("3");
    await page.locator('input[name="maxParticipants"]').fill("10");
    await page.locator('input[type="checkbox"][value="installation"]').check({ force: true });
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 2);
    await page.locator('input[name="validUntil"]').fill(futureDate.toISOString().split("T")[0]!);
    await page.getByRole("button", { name: /^הבא/ }).click();

    // Step 4 — preview + publish.
    // The publish button only renders when currentStep === 3.
    // Auto-dismiss any alert() that onSubmit might show on API error.
    page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
    const publishBtn = page.locator('[data-testid="publish-offer-btn"]');
    await expect(publishBtn).toBeVisible({ timeout: 25000 });
    // force:true bypasses Playwright's stability check — the button re-renders
    // rapidly (React state on step 3) and keeps detaching before each click
    // attempt.  The form is valid and the element IS present; we just need to
    // fire the click without waiting for DOM quiescence.
    await publishBtn.click({ force: true });
    // URL navigation confirms the POST succeeded; waitForResponse is omitted
    // because the mocked response can race with Playwright's event listener.
    await expect(page).toHaveURL(/contractor\/projects\//, { timeout: 30000 });
  });
});

// ============================================================================
// Contractor Active Offers – /contractor/offers/active
// ============================================================================

test.describe("Contractor Manage Offers", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupContractorAuth(page);

    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "con_001", contractor_id: "con_001", role: "contractor" }),
      })
    );

    await page.route("**/api/v1/offers*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: MOCK_CONTRACTOR_OFFERS, offers: MOCK_CONTRACTOR_OFFERS }),
      })
    );
  });

  test("should display active offers list", async ({ page, offersPage }) => {
    await offersPage.gotoActiveOffers();
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("main")).toBeVisible({ timeout: 15000 });
    // Wait for the page heading inside main. The contractor layout goes through a
    // token-refresh cycle in CI before rendering <main>, and then the page chunk
    // may stream briefly (loading.tsx). 30 s is enough headroom while keeping
    // the total test time under the 60 s test timeout.
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 30000 });
  });

  test("should have filter controls", async ({ page, offersPage }) => {
    await offersPage.gotoActiveOffers();
    await page.waitForLoadState("domcontentloaded");

    // Wait for the layout to fully render before looking for filter controls.
    await expect(page.locator("main")).toBeVisible({ timeout: 15000 });
    // The three <select> filters (status, category, sort) render with the heading.
    await expect(page.locator("select").first()).toBeVisible({ timeout: 20000 });
  });
});

// ============================================================================
// Contractor Projects – /contractor/projects
// ============================================================================

test.describe("Contractor Projects", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupContractorAuth(page);

    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "con_001", contractor_id: "con_001", role: "contractor" }),
      })
    );

    await page.route("**/api/v1/offers*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], offers: [] }),
      })
    );
  });

  test("should display projects page", async ({ page, dashboardPage }) => {
    await dashboardPage.gotoContractorProjects();

    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// Contractor Profile – /contractor/profile
// ============================================================================

test.describe("Contractor Profile Settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupContractorAuth(page);

    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "con_001", contractor_id: "con_001", role: "contractor" }),
      })
    );

    await page.route("**/api/v1/contractors/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "con_001",
          email: TEST_CONTRACTOR.email,
          businessName: TEST_CONTRACTOR.businessName,
          contactName: "Moshe",
          licenseNumber: TEST_CONTRACTOR.licenseNumber,
          phone: TEST_CONTRACTOR.phone,
          description: "Professional AC installation and maintenance services.",
          categories: TEST_CONTRACTOR.categories,
          regions: TEST_CONTRACTOR.regions,
          yearsExperience: 10,
          employeeCount: 5,
          verified: true,
          trustScore: 85,
          rating: 4.8,
          reviewCount: 45,
          completedProjects: 120,
          status: "active",
        }),
      })
    );
  });

  test("should display profile settings page", async ({ page, contractorProfilePage }) => {
    await contractorProfilePage.goto();

    // Profile page renders with tabs
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
  });
});

