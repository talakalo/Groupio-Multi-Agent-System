/**
 * LoginPage — Page Object for the /login route.
 * Covers the login form used by residents, contractors, and admins.
 */

import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  readonly emailInput = this.page.locator("#identifier");
  readonly passwordInput = this.page.locator("#password");
  readonly submitButton = this.page.getByRole("button", { name: /login|התחברות/i });
  readonly errorMessage = this.page.locator("form ~ div[role='alert'], form + div [role='alert']").first();
  readonly forgotPasswordLink = this.page.getByRole("link", { name: /forgot-password|שכחתי סיסמה/i });
  readonly signUpLink = this.page
    .getByRole("main")
    .getByRole("link", { name: /הרשמו חינם לגרופיו|sign up free/i });

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

  async expectError(messagePattern?: string | RegExp): Promise<void> {
    const alert = this.page.getByRole("alert").filter({ hasText: /.+/ }).first();
    await expect(alert).toBeVisible();
    if (messagePattern) {
      await expect(alert).toContainText(messagePattern);
    }
  }

  async expectOnLoginPage(): Promise<void> {
    await expect(this.submitButton).toBeVisible();
  }
}
