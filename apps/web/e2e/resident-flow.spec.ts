import { test, expect, Page } from "@playwright/test";

/**
 * Comprehensive E2E tests for Resident user flows
 * Covers: Registration -> Login -> Browse Offers -> Join Offer -> Track Order -> Leave Review
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
    currentTier: 1,
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
    category: "kitchen_renovation",
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
    currentTier: 0,
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
  // Health check
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        status: "healthy",
        services: { vector_db: true, graph_db: true, redis: true, postgres: true },
      }),
    })
  );

  // Building lookup
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

test.describe("Resident Registration Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test("should display registration page with all fields", async ({ page }) => {
    await page.goto("/register");

    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toBeVisible();
    await expect(page.locator("text=הרשמה")).toBeVisible();
  });

  test("should validate email format", async ({ page }) => {
    await page.goto("/register");

    await page.fill('input[name="email"]', "invalid-email");
    await page.fill('input[name="password"]', TEST_RESIDENT.password);
    await page.click('button[type="submit"]');

    await expect(page.locator("text=אימייל לא תקין")).toBeVisible();
  });

  test("should validate password strength", async ({ page }) => {
    await page.goto("/register");

    await page.fill('input[name="email"]', TEST_RESIDENT.email);
    await page.fill('input[name="password"]', "weak");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=הסיסמה חייבת להכיל")).toBeVisible();
  });

  test("should complete registration successfully", async ({ page }) => {
    await page.route("**/api/v1/auth/register", (route) =>
      route.fulfill({
        status: 201,
        body: JSON.stringify({
          user: {
            id: "user_new",
            email: TEST_RESIDENT.email,
            name: TEST_RESIDENT.name,
          },
          token: "jwt_token_here",
        }),
      })
    );

    await page.goto("/register");

    await page.fill('input[name="email"]', TEST_RESIDENT.email);
    await page.fill('input[name="password"]', TEST_RESIDENT.password);
    await page.fill('input[name="name"]', TEST_RESIDENT.name);
    await page.fill('input[name="phone"]', TEST_RESIDENT.phone);

    // Select building
    await page.fill('input[placeholder*="כתובת"]', "רוטשילד 15");
    await page.click("text=רוטשילד 15, תל אביב");
    await page.fill('input[name="apartmentNumber"]', TEST_RESIDENT.apartmentNumber);

    await page.click('button[type="submit"]');

    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL(/dashboard/);
  });

  test("should handle registration error for existing email", async ({ page }) => {
    await page.route("**/api/v1/auth/register", (route) =>
      route.fulfill({
        status: 409,
        body: JSON.stringify({ error: "Email already exists" }),
      })
    );

    await page.goto("/register");

    await page.fill('input[name="email"]', TEST_RESIDENT.email);
    await page.fill('input[name="password"]', TEST_RESIDENT.password);
    await page.fill('input[name="name"]', TEST_RESIDENT.name);
    await page.fill('input[name="phone"]', TEST_RESIDENT.phone);
    await page.click('button[type="submit"]');

    await expect(page.locator("text=אימייל כבר קיים במערכת")).toBeVisible();
  });
});

test.describe("Resident Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test("should display login page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator("text=התחברות")).toBeVisible();
  });

  test("should login successfully and redirect to dashboard", async ({ page }) => {
    await page.route("**/api/v1/auth/login/json", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          access_token: "jwt_token_here",
          refresh_token: "refresh_token_here",
          expires_in: 3600,
        }),
      })
    );

    await page.goto("/login");

    await page.fill('input[name="identifier"]', TEST_RESIDENT.email);
    await page.fill('input[name="password"]', TEST_RESIDENT.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/dashboard/);
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.route("**/api/v1/auth/login/json", (route) =>
      route.fulfill({
        status: 401,
        body: JSON.stringify({ detail: "Invalid credentials" }),
      })
    );

    await page.goto("/login");

    await page.fill('input[name="identifier"]', TEST_RESIDENT.email);
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=פרטי התחברות שגויים")).toBeVisible();
  });

  test("should navigate to registration from login", async ({ page }) => {
    await page.goto("/login");
    await page.click('a[href="/register"]');
    await expect(page).toHaveURL(/register/);
  });

  test("should navigate to forgot password", async ({ page }) => {
    await page.goto("/login");
    await page.click("text=שכחתי סיסמה");
    await expect(page).toHaveURL(/forgot-password/);
  });
});

