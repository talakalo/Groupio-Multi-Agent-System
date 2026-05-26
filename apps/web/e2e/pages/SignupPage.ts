import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class SignupPage extends BasePage {
  readonly residentRoleButton = this.page
    .getByRole("button", { name: /^(דייר|Resident)\b/i })
    .first();
  readonly continueButton = this.page.getByRole("button", { name: /^(המשך|Continue)$/i });
  readonly nameInput = this.page.locator("#name");
  readonly emailInput = this.page.locator("#email");
  readonly phoneInput = this.page.locator("#phone");
  readonly passwordInput = this.page.locator("#password");
  readonly tosCheckbox = this.page.locator("#tos");
  readonly submitButton = this.page.locator("form").getByRole("button", { name: /^הרשמה$|^Sign up$/i });
  readonly errorMessage = this.page.getByRole("alert");

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/signup");
    await this.waitForReady();
  }

  async selectResidentAndContinue(): Promise<void> {
    const residentOption = this.page.locator('button[aria-pressed="true"]').first();
    if (await residentOption.isVisible().catch(() => false)) {
      await expect(residentOption).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(this.residentRoleButton).toBeVisible({ timeout: 10_000 });
      await this.residentRoleButton.click();
    }
    await expect(this.continueButton).toBeVisible();
    await this.waitForReady();

    for (let attempt = 0; attempt < 5; attempt++) {
      await this.continueButton.click();
      if (await this.nameInput.isVisible().catch(() => false)) {
        return;
      }
      await this.page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
    }

    await expect(this.nameInput).toBeVisible({ timeout: 10_000 });
  }

  async fillDetails(
    name: string,
    email: string,
    phone: string,
    password: string,
  ): Promise<void> {
    await this.fill(this.nameInput, name);
    await this.fill(this.emailInput, email);
    await this.fill(this.phoneInput, phone);
    await this.fill(this.passwordInput, password);
    await this.tosCheckbox.check();
  }

  async submit(): Promise<void> {
    await this.waitForReady();
    await this.submitButton.click();
  }

  async signupAsResident(
    name: string,
    email: string,
    phone: string,
    password: string,
  ): Promise<void> {
    await this.selectResidentAndContinue();
    await this.fillDetails(name, email, phone, password);
    await this.submit();
  }
}
