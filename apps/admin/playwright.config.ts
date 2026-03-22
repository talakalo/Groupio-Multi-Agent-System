import { defineConfig, devices } from "@playwright/test";
import { envConfig } from "./e2e/config/env.config";

/**
 * Playwright config for Admin E2E tests.
 * Run: pnpm --filter @groupio/admin exec playwright test
 * Requires: pnpm --filter @groupio/admin dev (port 3001)
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "playwright-report/junit-e2e.xml" }],
    ["./e2e/reports/custom-reporter.ts"],
  ],
  use: {
    baseURL: envConfig.baseURL,
    trace: "on-first-retry",
    locale: envConfig.locale,
    actionTimeout: envConfig.actionTimeout,
    navigationTimeout: envConfig.navigationTimeout,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: envConfig.baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
