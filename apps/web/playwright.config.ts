import { defineConfig, devices } from "@playwright/test";
import { envConfig } from "./e2e/config/env.config";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-he",
      use: { ...devices["Desktop Chrome"], locale: "he-IL" },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: envConfig.baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
