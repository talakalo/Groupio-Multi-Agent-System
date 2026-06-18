import { defineConfig, devices } from "@playwright/test";
import { envConfig } from "./e2e/config/env.config";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // Next.js JIT-compiles pages on first request; 60 s gives the dev server
  // enough headroom to compile even the heaviest page bundles before failing.
  timeout: 60_000,
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
  webServer: [
    {
      // In CI the app is pre-built by the workflow step; serve the production build.
      // Locally, dev server is used and reused across runs.
      command: process.env.CI ? "pnpm start" : "pnpm dev",
      url: envConfig.baseURL,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Admin app — needed by rbac-browser.spec.ts tests that verify :3001 blocks non-admin roles.
      // The admin package.json bakes in --port 3001, so no PORT env var is needed.
      command: process.env.CI ? "pnpm start" : "pnpm dev",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      cwd: "../admin",
    },
  ],
});
