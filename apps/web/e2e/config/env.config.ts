/**
 * ENV Manager — typed environment variable access for Playwright tests.
 * All test configuration is sourced from here; no spec file should read
 * process.env directly.
 */

export const envConfig = {
  /** Base URL of the web application under test */
  baseURL: process.env.BASE_URL ?? "http://localhost:3000",

  /** Backend API base URL */
  apiURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",

  /** True when running inside a CI environment */
  ci: !!process.env.CI,

  /** Default locale for browser contexts */
  locale: (process.env.TEST_LOCALE ?? "he-IL") as string,

  /** Default timeout for actions (ms) */
  actionTimeout: Number(process.env.TEST_ACTION_TIMEOUT ?? 15_000),

  /** Default navigation timeout (ms) */
  navigationTimeout: Number(process.env.TEST_NAVIGATION_TIMEOUT ?? 60_000),

  /** Auth token used in smoke/mock suites */
  smokeAuthToken: process.env.SMOKE_AUTH_TOKEN ?? "smoke-test-token",

  /** Whether to keep browser open on failure (local dev only) */
  keepBrowserOpen: process.env.PWDEBUG === "1",
} as const;

export type EnvConfig = typeof envConfig;
