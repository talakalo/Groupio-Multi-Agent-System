/**
 * OffersPage — Page Object for the /offers route and offer detail pages.
 */

import { type Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class OffersPage extends BasePage {
  // ─── List page locators ───────────────────────────────────────────────────

  readonly pageHeading = this.page.getByRole("heading", { name: /offers|הצעות/i });
  readonly offerCards = this.page.locator("[data-testid='offer-card'], .offer-card");
  readonly filterBar = this.page.locator("[data-testid='filter-bar']");
  readonly categoryFilter = this.page.getByRole("combobox", { name: /category|קטגוריה/i });
  readonly searchInput = this.page.getByRole("searchbox");
  readonly loadingSpinner = this.page.locator("[data-testid='loading']");

  // ─── Offer card locators (relative to a card) ─────────────────────────────

  offerCard(titleText: string | RegExp) {
    return this.page.locator("[data-testid='offer-card'], .offer-card").filter({
      hasText: titleText,
    });
  }

  joinButton(offerId?: string) {
    const base = offerId
      ? this.page.locator(`[data-testid='offer-${offerId}']`)
      : this.page;
    return base.getByRole("button", { name: /join|הצטרף/i });
  }

  // ─── Detail page locators ─────────────────────────────────────────────────

  readonly offerTitle = this.page.getByRole("heading", { level: 1 });
  readonly priceDisplay = this.page.locator("[data-testid='price'], .price");
  readonly tierProgress = this.page.locator("[data-testid='tier-progress']");
  readonly participantsCount = this.page.locator("[data-testid='participants']");
  readonly joinOfferButton = this.page.getByRole("button", { name: /join offer|הצטרף להצעה/i });
  readonly contractorInfo = this.page.locator("[data-testid='contractor-info']");

  constructor(page: Page) {
    super(page);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await super.goto("/offers");
    await this.waitForReady();
  }

  async gotoOffer(offerId: string): Promise<void> {
    await super.goto(`/offers/${offerId}`);
    await this.waitForReady();
  }

  async clickFirstOffer(): Promise<void> {
    await this.offerCards.first().click();
    await this.page.waitForURL(/\/offers\//);
  }

  async filterByCategory(category: string): Promise<void> {
    await this.categoryFilter.selectOption(category);
    await this.waitForReady();
  }

  async joinOffer(): Promise<void> {
    await this.joinOfferButton.click();
  }

  // ─── Contractor create offer ───────────────────────────────────────────────

  readonly createOfferButton = this.page.getByRole("button", { name: /create|new offer|צור הצעה/i });
  readonly categorySelect = this.page.getByLabel(/category|קטגוריה/i);
  readonly titleInput = this.page.getByLabel(/title|כותרת/i);
  readonly basePriceInput = this.page.getByLabel(/base price|מחיר בסיס/i);

  async gotoCreateOffer(): Promise<void> {
    await super.goto("/contractor/offers/create");
    await this.waitForReady();
  }

  // ─── Assertions ───────────────────────────────────────────────────────────

  async expectOffersLoaded(minCount = 1): Promise<void> {
    await expect(this.offerCards).toHaveCount(minCount, { timeout: 10_000 });
  }

  async expectOnOffersPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/offers/);
  }
}
