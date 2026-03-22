/**
 * LoginPage — Page Object for the /login route.
 * Covers the login form used by residents, contractors, and admins.
 */

import { type Page, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class LoginPage extends BasePage {
  // ─── Locators ─────────────────────────────────────────────────────────────

  readonly emailInput = this.page.getByRole("textbox", { name: /email|אימייל/i });
  readonly passwordInput = this.page.getByLabel(/password|סיסמה/i);
  readonly submitButton = this.page.getByRole("button", { name: /login|sign in|כניסה|התחברות/i });
  readonly errorMessage = this.page.getByRole("alert");
  readonly forgotPasswordLink = this.page.getByRole("link", { name: /forgot|שכחת/i });
  readonly signUpLink = this.page.getByRole("link", { name: /sign up|register|הרשמה/i });

  constructor(page: Page) {
    super(page);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Navigate to the login page */
  async goto(): Promise<void> {
    await super.goto("/login");
    await this.waitForReady();
  }

  /** Fill the login form and submit */
  async login(email: string, password: string): Promise<void> {
    await this.fill(this.emailInput, email);
    await this.fill(this.passwordInput, password);
    await this.submitButton.click();
  }

  /** Login and wait for redirect to dashboard */
  async loginAndWaitForDashboard(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await this.page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  }

  // ─── Assertions ───────────────────────────────────────────────────────────

  async expectError(messagePattern?: string | RegExp): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (messagePattern) {
      await expect(this.errorMessage).toContainText(messagePattern);
    }
  }

  async expectOnLoginPage(): Promise<void> {
    await expect(this.submitButton).toBeVisible();
  }
}
