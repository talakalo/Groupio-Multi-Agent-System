/**
 * Payment Flow E2E — Resident payment journey
 *
 * Tests the most critical user journey on the platform:
 *   Browse → Join → Checkout → Success (or Error)
 *
 * Design decisions:
 *   - All backend calls are intercepted with page.route() so the suite runs
 *     without a live API or DB.  This makes the suite a reliable UI-contract
 *     test that runs in CI on every push.
 *   - Payment is tested in "mock mode": the /payments/initiate endpoint returns
 *     status "succeeded" with no client_secret, so the checkout page shows the
 *     success state without mounting Stripe Elements.
 *   - Stripe UI interactions are intentionally NOT tested here — they are
 *     brittle, environment-specific, and covered by Stripe's own test suite.
 *   - A beforeEach guard checks API reachability; the tests are skipped
 *     (not failed) when the backend is not available.
 *
 * Run:
 *   pnpm --filter web exec playwright test e2e/payment-flow.spec.ts --project=chromium
 */

import { test, expect, loginAs, setupBaseMocks } from "./fixtures/auth-fixtures";
import { envConfig } from "./config/env.config";

// ─── Shared test data ────────────────────────────────────────────────────────

const OFFER_ID = "offer-pilot-1";

const MOCK_OFFER = {
  id: OFFER_ID,
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
    { min: 3, max: 5, discount: 0.05, price: 4275 },
    { min: 6, max: 10, discount: 0.10, price: 4050 },
    { min: 11, max: 20, discount: 0.15, price: 3825 },
  ],
  expiresAt: "2026-12-31T00:00:00Z",
  building: { id: "bld_001", address: "רוטשילד 15", city: "תל אביב" },
};

/** Mock /payments/initiate response for mock mode (no Stripe). */
const MOCK_PAYMENT_SUCCESS = {
  id: "pay-e2e-1",
  status: "succeeded",
  provider: "mock",
  subtotal: 3432.20,
  tax_rate: 0.18,
  tax_amount: 617.80,
  amount: 4050,
  currency: "ILS",
  client_secret: null,
  offer_id: OFFER_ID,
};

/** Mock /payments/initiate response for the failure path. */
const MOCK_PAYMENT_FAILURE = {
  detail: "Payment processing failed. Please try again.",
};

// ─── Helper: set up the full offer flow mocks ────────────────────────────────

/**
 * Register all API mocks required for the offers + payment journey.
 * Offer-specific routes are registered AFTER setupBaseMocks so they take
 * precedence (Playwright uses last-registered match).
 */
async function setupOfferAndPaymentMocks(
  page: import("@playwright/test").Page,
  paymentOverride?: {
    status?: number;
    body?: unknown;
  }
): Promise<void> {
  // Offers list
  await page.route("**/api/v1/offers*", (route) => {
    const url = new URL(route.request().url());

    // Single offer detail: /api/v1/offers/<id>  (not /offers/<id>/join)
    const detailMatch = url.pathname.match(/\/api\/v1\/offers\/([^/?]+)$/);
    if (detailMatch && !url.pathname.endsWith("/join")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OFFER),
      });
    }

    // Join endpoint: /api/v1/offers/<id>/join
    if (url.pathname.endsWith("/join")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, participants: 9 }),
      });
    }

    // Offers list
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ offers: [MOCK_OFFER], items: [MOCK_OFFER] }),
    });
  });

  // Payment initiate
  const paymentStatus = paymentOverride?.status ?? 200;
  const paymentBody = paymentOverride?.body ?? MOCK_PAYMENT_SUCCESS;

  await page.route("**/api/v1/payments/initiate", (route) =>
    route.fulfill({
      status: paymentStatus,
      contentType: "application/json",
      body: JSON.stringify(paymentBody),
    })
  );
}

// ─── Connectivity guard ──────────────────────────────────────────────────────

/**
 * Check whether the Next.js dev server is reachable.
 * If not, `test.skip()` is called so CI does not report a failure when the
 * backend is intentionally not running (e.g., in isolated lint/type-check jobs).
 */
async function skipIfOffline(page: import("@playwright/test").Page): Promise<void> {
  try {
    const response = await page.request.get(envConfig.baseURL, {
      timeout: 5_000,
    });
    if (!response.ok()) {
      test.skip(true, "Next.js dev server not reachable — skipping payment flow tests");
    }
  } catch {
    test.skip(true, "Next.js dev server not reachable — skipping payment flow tests");
  }
}

// ============================================================================
// Full resident payment flow — happy path (mock mode)
// ============================================================================

