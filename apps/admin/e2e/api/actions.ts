/**
 * Actions — reusable Playwright actions for admin E2E tests.
 */

import { type Page } from "@playwright/test";
import { envConfig } from "../config/env.config";
import { createMockResponse, createSystemHealth, createDashboardStats } from "../helpers/factory.util";

export async function openApp(page: Page, path = "/"): Promise<void> {
  await page.goto(`${envConfig.baseURL}${path}`);
  await page.waitForLoadState("networkidle");
}

/** Inject admin auth state into localStorage and cookies */
export async function loginAsAdmin(page: Page, token = envConfig.smokeAuthToken): Promise<void> {
  await page.addInitScript((params: { token: string }) => {
    localStorage.setItem("admin_token", params.token);
    localStorage.setItem(
      "groupio-admin-auth",
      JSON.stringify({
        state: {
          user: { role: "admin", email: "admin@groupio.co.il", isAuthenticated: true },
          accessToken: params.token,
          isAuthenticated: true,
        },
        version: 0,
      }),
    );
  }, { token });

  await page.context().addCookies([
    { name: "admin_token", value: token, url: envConfig.baseURL },
    { name: "refresh_token", value: "admin-e2e-refresh", url: envConfig.baseURL },
  ]);
}

/** Set up standard admin API mocks */
export async function setupAdminMocks(page: Page): Promise<void> {
  await page.route("**/api/v1/health", (r) =>
    r.fulfill(createMockResponse(createSystemHealth())),
  );

  await page.route("**/api/v1/admin/stats*", (r) =>
    r.fulfill(createMockResponse(createDashboardStats())),
  );

  await page.route("**/api/v1/admin/users*", (r) =>
    r.fulfill(createMockResponse({ items: [], total: 0 })),
  );

  await page.route("**/api/v1/admin/contractors*", (r) =>
    r.fulfill(createMockResponse({ items: [], total: 0 })),
  );

  await page.route("**/api/v1/admin/escalations*", (r) =>
    r.fulfill(createMockResponse({ items: [], total: 0 })),
  );
}

export async function mockEndpoint<T>(
  page: Page,
  pattern: string | RegExp,
  data: T,
  status = 200,
): Promise<void> {
  await page.route(pattern, (r) => r.fulfill(createMockResponse(data, status)));
}
