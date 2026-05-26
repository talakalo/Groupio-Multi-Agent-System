import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class OnboardingPage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly residentRoleButton = this.page.getByRole("button", { name: /^דייר\s/ }).first();
  readonly nextButton = this.page.getByRole("main").getByRole("button", { name: "הבא" });
  readonly buildingAddressInput = this.page.locator("#buildingAddress");
  readonly cityInput = this.page.locator("#city");
  readonly suggestAddressButton = this.page.getByRole("button", {
    name: /הצע כתובת|Suggest address/i,
  });
  readonly englishToggle = this.page.getByRole("banner").getByRole("button", { name: "English" });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/onboarding");
    await this.waitForReady();
  }

  async selectResidentAndContinue(): Promise<void> {
    await expect(this.residentRoleButton).toBeVisible({ timeout: 5_000 });
    await this.residentRoleButton.click();
    await expect(this.nextButton).toBeEnabled({ timeout: 5_000 });
    await this.nextButton.click();
    await expect(this.buildingAddressInput).toBeVisible({ timeout: 5_000 });
  }

  async fillAddress(address: string, city: string): Promise<void> {
    await this.buildingAddressInput.fill(address);
    await this.cityInput.fill(city);
  }

  async expectOnOnboardingPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/onboarding/);
  }
}
