import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class BuildingPage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly joinButton = this.page.getByRole("button", { name: /join|הצטרף/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/building");
    await this.waitForReady();
  }

  async gotoJoin(): Promise<void> {
    await super.goto("/building/join");
    await this.waitForReady();
  }

  async expectOnBuildingPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/building/);
  }
}
