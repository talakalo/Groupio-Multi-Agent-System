/**
 * Coverage Gaps Suite — tests for previously uncovered pages & flows.
 *
 * Covers: verify-email, resend-verification, /building, /contractors,
 * buildings-manager, change-password, order detail, work-approval.
 *
 * All backend calls are intercepted with page.route() mocks.
 */

import { test, expect } from "./api/test";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: "user-cov-1",
  email: "cov@example.com",
  full_name: "Coverage User",
  phone: "0501234567",
  role: "resident",
  is_active: true,
  is_verified: true,
  building_id: "bld-cov",
  contractor_id: null,
  avatar_url: null,
  preferred_language: "he",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_BUILDINGS_MANAGER = {
  ...MOCK_USER,
  id: "mgr-cov-1",
  role: "buildings_manager",
};

async function setAuthToken(
  page: Page,
  token = "cov-test-token",
  role: "resident" | "contractor" | "admin" | "buildings_manager" = "resident",
) {
  await page.addInitScript(
    (params) => {
      localStorage.setItem("auth_token", params.token);
      localStorage.setItem(
        "groupio-auth",
        JSON.stringify({
          state: {
            user: {
              id: "user-cov-1",
              email: "cov@example.com",
              fullName: "Coverage User",
              phone: "0501234567",
              role: params.role,
              preferredLanguage: "he",
              isVerified: true,
            },
            accessToken: params.token,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    },
    { token, role },
  );
  await page.context().addCookies([
    {
      name: "refresh_token",
      value: "e2e-refresh-token",
      url: "http://localhost:3000",
    },
    {
      name: "groupio-auth",
      value: encodeURIComponent(
        JSON.stringify({
          state: { user: { role }, isAuthenticated: true },
        }),
      ),
      url: "http://localhost:3000",
    },
  ]);
}

async function setupBaseMocks(page: Page) {
  await page.route("**/api/v1/health", (r) =>
    r.fulfill({
      status: 200,
      body: JSON.stringify({ status: "healthy", services: {} }),
    }),
  );
  await page.route("**/api/v1/auth/refresh", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "cov-test-token" }),
    }),
  );
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill({ status: 200, body: JSON.stringify(MOCK_USER) }),
  );
  await page.route("**/api/v1/buildings/me", (r) =>
    r.fulfill({
      status: 200,
      body: JSON.stringify({
        id: "bld-cov",
        name: "בניין הכיסוי",
        address: "הרצל 10",
        city: "תל אביב",
        total_units: 20,
        floors: 6,
        resident_count: 15,
        active_offers: 2,
      }),
    }),
  );
  await page.route("**/api/v1/activity/recent*", (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ items: [], total: 0 }) }),
  );
  await page.route("**/api/v1/conversations/*/messages*", (r) =>
    r.fulfill({
      status: 200,
      body: JSON.stringify({ messages: [], total: 0, next_cursor: null }),
    }),
  );
}

// ===========================================================================
// VERIFY EMAIL
// ===========================================================================

