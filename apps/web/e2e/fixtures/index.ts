/**
 * Composed Playwright fixtures for Groupio E2E tests.
 *
 * Import in spec files:
 *   import { test, expect } from "./fixtures";
 *
 * Fixture modules (extend in order):
 *   base.fixture    — domcontentloaded page patch
 *   mock.fixture    — loginAs, setupMocks, setupAuthAndMocks
 *   pages.fixture   — lazy page object instances
 *   session.fixture — pre-navigated login/signup + authenticated roles
 *   browser.fixture — multi-context browserManager
 */

export { expect } from "@playwright/test";
export { test } from "./browser.fixture";

export type { BaseFixtures } from "./base.fixture";
export type { MockFixtures } from "./mock.fixture";
export type { PageObjectFixtures } from "./pages.fixture";
export type { SessionFixtures } from "./session.fixture";
export type { BrowserFixtures } from "./browser.fixture";
export type { UserRole } from "../helpers/user.factory";

import type { BrowserFixtures } from "./browser.fixture";
import type { MockFixtures } from "./mock.fixture";
import type { PageObjectFixtures } from "./pages.fixture";
import type { SessionFixtures } from "./session.fixture";

/** Full fixture surface available in spec files. */
export type GroupioFixtures = PageObjectFixtures &
  SessionFixtures &
  MockFixtures &
  BrowserFixtures;
