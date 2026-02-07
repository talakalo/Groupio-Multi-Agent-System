import { test, expect, Page } from "@playwright/test";

/**
 * Comprehensive E2E tests for Admin user flows
 * Covers: Login -> Dashboard -> Contractor Management -> Escalations -> Analytics -> Settings
 */

// Test data
const TEST_ADMIN = {
  email: "admin@groupio.co.il",
  password: "AdminSecure123!",
  name: "אדמין ראשי",
};

const MOCK_SYSTEM_HEALTH = {
  status: "healthy",
  services: {
    vector_db: { status: "healthy", latency: 15 },
    graph_db: { status: "healthy", latency: 22 },
    redis: { status: "healthy", latency: 5 },
    postgres: { status: "healthy", latency: 12 },
    llm_api: { status: "healthy", latency: 450 },
  },
  agents: {
    router: { calls: 1500, errors: 12, avgLatency: 0.3 },
    matching: { calls: 800, errors: 5, avgLatency: 1.1 },
    pricing: { calls: 600, errors: 3, avgLatency: 0.8 },
    vetting: { calls: 200, errors: 2, avgLatency: 1.5 },
    support: { calls: 2000, errors: 25, avgLatency: 0.6 },
    outreach: { calls: 300, errors: 1, avgLatency: 2.0 },
    analytics: { calls: 150, errors: 0, avgLatency: 1.8 },
  },
  uptime: 99.95,
  lastRestart: "2026-01-01T00:00:00Z",
};

const MOCK_DASHBOARD_STATS = {
  users: { total: 5000, active: 3500, newThisMonth: 250 },
  contractors: { total: 200, verified: 180, pending: 15, rejected: 5 },
  offers: { total: 500, active: 85, completed: 400, cancelled: 15 },
  revenue: { total: 2500000, thisMonth: 180000, growth: 12.5 },
  escalations: { open: 8, resolved: 150, avgResolutionTime: 4.2 },
};

const MOCK_PENDING_CONTRACTORS = [
  {
    id: "con_pending_001",
    businessName: "New AC Company",
    email: "newac@example.com",
    licenseNumber: "87654321",
    submittedAt: "2026-01-25T10:00:00Z",
    documents: [
      { type: "license", status: "pending_review" },
      { type: "insurance", status: "pending_review" },
    ],
    categories: ["ac_installation"],
    regions: ["center"],
  },
  {
    id: "con_pending_002",
    businessName: "Kitchen Experts",
    email: "kitchen@example.com",
    licenseNumber: "12348765",
    submittedAt: "2026-01-24T14:00:00Z",
    documents: [
      { type: "license", status: "approved" },
      { type: "insurance", status: "pending_review" },
    ],
    categories: ["kitchen_renovation"],
    regions: ["tel_aviv", "center"],
  },
];

const MOCK_ESCALATIONS = [
  {
    id: "esc_001",
    conversationId: "conv_123",
    userId: "user_456",
    userName: "יעל כהן",
    reason: "legal_keywords",
    priority: "high",
    status: "open",
    createdAt: "2026-01-26T09:00:00Z",
    summary: "הלקוח ציין שהוא רוצה לפנות לעורך דין",
    messages: [
      { role: "user", content: "השירות היה גרוע, אני הולך לעורך דין" },
      { role: "assistant", content: "אני מצטער לשמוע. מעביר אותך לנציג." },
    ],
  },
  {
    id: "esc_002",
    conversationId: "conv_124",
    userId: "user_789",
    userName: "דני לוי",
    reason: "negative_sentiment",
    priority: "medium",
    status: "open",
    createdAt: "2026-01-26T08:30:00Z",
    summary: "לקוח מתלונן על איכות העבודה",
    messages: [
      { role: "user", content: "הקבלן עשה עבודה גרועה מאוד!" },
    ],
  },
];

// Helper to set up common API mocks
async function setupCommonMocks(page: Page) {
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify(MOCK_SYSTEM_HEALTH),
    })
  );
}

async function setupAdminAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "auth",
      JSON.stringify({
        user: { id: "admin_001", email: "admin@groupio.co.il", role: "admin" },
        token: "admin_jwt_token",
      })
    );
  });
}

