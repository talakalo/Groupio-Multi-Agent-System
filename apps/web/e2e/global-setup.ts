/**
 * Global Setup — runs once before all Playwright tests begin.
 *
 * Use this for:
 * - Pre-warming auth state files (storageState) to avoid repeated logins
 * - Verifying the dev server is reachable before the suite starts
 * - Any one-time setup that is too expensive to repeat per-test
 *
 * Register in playwright.config.ts:
 *   globalSetup: './e2e/global-setup.ts'
 */

import { chromium, type FullConfig } from "@playwright/test";
import { envConfig } from "./config/env.config";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  console.log("\n[GlobalSetup] Starting Groupio E2E global setup...");

  // ── Verify the dev server / app is reachable ──────────────────────────────
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(envConfig.baseURL, { timeout: 30_000, waitUntil: "domcontentloaded" });

    const status = page.url();
    console.log(`[GlobalSetup] App reachable at: ${status}`);

    await browser.close();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[GlobalSetup] Warning: Could not reach app at ${envConfig.baseURL}: ${msg}`);
    // Don't throw — the webServer config in playwright.config.ts handles starting the server.
  }

  console.log("[GlobalSetup] Global setup complete.\n");
}
