import { type Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  readonly emailInput = this.page.getByRole("textbox", { name: /email|אימייל/i });
  readonly passwordInput = this.page.getByLabel(/password|סיסמה/i);
  readonly submitButton = this.page.getByRole("button", { name: /login|sign in|כניסה/i });
  readonly errorMessage = this.page.getByRole("alert");

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/login");
    await this.waitForReady();
  }

  async login(email: string, password: string): Promise<void> {
    await this.fill(this.emailInput, email);
    await this.fill(this.passwordInput, password);
    await this.submitButton.click();
  }

  async loginAndWaitForDashboard(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await this.page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  }

  async expectOnLoginPage(): Promise<void> {
    await expect(this.submitButton).toBeVisible();
  }
}