test.describe("Admin Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test("should display admin login page", async ({ page }) => {
    await page.goto("/admin/login");

    await expect(page.locator("text=כניסת מנהל")).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("should login successfully and redirect to dashboard", async ({ page }) => {
    await page.route("**/api/v1/auth/admin/login", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: { id: "admin_001", email: TEST_ADMIN.email, role: "admin" },
          token: "admin_jwt_token",
        }),
      })
    );

    await page.goto("/admin/login");

    await page.fill('input[name="email"]', TEST_ADMIN.email);
    await page.fill('input[name="password"]', TEST_ADMIN.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/admin\/dashboard/);
  });

  test("should reject non-admin users", async ({ page }) => {
    await page.route("**/api/v1/auth/admin/login", (route) =>
      route.fulfill({
        status: 403,
        body: JSON.stringify({ error: "Admin access required" }),
      })
    );

    await page.goto("/admin/login");

    await page.fill('input[name="email"]', "user@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=אין הרשאות מנהל")).toBeVisible();
  });

  test("should require 2FA for admin login", async ({ page }) => {
    await page.route("**/api/v1/auth/admin/login", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ requires2FA: true, tempToken: "temp_token" }),
      })
    );

    await page.goto("/admin/login");

    await page.fill('input[name="email"]', TEST_ADMIN.email);
    await page.fill('input[name="password"]', TEST_ADMIN.password);
    await page.click('button[type="submit"]');

    await expect(page.locator("text=הזן קוד אימות")).toBeVisible();
    await expect(page.locator('input[name="otp"]')).toBeVisible();
  });

  test("should verify 2FA code", async ({ page }) => {
    await page.route("**/api/v1/auth/admin/verify-2fa", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: { id: "admin_001", role: "admin" },
          token: "admin_jwt_token",
        }),
      })
    );

    await page.goto("/admin/login");

    // Simulate 2FA screen
    await page.addInitScript(() => {
      sessionStorage.setItem("tempToken", "temp_token");
    });

    await page.goto("/admin/verify-2fa");

    await page.fill('input[name="otp"]', "123456");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/admin\/dashboard/);
  });
});

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);

    await page.route("**/api/v1/admin/dashboard", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_DASHBOARD_STATS),
      })
    );
  });

  test("should display dashboard with key metrics", async ({ page }) => {
    await page.goto("/admin/dashboard");

    await expect(page.locator("text=לוח בקרה")).toBeVisible();
    await expect(page.locator("text=5,000")).toBeVisible(); // Total users
    await expect(page.locator("text=200")).toBeVisible(); // Total contractors
  });

  test("should show system health status", async ({ page }) => {
    await page.goto("/admin/dashboard");

    await expect(page.locator("text=מצב המערכת")).toBeVisible();
    await expect(page.locator("text=99.95%")).toBeVisible(); // Uptime
    await expect(page.locator('[data-testid="health-indicator"].healthy')).toBeVisible();
  });

  test("should display agent performance metrics", async ({ page }) => {
    await page.goto("/admin/dashboard");

    await expect(page.locator("text=ביצועי סוכנים")).toBeVisible();
    await expect(page.locator("text=Router")).toBeVisible();
    await expect(page.locator("text=1,500")).toBeVisible(); // Router calls
  });

  test("should show pending escalations alert", async ({ page }) => {
    await page.route("**/api/v1/admin/escalations*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ items: MOCK_ESCALATIONS, total: 8 }),
      })
    );

    await page.goto("/admin/dashboard");

    await expect(page.locator('[data-testid="escalation-alert"]')).toBeVisible();
    await expect(page.locator("text=8 פניות ממתינות")).toBeVisible();
  });

  test("should navigate to different sections", async ({ page }) => {
    await page.goto("/admin/dashboard");

    await page.click('a:has-text("קבלנים")');
    await expect(page).toHaveURL(/admin\/contractors/);

    await page.goto("/admin/dashboard");
    await page.click('a:has-text("אסקלציות")');
    await expect(page).toHaveURL(/admin\/escalations/);
  });

  test("should show revenue chart", async ({ page }) => {
    await page.goto("/admin/dashboard");

    await expect(page.locator('[data-testid="revenue-chart"]')).toBeVisible();
    await expect(page.locator("text=₪2,500,000")).toBeVisible();
  });

  test("should display real-time activity feed", async ({ page }) => {
    await page.route("**/api/v1/admin/activity*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          { type: "offer_created", message: "הצעה חדשה נוצרה", timestamp: "2026-01-26T10:00:00Z" },
          { type: "contractor_approved", message: "קבלן אושר", timestamp: "2026-01-26T09:55:00Z" },
        ]),
      })
    );

    await page.goto("/admin/dashboard");

    await expect(page.locator('[data-testid="activity-feed"]')).toBeVisible();
    await expect(page.locator("text=הצעה חדשה נוצרה")).toBeVisible();
  });
});

