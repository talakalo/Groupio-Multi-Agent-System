/**
 * BrowserManager — manages multiple browser contexts for multi-user or
 * multi-tab test scenarios (e.g. testing real-time updates with two residents).
 */

import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { loginAs } from "./actions";
import { type UserRole } from "../helpers/user.factory";
import { envConfig } from "../config/env.config";

export interface ManagedContext {
  context: BrowserContext;
  page: Page;
  role?: UserRole;
}

export class BrowserManager {
  private readonly contexts: BrowserContext[] = [];

  constructor(private readonly browser: Browser) {}

  /**
   * Create a new browser context with the given options.
   * The context is tracked internally and cleaned up by disposeAll().
   */
  async createContext(options?: BrowserContextOptions): Promise<BrowserContext> {
    const context = await this.browser.newContext({
      baseURL: envConfig.baseURL,
      locale: envConfig.locale,
      ...options,
    });
    this.contexts.push(context);
    return context;
  }

  /**
   * Create a new browser context + page pre-authenticated as the given role.
   * Useful for multi-user scenarios.
   */
  async createAuthenticatedContext(
    role: UserRole,
    options?: BrowserContextOptions,
  ): Promise<ManagedContext> {
    const context = await this.createContext(options);
    const page = await context.newPage();
    await loginAs(page, role);
    return { context, page, role };
  }

  /**
   * Create two independent authenticated contexts (e.g. two residents
   * interacting with the same offer simultaneously).
   */
  async createMultiUserContexts(
    roles: [UserRole, UserRole],
  ): Promise<[ManagedContext, ManagedContext]> {
    const [ctx1, ctx2] = await Promise.all([
      this.createAuthenticatedContext(roles[0]),
      this.createAuthenticatedContext(roles[1]),
    ]);
    return [ctx1, ctx2];
  }

  /**
   * Close all managed contexts. Call this in afterEach/afterAll.
   */
  async disposeAll(): Promise<void> {
    await Promise.all(this.contexts.map((ctx) => ctx.close()));
    this.contexts.length = 0;
  }

  /** Number of currently active contexts */
  get activeCount(): number {
    return this.contexts.length;
  }
}
