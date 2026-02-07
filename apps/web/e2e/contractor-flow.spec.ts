import { test, expect, Page } from "@playwright/test";

/**
 * Comprehensive E2E tests for Contractor user flows
 * Covers: Registration -> Vetting -> Create Offers -> Manage Orders -> Analytics
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

const MOCK_CONTRACTOR_PROFILE = {
  id: "con_001",
  email: TEST_CONTRACTOR.email,
  businessName: TEST_CONTRACTOR.businessName,
  licenseNumber: TEST_CONTRACTOR.licenseNumber,
  phone: TEST_CONTRACTOR.phone,
  categories: TEST_CONTRACTOR.categories,
  regions: TEST_CONTRACTOR.regions,
  verified: true,
  rating: 4.8,
  reviewCount: 45,
  completedProjects: 120,
  status: "active",
  documents: [
    { type: "license", status: "approved", uploadedAt: "2025-01-15" },
    { type: "insurance", status: "approved", uploadedAt: "2025-01-15" },
  ],
};

const MOCK_BUILDING_REQUESTS = [
  {
    id: "req_001",
    buildingId: "bld_001",
    address: "רוטשילד 15, תל אביב",
    category: "ac_installation",
    units: 24,
    interestedResidents: 12,
    preferredTimeframe: "2026-03-01",
    status: "pending",
    createdAt: "2026-01-20T10:00:00Z",
  },
  {
    id: "req_002",
    buildingId: "bld_002",
    address: "דיזנגוף 100, תל אביב",
    category: "ac_installation",
    units: 36,
    interestedResidents: 18,
    preferredTimeframe: "2026-04-01",
    status: "pending",
    createdAt: "2026-01-22T14:00:00Z",
  },
];

const MOCK_CONTRACTOR_OFFERS = [
  {
    id: "offer_001",
    category: "ac_installation",
    title: "התקנת מזגנים - רוטשילד 15",
    basePrice: 4500,
    status: "active",
    buildingId: "bld_001",
    participants: 8,
    currentTier: 1,
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
    finalTier: 2,
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
}

test.describe("Contractor Registration Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test("should display contractor registration page", async ({ page }) => {
    await page.goto("/contractor/register");

    await expect(page.locator("text=הרשמת קבלן")).toBeVisible();
    await expect(page.locator('input[name="businessName"]')).toBeVisible();
    await expect(page.locator('input[name="licenseNumber"]')).toBeVisible();
  });

  test("should validate license number format", async ({ page }) => {
    await page.goto("/contractor/register");

    await page.fill('input[name="licenseNumber"]', "abc");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=מספר רישיון לא תקין")).toBeVisible();
  });

  test("should complete registration with document upload", async ({ page }) => {
    await page.route("**/api/v1/contractors/register", (route) =>
      route.fulfill({
        status: 201,
        body: JSON.stringify({
          contractor: { id: "con_new", businessName: TEST_CONTRACTOR.businessName },
          token: "jwt_token",
          status: "pending_verification",
        }),
      })
    );

    await page.goto("/contractor/register");

    // Fill business details
    await page.fill('input[name="businessName"]', TEST_CONTRACTOR.businessName);
    await page.fill('input[name="licenseNumber"]', TEST_CONTRACTOR.licenseNumber);
    await page.fill('input[name="email"]', TEST_CONTRACTOR.email);
    await page.fill('input[name="password"]', TEST_CONTRACTOR.password);
    await page.fill('input[name="phone"]', TEST_CONTRACTOR.phone);

    // Select categories
    await page.click('label:has-text("התקנת מזגנים")');
    await page.click('label:has-text("תחזוקת מזגנים")');

    // Select regions
    await page.click('label:has-text("מרכז")');
    await page.click('label:has-text("תל אביב")');

    // Upload documents (mock file input)
    const licenseInput = page.locator('input[name="license-file"]');
    await licenseInput.setInputFiles({
      name: "license.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("mock pdf content"),
    });

    const insuranceInput = page.locator('input[name="insurance-file"]');
    await insuranceInput.setInputFiles({
      name: "insurance.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("mock pdf content"),
    });

    await page.click('button[type="submit"]');

    await expect(page.locator("text=הרשמה התקבלה")).toBeVisible();
    await expect(page.locator("text=ממתין לאימות")).toBeVisible();
  });

  test("should show pending verification status after registration", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_new", role: "contractor", status: "pending_verification" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          ...MOCK_CONTRACTOR_PROFILE,
          verified: false,
          status: "pending_verification",
        }),
      })
    );

    await page.goto("/contractor/dashboard");

    await expect(page.locator("text=הפרופיל שלך בבדיקה")).toBeVisible();
    await expect(page.locator("text=נעדכן אותך כשהאימות יושלם")).toBeVisible();
  });
});