test.describe("Resident Browse Offers Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    // Mock offers API
    await page.route("**/api/v1/offers*", (route) => {
      const url = new URL(route.request().url());
      const category = url.searchParams.get("category");

      let offers = MOCK_OFFERS;
      if (category) {
        offers = MOCK_OFFERS.filter((o) => o.category === category);
      }

      return route.fulfill({
        status: 200,
        body: JSON.stringify(offers),
      });
    });

    // Mock auth state
    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "user_123", name: "יעל כהן", role: "resident" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should display offers page with active offers", async ({ page }) => {
    await page.goto("/offers");

    await expect(page.locator("text=הצעות פעילות")).toBeVisible();
    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
    await expect(page.locator("text=Kitchen Masters")).toBeVisible();
  });

  test("should filter offers by category", async ({ page }) => {
    await page.goto("/offers");

    await page.click('button:has-text("מזגנים")');

    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
    await expect(page.locator("text=Kitchen Masters")).not.toBeVisible();
  });

  test("should display offer card with pricing tiers", async ({ page }) => {
    await page.goto("/offers");

    const offerCard = page.locator('[data-testid="offer-card"]').first();
    await expect(offerCard.locator("text=₪4,050")).toBeVisible(); // Current tier price
    await expect(offerCard.locator("text=10%")).toBeVisible(); // Discount percentage
    await expect(offerCard.locator("text=8 משתתפים")).toBeVisible();
  });

  test("should show tier progression indicator", async ({ page }) => {
    await page.goto("/offers");

    const tierIndicator = page.locator('[data-testid="tier-progress"]').first();
    await expect(tierIndicator).toBeVisible();
  });

  test("should navigate to offer details page", async ({ page }) => {
    await page.goto("/offers");

    await page.click('[data-testid="offer-card"]');

    await expect(page).toHaveURL(/offers\/offer_001/);
  });

  test("should sort offers by price", async ({ page }) => {
    await page.goto("/offers");

    await page.click('button:has-text("מיין לפי")');
    await page.click("text=מחיר: נמוך לגבוה");

    // First offer should be the cheaper one
    const firstCard = page.locator('[data-testid="offer-card"]').first();
    await expect(firstCard.locator("text=Cool Air")).toBeVisible();
  });

  test("should sort offers by participants", async ({ page }) => {
    await page.goto("/offers");

    await page.click('button:has-text("מיין לפי")');
    await page.click("text=משתתפים: רב לגבוה");

    const firstCard = page.locator('[data-testid="offer-card"]').first();
    await expect(firstCard.locator("text=8 משתתפים")).toBeVisible();
  });
});

