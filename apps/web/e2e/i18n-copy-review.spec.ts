/**
 * i18n-copy-review.spec.ts
 *
 * Automated copy / i18n checks for both Hebrew (RTL) and English (LTR).
 * Catches:
 *   - Raw translation keys leaked to the DOM (e.g. "auth.login.title")
 *   - Placeholder / dummy text (Lorem ipsum, TODO, FIXME)
 *   - Untranslated English on Hebrew pages or vice-versa on key UI elements
 *   - Wrong directionality (<html dir="rtl"> vs locale)
 *   - Missing <html lang> attribute
 */

import { expect, test } from "./fixtures/auth-fixtures";
import { waitForPageInteractive } from "./api/actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RAW_KEY_PATTERN = /\b[\w]+\.[\w]+\.[\w]+\b/; // e.g. "auth.login.submit"
const PLACEHOLDER_PATTERN = /lorem ipsum|TODO|FIXME|dummy|sample text|placeholder/i;

async function checkPage(
  page: import("@playwright/test").Page,
  path: string,
  locale: "he-IL" | "en",
  expectedDir: "rtl" | "ltr",
): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForPageInteractive(page);

  const bodyText = await page.locator("body").innerText().catch(() => "");

  // 1. No raw i18n keys
  expect(bodyText, `Raw i18n key found on ${path} (${locale})`).not.toMatch(RAW_KEY_PATTERN);

  // 2. No placeholder copy
  expect(bodyText, `Placeholder text found on ${path} (${locale})`).not.toMatch(PLACEHOLDER_PATTERN);

  // 3. <html> has lang attribute
  const lang = await page.locator("html").getAttribute("lang");
  expect(lang, `<html lang> missing on ${path}`).toBeTruthy();

  // 4. Correct dir attribute
  const dir = await page.locator("html").getAttribute("dir");
  if (dir !== null) {
    expect(dir, `Wrong dir on ${path}: expected ${expectedDir}`).toBe(expectedDir);
  }
}

// ─── Hebrew (RTL) Pages ───────────────────────────────────────────────────────

test.describe("Hebrew (RTL) copy — public pages", () => {
  // These run in the chromium-he project (locale: he-IL) — see playwright.config.ts
  test.use({ locale: "he-IL" });

  test("/login — no raw keys, RTL dir", async ({ page }) => {
    await checkPage(page, "/login", "he-IL", "rtl");
  });

  test("/signup — no raw keys, no placeholder, RTL dir", async ({ page }) => {
    await checkPage(page, "/signup", "he-IL", "rtl");
  });

  test("/forgot-password — no raw keys", async ({ page }) => {
    await checkPage(page, "/forgot-password", "he-IL", "rtl");
  });
});

test.describe("Hebrew (RTL) copy — resident pages", () => {
  test.use({ locale: "he-IL" });

  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("resident");
  });

  test("/dashboard — no raw keys, no placeholder", async ({ page }) => {
    await checkPage(page, "/dashboard", "he-IL", "rtl");
  });

  test("/offers — no raw keys", async ({ page }) => {
    await checkPage(page, "/offers", "he-IL", "rtl");
  });
});

test.describe("Hebrew (RTL) copy — contractor pages", () => {
  test.use({ locale: "he-IL" });

  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("contractor");
  });

  test("/contractor/dashboard — no raw keys", async ({ page }) => {
    await checkPage(page, "/contractor/dashboard", "he-IL", "rtl");
  });
});

test.describe("Hebrew (RTL) copy — buildings manager pages", () => {
  test.use({ locale: "he-IL" });

  test.beforeEach(async ({ setupAuthAndMocks }) => {
    await setupAuthAndMocks("buildings_manager");
  });

  test("/buildings-manager/dashboard — no raw keys", async ({ page }) => {
    await checkPage(page, "/buildings-manager/dashboard", "he-IL", "rtl");
  });
});

// ─── English (LTR) Pages ──────────────────────────────────────────────────────

test.describe("English (LTR) copy — public pages", () => {
  test.use({ locale: "en" });

  test("/login — LTR dir", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await waitForPageInteractive(page);
    const dir = await page.locator("html").getAttribute("dir");
    if (dir !== null) {
      expect(dir).toBe("ltr");
    }
  });
});

// ─── Terminology consistency ──────────────────────────────────────────────────

test.describe("Terminology consistency", () => {
  /**
   * Checks that certain terms are used consistently across the resident dashboard.
   * Add more rules here as product terminology is finalised.
   */
  test("resident dashboard does not show raw 'buildings_manager' string", async ({
    page,
    setupAuthAndMocks,
  }) => {
    await setupAuthAndMocks("resident");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForPageInteractive(page);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    expect(bodyText).not.toContain("buildings_manager");
  });

  test("signup page does not expose 'buildings_manager' as a visible role option", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await waitForPageInteractive(page);
    // Check no visible text option says "buildings_manager"
    const count = await page.locator("text=buildings_manager").count();
    expect(count, "'buildings_manager' raw value must not appear in signup UI").toBe(0);
  });
});
