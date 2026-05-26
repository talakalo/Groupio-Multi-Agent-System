import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class ContractorsPage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly contractorCards = this.page.locator("[data-testid='contractor-card'], .contractor-card");

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/contractors");
    await this.waitForReady();
  }

  async expectOnContractorsPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/contractors/);
  }
}
