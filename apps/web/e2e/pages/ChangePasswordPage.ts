import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class ChangePasswordPage extends BasePage {
  readonly currentPasswordInput = this.page.getByLabel(/current|סיסמה נוכחית/i);
  readonly newPasswordInput = this.page.getByLabel(/new|סיסמה חדשה/i);
  readonly submitButton = this.page.getByRole("button", { name: /change|עדכן|שמור/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/change-password");
    await this.waitForReady();
  }

  async expectOnChangePasswordPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/change-password/);
  }
}