test.describe("Resident Join Offer Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    // Mock single offer
    await page.route("**/api/v1/offers/offer_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_OFFERS[0]),
      })
    );

    // Mock auth state
    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "user_123", name: "יעל כהן", role: "resident", buildingId: "bld_001" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should display offer details page", async ({ page }) => {
    await page.goto("/offers/offer_001");

    await expect(page.locator("text=התקנת מזגנים לבניין")).toBeVisible();
    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
    await expect(page.locator("text=4.8")).toBeVisible(); // Rating
  });

  test("should display all pricing tiers", async ({ page }) => {
    await page.goto("/offers/offer_001");

    await expect(page.locator("text=5%")).toBeVisible();
    await expect(page.locator("text=10%")).toBeVisible();
    await expect(page.locator("text=15%")).toBeVisible();
  });

  test("should highlight current tier", async ({ page }) => {
    await page.goto("/offers/offer_001");

    const currentTier = page.locator('[data-testid="tier-card"].active');
    await expect(currentTier.locator("text=10%")).toBeVisible();
  });

  test("should show remaining spots to next tier", async ({ page }) => {
    await page.goto("/offers/offer_001");

    await expect(page.locator("text=עוד 3 משתתפים")).toBeVisible();
  });

  test("should join offer successfully", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001/join", (route) =>
      route.fulfill({
        status: 200,
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
    await page.click('button:has-text("הצטרף להצעה")');

    // Confirmation modal
    await expect(page.locator("text=אישור הצטרפות")).toBeVisible();
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=הצטרפת בהצלחה")).toBeVisible();
  });

  test("should show join confirmation with price", async ({ page }) => {
    await page.goto("/offers/offer_001");
    await page.click('button:has-text("הצטרף להצעה")');

    await expect(page.locator("text=₪4,050")).toBeVisible();
    await expect(page.locator("text=10% הנחה")).toBeVisible();
  });

  test("should prevent joining if already joined", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          ...MOCK_OFFERS[0],
          userParticipation: { id: "part_001", joinedAt: "2026-01-15T10:00:00Z" },
        }),
      })
    );

    await page.goto("/offers/offer_001");

    await expect(page.locator("text=כבר הצטרפת")).toBeVisible();
    await expect(page.locator('button:has-text("הצטרף")')).not.toBeVisible();
  });

  test("should show contractor details modal", async ({ page }) => {
    await page.goto("/offers/offer_001");
    await page.click("text=Cool Air Ltd");

    await expect(page.locator('[data-testid="contractor-modal"]')).toBeVisible();
    await expect(page.locator("text=45 ביקורות")).toBeVisible();
    await expect(page.locator("text=מאומת")).toBeVisible();
  });
});

test.describe("Resident Order Tracking Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    // Mock user orders
    await page.route("**/api/v1/orders*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: "order_001",
            offerId: "offer_001",
            status: "scheduled",
            scheduledDate: "2026-02-20T09:00:00Z",
            contractor: { businessName: "Cool Air Ltd", phone: "0521234567" },
            price: 4050,
            category: "ac_installation",
          },
          {
            id: "order_002",
            offerId: "offer_003",
            status: "completed",
            completedDate: "2026-01-10T14:00:00Z",
            contractor: { businessName: "Plumb Pro", phone: "0539876543" },
            price: 1800,
            category: "plumbing",
            review: null,
          },
        ]),
      })
    );

    // Mock auth state
    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "user_123", name: "יעל כהן", role: "resident" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should display orders page with all orders", async ({ page }) => {
    await page.goto("/orders");

    await expect(page.locator("text=ההזמנות שלי")).toBeVisible();
    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
    await expect(page.locator("text=Plumb Pro")).toBeVisible();
  });

  test("should show order status badges", async ({ page }) => {
    await page.goto("/orders");

    await expect(page.locator('text="מתוכנן"')).toBeVisible();
    await expect(page.locator('text="הושלם"')).toBeVisible();
  });

  test("should filter orders by status", async ({ page }) => {
    await page.goto("/orders");

    await page.click('button:has-text("הושלמו")');

    await expect(page.locator("text=Plumb Pro")).toBeVisible();
    await expect(page.locator("text=Cool Air Ltd")).not.toBeVisible();
  });

  test("should display order details", async ({ page }) => {
    await page.route("**/api/v1/orders/order_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "order_001",
          offerId: "offer_001",
          status: "scheduled",
          scheduledDate: "2026-02-20T09:00:00Z",
          contractor: {
            businessName: "Cool Air Ltd",
            phone: "0521234567",
            email: "contact@coolair.co.il",
          },
          price: 4050,
          category: "ac_installation",
          timeline: [
            { date: "2026-02-01T10:00:00Z", status: "joined", message: "הצטרפת להצעה" },
            { date: "2026-02-05T12:00:00Z", status: "confirmed", message: "ההזמנה אושרה" },
            { date: "2026-02-10T09:00:00Z", status: "scheduled", message: "נקבע מועד לביצוע" },
          ],
        }),
      })
    );

    await page.goto("/orders/order_001");

    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
    await expect(page.locator("text=₪4,050")).toBeVisible();
    await expect(page.locator("text=20/02/2026")).toBeVisible();
  });

  test("should contact contractor", async ({ page }) => {
    await page.goto("/orders/order_001");

    const callButton = page.locator('a[href="tel:0521234567"]');
    await expect(callButton).toBeVisible();
  });

  test("should reschedule appointment", async ({ page }) => {
    await page.route("**/api/v1/orders/order_001/reschedule", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, newDate: "2026-02-25T10:00:00Z" }),
      })
    );

    await page.goto("/orders/order_001");
    await page.click('button:has-text("שינוי מועד")');

    await expect(page.locator('[data-testid="date-picker"]')).toBeVisible();
    await page.click('button:has-text("25")');
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=המועד עודכן")).toBeVisible();
  });
});

