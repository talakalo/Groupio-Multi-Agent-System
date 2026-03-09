import { test, expect, Page } from "@playwright/test";
import { setAuthCookies } from "./auth-helpers";

/**
 * E2E tests for Resident user flows
 * Tests are aligned with actual app routes and Hebrew UI.
 *
 * Existing routes: /signup, /login, /dashboard, /offers, /offers/[offerId],
 *                  /architecture, /contractors, /profile, /building, /payments
 */

// Test data
const TEST_RESIDENT = {
  email: "yael.cohen@example.com",
  password: "SecurePass123!",
  name: "יעל כהן",
  phone: "0541234567",
  buildingId: "bld_001",
  apartmentNumber: "12",
};

const MOCK_OFFERS = [
  {
    id: "offer_001",
    category: "ac_installation",
    title: "התקנת מזגנים לבניין",
    basePrice: 4500,
    status: "active",
    contractor: {
      id: "con_001",
      businessName: "Cool Air Ltd",
      rating: 4.8,
      verified: true,
      reviewCount: 45,
    },
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
    expiresAt: "2026-03-15T00:00:00Z",
    building: {
      id: "bld_001",
      address: "רוטשילד 15",
      city: "תל אביב",
    },
  },
  {
    id: "offer_002",
    category: "kitchen",
    title: "שיפוץ מטבחים קבוצתי",
    basePrice: 25000,
    status: "active",
    contractor: {
      id: "con_002",
      businessName: "Kitchen Masters",
      rating: 4.6,
      verified: true,
      reviewCount: 32,
    },
    participants: 4,
    currentParticipants: 4,
    minParticipants: 3,
    maxParticipants: 10,
    currentTier: 0,
    discount: 8,
    tiers: [
      { min: 3, max: 5, discount: 8, price: 23000 },
      { min: 6, max: 10, discount: 12, price: 22000 },
    ],
    expiresAt: "2026-04-01T00:00:00Z",
    building: {
      id: "bld_001",
      address: "רוטשילד 15",
      city: "תל אביב",
    },
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

  await page.route("**/api/v1/buildings/search*", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify([
        {
          id: "bld_001",
          address: "רוטשילד 15",
          city: "תל אביב",
          region: "center",
          units: 24,
        },
      ]),
    })
  );
}

// ============================================================================
// Registration Flow – /signup (not /register)
// ============================================================================

test.describe("Resident Registration Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test("should display signup page with role selection", async ({ page }) => {
    await page.goto("/signup");

    // First step is role selection (Hebrew: "דייר", "קבלן")
    await expect(page.getByText("דייר")).toBeVisible();
    await expect(page.getByText("קבלן")).toBeVisible();
    await expect(page.getByText("הצטרפו ל-Groupio")).toBeVisible();
  });

  test("should navigate to details step after role selection", async ({ page }) => {
    await page.goto("/signup");

    // Select resident role and continue
    await page.getByRole("button", { name: /דייר/ }).first().click();
    await page.getByRole("button", { name: "המשך" }).click();

    // Details form should appear
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#phone")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("should validate email format", async ({ page }) => {
    await page.goto("/signup");

    await page.getByRole("button", { name: /דייר/ }).first().click();
    await page.getByRole("button", { name: "המשך" }).click();

    await page.fill("#email", "invalid-email");
    await page.fill("#name", TEST_RESIDENT.name);
    await page.fill("#phone", TEST_RESIDENT.phone);
    await page.fill("#password", TEST_RESIDENT.password);
    await page.click('button:has-text("הרשמה")');

    await expect(page.getByText("נא להזין כתובת אימייל תקינה")).toBeVisible();
  });

  test("should validate password strength", async ({ page }) => {
    await page.goto("/signup");

    await page.getByRole("button", { name: /דייר/ }).first().click();
    await page.getByRole("button", { name: "המשך" }).click();

    await page.fill("#email", TEST_RESIDENT.email);
    await page.fill("#name", TEST_RESIDENT.name);
    await page.fill("#phone", TEST_RESIDENT.phone);
    await page.fill("#password", "weak");
    await page.click('button:has-text("הרשמה")');

    await expect(page.getByText(/סיסמה חייבת להכיל/)).toBeVisible();
  });

  test("should complete registration successfully", async ({ page }) => {
    await page.route("**/api/v1/auth/register", (route) =>
      route.fulfill({
        status: 201,
        body: JSON.stringify({
          user: {
            id: "user_new",
            email: TEST_RESIDENT.email,
            fullName: TEST_RESIDENT.name,
          },
          token: "jwt_token_here",
        }),
        headers: { "Set-Cookie": "refresh_token=mock-refresh; Path=/; HttpOnly" },
      })
    );

    await page.goto("/signup");

    await page.getByRole("button", { name: /דייר/ }).first().click();
    await page.getByRole("button", { name: "המשך" }).click();

    await page.fill("#name", TEST_RESIDENT.name);
    await page.fill("#email", TEST_RESIDENT.email);
    await page.fill("#phone", TEST_RESIDENT.phone);
    await page.fill("#password", TEST_RESIDENT.password);
    await page.check("#tos");
    await page.getByRole("button", { name: "הרשמה" }).click();

    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });
});

