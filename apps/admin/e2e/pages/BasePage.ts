import { type Page, type Locator } from "@playwright/test";
import { envConfig } from "../config/env.config";

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    const url = path.startsWith("http") ? path : `${envConfig.baseURL}${path}`;
    await this.page.goto(url);
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async waitForURL(urlPattern: string | RegExp): Promise<void> {
    await this.page.waitForURL(urlPattern);
  }

  async fill(locator: Locator, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
  }
}