test.describe("Contractor Vetting Process", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "pending_verification" },
          token: "jwt_token",
        })
      );
    });
  });

  test("should display vetting status page", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/vetting-status", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "in_progress",
          steps: [
            { name: "license_verification", status: "completed", completedAt: "2026-01-16" },
            { name: "insurance_verification", status: "in_progress" },
            { name: "background_check", status: "pending" },
            { name: "final_review", status: "pending" },
          ],
          estimatedCompletion: "2026-01-20",
        }),
      })
    );

    await page.goto("/contractor/vetting");

    await expect(page.locator("text=סטטוס אימות")).toBeVisible();
    await expect(page.locator("text=בדיקת רישיון")).toBeVisible();
    await expect(page.locator("text=הושלם")).toBeVisible();
  });

  test("should show document upload prompt for missing documents", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/vetting-status", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "documents_required",
          missingDocuments: ["insurance_certificate"],
          message: "נדרש להעלות תעודת ביטוח עדכנית",
        }),
      })
    );

    await page.goto("/contractor/vetting");

    await expect(page.locator("text=נדרשים מסמכים נוספים")).toBeVisible();
    await expect(page.locator("text=תעודת ביטוח")).toBeVisible();
  });

  test("should upload additional documents", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/documents", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, documentId: "doc_new" }),
      })
    );

    await page.goto("/contractor/vetting");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "insurance.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("mock pdf content"),
    });

    await page.click('button:has-text("העלה")');

    await expect(page.locator("text=המסמך הועלה בהצלחה")).toBeVisible();
  });

  test("should display approval notification", async ({ page }) => {
    await page.route("**/api/v1/contractors/me", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ ...MOCK_CONTRACTOR_PROFILE, verified: true, status: "active" }),
      })
    );

    await page.goto("/contractor/dashboard");

    await expect(page.locator("text=הפרופיל שלך אומת")).toBeVisible();
  });

  test("should handle rejection with reason", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/vetting-status", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: "rejected",
          reason: "רישיון פג תוקף",
          canReapply: true,
          reapplyAfter: "2026-02-01",
        }),
      })
    );

    await page.goto("/contractor/vetting");

    await expect(page.locator("text=הבקשה נדחתה")).toBeVisible();
    await expect(page.locator("text=רישיון פג תוקף")).toBeVisible();
  });
});

test.describe("Contractor Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_CONTRACTOR_PROFILE),
      })
    );

    await page.route("**/api/v1/contractors/me/stats", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          activeOffers: 3,
          totalParticipants: 25,
          monthlyRevenue: 45000,
          rating: 4.8,
          completionRate: 98,
        }),
      })
    );
  });

  test("should display contractor dashboard with stats", async ({ page }) => {
    await page.goto("/contractor/dashboard");

    await expect(page.locator("text=Cool Air Ltd")).toBeVisible();
    await expect(page.locator("text=4.8")).toBeVisible();
    await expect(page.locator("text=45 ביקורות")).toBeVisible();
  });

  test("should show quick stats cards", async ({ page }) => {
    await page.goto("/contractor/dashboard");

    await expect(page.locator("text=הצעות פעילות")).toBeVisible();
    await expect(page.locator("text=3")).toBeVisible();
    await expect(page.locator("text=הכנסות החודש")).toBeVisible();
    await expect(page.locator("text=₪45,000")).toBeVisible();
  });

  test("should navigate to offers management", async ({ page }) => {
    await page.goto("/contractor/dashboard");
    await page.click('a:has-text("הצעות")');

    await expect(page).toHaveURL(/contractor\/offers/);
  });

  test("should display notifications", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/notifications", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: "notif_001",
            type: "new_request",
            message: "בקשה חדשה מרוטשילד 15 - 12 דיירים מעוניינים",
            createdAt: "2026-01-25T10:00:00Z",
            read: false,
          },
        ]),
      })
    );

    await page.goto("/contractor/dashboard");

    await expect(page.locator('[data-testid="notification-badge"]')).toBeVisible();
  });
});