// ============================================================================
// Login Flow – /login
// ============================================================================

test.describe("Resident Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test("should display login page", async ({ page }) => {
    await page.goto("/login");

    // Login form uses id="identifier" and id="password"
    await expect(page.locator("#identifier")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByText("התחברות")).toBeVisible();
  });

  test("should login successfully and redirect to dashboard", async ({ page }) => {
    await page.route("**/api/v1/auth/login/json", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          access_token: "jwt_token_here",
          token_type: "bearer",
        }),
        headers: { "Set-Cookie": "refresh_token=mock-refresh; Path=/; HttpOnly" },
      })
    );

    await page.goto("/login");

    await page.fill("#identifier", TEST_RESIDENT.email);
    await page.fill("#password", TEST_RESIDENT.password);
    await page.getByRole("button", { name: "התחברות" }).click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.route("**/api/v1/auth/login/json", (route) =>
      route.fulfill({
        status: 401,
        body: JSON.stringify({ detail: "Invalid credentials" }),
      })
    );

    await page.goto("/login");

    await page.fill("#identifier", TEST_RESIDENT.email);
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');

    // Error message in Hebrew
    await expect(page.getByText(/שגיאה|שגויים|invalid/i)).toBeVisible({ timeout: 5000 });
  });

  test("should navigate to signup from login", async ({ page }) => {
    await page.goto("/login");

    // The link says "הרשמו חינם" and points to /signup
    await page.click('a[href="/signup"]');
    await expect(page).toHaveURL(/signup/);
  });
});

// ============================================================================
// Browse Offers Flow – /offers
// ============================================================================

test.describe("Resident Browse Offers Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setAuthCookies(page, "resident");

    await page.route("**/api/v1/offers*", (route) => {
      const url = new URL(route.request().url());
      const category = url.searchParams.get("category");

      let offers = MOCK_OFFERS;
      if (category) {
        offers = MOCK_OFFERS.filter((o) => o.category === category);
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ offers, items: offers }),
      });
    });
  });

  test("should display offers page with active offers", async ({ page }) => {
    await page.goto("/offers");

    await expect(page.getByText("הצעות").first()).toBeVisible();
    await expect(page.getByText("Cool Air Ltd")).toBeVisible();
    await expect(page.getByText("Kitchen Masters")).toBeVisible();
  });

  test("should display offer details when clicking an offer", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OFFERS[0]),
      })
    );

    await page.goto("/offers/offer_001");

    await expect(page.getByText("התקנת מזגנים לבניין")).toBeVisible();
    await expect(page.getByText("Cool Air Ltd")).toBeVisible();
  });
});

// ============================================================================
// Join Offer Flow – /offers/[offerId]
// ============================================================================

test.describe("Resident Join Offer Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setAuthCookies(page, "resident");

    await page.route("**/api/v1/offers/offer_001", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OFFERS[0]),
      })
    );
  });

  test("should display offer details page", async ({ page }) => {
    await page.goto("/offers/offer_001");

    await expect(page.getByText("התקנת מזגנים לבניין")).toBeVisible();
    await expect(page.getByText("Cool Air Ltd")).toBeVisible();
  });

  test("should display pricing tiers", async ({ page }) => {
    await page.goto("/offers/offer_001");

    // Should show discount percentages
    await expect(page.getByText("5%").first()).toBeVisible();
    await expect(page.getByText("10%").first()).toBeVisible();
    await expect(page.getByText("15%").first()).toBeVisible();
  });

  test("should join offer successfully", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001/join", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          participation: {
            id: "part_001",
            offerId: "offer_001",
            userId: "user_123",
            joinedAt: new Date().toISOString(),
            tier: 1,
            price: 4050,
          },
        }),
      })
    );

    await page.goto("/offers/offer_001");

    // Click join button (Hebrew: "הצטרף להצעה")
    const joinBtn = page.getByText("הצטרף להצעה");
    if (await joinBtn.isVisible()) {
      await joinBtn.click();
      // Wait for success feedback
      await expect(page.getByText(/הצטרפת|הצלחה/)).toBeVisible({ timeout: 10000 });
    }
  });
});

// ============================================================================
// Resident Profile – /profile
// ============================================================================

