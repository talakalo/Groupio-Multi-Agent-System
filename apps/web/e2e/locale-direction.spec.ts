/**
 * locale-direction.spec.ts
 *
 * Regression tests for P1-BQ-01: the web app must respect the NEXT_LOCALE
 * cookie and render the correct dir attribute on <html> for each locale.
 *
 * - Hebrew (he): dir="rtl"
 * - English (en): dir="ltr"
 *
 * The server reads locale from the NEXT_LOCALE cookie (set by LanguageToggle
 * and by Playwright below). Accept-Language header alone is no longer the
 * only signal — the cookie takes priority.
 */

import { test, expect } from "@playwright/test";

const PAGES = ["/login", "/signup", "/forgot-password"];

test.describe("Hebrew locale → dir=rtl on public pages", () => {
  for (const path of PAGES) {
    test(`${path} has dir=rtl when NEXT_LOCALE=he`, async ({ page }) => {
      await page.context().addCookies([
        { name: "NEXT_LOCALE", value: "he", domain: "localhost", path: "/" },
      ]);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const dir = await page.locator("html").getAttribute("dir");
      expect(dir).toBe("rtl");
    });
  }
});

test.describe("English locale → dir=ltr on public pages", () => {
  for (const path of PAGES) {
    test(`${path} has dir=ltr when NEXT_LOCALE=en`, async ({ page }) => {
      await page.context().addCookies([
        { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
      ]);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const dir = await page.locator("html").getAttribute("dir");
      expect(dir).toBe("ltr");
    });
  }
});

test.describe("Accept-Language header fallback (when no cookie)", () => {
  test("/login returns ltr when browser locale is en and no cookie is set", async ({
    browser,
  }) => {
    // Create a context with Accept-Language: en and NO NEXT_LOCALE cookie.
    // The i18n/request.ts fix falls back to Accept-Language when cookie is absent.
    const ctx = await browser.newContext({ locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const dir = await page.locator("html").getAttribute("dir");
    // Should be ltr when Accept-Language is en (and no cookie overrides)
    expect(dir).toBe("ltr");
    await ctx.close();
  });

  test("/login returns rtl when browser locale is he and no cookie is set", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ locale: "he-IL" });
    const page = await ctx.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const dir = await page.locator("html").getAttribute("dir");
    expect(dir).toBe("rtl");
    await ctx.close();
  });
});

test.describe("NEXT_LOCALE cookie overrides Accept-Language header", () => {
  test("NEXT_LOCALE=en wins over Accept-Language: he-IL", async ({ browser }) => {
    // Browser locale is Hebrew, but cookie explicitly sets English
    const ctx = await browser.newContext({ locale: "he-IL" });
    const page = await ctx.newPage();
    await page.context().addCookies([
      { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
    ]);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const dir = await page.locator("html").getAttribute("dir");
    expect(dir).toBe("ltr");
    await ctx.close();
  });
});
