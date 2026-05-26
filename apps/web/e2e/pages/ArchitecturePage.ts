import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class ArchitecturePage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly dropzoneTitle = this.page.getByText(/העלה את תוכנית הדירה|Upload your floor plan/i);
  readonly uploadButton = this.page.getByRole("button", { name: /בחר קובץ|Choose file|upload/i });
  readonly fileInput = this.page.locator('input[type="file"]');

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/architecture");
    await this.waitForReady();
  }

  async expectOnArchitecturePage(): Promise<void> {
    await expect(this.pageHeading).toBeVisible({ timeout: 10_000 });
    await expect(this.dropzoneTitle).toBeVisible();
  }

  async expectFileInputAttached(): Promise<void> {
    await expect(this.fileInput).toBeAttached({ timeout: 15_000 });
  }
}
