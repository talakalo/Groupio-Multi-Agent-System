/**
 * CheckoutPage — Page Object for the /checkout route.
 *
 * The checkout page operates in two modes depending on the backend
 * payment provider:
 *   - Mock mode (PAYMENT_PROVIDER=mock): the API returns status "succeeded"
 *     and no client_secret, so the success state is shown immediately.
 *   - Stripe mode: the API returns a client_secret and the Stripe
 *     PaymentElement is mounted for card capture.
 *
 * E2E tests should always use mock mode to avoid brittle Stripe UI
 * interactions and to keep tests deterministic.
 */

import { type Page, type Locator, expect } from "@playwright/test";

export class CheckoutPage {
  readonly page: Page;

  // ─── Selectors ────────────────────────────────────────────────────────────

  /** Loading spinner while payment is being initiated */
  readonly loadingSpinner: Locator;

  /** The "payment successful" heading (mock/success state) */
  readonly successHeading: Locator;

  /** The VAT receipt / amount breakdown shown in success state */
  readonly successReceipt: Locator;

  /** Escrow protection badge (shown in both Stripe and success states) */
  readonly escrowBadge: Locator;

  /** Error heading shown when payment fails */
  readonly errorHeading: Locator;

  /** Error message body text */
  readonly errorMessage: Locator;

  /** "Retry" button shown in the error state */
  readonly retryButton: Locator;

  /** "My orders" CTA link shown after a successful payment */
  readonly myOrdersLink: Locator;

  /** "Back to offer" link shown after a successful payment */
  readonly backToOfferLink: Locator;

  /** Stripe PaymentElement container (Stripe mode only — not rendered in mock mode) */
  readonly stripePaymentForm: Locator;

  /** "Pay" / "Submit payment" button inside the Stripe form */
  readonly stripeSubmitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.loadingSpinner = page.locator('[aria-label="loading"], .animate-spin').first();

    this.successHeading = page.getByText(/התשלום בוצע בהצלחה/i);

    this.successReceipt = page.locator(
      ".rounded-xl.border-emerald-100, [data-testid='payment-receipt']"
    );

    this.escrowBadge = page.getByText(/נאמנות|Escrow/i).first();

    this.errorHeading = page.getByText(/שגיאה בעיבוד התשלום/i);

    this.errorMessage = page.locator(
      "p.text-sm.text-gray-600, [data-testid='payment-error-message']"
    );

    this.retryButton = page.getByRole("button", { name: /נסה שוב/i });

    this.myOrdersLink = page.getByRole("link", { name: /להזמנות שלי/i });

    this.backToOfferLink = page.getByRole("link", { name: /חזרה להצעה/i });

    this.stripePaymentForm = page.locator(
      "[data-testid='stripe-checkout-form'], #payment-element, iframe[title*='Secure card']"
    ).first();

    this.stripeSubmitButton = page.getByRole("button", { name: /שלם|אשר תשלום|pay/i });
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  /**
   * Navigate directly to the checkout page for a specific offer.
   * The `offerId` is passed as a query parameter (?offerId=...) which the
   * checkout page reads via `useSearchParams`.
   */
  async goto(offerId: string): Promise<void> {
    await this.page.goto(`/checkout?offerId=${offerId}`);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Wait for the loading phase to complete.
   * The checkout page shows a spinner while calling POST /payments/initiate.
   * After the API responds the page transitions to "success", "stripe", or
   * "error" phase — all of which show different content instead of the spinner.
   */
  async waitForLoadingComplete(): Promise<void> {
    // Wait for the spinner to disappear OR for a non-loading state to appear
    await Promise.race([
      this.successHeading.waitFor({ state: "visible", timeout: 15_000 }),
      this.errorHeading.waitFor({ state: "visible", timeout: 15_000 }),
      this.stripePaymentForm.waitFor({ state: "visible", timeout: 15_000 }),
    ]).catch(() => {
      // If none of the above appear within the timeout the test assertion
      // will fail with a clearer message — no need to throw here.
    });
  }

  /**
   * Perform a mock payment by intercepting the /payments/initiate endpoint
   * before calling goto() so that the page immediately shows success.
   *
   * This method is intentionally NOT calling page.route() itself — route mocks
   * must be set up by the caller before navigating (Playwright requirement).
   * Call this method after setting up the mock to confirm the success state.
   */
  async expectMockPaymentSuccess(): Promise<void> {
    await this.expectSuccess();
  }

  /**
   * Click the Stripe submit button (Stripe mode only).
   * Only call this when the Stripe PaymentElement is visible.
   */
  async submitStripePayment(): Promise<void> {
    await this.stripeSubmitButton.click();
  }

  // ─── Assertions ───────────────────────────────────────────────────────────

  /** Assert that the payment succeeded and the success state is displayed */
  async expectSuccess(): Promise<void> {
    await expect(this.successHeading).toBeVisible({ timeout: 12_000 });
    await expect(this.escrowBadge).toBeVisible();
  }

  /** Assert that the success state includes a link to view orders */
  async expectSuccessWithOrdersLink(): Promise<void> {
    await this.expectSuccess();
    await expect(this.myOrdersLink).toBeVisible();
  }

  /** Assert that the error state is displayed with the given message substring */
  async expectError(messageSubstring?: string | RegExp): Promise<void> {
    await expect(this.errorHeading).toBeVisible({ timeout: 10_000 });
    if (messageSubstring) {
      await expect(this.errorMessage).toContainText(messageSubstring);
    }
  }

  /** Assert that the retry button is visible in the error state */
  async expectRetryAvailable(): Promise<void> {
    await expect(this.retryButton).toBeVisible();
  }

  /** Assert the page is on the checkout URL */
  async expectOnCheckoutPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/checkout/);
  }
}
