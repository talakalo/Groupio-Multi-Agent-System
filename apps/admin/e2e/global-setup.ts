/**
 * Global Setup — runs once before all admin Playwright tests.
 */

import { chromium, type FullConfig } from "@playwright/test";
import { envConfig } from "./config/env.config";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  console.log("\n[GlobalSetup] Starting Groupio Admin E2E global setup...");

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(envConfig.baseURL, { timeout: 30_000, waitUntil: "domcontentloaded" });
    console.log(`[GlobalSetup] Admin app reachable at: ${page.url()}`);
    await browser.close();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[GlobalSetup] Warning: ${msg}`);
  }

  console.log("[GlobalSetup] Global setup complete.\n");
}
