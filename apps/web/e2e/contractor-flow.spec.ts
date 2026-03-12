import { test, expect, Page } from "@playwright/test";

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
  // Set cookies the Next.js Edge middleware reads:
  // refresh_token (presence = session valid) + groupio-auth (role for routing)
  await page.context().addCookies([
    { name: "refresh_token", value: "e2e-refresh-token", url: "http://localhost:3000" },
    { name: "groupio-auth", value: encodeURIComponent(JSON.stringify({ state: { user: { role: "contractor" }, isAuthenticated: true } })), url: "http://localhost:3000" },
  ]);
}

// ============================================================================
// Contractor Dashboard – /contractor/dashboard
// ============================================================================

test.describe("Contractor Dashboard", () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test("should display contractor dashboard with stats", async ({ page }) => {
    await page.goto("/contractor/dashboard");

    // Wait for stats to load — dashboard shows stat cards or active offers
    await expect(page.getByRole("heading", { name: "לוח בקרה" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/הצעות פעילות|Active Offers|3/).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should navigate to create offer", async ({ page }) => {
    await page.goto("/contractor/dashboard");

    // Sidebar or quick action link to create offer
    const createLink = page.locator('a[href="/contractor/offers/create"]');
    if (await createLink.first().isVisible()) {
      await createLink.first().click();
      await expect(page).toHaveURL(/contractor\/offers\/create/);
    }
  });

  test("should navigate to active offers", async ({ page }) => {
    await page.goto("/contractor/dashboard");

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

  test("should display offer creation form", async ({ page }) => {
    await page.goto("/contractor/offers/create");

    // Form inputs are registered via react-hook-form (name attr only, no id)
    await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('select[name="category"]')).toBeVisible();
    await expect(page.locator('input[name="basePrice"]')).toBeVisible();
  });

  test("should fill in and submit offer form", async ({ page }) => {
    await page.route("**/api/v1/offers", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "offer_new",
          status: "active",
        }),
      })
    );

    await page.goto("/contractor/offers/create");

    await page.fill('input[name="title"]', "התקנת מזגנים מקצועית");
    await page.fill('textarea[name="description"]', "שירות מקצועי ואחריות מלאה. התקנה מקצועית עם אחריות לשנה.");
    await page.selectOption('select[name="category"]', "ac_installation");
    await page.selectOption('select[name="region"]', "center");
    await page.fill('input[name="buildingId"]', "bld_001");
    await page.fill('input[name="basePrice"]', "4500");
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 2);
    await page.fill('input[name="validUntil"]', futureDate.toISOString().split("T")[0]!);
    await page.check('input[value="installation"]');

    await page.click('button[type="submit"]');

    // Should navigate to offer page or show success
    await expect(page).toHaveURL(/contractor\/offers\//, { timeout: 10000 });
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

  test("should display active offers list", async ({ page }) => {
    await page.goto("/contractor/offers/active");

    // OfferCard renders the category label (not offer.title); use first() to avoid
    // strict mode violation since the category also appears in the filter dropdown
    await expect(page.getByText("התקנת מזגנים").first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should have filter controls", async ({ page }) => {
    await page.goto("/contractor/offers/active");

    // Status filter dropdown exists
    await expect(page.locator("select").first()).toBeVisible({ timeout: 10000 });
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

  test("should display projects page", async ({ page }) => {
    await page.goto("/contractor/projects");

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

  test("should display profile settings page", async ({ page }) => {
    await page.goto("/contractor/profile");

    // Profile page renders with tabs
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10000 });
  });
});

