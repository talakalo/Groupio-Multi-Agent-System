import type { Page } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

/**
 * Set auth cookies so Next.js Edge middleware grants access to protected routes.
 * Middleware checks `refresh_token` cookie (authoritative) and `groupio-auth` (role).
 */
export async function setAuthCookies(
  page: Page,
  role: "resident" | "contractor" = "resident"
): Promise<void> {
  await page.context().addCookies([
    {
      name: "refresh_token",
      value: "mock-refresh-token-e2e",
      url: BASE_URL,
      path: "/",
    },
    {
      name: "groupio-auth",
      value: encodeURIComponent(
        JSON.stringify({
          state: { user: { role }, isAuthenticated: true },
        })
      ),
      url: BASE_URL,
      path: "/",
    },
  ]);
}