test.describe("Admin Contractor Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);

    await page.route("**/api/v1/admin/contractors*", (route) => {
      const url = new URL(route.request().url());
      const status = url.searchParams.get("status");

      if (status === "pending") {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({ items: MOCK_PENDING_CONTRACTORS, total: 2 }),
        });
      }

      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          items: [
            ...MOCK_PENDING_CONTRACTORS,
            {
              id: "con_001",
              businessName: "Cool Air Ltd",
              status: "active",
              verified: true,
              rating: 4.8,
            },
          ],
          total: 3,
        }),
      });
    });
  });

  test("should display contractors list", async ({ page }) => {
    await page.goto("/admin/contractors");

    await expect(page.locator("text=ניהול קבלנים")).toBeVisible();
    await expect(page.locator("text=New AC Company")).toBeVisible();
    await expect(page.locator("text=Kitchen Experts")).toBeVisible();
  });

  test("should filter contractors by status", async ({ page }) => {
    await page.goto("/admin/contractors");

    await page.click('button:has-text("ממתינים לאישור")');

    await expect(page.locator("text=New AC Company")).toBeVisible();
    await expect(page.locator("text=Cool Air Ltd")).not.toBeVisible();
  });

  test("should view contractor details", async ({ page }) => {
    await page.route("**/api/v1/admin/contractors/con_pending_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          ...MOCK_PENDING_CONTRACTORS[0],
          phoneNumber: "0521234567",
          registrationDate: "2026-01-25T10:00:00Z",
          submittedDocuments: [
            { type: "license", url: "/docs/license.pdf", status: "pending_review" },
            { type: "insurance", url: "/docs/insurance.pdf", status: "pending_review" },
          ],
        }),
      })
    );

    await page.goto("/admin/contractors/con_pending_001");

    await expect(page.locator("text=New AC Company")).toBeVisible();
    await expect(page.locator("text=87654321")).toBeVisible(); // License number
    await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible();
  });

  test("should approve contractor", async ({ page }) => {
    await page.route("**/api/v1/admin/contractors/con_pending_001/approve", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "approved" }),
      })
    );

    await page.goto("/admin/contractors/con_pending_001");
    await page.click('button:has-text("אשר קבלן")');

    await expect(page.locator("text=אישור קבלן")).toBeVisible();
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=הקבלן אושר בהצלחה")).toBeVisible();
  });

  test("should reject contractor with reason", async ({ page }) => {
    await page.route("**/api/v1/admin/contractors/con_pending_001/reject", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "rejected" }),
      })
    );

    await page.goto("/admin/contractors/con_pending_001");
    await page.click('button:has-text("דחה")');

    await expect(page.locator("text=סיבת דחייה")).toBeVisible();
    await page.fill('textarea[name="rejectionReason"]', "רישיון לא תקף");
    await page.click('button:has-text("שלח דחייה")');

    await expect(page.locator("text=הקבלן נדחה")).toBeVisible();
  });

  test("should request additional documents", async ({ page }) => {
    await page.route("**/api/v1/admin/contractors/con_pending_001/request-documents", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/contractors/con_pending_001");
    await page.click('button:has-text("בקש מסמכים")');

    await page.click('label:has-text("אישור ביטוח מורחב")');
    await page.fill('textarea[name="message"]', "נדרש אישור ביטוח עדכני");
    await page.click('button:has-text("שלח בקשה")');

    await expect(page.locator("text=הבקשה נשלחה")).toBeVisible();
  });

  test("should suspend contractor", async ({ page }) => {
    await page.route("**/api/v1/admin/contractors/con_001/suspend", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "suspended" }),
      })
    );

    await page.goto("/admin/contractors/con_001");
    await page.click('button:has-text("השעה")');

    await page.fill('textarea[name="reason"]', "תלונות רבות על איכות עבודה");
    await page.click('button:has-text("אשר השעייה")');

    await expect(page.locator("text=הקבלן הושעה")).toBeVisible();
  });

  test("should view contractor analytics", async ({ page }) => {
    await page.route("**/api/v1/admin/contractors/con_001/analytics", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          totalRevenue: 180000,
          completedOffers: 45,
          avgRating: 4.8,
          complaints: 2,
          responseTime: 2.5,
        }),
      })
    );

    await page.goto("/admin/contractors/con_001/analytics");

    await expect(page.locator("text=₪180,000")).toBeVisible();
    await expect(page.locator("text=45 הצעות")).toBeVisible();
    await expect(page.locator("text=4.8")).toBeVisible();
  });
});

