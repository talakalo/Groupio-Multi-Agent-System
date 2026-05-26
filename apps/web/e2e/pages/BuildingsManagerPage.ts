import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class BuildingsManagerPage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly buildingsTable = this.page.locator("table");
  readonly escalationsList = this.page.locator("[data-testid='escalations-list']");

  constructor(page: Page) {
    super(page);
  }

  async gotoDashboard(): Promise<void> {
    await super.goto("/buildings-manager/dashboard");
    await this.waitForReady();
  }

  async gotoBuildings(): Promise<void> {
    await super.goto("/buildings-manager/buildings");
    await this.waitForReady();
  }

  async gotoEscalations(): Promise<void> {
    await super.goto("/buildings-manager/escalations");
    await this.waitForReady();
  }

  async expectOnDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/buildings-manager\/dashboard/);
  }
}