test.describe("Contractor View Building Requests", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me/requests*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_BUILDING_REQUESTS),
      })
    );
  });

  test("should display available building requests", async ({ page }) => {
    await page.goto("/contractor/requests");

    await expect(page.locator("text=בקשות זמינות")).toBeVisible();
    await expect(page.locator("text=רוטשילד 15, תל אביב")).toBeVisible();
    await expect(page.locator("text=12 דיירים מעוניינים")).toBeVisible();
  });

  test("should filter requests by category", async ({ page }) => {
    await page.goto("/contractor/requests");

    await page.click('button:has-text("קטגוריה")');
    await page.click("text=התקנת מזגנים");

    await expect(page.locator("text=רוטשילד 15")).toBeVisible();
  });

  test("should sort requests by interest level", async ({ page }) => {
    await page.goto("/contractor/requests");

    await page.click('button:has-text("מיין")');
    await page.click("text=כמות דיירים");

    // Request with more interested residents should be first
    const firstRequest = page.locator('[data-testid="request-card"]').first();
    await expect(firstRequest.locator("text=18 דיירים")).toBeVisible();
  });

  test("should view request details", async ({ page }) => {
    await page.route("**/api/v1/requests/req_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          ...MOCK_BUILDING_REQUESTS[0],
          building: {
            type: "residential",
            age: 15,
            floors: 8,
            totalUnits: 24,
          },
          previousContractors: [],
          notes: "דרושה עבודה מהירה",
        }),
      })
    );

    await page.goto("/contractor/requests");
    await page.click("text=רוטשילד 15, תל אביב");

    await expect(page.locator('[data-testid="request-details"]')).toBeVisible();
    await expect(page.locator("text=24 יחידות")).toBeVisible();
  });
});

test.describe("Contractor Create Offer Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/market-data*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          category: "ac_installation",
          region: "center",
          avgPrice: 4500,
          minPrice: 3500,
          maxPrice: 6000,
          sampleSize: 50,
        }),
      })
    );
  });

  test("should display offer creation form", async ({ page }) => {
    await page.goto("/contractor/offers/create");

    await expect(page.locator("text=יצירת הצעה חדשה")).toBeVisible();
    await expect(page.locator('select[name="category"]')).toBeVisible();
    await expect(page.locator('input[name="basePrice"]')).toBeVisible();
  });

  test("should show market data while creating offer", async ({ page }) => {
    await page.goto("/contractor/offers/create");

    await page.selectOption('select[name="category"]', "ac_installation");

    await expect(page.locator("text=מחיר ממוצע בשוק")).toBeVisible();
    await expect(page.locator("text=₪4,500")).toBeVisible();
  });

  test("should calculate tier prices automatically", async ({ page }) => {
    await page.goto("/contractor/offers/create");

    await page.fill('input[name="basePrice"]', "4500");

    // Tier preview should show calculated discounts
    await expect(page.locator("text=₪4,275")).toBeVisible(); // 5% off
    await expect(page.locator("text=₪4,050")).toBeVisible(); // 10% off
    await expect(page.locator("text=₪3,825")).toBeVisible(); // 15% off
  });

  test("should warn about below-market pricing", async ({ page }) => {
    await page.goto("/contractor/offers/create");

    await page.selectOption('select[name="category"]', "ac_installation");
    await page.fill('input[name="basePrice"]', "2500");

    await expect(page.locator("text=המחיר נמוך מהממוצע בשוק")).toBeVisible();
  });

  test("should create offer successfully", async ({ page }) => {
    await page.route("**/api/v1/offers", (route) =>
      route.fulfill({
        status: 201,
        body: JSON.stringify({
          id: "offer_new",
          status: "active",
        }),
      })
    );

    await page.goto("/contractor/offers/create");

    await page.selectOption('select[name="category"]', "ac_installation");
    await page.fill('input[name="basePrice"]', "4500");
    await page.fill('input[name="title"]', "התקנת מזגנים מקצועית");
    await page.fill('textarea[name="description"]', "שירות מקצועי ואחריות מלאה");

    // Select building
    await page.click('[data-testid="building-selector"]');
    await page.click("text=רוטשילד 15");

    // Set expiration
    await page.fill('input[name="expirationDays"]', "30");

    await page.click('button:has-text("פרסם הצעה")');

    await expect(page.locator("text=ההצעה פורסמה בהצלחה")).toBeVisible();
  });

  test("should create offer from building request", async ({ page }) => {
    await page.route("**/api/v1/requests/req_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_BUILDING_REQUESTS[0]),
      })
    );

    await page.goto("/contractor/requests/req_001/create-offer");

    // Building should be pre-selected
    await expect(page.locator("text=רוטשילד 15, תל אביב")).toBeVisible();
    await expect(page.locator('select[name="category"]')).toHaveValue("ac_installation");
  });
});