test.describe("Admin Escalation Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);

    await page.route("**/api/v1/admin/escalations*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ items: MOCK_ESCALATIONS, total: 2 }),
      })
    );
  });

  test("should display escalations list", async ({ page }) => {
    await page.goto("/admin/escalations");

    await expect(page.locator("text=אסקלציות")).toBeVisible();
    await expect(page.locator("text=יעל כהן")).toBeVisible();
    await expect(page.locator("text=דני לוי")).toBeVisible();
  });

  test("should show priority badges", async ({ page }) => {
    await page.goto("/admin/escalations");

    await expect(page.locator('[data-testid="priority-high"]')).toBeVisible();
    await expect(page.locator('[data-testid="priority-medium"]')).toBeVisible();
  });

  test("should filter by priority", async ({ page }) => {
    await page.goto("/admin/escalations");

    await page.click('button:has-text("גבוהה")');

    await expect(page.locator("text=יעל כהן")).toBeVisible();
    await expect(page.locator("text=דני לוי")).not.toBeVisible();
  });

  test("should view escalation details with conversation", async ({ page }) => {
    await page.route("**/api/v1/admin/escalations/esc_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_ESCALATIONS[0]),
      })
    );

    await page.goto("/admin/escalations/esc_001");

    await expect(page.locator("text=יעל כהן")).toBeVisible();
    await expect(page.locator("text=השירות היה גרוע")).toBeVisible();
    await expect(page.locator("text=legal_keywords")).toBeVisible();
  });

  test("should take over conversation", async ({ page }) => {
    await page.route("**/api/v1/admin/escalations/esc_001/takeover", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/escalations/esc_001");
    await page.click('button:has-text("קח שליטה")');

    await expect(page.locator('[data-testid="admin-chat-input"]')).toBeVisible();
  });

  test("should send message as admin", async ({ page }) => {
    await page.route("**/api/v1/admin/escalations/esc_001/message", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/escalations/esc_001");
    await page.click('button:has-text("קח שליטה")');

    await page.fill('[data-testid="admin-chat-input"]', "שלום, אני נציג שירות. כיצד אוכל לעזור?");
    await page.click('button:has-text("שלח")');

    await expect(page.locator("text=ההודעה נשלחה")).toBeVisible();
  });

  test("should resolve escalation", async ({ page }) => {
    await page.route("**/api/v1/admin/escalations/esc_001/resolve", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "resolved" }),
      })
    );

    await page.goto("/admin/escalations/esc_001");
    await page.click('button:has-text("סמן כנפתר")');

    await page.selectOption('select[name="resolution"]', "customer_satisfied");
    await page.fill('textarea[name="notes"]', "הלקוח קיבל פיצוי והסכים להמשיך");
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=האסקלציה נפתרה")).toBeVisible();
  });

  test("should escalate to higher level", async ({ page }) => {
    await page.route("**/api/v1/admin/escalations/esc_001/escalate", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ newPriority: "critical" }),
      })
    );

    await page.goto("/admin/escalations/esc_001");
    await page.click('button:has-text("העבר לגורם בכיר")');

    await page.fill('textarea[name="reason"]', "דורש התייחסות משפטית");
    await page.click('button:has-text("העבר")');

    await expect(page.locator("text=הועבר בהצלחה")).toBeVisible();
  });

  test("should add internal note", async ({ page }) => {
    await page.route("**/api/v1/admin/escalations/esc_001/notes", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/escalations/esc_001");
    await page.click('button:has-text("הוסף הערה")');

    await page.fill('textarea[name="note"]', "בוצעה שיחה עם הלקוח ב-10:00");
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=ההערה נשמרה")).toBeVisible();
  });
});

