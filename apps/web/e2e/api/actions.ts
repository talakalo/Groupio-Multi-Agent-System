/**
 * Actions — reusable Playwright test actions.
 *
 * These are the equivalent of "Advanced Playwright API" described in the
 * architecture: high-level helpers (openApp, loginAs, setupBaseMocks) that
 * are shared across all spec files instead of being duplicated inside each.
 */

import { type Page, type BrowserContext } from "@playwright/test";
import { envConfig } from "../config/env.config";
import {
  getMockUserForRole,
  type MockUser,
  type UserRole,
} from "../helpers/user.factory";
import {
  createMockResponse,
  createHealthResponse,
  createOfferList,
  createResidentStats,
  createPilotOffer,
} from "../helpers/factory.util";
import testData from "../config/test-data.json";

// ─── App Navigation ──────────────────────────────────────────────────────────

/**
 * Navigate to the app root (or a specific path) and wait for it to be ready.
 */
export async function openApp(page: Page, path = "/"): Promise<void> {
  await page.goto(`${envConfig.baseURL}${path}`);
  await page.waitForLoadState("networkidle");
}

// ─── Authentication ──────────────────────────────────────────────────────────

/**
 * Inject auth state into the browser context so that the Next.js middleware
 * and the Zustand auth store both treat the session as logged in.
 *
 * - Sets `auth_token` in localStorage
 * - Populates the `groupio-auth` Zustand persistence key
 * - Sets `refresh_token` and `groupio-auth` cookies (read by Edge middleware)
 *
 * Must be called BEFORE any page.goto() to take effect.
 */
export async function loginAs(
  page: Page,
  role: UserRole,
  token: string = envConfig.smokeAuthToken,
): Promise<void> {
  const user = getMockUserForRole(role);

  await page.addInitScript(
    (params: { token: string; role: string; user: typeof user }) => {
      localStorage.setItem("auth_token", params.token);
      localStorage.setItem(
        "groupio-auth",
        JSON.stringify({
          state: {
            user: {
              id: params.user.id,
              email: params.user.email,
              fullName: params.user.full_name,
              phone: params.user.phone,
              role: params.role,
              preferredLanguage: params.user.preferred_language,
              isVerified: params.user.is_verified,
            },
            accessToken: params.token,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    },
    { token, role, user },
  );

  await page.context().addCookies([
    {
      name: "refresh_token",
      value: testData.auth.refreshToken,
      url: envConfig.baseURL,
    },
    {
      name: "groupio-auth",
      value: encodeURIComponent(
        JSON.stringify({ state: { user: { role }, isAuthenticated: true } }),
      ),
      url: envConfig.baseURL,
    },
  ]);
}

/**
 * Remove all auth state from the browser context (simulate logout).
 */
export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("groupio-auth");
  });
  await page.context().clearCookies();
}

// ─── API Mocking ─────────────────────────────────────────────────────────────

export type SetupBaseMocksOptions = {
  /** When true, skip default in-app notification routes so specs can register their own. */
  skipDefaultNotifications?: boolean;
  /** Override ``/api/v1/auth/me`` JSON (defaults to resident pilot user). */
  authMeUser?: MockUser;
};

/**
 * Default happy-path mocks for ``NotificationPanel`` (empty list, zero unread).
 */
export async function setupDefaultNotificationMocks(page: Page): Promise<void> {
  await page.route("**/api/v1/notifications**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes("unread-count")) {
      await route.fulfill(createMockResponse({ count: 0 }));
      return;
    }
    if (method === "POST" && url.includes("/read-all")) {
      await route.fulfill(createMockResponse({ status: "ok" }));
      return;
    }
    if (method === "POST" && /\/api\/v1\/notifications\/[^/]+\/read(?:\?|$)/.test(url)) {
      await route.fulfill(createMockResponse({ status: "ok" }));
      return;
    }

    await route.fulfill(
      createMockResponse({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
    );
  });
}

/**
 * Set up the standard set of API mocks needed across multiple tests.
 * Intercepts the most common backend endpoints so tests run without a live API.
 */
export async function setupBaseMocks(
  page: Page,
  opts: SetupBaseMocksOptions = {},
): Promise<void> {
  const authMeUser = opts.authMeUser ?? getMockUserForRole("resident");

  // Health
  await page.route("**/api/v1/health", (r) =>
    r.fulfill(createHealthResponse()),
  );

  // Auth /me
  await page.route("**/api/v1/auth/me", (r) =>
    r.fulfill(createMockResponse(authMeUser)),
  );

  // Offers list
  await page.route("**/api/v1/offers*", (r) =>
    r.fulfill(createMockResponse(createOfferList())),
  );

  // Single offer
  await page.route("**/api/v1/offers/*", (r) =>
    r.fulfill(createMockResponse(createPilotOffer())),
  );

  // Stats
  await page.route("**/api/v1/stats*", (r) =>
    r.fulfill(createMockResponse(createResidentStats())),
  );

  // Conversations (AI chat)
  await page.route("**/api/v1/conversations*", (r) =>
    r.fulfill(createMockResponse([])),
  );

  // Payments
  await page.route("**/api/v1/payments*", (r) =>
    r.fulfill(createMockResponse([])),
  );

  // Buildings /me (detailed building object)
  await page.route("**/api/v1/buildings/me", (r) =>
    r.fulfill(
      createMockResponse({
        id: "bld-pilot",
        name: "בניין רוטשילד 15",
        address: "רוטשילד 15",
        city: "תל אביב",
        region: "tel_aviv",
        total_units: 24,
        floors: 8,
        resident_count: 18,
        active_offers: 2,
        completed_offers: 5,
        total_savings: 45000,
      }),
    ),
  );

  // Buildings (generic list)
  await page.route("**/api/v1/buildings*", (r) =>
    r.fulfill(createMockResponse([])),
  );

  // Activity
  await page.route("**/api/v1/activity/recent*", (r) =>
    r.fulfill(createMockResponse({ items: [], total: 0 })),
  );

  if (!opts.skipDefaultNotifications) {
    await setupDefaultNotificationMocks(page);
  }
}

/**
 * Convenience: set up mocks AND inject auth state for a given role.
 * This is the most common setup pattern for smoke/mock spec files.
 */
export async function setupAuthAndMocks(
  page: Page,
  role: UserRole = "resident",
  opts: SetupBaseMocksOptions = {},
): Promise<void> {
  const authMeUser = opts.authMeUser ?? getMockUserForRole(role);
  await setupBaseMocks(page, { ...opts, authMeUser });
  await loginAs(page, role);
}

// ─── Route Helpers ───────────────────────────────────────────────────────────

/**
 * Mock a specific endpoint to return the given data.
 * Useful for overriding the base mocks in individual tests.
 */
export async function mockEndpoint<T>(
  page: Page,
  pattern: string | RegExp,
  data: T,
  status = 200,
): Promise<void> {
  await page.route(pattern, (r) => r.fulfill(createMockResponse(data, status)));
}

/**
 * Mock an endpoint to return an error response.
 */
export async function mockEndpointError(
  page: Page,
  pattern: string | RegExp,
  status = 500,
  message = "Internal Server Error",
): Promise<void> {
  await page.route(pattern, (r) =>
    r.fulfill(createMockResponse({ detail: message }, status)),
  );
}
