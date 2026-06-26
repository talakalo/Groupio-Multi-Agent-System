import { type Page, expect } from "@playwright/test";

import { BasePage } from "./BasePage";

export class ArchitecturePage extends BasePage {
  readonly pageHeading = this.page.getByRole("heading", { level: 1 });
  readonly dropzoneTitle = this.page.getByText(/העלה את תוכנית הדירה|Upload your floor plan/i);
  // Use locator('button') to exclude the dropzone div[role="button"] which also contains the text
  readonly uploadButton = this.page.locator("button").filter({ hasText: /בחר קובץ|Choose file/i });
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
