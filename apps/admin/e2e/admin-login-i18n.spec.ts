/**
 * admin-login-i18n.spec.ts
 *
 * Tests for admin login page i18n fixes:
 *
 * P1-BQ-02: Admin login form labels and submit button must be in the active
 *            locale (Hebrew when NEXT_LOCALE=he, English when NEXT_LOCALE=en).
 * P2-BQ-05: The admin login page must have exactly ONE <h1> heading.
 *
 * Strategy:
 *   - Visit /login with NEXT_LOCALE=he cookie → assert Hebrew labels visible
 *   - Visit /login with NEXT_LOCALE=en cookie → assert English labels visible
 *   - Count <h1> elements on the login page → must be exactly 1
 */

import { test, expect } from "@playwright/test";
import { envConfig } from "./config/env.config";

test.describe("Admin login page — Hebrew locale (P1-BQ-02)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: "NEXT_LOCALE",
        value: "he",
        url: envConfig.baseURL,
      },
    ]);
    await page.goto(`${envConfig.baseURL}/login`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
  });

  test("email label is in Hebrew", async ({ page }) => {
    // The translated label is 'כתובת אימייל'
    const label = page.locator('label[for="email"]');
    await expect(label).toBeVisible({ timeout: 5000 });
    await expect(label).toContainText("כתובת אימייל");
  });

  test("password label is in Hebrew", async ({ page }) => {
    const label = page.locator('label[for="password"]');
    await expect(label).toBeVisible({ timeout: 5000 });
    await expect(label).toContainText("סיסמה");
  });

  test("submit button text is in Hebrew", async ({ page }) => {
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeAttached({ timeout: 5000 });
    // Button text is 'כניסה' (idle) or 'מתחבר...' (loading)
    const text = await submit.innerText().catch(() => "");
    expect(text.trim()).toBeTruthy();
    // The English 'Sign in' must NOT appear
    expect(text).not.toMatch(/^Sign in$/i);
  });

  test("page dir is rtl", async ({ page }) => {
    const dir = await page.locator("html").getAttribute("dir");
    expect(dir).toBe("rtl");
  });
});

test.describe("Admin login page — English locale", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: "NEXT_LOCALE",
        value: "en",
        url: envConfig.baseURL,
      },
    ]);
    await page.goto(`${envConfig.baseURL}/login`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
  });

  test("email label is in English", async ({ page }) => {
    const label = page.locator('label[for="email"]');
    await expect(label).toBeVisible({ timeout: 5000 });
    await expect(label).toContainText("Email address");
  });

  test("password label is in English", async ({ page }) => {
    const label = page.locator('label[for="password"]');
    await expect(label).toBeVisible({ timeout: 5000 });
    await expect(label).toContainText("Password");
  });

  test("submit button text is in English", async ({ page }) => {
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeAttached({ timeout: 5000 });
    const text = await submit.innerText().catch(() => "");
    expect(text.trim()).toMatch(/sign in/i);
  });

  test("page dir is ltr", async ({ page }) => {
    const dir = await page.locator("html").getAttribute("dir");
    expect(dir).toBe("ltr");
  });
});

test.describe("Admin login page — exactly one <h1> (P2-BQ-05)", () => {
  test("login page has exactly one h1 element", async ({ page }) => {
    await page.goto(`${envConfig.baseURL}/login`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
    const h1Count = await page.locator("h1").count();
    expect(
      h1Count,
      `Expected exactly 1 <h1> on login page, found ${h1Count}`
    ).toBe(1);
  });
});