test.describe("Resident Review Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "user_123", name: "יעל כהן", role: "resident" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should prompt for review on completed order", async ({ page }) => {
    await page.route("**/api/v1/orders/order_002", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "order_002",
          status: "completed",
          completedDate: "2026-01-10T14:00:00Z",
          contractor: { id: "con_003", businessName: "Plumb Pro" },
          review: null,
        }),
      })
    );

    await page.goto("/orders/order_002");

    await expect(page.locator("text=מה דעתך על השירות")).toBeVisible();
  });

  test("should submit review successfully", async ({ page }) => {
    await page.route("**/api/v1/orders/order_002", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "order_002",
          status: "completed",
          contractor: { id: "con_003", businessName: "Plumb Pro" },
          review: null,
        }),
      })
    );

    await page.route("**/api/v1/reviews", (route) =>
      route.fulfill({
        status: 201,
        body: JSON.stringify({
          id: "review_001",
          rating: 5,
          text: "שירות מעולה, מקצועי ואדיב",
        }),
      })
    );

    await page.goto("/orders/order_002");

    // Rate 5 stars
    await page.click('[data-testid="star-5"]');
    await page.fill('textarea[name="reviewText"]', "שירות מעולה, מקצועי ואדיב");
    await page.click('button:has-text("שלח ביקורת")');

    await expect(page.locator("text=הביקורת נשלחה")).toBeVisible();
  });

  test("should require minimum rating", async ({ page }) => {
    await page.route("**/api/v1/orders/order_002", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "order_002",
          status: "completed",
          contractor: { id: "con_003", businessName: "Plumb Pro" },
          review: null,
        }),
      })
    );

    await page.goto("/orders/order_002");

    await page.click('button:has-text("שלח ביקורת")');

    await expect(page.locator("text=יש לבחור דירוג")).toBeVisible();
  });
});

test.describe("Resident AI Chat Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "user_123", name: "יעל כהן", role: "resident", buildingId: "bld_001" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should display chat interface on dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.locator('[data-testid="chat-widget"]')).toBeVisible();
  });

  test("should send message and receive AI response", async ({ page }) => {
    await page.route("**/api/v1/message", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          conversationId: "conv_001",
          response: {
            type: "contractor_list",
            message: "מצאתי 3 קבלנים מתאימים להתקנת מזגנים",
            data: [
              { id: "con_001", name: "Cool Air Ltd", rating: 4.8 },
              { id: "con_002", name: "AC Masters", rating: 4.6 },
              { id: "con_003", name: "Clima Pro", rating: 4.5 },
            ],
          },
          metadata: {
            intent: "contractor_search",
            confidence: 0.95,
            agentsUsed: ["router", "matching"],
          },
        }),
      })
    );

    await page.goto("/dashboard");

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill("מחפש קבלן מזגנים");
    await chatInput.press("Enter");

    await expect(page.locator("text=מצאתי 3 קבלנים")).toBeVisible();
    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
  });

  test("should handle pricing questions", async ({ page }) => {
    await page.route("**/api/v1/message", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          conversationId: "conv_001",
          response: {
            type: "pricing_info",
            message: "מחיר ממוצע להתקנת מזגן הוא כ-4,500₪. בהצעה קבוצתית אפשר לחסוך עד 20%.",
            data: {
              avgPrice: 4500,
              groupDiscount: 20,
              currentOffers: 2,
            },
          },
          metadata: { intent: "pricing_question", confidence: 0.92 },
        }),
      })
    );

    await page.goto("/dashboard");

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill("כמה עולה להתקין מזגן?");
    await chatInput.press("Enter");

    await expect(page.locator("text=4,500₪")).toBeVisible();
    await expect(page.locator("text=20%")).toBeVisible();
  });

  test("should show typing indicator while waiting for response", async ({ page }) => {
    await page.route("**/api/v1/message", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ response: { message: "תשובה" } }),
      });
    });

    await page.goto("/dashboard");

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill("שאלה");
    await chatInput.press("Enter");

    await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible();
  });

  test("should handle escalation to human", async ({ page }) => {
    await page.route("**/api/v1/message", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          conversationId: "conv_001",
          response: {
            type: "escalation",
            message: "אני מעביר אותך לנציג אנושי שיוכל לעזור לך",
          },
          metadata: {
            intent: "complaint",
            needsHuman: true,
            escalationReason: "legal_keywords",
          },
        }),
      })
    );

    await page.goto("/dashboard");

    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill("אני רוצה לדבר עם עורך דין");
    await chatInput.press("Enter");

    await expect(page.locator("text=נציג אנושי")).toBeVisible();
  });
});

