import { type Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class AdminDashboardPage extends BasePage {
  // Navigation
  readonly navUsers = this.page.getByRole("link", { name: /users|משתמשים/i });
  readonly navContractors = this.page.getByRole("link", { name: /contractors|קבלנים/i });
  readonly navEscalations = this.page.getByRole("link", { name: /escalations|הסלמות/i });
  readonly navOffers = this.page.getByRole("link", { name: /offers|הצעות/i });
  readonly navPayments = this.page.getByRole("link", { name: /payments|תשלומים/i });
  readonly navSettings = this.page.getByRole("link", { name: /settings|הגדרות/i });
  readonly navAuditLogs = this.page.getByRole("link", { name: /audit|לוג/i });

  // Stats
  readonly systemHealthBadge = this.page.locator("[data-testid='system-health']");
  readonly totalUsersCard = this.page.locator("[data-testid='stat-users']");
  readonly pendingContractorsCard = this.page.locator("[data-testid='stat-pending']");

  // Contractor management
  readonly contractorTable = this.page.locator("table");
  readonly approveFirstButton = this.page.getByRole("button", { name: /approve|אשר/i }).first();
  readonly rejectFirstButton = this.page.getByRole("button", { name: /reject|דחה/i }).first();

  // Escalations
  readonly escalationsList = this.page.locator("[data-testid='escalations-list']");
  readonly resolveButton = this.page.getByRole("button", { name: /resolve|פתור/i }).first();

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/dashboard");
    await this.waitForReady();
  }

  async gotoContractors(): Promise<void> {
    await super.goto("/contractors");
    await this.waitForReady();
  }

  async gotoEscalations(): Promise<void> {
    await super.goto("/escalations");
    await this.waitForReady();
  }

  async expectOnDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
