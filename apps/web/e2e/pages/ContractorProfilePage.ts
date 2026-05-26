import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class ContractorProfilePage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly membershipSection = this.page.locator("[data-testid='membership'], .membership");
  readonly checkoutButton = this.page.getByRole("button", { name: /subscribe|checkout|הצטרף/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/contractor/profile");
    await this.waitForReady();
  }

  async expectOnProfilePage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/contractor\/profile/);
  }
}