test.describe("Resident Share Offer Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.route("**/api/v1/offers/offer_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_OFFERS[0]),
      })
    );

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "user_123", name: "יעל כהן", role: "resident", buildingId: "bld_001" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should display share button on offer page", async ({ page }) => {
    await page.goto("/offers/offer_001");

    await expect(page.locator('button:has-text("שתף")')).toBeVisible();
  });

  test("should show share modal with options", async ({ page }) => {
    await page.goto("/offers/offer_001");
    await page.click('button:has-text("שתף")');

    await expect(page.locator('[data-testid="share-modal"]')).toBeVisible();
    await expect(page.locator("text=WhatsApp")).toBeVisible();
    await expect(page.locator("text=העתק קישור")).toBeVisible();
  });

  test("should generate share link", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001/share", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          shareUrl: "https://groupio.co.il/join/abc123",
          referralCode: "abc123",
        }),
      })
    );

    await page.goto("/offers/offer_001");
    await page.click('button:has-text("שתף")');
    await page.click("text=העתק קישור");

    await expect(page.locator("text=הקישור הועתק")).toBeVisible();
  });

  test("should invite building neighbors", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001/invite", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ invitesSent: 15 }),
      })
    );

    await page.goto("/offers/offer_001");
    await page.click('button:has-text("הזמן שכנים")');

    await expect(page.locator("text=15 הזמנות נשלחו")).toBeVisible();
  });
});

test.describe("Resident Profile & Settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.route("**/api/v1/users/me", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "user_123",
          email: TEST_RESIDENT.email,
          name: TEST_RESIDENT.name,
          phone: TEST_RESIDENT.phone,
          building: { id: "bld_001", address: "רוטשילד 15", city: "תל אביב" },
          apartmentNumber: "12",
          notifications: { email: true, whatsapp: true, push: false },
        }),
      })
    );

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "user_123", name: "יעל כהן", role: "resident" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should display profile page", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.locator(`text=${TEST_RESIDENT.name}`)).toBeVisible();
    await expect(page.locator(`text=${TEST_RESIDENT.email}`)).toBeVisible();
    await expect(page.locator("text=רוטשילד 15")).toBeVisible();
  });

  test("should update profile information", async ({ page }) => {
    await page.route("**/api/v1/users/me", (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({ name: "יעל כהן-לוי", phone: "0549876543" }),
        });
      }
      return route.continue();
    });

    await page.goto("/profile");
    await page.click('button:has-text("עריכה")');

    await page.fill('input[name="name"]', "יעל כהן-לוי");
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=הפרטים עודכנו")).toBeVisible();
  });

  test("should update notification preferences", async ({ page }) => {
    await page.route("**/api/v1/users/me/notifications", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
    );

    await page.goto("/profile/settings");

    const pushToggle = page.locator('[data-testid="push-notifications"]');
    await pushToggle.click();

    await expect(page.locator("text=ההגדרות נשמרו")).toBeVisible();
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("/profile");
    await page.click('button:has-text("התנתקות")');

    await expect(page).toHaveURL(/login|home/);
  });
});
