/**
 * AdminPage — Page Object for the admin panel routes (/admin/*).
 * Covers dashboard, contractor management, escalations, and analytics.
 */

import { type Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class AdminPage extends BasePage {
  // ─── Navigation ───────────────────────────────────────────────────────────

  readonly navDashboard = this.page.getByRole("link", { name: /dashboard|לוח בקרה/i });
  readonly navContractors = this.page.getByRole("link", { name: /contractors|קבלנים/i });
  readonly navEscalations = this.page.getByRole("link", { name: /escalations|הסלמות/i });
  readonly navAnalytics = this.page.getByRole("link", { name: /analytics|אנליטיקה/i });
  readonly navUsers = this.page.getByRole("link", { name: /users|משתמשים/i });
  readonly navSettings = this.page.getByRole("link", { name: /settings|הגדרות/i });

  // ─── Dashboard ────────────────────────────────────────────────────────────

  readonly dashboardHeading = this.page.getByRole("heading", { name: /admin|ניהול/i });
  readonly systemHealthBadge = this.page.locator("[data-testid='system-health']");
  readonly totalUsersCard = this.page.locator("[data-testid='stat-users']");
  readonly totalOffersCard = this.page.locator("[data-testid='stat-offers']");
  readonly pendingContractorsCard = this.page.locator("[data-testid='stat-pending']");

  // ─── Contractor management ────────────────────────────────────────────────

  readonly contractorTable = this.page.locator("table");
  readonly pendingContractorRows = this.page.locator("tr[data-status='pending']");
  readonly approveButton = (contractorId: string) =>
    this.page.getByRole("button", { name: /approve|אשר/i }).filter({
      has: this.page.locator(`[data-contractor-id='${contractorId}']`),
    });
  readonly rejectButton = (contractorId: string) =>
    this.page.getByRole("button", { name: /reject|דחה/i }).filter({
      has: this.page.locator(`[data-contractor-id='${contractorId}']`),
    });

  // ─── Escalations ─────────────────────────────────────────────────────────

  readonly escalationsList = this.page.locator("[data-testid='escalations-list']");
  readonly openEscalationBadge = this.page.locator("[data-testid='open-escalations-count']");
  readonly resolveButton = this.page.getByRole("button", { name: /resolve|פתור/i });

  // ─── Analytics ───────────────────────────────────────────────────────────

  readonly revenueChart = this.page.locator("[data-testid='revenue-chart']");
  readonly agentStatsTable = this.page.locator("[data-testid='agent-stats']");

  constructor(page: Page) {
    super(page);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await super.goto("/admin");
    await this.waitForReady();
  }

  async gotoContractors(): Promise<void> {
    await super.goto("/admin/contractors");
    await this.waitForReady();
  }

  async gotoEscalations(): Promise<void> {
    await super.goto("/admin/escalations");
    await this.waitForReady();
  }

  async gotoAnalytics(): Promise<void> {
    await super.goto("/admin/analytics");
    await this.waitForReady();
  }

  async clickNavItem(name: "contractors" | "escalations" | "analytics" | "users" | "settings"): Promise<void> {
    const navMap = {
      contractors: this.navContractors,
      escalations: this.navEscalations,
      analytics: this.navAnalytics,
      users: this.navUsers,
      settings: this.navSettings,
    };
    await navMap[name].click();
    await this.waitForReady();
  }

  // ─── Assertions ───────────────────────────────────────────────────────────

  async expectOnAdminDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/admin/);
  }

  async expectSystemHealthy(): Promise<void> {
    await expect(this.systemHealthBadge).toContainText(/healthy|תקין/i);
  }
}
