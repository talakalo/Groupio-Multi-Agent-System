/**
 * Central Test Runner — extends Playwright's `test` with admin-specific fixtures.
 *
 * Usage:
 *   import { test, expect } from '../api/test';
 */

import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { AdminDashboardPage } from "../pages/AdminDashboardPage";
import { BrowserManager } from "./browser-manager";
import { loginAsAdmin, setupAdminMocks } from "./actions";

interface AdminFixtures {
  loginPage: LoginPage;
  dashboardPage: AdminDashboardPage;
  loginAsAdmin: () => Promise<void>;
  setupMocks: () => Promise<void>;
  browserManager: BrowserManager;
}

export const test = base.extend<AdminFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new AdminDashboardPage(page));
  },

  loginAsAdmin: async ({ page }, use) => {
    await use(() => loginAsAdmin(page));
  },

  setupMocks: async ({ page }, use) => {
    await use(() => setupAdminMocks(page));
  },

  browserManager: async ({ browser }, use) => {
    const manager = new BrowserManager(browser);
    await use(manager);
    await manager.disposeAll();
  },
});

export { expect };
