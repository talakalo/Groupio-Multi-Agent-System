/**
 * BasePage — abstract base class for all Page Objects.
 * Provides common navigation, wait, and element helpers so each page class
 * only needs to define its own locators and actions.
 */

import { type Page, type Locator } from "@playwright/test";

import { envConfig } from "../config/env.config";

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Expose the underlying Playwright page for assertions in specs. */
  get rawPage(): Page {
    return this.page;
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  /** Navigate to an absolute or relative path */
  async goto(path: string): Promise<void> {
    const url = path.startsWith("http") ? path : `${envConfig.baseURL}${path}`;
    await this.page.goto(url);
  }

  /** Wait until the page is fully loaded (network idle + DOM ready) */
  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  // ─── Page info ────────────────────────────────────────────────────────────

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async getURL(): Promise<string> {
    return this.page.url();
  }

  async waitForURL(urlPattern: string | RegExp): Promise<void> {
    await this.page.waitForURL(urlPattern);
  }

  // ─── Element helpers ──────────────────────────────────────────────────────

  /** Click an element and optionally wait for navigation */
  async clickAndWait(locator: Locator, waitForURL?: string | RegExp): Promise<void> {
    await locator.click();
    if (waitForURL) {
      await this.page.waitForURL(waitForURL);
    }
  }

  /** Fill an input, clearing it first */
  async fill(locator: Locator, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
  }

  /** Wait for an element to be visible */
  async waitForVisible(locator: Locator): Promise<void> {
    await locator.waitFor({ state: "visible" });
  }

  /** Check if an element is visible */
  async isVisible(locator: Locator): Promise<boolean> {
    return locator.isVisible();
  }
}
