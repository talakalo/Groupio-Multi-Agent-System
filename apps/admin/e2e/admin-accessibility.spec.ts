/**
 * admin-accessibility.spec.ts
 *
 * Tests for P2-BQ-08/09/10: admin filter controls must have accessible labels.
 *
 * Every <select> and <input type="checkbox"> used for filtering must have
 * either an associated <label> or an aria-label attribute so that screen
 * readers can identify them.
 *
 * Pages checked:
 *   /users       — role filter select, status filter select
 *   /contractors — verification filter select, category filter select,
 *                  region filter select, select-all checkbox
 *   /offers      — status filter select, category filter select
 */

import { test, expect } from "@playwright/test";
import { envConfig } from "./config/env.config";

// ─── Helper ──────────────────────────────────────────────────────────────────

async function injectAdminCookies(
  page: import("@playwright/test").Page
): Promise<void> {
  const cookie = JSON.stringify({
    state: {
      user: { id: "test-admin", email: "admin@groupio.test", role: "admin" },
      isAuthenticated: true,
    },
    version: 0,
  });
  await page.context().addCookies([
    { name: "groupio-auth", value: cookie, url: envConfig.baseURL },
    { name: "refresh_token", value: "e2e-admin-refresh", url: envConfig.baseURL },
    { name: "admin_role_verified", value: "1", url: envConfig.baseURL },
  ]);
}

async function mockAdminApis(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/admin/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, users: [], contractors: [] }),
    })
  );
  await page.route("**/api/v1/contractors**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  );
}

async function hasAccessibleLabel(
  page: import("@playwright/test").Page,
  selector: string
): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    // Check aria-label
    if (el.getAttribute("aria-label")) return true;
    // Check aria-labelledby
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl && labelEl.textContent?.trim()) return true;
    }
    // Check associated <label> via id
    const id = el.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label && label.textContent?.trim()) return true;
    }
    return false;
  }, selector);
}

// ─── Users page ──────────────────────────────────────────────────────────────

test.describe("/users — filter controls are accessible (P2-BQ-08)", () => {
  test.beforeEach(async ({ page }) => {
    await injectAdminCookies(page);
    await mockAdminApis(page);
    await page.goto(`${envConfig.baseURL}/users`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
  });

  test("role filter select has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(page, "#users-role-filter");
    expect(ok, "Role filter select must have an accessible label").toBe(true);
  });

  test("status filter select has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(page, "#users-status-filter");
    expect(ok, "Status filter select must have an accessible label").toBe(true);
  });
});

// ─── Contractors page ─────────────────────────────────────────────────────────

test.describe("/contractors — filter controls are accessible (P2-BQ-09)", () => {
  test.beforeEach(async ({ page }) => {
    await injectAdminCookies(page);
    await mockAdminApis(page);
    await page.goto(`${envConfig.baseURL}/contractors`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
  });

  test("verification filter select has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(
      page,
      "#contractors-verification-filter"
    );
    expect(ok, "Verification filter must have an accessible label").toBe(true);
  });

  test("category filter select has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(page, "#contractors-category-filter");
    expect(ok, "Category filter must have an accessible label").toBe(true);
  });

  test("region filter select has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(page, "#contractors-region-filter");
    expect(ok, "Region filter must have an accessible label").toBe(true);
  });

  test("select-all checkbox has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(page, "#contractors-select-all");
    expect(ok, "Select-all checkbox must have an accessible label").toBe(true);
  });
});

// ─── Offers page ─────────────────────────────────────────────────────────────

test.describe("/offers — filter controls are accessible (P2-BQ-10)", () => {
  test.beforeEach(async ({ page }) => {
    await injectAdminCookies(page);
    await mockAdminApis(page);
    await page.goto(`${envConfig.baseURL}/offers`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
  });

  test("status filter select has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(page, "#offers-status-filter");
    expect(ok, "Status filter must have an accessible label").toBe(true);
  });

  test("category filter select has accessible label", async ({ page }) => {
    const ok = await hasAccessibleLabel(page, "#offers-category-filter");
    expect(ok, "Category filter must have an accessible label").toBe(true);
  });
});
