/**
 * DashboardPage — Page Object for the /dashboard route (resident/contractor).
 * Wraps locators and actions for the main dashboard view.
 */

import { type Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class DashboardPage extends BasePage {
  // ─── Locators ─────────────────────────────────────────────────────────────

  // Navigation
  readonly navOffers = this.page.getByRole("link", { name: /offers|הצעות/i });
  readonly navPayments = this.page.getByRole("link", { name: /payments|תשלומים/i });
  readonly navProfile = this.page.getByRole("link", { name: /profile|פרופיל/i });
  readonly navBuilding = this.page.getByRole("link", { name: /building|בניין/i });
  readonly navContractors = this.page.getByRole("link", { name: /contractors|קבלנים/i });

  // Dashboard content
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly statsCards = this.page.locator("[data-testid='stats-card'], .stats-card");
  readonly activeOffersList = this.page.locator("[data-testid='active-offers']");
  readonly welcomeMessage = this.page.getByText(/welcome|ברוך הבא|שלום/i);

  // Contractor-specific
  readonly createOfferButton = this.page.getByRole("button", { name: /create offer|צור הצעה/i });
  readonly contractorStats = this.page.locator("[data-testid='contractor-stats']");

  constructor(page: Page) {
    super(page);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Navigate to the resident dashboard */
  async goto(): Promise<void> {
    await super.goto("/dashboard");
    await this.waitForReady();
  }

  /** Navigate to the contractor dashboard */
  async gotoContractor(): Promise<void> {
    await super.goto("/contractor/dashboard");
    await this.waitForReady();
  }

  async gotoContractorProjects(): Promise<void> {
    await super.goto("/contractor/projects");
    await this.waitForReady();
  }

  async clickOffers(): Promise<void> {
    await this.navOffers.click();
    await this.page.waitForURL(/\/offers/);
  }

  async clickPayments(): Promise<void> {
    await this.navPayments.click();
    await this.page.waitForURL(/\/payments/);
  }

  async clickProfile(): Promise<void> {
    await this.navProfile.click();
    await this.page.waitForURL(/\/profile/);
  }

  // ─── Assertions ───────────────────────────────────────────────────────────

  async expectOnResidentDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/);
    await expect(this.pageHeading).toBeVisible();
  }

  async expectOnContractorDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/contractor\/dashboard/);
    await expect(this.pageHeading).toBeVisible();
  }
}