test.describe("Admin Analytics & Reports", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);

    await page.route("**/api/v1/admin/analytics*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          users: {
            total: 5000,
            growth: [
              { date: "2025-10", count: 4200 },
              { date: "2025-11", count: 4500 },
              { date: "2025-12", count: 4800 },
              { date: "2026-01", count: 5000 },
            ],
          },
          revenue: {
            total: 2500000,
            byMonth: [
              { month: "2025-10", amount: 150000 },
              { month: "2025-11", amount: 165000 },
              { month: "2025-12", amount: 175000 },
              { month: "2026-01", amount: 180000 },
            ],
          },
          agentPerformance: {
            totalConversations: 10000,
            avgSatisfaction: 4.5,
            escalationRate: 2.5,
            avgResolutionTime: 3.2,
          },
          topCategories: [
            { category: "ac_installation", count: 150, revenue: 675000 },
            { category: "kitchen_renovation", count: 50, revenue: 1250000 },
            { category: "plumbing", count: 200, revenue: 360000 },
          ],
        }),
      })
    );
  });

  test("should display analytics dashboard", async ({ page }) => {
    await page.goto("/admin/analytics");

    await expect(page.locator("text=ניתוח נתונים")).toBeVisible();
    await expect(page.locator("text=5,000 משתמשים")).toBeVisible();
    await expect(page.locator("text=₪2,500,000")).toBeVisible();
  });

  test("should show user growth chart", async ({ page }) => {
    await page.goto("/admin/analytics");

    await expect(page.locator('[data-testid="user-growth-chart"]')).toBeVisible();
  });

  test("should show revenue trends", async ({ page }) => {
    await page.goto("/admin/analytics");

    await expect(page.locator('[data-testid="revenue-chart"]')).toBeVisible();
  });

  test("should filter by date range", async ({ page }) => {
    await page.goto("/admin/analytics");

    await page.click('button:has-text("טווח תאריכים")');
    await page.click("text=חודש אחרון");

    // Chart should update
    await expect(page.locator('[data-testid="revenue-chart"]')).toBeVisible();
  });

  test("should show agent performance metrics", async ({ page }) => {
    await page.goto("/admin/analytics");

    await page.click('button:has-text("ביצועי סוכנים")');

    await expect(page.locator("text=10,000 שיחות")).toBeVisible();
    await expect(page.locator("text=4.5")).toBeVisible(); // Satisfaction
    await expect(page.locator("text=2.5%")).toBeVisible(); // Escalation rate
  });

  test("should show category breakdown", async ({ page }) => {
    await page.goto("/admin/analytics");

    await expect(page.locator("text=התקנת מזגנים")).toBeVisible();
    await expect(page.locator("text=150 הצעות")).toBeVisible();
  });

  test("should export analytics report", async ({ page }) => {
    await page.route("**/api/v1/admin/analytics/export", (route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("mock pdf"),
      })
    );

    await page.goto("/admin/analytics");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click('button:has-text("ייצא דוח")'),
    ]);

    expect(download.suggestedFilename()).toContain("analytics");
  });

  test("should view agent-specific metrics", async ({ page }) => {
    await page.route("**/api/v1/admin/analytics/agents/router", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          name: "Router",
          totalCalls: 15000,
          successRate: 99.2,
          avgLatency: 0.3,
          intentDistribution: {
            contractor_search: 40,
            pricing_question: 25,
            support: 20,
            other: 15,
          },
        }),
      })
    );

    await page.goto("/admin/analytics/agents/router");

    await expect(page.locator("text=Router Agent")).toBeVisible();
    await expect(page.locator("text=15,000 קריאות")).toBeVisible();
    await expect(page.locator("text=99.2%")).toBeVisible();
  });
});

