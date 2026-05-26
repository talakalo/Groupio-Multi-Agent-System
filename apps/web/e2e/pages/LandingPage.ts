import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class LandingPage extends BasePage {
  readonly heroHeading = this.page.locator("h1").first();
  readonly signupLink = this.page.getByRole("link", { name: /הרשמ|signup/i });
  readonly loginLink = this.page.getByRole("link", { name: /login|התחבר/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/");
    await this.waitForReady();
  }

  async gotoContact(): Promise<void> {
    await super.goto("/contact");
    await this.waitForReady();
  }

  async gotoFaq(): Promise<void> {
    await super.goto("/faq");
    await this.waitForReady();
  }

  async gotoTerms(): Promise<void> {
    await super.goto("/terms");
    await this.waitForReady();
  }

  async gotoPrivacy(): Promise<void> {
    await super.goto("/privacy");
    await this.waitForReady();
  }

  async expectLandingLoaded(): Promise<void> {
    await expect(this.heroHeading).toBeVisible();
    await expect(this.signupLink).toBeVisible();
  }
}