test.describe("Contractor Manage Offers", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me/offers*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_CONTRACTOR_OFFERS),
      })
    );
  });

  test("should display contractor offers list", async ({ page }) => {
    await page.goto("/contractor/offers");

    await expect(page.locator("text=ההצעות שלי")).toBeVisible();
    await expect(page.locator("text=התקנת מזגנים - רוטשילד 15")).toBeVisible();
    await expect(page.locator("text=תחזוקת מזגנים - בן יהודה 50")).toBeVisible();
  });

  test("should filter offers by status", async ({ page }) => {
    await page.goto("/contractor/offers");

    await page.click('button:has-text("פעילות")');

    await expect(page.locator("text=התקנת מזגנים - רוטשילד 15")).toBeVisible();
    await expect(page.locator("text=תחזוקת מזגנים - בן יהודה 50")).not.toBeVisible();
  });

  test("should view offer details with participants", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          ...MOCK_CONTRACTOR_OFFERS[0],
          participants_details: [
            { id: "user_1", name: "יעל כהן", apartment: "12", joinedAt: "2026-01-26" },
            { id: "user_2", name: "דני לוי", apartment: "5", joinedAt: "2026-01-27" },
          ],
        }),
      })
    );

    await page.goto("/contractor/offers/offer_001");

    await expect(page.locator("text=8 משתתפים")).toBeVisible();
    await expect(page.locator("text=יעל כהן")).toBeVisible();
    await expect(page.locator("text=דירה 12")).toBeVisible();
  });

  test("should edit offer pricing", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001", (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true }),
        });
      }
      return route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_CONTRACTOR_OFFERS[0]),
      });
    });

    await page.goto("/contractor/offers/offer_001/edit");

    await page.fill('input[name="basePrice"]', "4200");
    await page.click('button:has-text("עדכן")');

    await expect(page.locator("text=ההצעה עודכנה")).toBeVisible();
  });

  test("should extend offer expiration", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001/extend", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ newExpiresAt: "2026-04-15T00:00:00Z" }),
      })
    );

    await page.goto("/contractor/offers/offer_001");
    await page.click('button:has-text("הארך תוקף")');
    await page.fill('input[name="extensionDays"]', "30");
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=התוקף הוארך")).toBeVisible();
  });

  test("should cancel offer with confirmation", async ({ page }) => {
    await page.route("**/api/v1/offers/offer_001", (route) => {
      if (route.request().method() === "DELETE") {
        return route.fulfill({ status: 200 });
      }
      return route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_CONTRACTOR_OFFERS[0]),
      });
    });

    await page.goto("/contractor/offers/offer_001");
    await page.click('button:has-text("בטל הצעה")');

    await expect(page.locator("text=האם אתה בטוח")).toBeVisible();
    await page.click('button:has-text("כן, בטל")');

    await expect(page.locator("text=ההצעה בוטלה")).toBeVisible();
  });
});

