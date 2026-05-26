import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class ProfilePage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly emailDisplay = this.page.getByText(/@/);
  readonly saveButton = this.page.getByRole("button", { name: /save|שמור/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/profile");
    await this.waitForReady();
  }

  async expectOnProfilePage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/profile/);
  }
}