test.describe("Admin User Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);

    await page.route("**/api/v1/admin/users*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          items: [
            { id: "user_001", name: "יעל כהן", email: "yael@example.com", role: "resident", status: "active" },
            { id: "user_002", name: "דני לוי", email: "dani@example.com", role: "resident", status: "active" },
            { id: "admin_002", name: "מנהל משני", email: "admin2@groupio.co.il", role: "admin", status: "active" },
          ],
          total: 3,
        }),
      })
    );
  });

  test("should display users list", async ({ page }) => {
    await page.goto("/admin/users");

    await expect(page.locator("text=ניהול משתמשים")).toBeVisible();
    await expect(page.locator("text=יעל כהן")).toBeVisible();
  });

  test("should search users", async ({ page }) => {
    await page.goto("/admin/users");

    await page.fill('input[placeholder*="חיפוש"]', "יעל");

    await expect(page.locator("text=יעל כהן")).toBeVisible();
    await expect(page.locator("text=דני לוי")).not.toBeVisible();
  });

  test("should view user details", async ({ page }) => {
    await page.route("**/api/v1/admin/users/user_001", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "user_001",
          name: "יעל כהן",
          email: "yael@example.com",
          phone: "0541234567",
          building: { address: "רוטשילד 15", city: "תל אביב" },
          joinedAt: "2025-06-15T10:00:00Z",
          orders: 5,
          totalSpent: 25000,
        }),
      })
    );

    await page.goto("/admin/users/user_001");

    await expect(page.locator("text=יעל כהן")).toBeVisible();
    await expect(page.locator("text=רוטשילד 15")).toBeVisible();
    await expect(page.locator("text=5 הזמנות")).toBeVisible();
  });

  test("should suspend user", async ({ page }) => {
    await page.route("**/api/v1/admin/users/user_001/suspend", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "suspended" }),
      })
    );

    await page.goto("/admin/users/user_001");
    await page.click('button:has-text("השעה משתמש")');

    await page.fill('textarea[name="reason"]', "הפרת תנאי שימוש");
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=המשתמש הושעה")).toBeVisible();
  });

  test("should add new admin user", async ({ page }) => {
    await page.route("**/api/v1/admin/users/create-admin", (route) =>
      route.fulfill({
        status: 201,
        body: JSON.stringify({ id: "admin_new", email: "newadmin@groupio.co.il" }),
      })
    );

    await page.goto("/admin/users");
    await page.click('button:has-text("הוסף מנהל")');

    await page.fill('input[name="email"]', "newadmin@groupio.co.il");
    await page.fill('input[name="name"]', "מנהל חדש");
    await page.click('button:has-text("צור")');

    await expect(page.locator("text=המנהל נוסף בהצלחה")).toBeVisible();
  });
});

test.describe("Admin System Settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);

    await page.route("**/api/v1/admin/settings", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          general: {
            siteName: "Groupio",
            supportEmail: "support@groupio.co.il",
            defaultLanguage: "he",
          },
          notifications: {
            emailEnabled: true,
            whatsappEnabled: true,
            pushEnabled: true,
          },
          agents: {
            escalationThreshold: 3,
            autoEscalateLegalKeywords: true,
            sentimentThreshold: -0.5,
          },
          security: {
            sessionTimeout: 30,
            require2FA: true,
            maxLoginAttempts: 5,
          },
        }),
      })
    );
  });

  test("should display settings page", async ({ page }) => {
    await page.goto("/admin/settings");

    await expect(page.locator("text=הגדרות מערכת")).toBeVisible();
    await expect(page.locator("text=הגדרות כלליות")).toBeVisible();
  });

  test("should update notification settings", async ({ page }) => {
    await page.route("**/api/v1/admin/settings/notifications", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/settings");
    await page.click('button:has-text("התראות")');

    await page.click('[data-testid="toggle-push"]');
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=ההגדרות נשמרו")).toBeVisible();
  });

  test("should update agent escalation settings", async ({ page }) => {
    await page.route("**/api/v1/admin/settings/agents", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/settings");
    await page.click('button:has-text("סוכנים")');

    await page.fill('input[name="escalationThreshold"]', "5");
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=ההגדרות נשמרו")).toBeVisible();
  });

  test("should update security settings", async ({ page }) => {
    await page.route("**/api/v1/admin/settings/security", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/settings");
    await page.click('button:has-text("אבטחה")');

    await page.fill('input[name="sessionTimeout"]', "60");
    await page.click('button:has-text("שמור")');

    await expect(page.locator("text=ההגדרות נשמרו")).toBeVisible();
  });

  test("should view audit logs", async ({ page }) => {
    await page.route("**/api/v1/admin/audit-logs*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          items: [
            { action: "settings_updated", user: "admin@groupio.co.il", timestamp: "2026-01-26T10:00:00Z" },
            { action: "contractor_approved", user: "admin@groupio.co.il", timestamp: "2026-01-26T09:30:00Z" },
          ],
          total: 2,
        }),
      })
    );

    await page.goto("/admin/settings/audit-logs");

    await expect(page.locator("text=יומן פעילות")).toBeVisible();
    await expect(page.locator("text=settings_updated")).toBeVisible();
    await expect(page.locator("text=contractor_approved")).toBeVisible();
  });
});

