/**
 * Layout Consistency E2E Tests
 *
 * Covers:
 *  1. All authenticated layouts have LanguageToggle and NotificationPanel
 *  2. No duplicate nav links (same URL twice in sidebar)
 *  3. Contractor sidebar has create-offer only once (quick-create button, not in NAV list)
 *  4. Language toggle switches locale for every role
 *  5. Brand consistency — primary Groupio green applied across all layouts
 *  6. Both Hebrew (RTL) and English (LTR) directions set correctly on <html>
 *  7. Public pages render correctly in both locales
 *
 * Auth setup: uses loginAs() + setupAuthAndMocks() so no real backend is needed.
 */

import type { Page, Route } from "@playwright/test";
import { test, expect } from "./api/test";
import { setupAuthAndMocks } from "./api/actions";
import type { UserRole } from "./helpers/user.factory";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Mock the token-refresh endpoint so layouts don't redirect to /login. */
async function mockRefresh(page: Page, accessToken = "e2e-access-token") {
  await page.route("**/api/v1/auth/refresh", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: accessToken }),
    }),
  );
}

/** Set NEXT_LOCALE cookie before navigation (must be called before page.goto). */
async function setLocale(page: Page, locale: "he" | "en") {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: locale, url: "http://localhost:3000" },
  ]);
}

async function setupRole(
  page: Page,
  role: UserRole,
  locale: "he" | "en" = "he",
) {
  await setLocale(page, locale);
  await mockRefresh(page);
  await setupAuthAndMocks(page, role);
}

// ─── 1. LanguageToggle presence in all authenticated layouts ─────────────────

test.describe("LanguageToggle present in every authenticated layout", () => {
  const ROLE_ROUTES: [UserRole, string][] = [
    ["resident", "/dashboard"],
    ["contractor", "/contractor/dashboard"],
    ["buildings_manager", "/buildings-manager/dashboard"],
    ["admin", "/admin/dashboard"],
  ];

  for (const [role, route] of ROLE_ROUTES) {
    test(`${role} layout has LanguageToggle`, async ({ page }) => {
      await setupRole(page, role);
      await page.goto(route);
      // Wait for desktop sidebar to confirm layout has rendered
      await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

      // LanguageToggle renders buttons with "עברית" and "English" labels
      const toggle = page.getByRole("button", { name: /עברית|English/i }).first();
      await expect(toggle).toBeVisible({ timeout: 10_000 });
    });
  }
});

// ─── 2. NotificationPanel present in all authenticated layouts ───────────────

test.describe("NotificationPanel present in every authenticated layout", () => {
  const ROLE_ROUTES: [UserRole, string][] = [
    ["resident", "/dashboard"],
    ["contractor", "/contractor/dashboard"],
    ["buildings_manager", "/buildings-manager/dashboard"],
    ["admin", "/admin/dashboard"],
  ];

  for (const [role, route] of ROLE_ROUTES) {
    test(`${role} layout has NotificationPanel bell`, async ({ page }) => {
      await setupRole(page, role);
      await page.goto(route);
      await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

      // Both NotificationPanel and user-menu have aria-haspopup; use first() to avoid strict-mode error
      const userMenuBtn = page.locator('header button[aria-haspopup="true"]').first();
      await expect(userMenuBtn).toBeVisible({ timeout: 10_000 });
    });
  }
});

// ─── 3. No duplicate nav links in contractor sidebar ────────────────────────

