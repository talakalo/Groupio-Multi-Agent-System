/**
 * BrowserManager — manages multiple browser contexts for admin E2E tests.
 */

import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from "@playwright/test";
import { envConfig } from "../config/env.config";

export class BrowserManager {
  private readonly contexts: BrowserContext[] = [];

  constructor(private readonly browser: Browser) {}

  async createContext(options?: BrowserContextOptions): Promise<BrowserContext> {
    const context = await this.browser.newContext({
      baseURL: envConfig.baseURL,
      locale: envConfig.locale,
      ...options,
    });
    this.contexts.push(context);
    return context;
  }

  async disposeAll(): Promise<void> {
    await Promise.all(this.contexts.map((ctx) => ctx.close()));
    this.contexts.length = 0;
  }

  get activeCount(): number {
    return this.contexts.length;
  }
}
