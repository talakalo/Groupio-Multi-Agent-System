import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class VerifyEmailPage extends BasePage {
  readonly statusMessage = this.page.getByRole("alert");
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });

  constructor(page: Page) {
    super(page);
  }

  async goto(token?: string): Promise<void> {
    const path = token ? `/verify-email?token=${token}` : "/verify-email";
    await super.goto(path);
    await this.waitForReady();
  }

  async gotoResend(): Promise<void> {
    await super.goto("/resend-verification");
    await this.waitForReady();
  }
}