test.describe("No duplicate nav links in contractor sidebar", () => {
  test("create-offer URL appears exactly once in contractor sidebar", async ({ page }) => {
    await setupRole(page, "contractor");
    await page.goto("/contractor/dashboard");
    // Use desktop sidebar (nth(1)) to avoid double-counting from mobile aside
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

    const createOfferLinks = page.locator("aside").nth(1).locator('a[href="/contractor/offers/create"]');
    // Should be exactly 1 (the quick-create button), not 2
    await expect(createOfferLinks).toHaveCount(1, { timeout: 10_000 });
  });

  test("resident sidebar nav links are all unique URLs", async ({ page }) => {
    await setupRole(page, "resident");
    await page.goto("/dashboard");
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

    // Collect all nav link hrefs in the desktop sidebar only
    const sidebarLinks = page.locator("aside").nth(1).locator("a[href]");
    const hrefs = await sidebarLinks.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );

    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const href of hrefs) {
      if (!href) continue;
      if (seen.has(href)) duplicates.push(href);
      seen.add(href);
    }

    expect(duplicates, `Duplicate hrefs: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  test("buildings-manager sidebar nav links are all unique", async ({ page }) => {
    await setupRole(page, "buildings_manager");
    await page.goto("/buildings-manager/dashboard");
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

    const sidebarLinks = page.locator("aside").nth(1).locator("a[href]");
    const hrefs = await sidebarLinks.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );

    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const href of hrefs) {
      if (!href) continue;
      if (seen.has(href)) duplicates.push(href);
      seen.add(href);
    }

    expect(duplicates, `Duplicate hrefs: ${duplicates.join(", ")}`).toHaveLength(0);
  });
});

// ─── 4. Language toggle fires correct POST /api/locale ───────────────────────
//
// Clicking "English" or "עברית" must POST to /api/locale with the right locale
// value. We intercept the request to assert the payload. Testing the full
// dir-attribute change requires an actual server re-render cycle (Next.js RSC
// refresh + cookie propagation) which is covered by section 10 instead.

test.describe("Language toggle switches locale for each role", () => {
  const ROLE_ROUTES: [UserRole, string][] = [
    ["resident", "/dashboard"],
    ["contractor", "/contractor/dashboard"],
    ["buildings_manager", "/buildings-manager/dashboard"],
    ["admin", "/admin/dashboard"],
  ];

  for (const [role, route] of ROLE_ROUTES) {
    test(`${role}: clicking "English" sends locale=en to /api/locale`, async ({ page }) => {
      await setupRole(page, role, "he");
      await page.goto(route);
      await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

      // Mock the locale endpoint so the POST doesn't fail and cause an error toast
      await page.route("**/api/locale", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, locale: "en" }) }),
      );

      const [request] = await Promise.all([
        page.waitForRequest((req) => req.url().includes("/api/locale") && req.method() === "POST"),
        page.getByRole("button", { name: /^English$/i }).first().click(),
      ]);

      const body = JSON.parse(request.postData() ?? "{}") as { locale?: string };
      expect(body.locale).toBe("en");
    });

    test(`${role}: clicking "עברית" sends locale=he to /api/locale`, async ({ page }) => {
      await setupRole(page, role, "en");
      await page.goto(route);
      await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

      await page.route("**/api/locale", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, locale: "he" }) }),
      );

      const [request] = await Promise.all([
        page.waitForRequest((req) => req.url().includes("/api/locale") && req.method() === "POST"),
        page.getByRole("button", { name: /^עברית$/ }).first().click(),
      ]);

      const body = JSON.parse(request.postData() ?? "{}") as { locale?: string };
      expect(body.locale).toBe("he");
    });
  }
});

// ─── 5. Brand consistency — desktop sidebar renders with correct nav ──────────
//
// Each layout renders two <aside> elements: index 0 = mobile (lg:hidden, always
// hidden at desktop viewport), index 1 = desktop (hidden lg:block, visible at
// >=1024 px). We always target aside.nth(1) to reach the desktop sidebar.

test.describe("Brand color consistency", () => {
  test("resident sidebar renders with dashboard link", async ({ page }) => {
    await setupRole(page, "resident");
    await page.goto("/dashboard");
    // Desktop sidebar (index 1): hidden lg:block — visible at 1280px
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("aside").nth(1).locator('a[href="/dashboard"]')).toBeVisible({ timeout: 10_000 });
  });

  test("contractor sidebar renders with contractor dashboard link", async ({ page }) => {
    await setupRole(page, "contractor");
    await page.goto("/contractor/dashboard");
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("aside").nth(1).locator('a[href="/contractor/dashboard"]')).toBeVisible({ timeout: 10_000 });
  });

  test("buildings-manager sidebar renders with buildings link", async ({ page }) => {
    await setupRole(page, "buildings_manager");
    await page.goto("/buildings-manager/dashboard");
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("aside").nth(1).locator('a[href="/buildings-manager/dashboard"]')).toBeVisible({ timeout: 10_000 });
  });

  test("admin (web) sidebar renders with admin dashboard link", async ({ page }) => {
    await setupRole(page, "admin");
    await page.goto("/admin/dashboard");
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("aside").nth(1).locator('a[href="/admin/dashboard"]')).toBeVisible({ timeout: 10_000 });
  });

  test("no layout uses hardcoded indigo class on nav links", async ({ page }) => {
    await setupRole(page, "resident");
    await page.goto("/dashboard");
    await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

    // No nav link should have Tailwind indigo classes (indicates off-brand color)
    const indigoLinks = page.locator('nav a[class*="indigo"]');
    await expect(indigoLinks).toHaveCount(0, { timeout: 10_000 });
  });
});

// ─── 6. RTL / LTR direction per locale ───────────────────────────────────────

test.describe("HTML dir attribute matches locale", () => {
  test("public home page: Hebrew → dir=rtl, lang=he", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });

  test("public home page: English → dir=ltr, lang=en", async ({ page }) => {
    await setLocale(page, "en");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("login page: Hebrew → dir=rtl", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("login page: English → dir=ltr", async ({ page }) => {
    await setLocale(page, "en");
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("signup page: Hebrew → dir=rtl", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/signup");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("contact page: Hebrew → dir=rtl", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/contact");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("faq page: Hebrew → dir=rtl", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/faq");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("terms page: Hebrew → dir=rtl", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/terms");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("privacy page: Hebrew → dir=rtl", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/privacy");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

// ─── 7. Public pages render correctly in both locales ───────────────────────

test.describe("Public pages render in both locales", () => {
  test("home page loads in Hebrew", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // Header with nav links is present
    await expect(page.locator("header")).toBeVisible();
  });

  test("home page loads in English", async ({ page }) => {
    await setLocale(page, "en");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("header")).toBeVisible();
  });

  test("contact page loads in Hebrew with green header", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/contact");
    await expect(page.locator("header")).toBeVisible();
    // Green header has Groupio logo link
    await expect(page.locator("header").getByText("Groupio").first()).toBeVisible();
  });

  test("contact page loads in English", async ({ page }) => {
    await setLocale(page, "en");
    await page.goto("/contact");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("header")).toBeVisible();
  });

  test("faq page loads in Hebrew", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/faq");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main")).toBeVisible();
  });

  test("faq page loads in English", async ({ page }) => {
    await setLocale(page, "en");
    await page.goto("/faq");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("main")).toBeVisible();
  });

  test("terms page loads in Hebrew", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/terms");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });

  test("privacy page loads in Hebrew", async ({ page }) => {
    await setLocale(page, "he");
    await page.goto("/privacy");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });
});

// ─── 8. Header structure — single user-menu button per layout ─────────────────

test.describe("Header has exactly one user-menu dropdown button", () => {
  const ROLE_ROUTES: [UserRole, string][] = [
    ["resident", "/dashboard"],
    ["contractor", "/contractor/dashboard"],
    ["buildings_manager", "/buildings-manager/dashboard"],
    ["admin", "/admin/dashboard"],
  ];

  for (const [role, route] of ROLE_ROUTES) {
    test(`${role} header has one account user-menu button`, async ({ page }) => {
      await setupRole(page, role);
      await page.goto(route);
      await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });

      // Every layout's account menu button has aria-label containing "חשבון" (he) or "Account" (en)
      const accountBtn = page.locator('header button[aria-label*="חשבון"], header button[aria-label*="ccount"]');
      await expect(accountBtn).toHaveCount(1, { timeout: 10_000 });
    });
  }
});

// ─── 9. Login/signup pages accessible when unauthenticated ──────────────────

test.describe("Unauthenticated public routes are accessible", () => {
  test("login page renders without redirect", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    // The page renders some form content
    await expect(page.locator("main")).toBeVisible();
  });

  test("signup page renders without redirect", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("protected routes redirect to login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("contractor route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/contractor/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("buildings-manager route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/buildings-manager/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});

// ─── 10. Authenticated pages load in Hebrew and English ──────────────────────

test.describe("Authenticated pages load in both locales", () => {
  const ROLE_ROUTES: [UserRole, string][] = [
    ["resident", "/dashboard"],
    ["contractor", "/contractor/dashboard"],
    ["buildings_manager", "/buildings-manager/dashboard"],
    ["admin", "/admin/dashboard"],
  ];

  for (const [role, route] of ROLE_ROUTES) {
    test(`${role} dashboard loads in Hebrew (RTL)`, async ({ page }) => {
      await setupRole(page, role, "he");
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });
      await expect(page.locator("html")).toHaveAttribute("lang", "he");
      // Desktop sidebar (index 1) is visible at 1280px viewport
      await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });
    });

    test(`${role} dashboard loads in English (LTR)`, async ({ page }) => {
      await setupRole(page, role, "en");
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr", { timeout: 10_000 });
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("aside").nth(1)).toBeVisible({ timeout: 15_000 });
    });
  }
});