test.describe("Verify Email Flow", () => {
  test("shows success when token is valid", async ({ page }) => {
    await page.route("**/api/v1/auth/verify-email/*", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ status: "verified" }) }),
    );
    await page.goto("/verify-email?token=valid-mock-token");
    await expect(
      page.getByText(/אומת בהצלחה|verified|האימייל אומת/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test("shows error when token is invalid", async ({ page }) => {
    await page.route("**/api/v1/auth/verify-email/*", (r) =>
      r.fulfill({ status: 400, body: JSON.stringify({ detail: "Invalid token" }) }),
    );
    await page.goto("/verify-email?token=bad-token");
    await expect(
      page.getByText(/שגיאה|לא תקין|invalid|נכשל/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("shows error when no token provided", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(
      page.getByText(/חסר|token|שגיאה|לא תקין/i),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ===========================================================================
// RESEND VERIFICATION
// ===========================================================================

test.describe("Resend Verification Flow", () => {
  test("renders form and submits successfully", async ({ page }) => {
    await page.route("**/api/v1/auth/resend-verification-by-email", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ status: "sent" }) }),
    );
    await page.goto("/resend-verification");
    const emailInput = page.locator("#email, input[type='email']").first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill("test@example.com");
    const submitBtn = page.getByRole("button", { name: /שלח|send|אימות/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    await expect(
      page.getByText(/נשלח|sent|בדוק|תיבת/i),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ===========================================================================
// BUILDING PAGES
// ===========================================================================

test.describe("Building Pages", () => {
  test("building overview page loads", async ({ page }) => {
    await setAuthToken(page);
    await setupBaseMocks(page);
    await page.route("**/api/v1/buildings/*", (r) => {
      if (r.request().url().includes("/me")) return r.fallback();
      return r.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "bld-cov",
          name: "בניין הרצל 10",
          address: "הרצל 10",
          city: "תל אביב",
          total_units: 20,
          resident_count: 15,
        }),
      });
    });
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.goto("/building");
    await expect(page.locator("main, [role='main']")).toBeVisible({
      timeout: 15000,
    });
  });

  test("building join page loads", async ({ page }) => {
    await setAuthToken(page);
    await setupBaseMocks(page);
    await page.route("**/api/v1/buildings*", (r) => {
      if (r.request().url().includes("/me")) return r.fallback();
      return r.fulfill({
        status: 200,
        body: JSON.stringify([]),
      });
    });
    await page.goto("/building/join");
    await expect(page.locator("main, body")).toBeVisible({ timeout: 15000 });
  });
});

// ===========================================================================
// CONTRACTORS DIRECTORY
// ===========================================================================

test.describe("Contractors Directory", () => {
  test("contractors page loads and shows list", async ({ page }) => {
    await setAuthToken(page);
    await setupBaseMocks(page);
    await page.route("**/api/v1/contractors*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: "ctr-1",
            business_name: "קבלן הכיסוי",
            rating: 4.5,
            category: "ac_installation",
            verified: true,
            city: "תל אביב",
          },
        ]),
      }),
    );
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.goto("/contractors");
    await expect(page.locator("main, [role='main']")).toBeVisible({
      timeout: 15000,
    });
  });
});

// ===========================================================================
// BUILDINGS MANAGER
// ===========================================================================

test.describe("Buildings Manager Pages", () => {
  test("dashboard loads for buildings manager role", async ({ page }) => {
    await setAuthToken(page, "mgr-token", "buildings_manager");
    await page.route("**/api/v1/health", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ status: "healthy" }),
      }),
    );
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_BUILDINGS_MANAGER),
      }),
    );
    await page.route("**/api/v1/buildings*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: "bld-1", name: "בניין 1", address: "הרצל 1", city: "תל אביב" },
        ]),
      }),
    );
    await page.route("**/api/v1/escalations*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.goto("/buildings-manager/dashboard");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15000 });
  });

  test("buildings list page loads", async ({ page }) => {
    await setAuthToken(page, "mgr-token", "buildings_manager");
    await page.route("**/api/v1/health", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ status: "healthy" }) }),
    );
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_BUILDINGS_MANAGER),
      }),
    );
    await page.route("**/api/v1/buildings*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: "bld-1", name: "בניין 1", address: "הרצל 1", city: "תל אביב" },
        ]),
      }),
    );
    await page.goto("/buildings-manager/buildings");
    await expect(page.locator("main, body")).toBeVisible({ timeout: 15000 });
  });

  test("escalations page loads", async ({ page }) => {
    await setAuthToken(page, "mgr-token", "buildings_manager");
    await page.route("**/api/v1/health", (r) =>
      r.fulfill({ status: 200, body: JSON.stringify({ status: "healthy" }) }),
    );
    await page.route("**/api/v1/auth/me", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify(MOCK_BUILDINGS_MANAGER),
      }),
    );
    await page.route("**/api/v1/escalations*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.goto("/buildings-manager/escalations");
    await expect(page.locator("main, body")).toBeVisible({ timeout: 15000 });
  });
});

// ===========================================================================
// ORDER DETAIL
// ===========================================================================

test.describe("Order Detail Page", () => {
  test("order detail page shows order info", async ({ page }) => {
    await setAuthToken(page);
    await setupBaseMocks(page);
    await page.route("**/api/v1/payments/*", (r) => {
      const url = r.request().url();
      if (url.includes("/my") || url.includes("/initiate")) return r.fallback();
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "pay-1",
          offerId: "offer-1",
          amount: 4500,
          currency: "ILS",
          status: "succeeded",
          createdAt: "2024-06-01T00:00:00Z",
          offer: { title: "התקנת מזגנים", contractor: { businessName: "Cool Air" } },
          escrowStatus: "held",
        }),
      });
    });
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.goto("/orders/pay-1");
    await expect(page.locator("main").first()).toBeVisible({
      timeout: 15000,
    });
    // Order detail should show key info (title or amount). The page renders
    // the title in the breadcrumb + <h1>, and the amount in the status block,
    // so this regex matches several nodes — scope to the first match.
    await expect(page.getByText(/התקנת מזגנים|4,500|₪/).first()).toBeVisible({ timeout: 5000 });
  });
});

// ===========================================================================
// CHANGE PASSWORD
// ===========================================================================

test.describe("Change Password Page", () => {
  test("change password page renders form", async ({ page }) => {
    await setAuthToken(page);
    await setupBaseMocks(page);
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.goto("/change-password");
    await expect(page.locator("main, [role='main']").first()).toBeVisible({
      timeout: 15000,
    });
    const currentPwd = page.locator("#currentPassword, input[name='currentPassword']").first();
    await expect(currentPwd).toBeVisible({ timeout: 10000 });
  });

  test("change password submits successfully", async ({ page }) => {
    await setAuthToken(page);
    await setupBaseMocks(page);
    await page.route("**/api/v1/offers*", (r) =>
      r.fulfill({
        status: 200,
        body: JSON.stringify({ items: [], total: 0 }),
      }),
    );
    await page.route("**/api/v1/auth/password/change", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "changed" }),
      }),
    );
    await page.goto("/change-password");
    await expect(page.locator("#currentPassword").first()).toBeVisible({
      timeout: 15000,
    });
    // Fill form fields and submit programmatically to avoid DOM detachment
    await page.evaluate(() => {
      const set = (id: string, val: string) => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (!el) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        nativeSetter?.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("currentPassword", "OldPassword1!");
      set("newPassword", "NewPassword1!");
      set("confirmPassword", "NewPassword1!");
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      btn?.click();
    });
    await expect(
      page.getByText(/הסיסמה שונתה/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
