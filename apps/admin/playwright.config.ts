import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Admin E2E tests.
 * Run: pnpm --filter @groupio/admin exec playwright test
 * Requires: pnpm --filter @groupio/admin dev (port 3001)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001",
    trace: "on-first-retry",
    locale: "he-IL",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
  },
});