test.describe("Contractor Order Fulfillment", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me/orders*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: "order_001",
            offerId: "offer_001",
            resident: { name: "יעל כהן", phone: "0541234567", apartment: "12" },
            building: { address: "רוטשילד 15", city: "תל אביב" },
            status: "scheduled",
            scheduledDate: "2026-02-20T09:00:00Z",
            price: 4050,
          },
          {
            id: "order_002",
            offerId: "offer_001",
            resident: { name: "דני לוי", phone: "0549876543", apartment: "5" },
            building: { address: "רוטשילד 15", city: "תל אביב" },
            status: "pending_schedule",
            price: 4050,
          },
        ]),
      })
    );
  });

  test("should display orders list", async ({ page }) => {
    await page.goto("/contractor/orders");

    await expect(page.locator("text=הזמנות")).toBeVisible();
    await expect(page.locator("text=יעל כהן")).toBeVisible();
    await expect(page.locator("text=דני לוי")).toBeVisible();
  });

  test("should schedule appointment", async ({ page }) => {
    await page.route("**/api/v1/orders/order_002/schedule", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ scheduledDate: "2026-02-21T10:00:00Z" }),
      })
    );

    await page.goto("/contractor/orders");
    await page.click('[data-testid="order-order_002"]');
    await page.click('button:has-text("קבע מועד")');

    await page.click('[data-testid="date-21"]');
    await page.click('[data-testid="time-10:00"]');
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=המועד נקבע")).toBeVisible();
  });

  test("should mark order as completed", async ({ page }) => {
    await page.route("**/api/v1/orders/order_001/complete", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "completed" }),
      })
    );

    await page.goto("/contractor/orders/order_001");
    await page.click('button:has-text("סמן כהושלם")');

    await expect(page.locator("text=העבודה הושלמה")).toBeVisible();
  });

  test("should contact resident", async ({ page }) => {
    await page.goto("/contractor/orders");

    const callButton = page.locator('[data-testid="order-order_001"] a[href="tel:0541234567"]');
    await expect(callButton).toBeVisible();
  });

  test("should add notes to order", async ({ page }) => {
    await page.route("**/api/v1/orders/order_001/notes", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/contractor/orders/order_001");
    await page.click('button:has-text("הוסף הערה")');
    await page.fill('textarea[name="note"]', "הדייר ביקש התקנה בחדר שינה");
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=ההערה נשמרה")).toBeVisible();
  });
});

test.describe("Contractor Reviews Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me/reviews*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: "review_001",
            rating: 5,
            text: "שירות מעולה, מקצועי ומהיר",
            resident: { name: "יעל כ." },
            createdAt: "2026-01-15T10:00:00Z",
            response: null,
          },
          {
            id: "review_002",
            rating: 3,
            text: "העבודה טובה אבל הגיע באיחור",
            resident: { name: "דני ל." },
            createdAt: "2026-01-10T14:00:00Z",
            response: "מתנצלים על האיחור, נשפר בעתיד",
          },
        ]),
      })
    );
  });

  test("should display reviews list", async ({ page }) => {
    await page.goto("/contractor/reviews");

    await expect(page.locator("text=ביקורות")).toBeVisible();
    await expect(page.locator("text=שירות מעולה")).toBeVisible();
    await expect(page.locator("text=העבודה טובה")).toBeVisible();
  });

  test("should show average rating", async ({ page }) => {
    await page.goto("/contractor/reviews");

    await expect(page.locator("text=4.8")).toBeVisible();
    await expect(page.locator("text=45 ביקורות")).toBeVisible();
  });

  test("should respond to review", async ({ page }) => {
    await page.route("**/api/v1/reviews/review_001/respond", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/contractor/reviews");
    await page.click('[data-testid="review-review_001"] button:has-text("הגב")');
    await page.fill('textarea[name="response"]', "תודה רבה על המשוב החיובי!");
    await page.click('button:has-text("שלח תגובה")');

    await expect(page.locator("text=התגובה נשלחה")).toBeVisible();
  });

  test("should filter reviews by rating", async ({ page }) => {
    await page.goto("/contractor/reviews");

    await page.click('button:has-text("סנן")');
    await page.click("text=5 כוכבים");

    await expect(page.locator("text=שירות מעולה")).toBeVisible();
    await expect(page.locator("text=העבודה טובה")).not.toBeVisible();
  });
});

