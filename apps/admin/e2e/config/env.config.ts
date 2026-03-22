/**
 * ENV Manager — typed environment variable access for admin Playwright tests.
 */

export const envConfig = {
  baseURL: process.env.ADMIN_BASE_URL ?? "http://localhost:3001",
  apiURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  ci: !!process.env.CI,
  locale: (process.env.TEST_LOCALE ?? "he-IL") as string,
  actionTimeout: Number(process.env.TEST_ACTION_TIMEOUT ?? 15_000),
  navigationTimeout: Number(process.env.TEST_NAVIGATION_TIMEOUT ?? 30_000),
  smokeAuthToken: process.env.SMOKE_AUTH_TOKEN ?? "admin-smoke-token",
} as const;

export type EnvConfig = typeof envConfig;
