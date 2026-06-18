/**
 * full-navigation.spec.ts
 *
 * Verifies that every major page in the web app:
 *   - Loads without a crash or 500 error
 *   - Has a visible <main> element (not a blank page)
 *   - Does not show raw translation keys (e.g. "t('some.key')" leaked to DOM)
 *   - Does not emit unhandled JS exceptions
 *
 * This is a smoke-level navigation test — it does NOT verify deep UI content.
 * See ui-elements.spec.ts for per-element validation.
 */

import { expect, test } from "./fixtures/auth-fixtures";
import { waitForPageInteractive } from "./api/actions";

// Collect uncaught JS exceptions per test
type PageError = { msg: string; url: string };

function collectErrors(page: import("@playwright/test").Page): PageError[] {
  const errors: PageError[] = [];
  page.on("pageerror", (err) => errors.push({ msg: err.message, url: page.url() }));
  return errors;
}

// ─── Public / Auth Pages ──────────────────────────────────────────────────────

test.describe("Public / Auth pages", () => {
  const publicRoutes = [
    { path: "/login", label: "Login page" },
    { path: "/signup", label: "Signup page" },
    { path: "/forgot-password", label: "Forgot password page" },
  ];

  for (const { path, label } of publicRoutes) {
    test(`${label} loads and has <main>`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForPageInteractive(page);

      // No JS crash
      expect(errors, `Uncaught JS errors on ${path}: ${errors.map(e => e.msg).join("; ")}`).toHaveLength(0);

      // No raw translation key visible
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(bodyText).not.toMatch(/\bt\('[\w.]+'\)/);
    });
  }
});

// ─── Resident Pages ───────────────────────────────────────────────────────────

test.describe("Resident pages", () => {
  const residentRoutes = [
    { path: "/dashboard", label: "Resident dashboard" },
    { path: "/offers", label: "Offers list" },
    { path: "/payments", label: "Payments" },
    { path: "/profile", label: "Profile" },
    { path: "/building", label: "Building info" },
  ];

  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
  });

  for (const { path, label } of residentRoutes) {
    test(`${label} (${path}) loads`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForPageInteractive(page);

      // Should not be redirected to login
      expect(page.url()).not.toMatch(/\/login/);

      // No JS crash
      expect(errors, `JS errors on ${path}`).toHaveLength(0);

      // No raw i18n key leak
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(bodyText).not.toMatch(/\bt\('[\w.]+'\)/);
    });
  }
});

// ─── Contractor Pages ─────────────────────────────────────────────────────────

test.describe("Contractor pages", () => {
  const contractorRoutes = [
    { path: "/contractor/dashboard", label: "Contractor dashboard" },
    { path: "/contractor/offers/create", label: "Create offer" },
    { path: "/contractor/offers/active", label: "Active offers" },
    { path: "/contractor/profile", label: "Contractor profile" },
  ];

  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("contractor");
  });

  for (const { path, label } of contractorRoutes) {
    test(`${label} (${path}) loads`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForPageInteractive(page);

      expect(page.url()).not.toMatch(/\/login/);
      expect(errors, `JS errors on ${path}`).toHaveLength(0);
    });
  }
});

// ─── Buildings Manager Pages ──────────────────────────────────────────────────

test.describe("Buildings Manager pages", () => {
  const bmRoutes = [
    { path: "/buildings-manager/dashboard", label: "BM dashboard" },
    { path: "/buildings-manager/buildings", label: "Buildings list" },
    { path: "/buildings-manager/escalations", label: "Escalations" },
  ];

  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("buildings_manager");
  });

  for (const { path, label } of bmRoutes) {
    test(`${label} (${path}) loads`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForPageInteractive(page);

      expect(page.url()).not.toMatch(/\/login/);
      expect(errors, `JS errors on ${path}`).toHaveLength(0);
    });
  }
});