test.describe("Contractor Analytics", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me/analytics*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          revenue: {
            total: 180000,
            monthly: [
              { month: "2025-10", amount: 35000 },
              { month: "2025-11", amount: 42000 },
              { month: "2025-12", amount: 55000 },
              { month: "2026-01", amount: 48000 },
            ],
          },
          offers: {
            total: 25,
            active: 3,
            completed: 20,
            cancelled: 2,
          },
          performance: {
            avgRating: 4.8,
            completionRate: 98,
            avgResponseTime: 2.5, // hours
          },
          topCategories: [
            { category: "ac_installation", count: 15, revenue: 120000 },
            { category: "ac_maintenance", count: 10, revenue: 60000 },
          ],
        }),
      })
    );
  });

  test("should display analytics dashboard", async ({ page }) => {
    await page.goto("/contractor/analytics");

    await expect(page.locator("text=ניתוח ביצועים")).toBeVisible();
    await expect(page.locator("text=₪180,000")).toBeVisible();
    await expect(page.locator("text=98%")).toBeVisible();
  });

  test("should show revenue chart", async ({ page }) => {
    await page.goto("/contractor/analytics");

    await expect(page.locator('[data-testid="revenue-chart"]')).toBeVisible();
  });

  test("should filter analytics by date range", async ({ page }) => {
    await page.goto("/contractor/analytics");

    await page.click('button:has-text("טווח תאריכים")');
    await page.click("text=3 חודשים אחרונים");

    await expect(page.locator("text=אוקטובר")).toBeVisible();
  });

  test("should show category breakdown", async ({ page }) => {
    await page.goto("/contractor/analytics");

    await expect(page.locator("text=התקנת מזגנים")).toBeVisible();
    await expect(page.locator("text=15 הצעות")).toBeVisible();
    await expect(page.locator("text=₪120,000")).toBeVisible();
  });

  test("should export analytics report", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/analytics/export", (route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("mock pdf"),
      })
    );

    await page.goto("/contractor/analytics");
    await page.click('button:has-text("ייצא דוח")');

    // Should trigger download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click("text=PDF"),
    ]);

    expect(download.suggestedFilename()).toContain("analytics");
  });
});

test.describe("Contractor Profile Settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem(
        "auth",
        JSON.stringify({
          user: { id: "con_001", role: "contractor", status: "active" },
          token: "jwt_token",
        })
      );
    });

    await page.route("**/api/v1/contractors/me", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_CONTRACTOR_PROFILE),
      })
    );
  });

  test("should display profile settings", async ({ page }) => {
    await page.goto("/contractor/settings");

    await expect(page.locator("text=הגדרות פרופיל")).toBeVisible();
    await expect(page.locator(`text=${TEST_CONTRACTOR.businessName}`)).toBeVisible();
  });

  test("should update service areas", async ({ page }) => {
    await page.route("**/api/v1/contractors/me", (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({ regions: ["center", "tel_aviv", "sharon"] }),
        });
      }
      return route.continue();
    });

    await page.goto("/contractor/settings");
    await page.click('label:has-text("השרון")');
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=ההגדרות נשמרו")).toBeVisible();
  });

  test("should update availability schedule", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/availability", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/contractor/settings/availability");

    await page.click('[data-testid="day-sunday"]');
    await page.fill('[data-testid="start-time"]', "08:00");
    await page.fill('[data-testid="end-time"]', "17:00");
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=זמינות עודכנה")).toBeVisible();
  });

  test("should update notification preferences", async ({ page }) => {
    await page.route("**/api/v1/contractors/me/notifications", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/contractor/settings/notifications");

    await page.click('[data-testid="toggle-email"]');
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=ההגדרות נשמרו")).toBeVisible();
  });
});
