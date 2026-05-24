/**
 * auth-fixtures — backward-compatible entry point for E2E specs.
 *
 * Injects the same auth state the Next.js middleware and Zustand store expect:
 *   - `auth_token` in localStorage
 *   - `groupio-auth` Zustand persistence key in localStorage
 *   - `refresh_token` and `groupio-auth` cookies (read by Edge middleware)
 *
 * Implementation lives in `../api/actions.ts` and `../helpers/user.factory.ts`.
 * The composed Playwright fixture chain lives in `./index.ts`.
 *
 * Preferred imports for new specs:
 *   import { test, expect } from "./fixtures";
 *   import { loginAs, setupBaseMocks } from "./api/actions";
 */

export { expect, test } from "./index";
export type { GroupioFixtures, UserRole } from "./index";

export {
  clearAuth,
  ensureRefreshTokenCookie,
  loginAs,
  openApp,
  setupAuthAndMocks,
  setupBaseMocks,
  waitForPageInteractive,
  type SetupBaseMocksOptions,
} from "../api/actions";
