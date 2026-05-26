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

// Pages to pre-warm so Next.js JIT-compiles them before any test starts.
// Covers every route used in the smoke, resident, contractor, and layout suites.
// Every route used by any spec file.  Public pages compile fully; authenticated
// routes are redirected to /login by middleware but still trigger compilation
// of the route bundle and middleware on the first hit.
const WARMUP_ROUTES = [
  // Public / auth pages
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/reset-password?token=warmup-token",
  "/verify-email",
  "/verify-email?token=warmup-token",
  "/resend-verification",
  "/onboarding",
  "/faq",
  "/contact",
  "/terms",
  "/privacy",
  // Resident pages (middleware redirects to /login; still warms the bundle)
  "/dashboard",
  "/offers",
  "/payments",
  "/chat",
  "/checkout",
  "/building",
  "/building/join",
  "/contractors",
  "/profile",
  "/change-password",
  // Contractor pages
  "/contractor/dashboard",
  "/contractor/offers/create",
  "/contractor/offers/active",
  "/contractor/projects",
  "/contractor/profile",
  // Buildings-manager pages
  "/buildings-manager/dashboard",
  "/buildings-manager/buildings",
  "/buildings-manager/escalations",
  // Admin pages
  "/admin/dashboard",
];

export default async function globalSetup(_config: FullConfig): Promise<void> {
  console.log("\n[GlobalSetup] Starting Groupio E2E global setup...");

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Verify base URL is reachable
    await page.goto(envConfig.baseURL, { timeout: 60_000, waitUntil: "domcontentloaded" });
    console.log(`[GlobalSetup] App reachable at: ${page.url()}`);

    // Pre-warm all public routes so Next.js compiles them before tests run.
    // Authenticated routes are skipped here (no cookie) — middleware will
    // redirect them to /login, which still triggers the page compilation.
    console.log(`[GlobalSetup] Pre-warming ${WARMUP_ROUTES.length} routes...`);
    for (const route of WARMUP_ROUTES) {
      try {
        await page.goto(`${envConfig.baseURL}${route}`, {
          timeout: 60_000,
          waitUntil: "domcontentloaded",
        });
      } catch {
        // Non-fatal: continue warming remaining routes even if one fails
      }
    }
    console.log("[GlobalSetup] Route warmup complete.");

    await browser.close();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[GlobalSetup] Warning: Could not reach app at ${envConfig.baseURL}: ${msg}`);
    // Don't throw — the webServer config in playwright.config.ts handles starting the server.
  }

  console.log("[GlobalSetup] Global setup complete.\n");
}