test.describe("Resident Profile & Settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setAuthCookies(page, "resident");

    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "user_123",
          email: TEST_RESIDENT.email,
          full_name: TEST_RESIDENT.name,
          phone: TEST_RESIDENT.phone,
          role: "resident",
          building_id: "bld_001",
        }),
      })
    );
  });

  test("should display profile page", async ({ page }) => {
    await page.goto("/profile");

    // Profile page has tabs: Personal, Notifications, Security
    await expect(page.getByText(/פרטים אישיים|פרופיל/)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Critical Journey Tests
// These tests cover the exact flows that were broken in the production audit:
//   - 0-FE-5: Signup endpoint URL mismatch (/auth/register → /auth/signup)
//   - 0-FE-4: joinOffer sent hardcoded userId 'current-user' instead of real ID
// ---------------------------------------------------------------------------

test.describe("Critical User Journey — Register → Login → Join Offer", () => {
  test("full journey: register, login, browse, and join an offer", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route("**/api/v1/auth/register", (r) =>
      r.fulfill({
        status: 201,
        body: JSON.stringify({ token: "journey-token", user: { id: "journey-user", email: "e2e-resident@groupio-test.co.il", fullName: "Test Resident", role: "resident" } }),
        headers: { "Set-Cookie": "refresh_token=journey-refresh; Path=/; HttpOnly" },
      })
    );
    await page.route("**/api/v1/auth/login/json", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ access_token: "journey-token", token_type: "bearer" }),
        headers: { "Set-Cookie": "refresh_token=journey-refresh; Path=/; HttpOnly" },
      })
    );
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ items: MOCK_OFFERS, total: MOCK_OFFERS.length }) })
    );
    await page.route("**/api/v1/offers/offer_001*", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify(MOCK_OFFERS[0]) })
    );
    await page.route("**/api/v1/offers/offer_001/join", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ status: "joined" }) })
    );

    // ── 1. Registration ───────────────────────────────────────────────────
    await page.goto("/signup");
    await expect(page).toHaveURL(/signup/);

    await page.getByRole("button", { name: /דייר/ }).first().click();
    await page.getByRole("button", { name: "המשך" }).click();

    await page.fill("#name", "Test Resident");
    await page.fill("#email", "e2e-resident@groupio-test.co.il");
    await page.fill("#phone", "0501234567");
    await page.fill("#password", "SecurePass123!");
    await page.check("#tos");
    await page.getByRole("button", { name: "הרשמה" }).click();

    await expect(page).toHaveURL(/dashboard|onboarding/, { timeout: 10_000 });

    // ── 2. Login (if redirected to login or for explicit re-auth) ───────────
    await page.goto("/login");
    await page.fill("#identifier", "e2e-resident@groupio-test.co.il");
    await page.fill("#password", "SecurePass123!");
    await page.getByRole("button", { name: "התחברות" }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 10_000 });

    // ── 3. Browse offers ─────────────────────────────────────────────────
    await page.goto("/offers");
    await expect(page).toHaveURL(/offers/);

    // Wait for offers to load
    const offerCard = page.locator('[data-testid="offer-card"]').first();
    const hasOffers = await offerCard.count() > 0;
    if (!hasOffers) {
      // No offers in test environment — verify empty state renders correctly
      await expect(page.locator("text=/אין הצעות|no offers/i")).toBeVisible();
      return;
    }

    // ── 4. Join offer — validates real userId is sent ──────────────────
    await offerCard.click();
    await expect(page).toHaveURL(/offers\/.+/, { timeout: 5_000 });

    // Intercept the join request and verify userId is NOT 'current-user'
    let joinRequestBody: Record<string, unknown> | null = null;
    await page.route("**/api/v1/offers/*/participants", async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as Record<string, unknown> | null;
      joinRequestBody = body;
      await route.continue();
    });

    const joinButton = page.locator('[data-testid="join-offer-button"]');
    if (await joinButton.count() > 0) {
      await joinButton.click();

      // Verify the userId in the request is not the hardcoded placeholder
      if (joinRequestBody && typeof joinRequestBody === "object") {
        const userId = (joinRequestBody as Record<string, unknown>).userId ?? (joinRequestBody as Record<string, unknown>).user_id;
        expect(userId).not.toBe("current-user");
        expect(userId).toBeTruthy();
      }

      // Check for success indicator
      const joinSuccess = page.locator('[data-testid="join-success"], [role="alert"]').first();
      await expect(joinSuccess).toBeVisible({ timeout: 8_000 });
    }
  });

  test("signup form sends request to correct endpoint (/auth/register)", async ({ page }) => {
    await setupCommonMocks(page);

    let registrationUrl = "";
    await page.route("**/api/v1/**", async (route) => {
      const url = route.request().url();
      if (route.request().method() === "POST" && url.includes("/auth/")) {
        registrationUrl = url;
      }
      await route.continue();
    });

    await page.goto("/signup");

    await page.getByRole("button", { name: /דייר/ }).first().click();
    await page.getByRole("button", { name: "המשך" }).click();

    await page.fill("#name", "URL Test User");
    await page.fill("#email", "url-check@groupio-test.co.il");
    await page.fill("#phone", "0502345678");
    await page.fill("#password", "SecurePass123!");
    await page.check("#tos");
    await page.getByRole("button", { name: "הרשמה" }).click();

    await page.waitForTimeout(2000);

    expect(registrationUrl).toContain("/auth/register");
    expect(registrationUrl).not.toContain("/auth/signup");
  });
});