test.describe("Resident Payment Flow", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfOffline(page);
  });

  test("should complete the full resident payment flow (mock mode)", async ({ page, checkoutPage }) => {
    // ── 1. Set up auth + API mocks ─────────────────────────────────────────
    await setupBaseMocks(page);
    await loginAs(page, "resident");
    await setupOfferAndPaymentMocks(page);

    // ── 2. Navigate to offers list ─────────────────────────────────────────
    await page.goto("/offers");
    await page.waitForLoadState("networkidle");

    // Verify offers list loaded
    await expect(page).toHaveURL(/\/offers/);

    // ── 3. Navigate to the first available offer ──────────────────────────
    // Extract the href from the first offer card and navigate directly — this
    // avoids relying on Next.js client-side router click behaviour in the test
    // environment where prefetch/RSC fetch may silently fail.
    const firstOfferLink = page.locator('a[href^="/offers/"]').first();
    await expect(firstOfferLink).toBeVisible({ timeout: 15_000 });
    const offerHref = await firstOfferLink.getAttribute("href") ?? `/offers/${OFFER_ID}`;
    await page.goto(offerHref);

    await expect(page).toHaveURL(/\/offers\/.+/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // ── 4. Join the offer ──────────────────────────────────────────────────
    // Try the data-testid first, then fall back to Hebrew text
    const joinButton = page
      .locator('[data-testid="join-offer-button"]')
      .or(page.getByRole("button", { name: /הצטרף להצעה/i }))
      .first();

    if (await joinButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await joinButton.click();

      // Handle join confirmation modal if it appears
      const confirmModal = page.getByRole("dialog").first();
      const isModalVisible = await confirmModal
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      if (isModalVisible) {
        // Accept the cancellation policy checkbox if present
        const policyCheckbox = confirmModal.locator('input[type="checkbox"]').first();
        if (await policyCheckbox.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await policyCheckbox.check();
        }

        // Click confirm join button
        const confirmBtn = confirmModal.getByRole("button", {
          name: /אישור הצטרפות|הצטרף|אשר/i,
        });
        if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await confirmBtn.click();
        }
      }

      // Wait for join success indicator
      await expect(
        page
          .locator('[data-testid="join-success"]')
          .or(page.getByRole("button", { name: /הצטרפת/i }))
          .or(page.getByRole("alert"))
          .first()
      ).toBeVisible({ timeout: 10_000 });
    }

    // ── 5. Navigate to checkout ────────────────────────────────────────────
    await checkoutPage.goto(OFFER_ID);

    // ── 6. Verify mock payment success ────────────────────────────────────
    //    In mock mode the checkout page receives status="succeeded" with no
    //    client_secret and immediately shows the SuccessState component.
    await checkoutPage.expectSuccess();

    // The success state must include a link to view orders
    await checkoutPage.expectSuccessWithOrdersLink();

    // Breadcrumb navigation back to offers should be present
    await expect(page.getByRole("link", { name: /הצעות/i }).first()).toBeVisible();
  });

  // ==========================================================================
  // Error path — payment API returns 500
  // ==========================================================================

  test("should show error state when payment fails", async ({ page, checkoutPage }) => {
    // ── Auth + mocks ──────────────────────────────────────────────────────
    await setupBaseMocks(page);
    await loginAs(page, "resident");
    await setupOfferAndPaymentMocks(page, {
      status: 500,
      body: MOCK_PAYMENT_FAILURE,
    });

    // ── Navigate directly to checkout (simulating a deep-link / retry) ────
    await checkoutPage.goto(OFFER_ID);

    // ── Verify error state ────────────────────────────────────────────────
    await checkoutPage.expectError();

    // A "retry" CTA should be available so the user can try again
    await checkoutPage.expectRetryAvailable();

    // An alternative "back to payments" link should also be visible
    await expect(
      page.getByRole("link", { name: /לתשלומים שלי/i })
    ).toBeVisible();
  });

  // ==========================================================================
  // Edge case — checkout page without offerId query param
  // ==========================================================================

  test("should show error when offerId is missing from URL", async ({ page }) => {
    await setupBaseMocks(page);
    await loginAs(page, "resident");

    // Navigate to checkout without the required offerId param
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");

    // The checkout page renders an inline error when offerId is absent
    await expect(
      page.getByText(/מזהה הצעה חסר|לא צוין מזהה הצעה/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ============================================================================
// Standalone mock mode checkout — verifies core payment UI contract
// ============================================================================

test.describe("Checkout Page — Mock Payment Mode", () => {
  test.beforeEach(async ({ page }) => {
    await skipIfOffline(page);
  });

  test("mock payment: shows success immediately without Stripe UI", async ({ page, checkoutPage }) => {
    await setupBaseMocks(page);
    await loginAs(page, "resident");

    // Register the mock payment endpoint BEFORE navigating
    await page.route("**/api/v1/payments/initiate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PAYMENT_SUCCESS),
      })
    );

    await checkoutPage.goto(OFFER_ID);

    // Success state must be visible without any Stripe card form
    await checkoutPage.expectSuccess();

    // Stripe PaymentElement must NOT be rendered (mock mode bypasses it)
    await expect(checkoutPage.stripePaymentForm).not.toBeVisible();

    // Escrow protection badge must always be shown
    await expect(checkoutPage.escrowBadge).toBeVisible();

    // Orders link must be present so the user can view their purchase
    await expect(checkoutPage.myOrdersLink).toBeVisible();
  });

  test("mock payment: already-paid error shows friendly message", async ({ page, checkoutPage }) => {
    await setupBaseMocks(page);
    await loginAs(page, "resident");

    await page.route("**/api/v1/payments/initiate", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "already paid for this offer" }),
      })
    );

    await checkoutPage.goto(OFFER_ID);

    // The checkout page maps 400 "already" errors to a specific message
    await expect(
      page.getByText(/כבר ביצעת תשלום|היסטוריית התשלומים/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("mock payment: 404 error shows offer-not-found message", async ({ page, checkoutPage }) => {
    await setupBaseMocks(page);
    await loginAs(page, "resident");

    await page.route("**/api/v1/payments/initiate", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "offer not found" }),
      })
    );

    await checkoutPage.goto(OFFER_ID);

    await expect(
      page.getByText(/ההצעה לא נמצאה|הסתיימה/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