test.describe("Admin Offer Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);

    await page.route("**/api/v1/admin/offers*", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          items: [
            {
              id: "offer_001",
              title: "התקנת מזגנים - רוטשילד 15",
              contractor: { businessName: "Cool Air Ltd" },
              status: "active",
              participants: 8,
              basePrice: 4500,
            },
            {
              id: "offer_002",
              title: "שיפוץ מטבחים - דיזנגוף 100",
              contractor: { businessName: "Kitchen Masters" },
              status: "flagged",
              participants: 3,
              basePrice: 25000,
              flagReason: "suspicious_pricing",
            },
          ],
          total: 2,
        }),
      })
    );
  });

  test("should display offers list", async ({ page }) => {
    await page.goto("/admin/offers");

    await expect(page.locator("text=ניהול הצעות")).toBeVisible();
    await expect(page.locator("text=התקנת מזגנים")).toBeVisible();
    await expect(page.locator("text=שיפוץ מטבחים")).toBeVisible();
  });

  test("should show flagged offers", async ({ page }) => {
    await page.goto("/admin/offers");

    await page.click('button:has-text("מסומנות")');

    await expect(page.locator("text=שיפוץ מטבחים")).toBeVisible();
    await expect(page.locator("text=suspicious_pricing")).toBeVisible();
  });

  test("should review flagged offer", async ({ page }) => {
    await page.route("**/api/v1/admin/offers/offer_002", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "offer_002",
          title: "שיפוץ מטבחים - דיזנגוף 100",
          contractor: { id: "con_002", businessName: "Kitchen Masters" },
          status: "flagged",
          flagReason: "suspicious_pricing",
          basePrice: 25000,
          marketData: { avgPrice: 35000, minPrice: 28000 },
        }),
      })
    );

    await page.goto("/admin/offers/offer_002");

    await expect(page.locator("text=המחיר נמוך מהממוצע")).toBeVisible();
  });

  test("should approve flagged offer", async ({ page }) => {
    await page.route("**/api/v1/admin/offers/offer_002/approve", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "active" }),
      })
    );

    await page.goto("/admin/offers/offer_002");
    await page.click('button:has-text("אשר")');

    await expect(page.locator("text=ההצעה אושרה")).toBeVisible();
  });

  test("should cancel fraudulent offer", async ({ page }) => {
    await page.route("**/api/v1/admin/offers/offer_002/cancel", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: "cancelled" }),
      })
    );

    await page.goto("/admin/offers/offer_002");
    await page.click('button:has-text("בטל הצעה")');

    await page.fill('textarea[name="reason"]', "מחיר חשוד - לא תואם שוק");
    await page.click('button:has-text("אשר ביטול")');

    await expect(page.locator("text=ההצעה בוטלה")).toBeVisible();
  });
});

test.describe("Admin Notifications & Alerts", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await setupAdminAuth(page);
  });

  test("should display system alerts", async ({ page }) => {
    await page.route("**/api/v1/admin/alerts", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: "alert_001", type: "warning", message: "Vector DB latency high", timestamp: "2026-01-26T10:00:00Z" },
          { id: "alert_002", type: "info", message: "Scheduled maintenance tonight", timestamp: "2026-01-26T09:00:00Z" },
        ]),
      })
    );

    await page.goto("/admin/dashboard");

    await expect(page.locator('[data-testid="system-alerts"]')).toBeVisible();
    await expect(page.locator("text=Vector DB latency high")).toBeVisible();
  });

  test("should dismiss alert", async ({ page }) => {
    await page.route("**/api/v1/admin/alerts/alert_001/dismiss", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true }),
      })
    );

    await page.goto("/admin/dashboard");
    await page.click('[data-testid="dismiss-alert_001"]');

    await expect(page.locator("text=Vector DB latency high")).not.toBeVisible();
  });

  test("should receive real-time notifications", async ({ page }) => {
    await page.goto("/admin/dashboard");

    // Simulate WebSocket notification
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("admin-notification", {
          detail: { type: "escalation", message: "אסקלציה חדשה", priority: "high" },
        })
      );
    });

    await expect(page.locator('[data-testid="notification-toast"]')).toBeVisible();
  });
});
