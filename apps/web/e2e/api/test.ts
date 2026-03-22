/**
 * Central Test Runner — extends Playwright's `test` with project-specific
 * fixtures so every spec file gets page objects and helpers for free.
 *
 * Usage in spec files:
 *   import { test, expect } from '../api/test';
 *
 * Fixtures provided:
 *   - loginPage       → LoginPage instance
 *   - dashboardPage   → DashboardPage instance
 *   - offersPage      → OffersPage instance
 *   - adminPage       → AdminPage instance
 *   - loginAs         → (role) => Promise<void>   (injects auth state)
 *   - setupMocks      → () => Promise<void>        (sets up base API mocks)
 *   - browserManager  → BrowserManager instance
 */

import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/DashboardPage";
import { OffersPage } from "../pages/OffersPage";
import { AdminPage } from "../pages/AdminPage";
import { BrowserManager } from "./browser-manager";
import {
  loginAs as loginAsAction,
  setupBaseMocks,
  setupAuthAndMocks,
} from "./actions";
import { type UserRole } from "../helpers/user.factory";

// ─── Fixture type definitions ────────────────────────────────────────────────

interface GroupioFixtures {
  /** Page Object for the /login route */
  loginPage: LoginPage;

  /** Page Object for the /dashboard route */
  dashboardPage: DashboardPage;

  /** Page Object for the /offers route and offer detail pages */
  offersPage: OffersPage;

  /** Page Object for admin panel routes */
  adminPage: AdminPage;

  /** Inject auth state as a given role (must call before page.goto) */
  loginAs: (role: UserRole) => Promise<void>;

  /** Set up standard base API mocks (must call before page.goto) */
  setupMocks: () => Promise<void>;

  /** Set up both mocks and auth for a given role in one call */
  setupAuthAndMocks: (role?: UserRole) => Promise<void>;

  /** Manage multiple browser contexts in multi-user scenarios */
  browserManager: BrowserManager;
}

// ─── Extended test ────────────────────────────────────────────────────────────

export const test = base.extend<GroupioFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  offersPage: async ({ page }, use) => {
    await use(new OffersPage(page));
  },

  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  },

  loginAs: async ({ page }, use) => {
    await use((role: UserRole) => loginAsAction(page, role));
  },

  setupMocks: async ({ page }, use) => {
    await use(() => setupBaseMocks(page));
  },

  setupAuthAndMocks: async ({ page }, use) => {
    await use((role: UserRole = "resident") => setupAuthAndMocks(page, role));
  },

  browserManager: async ({ browser }, use) => {
    const manager = new BrowserManager(browser);
    await use(manager);
    await manager.disposeAll();
  },
});

// Re-export expect so specs only need one import
export { expect };
export type { UserRole };
