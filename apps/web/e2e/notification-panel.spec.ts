import { setupAuthAndMocks, setupDefaultNotificationMocks } from "./api/actions";
import { test, expect } from "./api/test";
import { createMockResponse } from "./helpers/factory.util";

test.describe("NotificationPanel (mock API)", () => {
  test("empty state when there are no notifications", async ({ page }) => {
    await setupAuthAndMocks(page, "resident", { skipDefaultNotifications: true });
    await setupDefaultNotificationMocks(page);

    await page.goto("/dashboard");
    await page.getByTestId("notification-panel-trigger").click();
    await expect(page.getByTestId("notification-panel-dialog")).toBeVisible();
    await expect(page.getByTestId("notification-panel-empty")).toBeVisible();
  });

  test("shows unread badge, list, mark one read, and mark all read", async ({ page }) => {
    await setupAuthAndMocks(page, "resident", { skipDefaultNotifications: true });

    const item = {
      id: "n1",
      type: "info",
      title: "הצעה חדשה",
      body: "פרטים",
      data: null,
      read: false,
      created_at: new Date().toISOString(),
    };

    let readCalls = 0;
    let readAllCalls = 0;

    await page.route("**/api/v1/notifications**", async (route) => {
      const req = route.request();
      const url = req.url();

      if (url.includes("unread-count")) {
        await route.fulfill(createMockResponse({ count: 1 }));
        return;
      }
      if (req.method() === "POST" && url.includes("/read-all")) {
        readAllCalls += 1;
        await route.fulfill(createMockResponse({ status: "ok" }));
        return;
      }
      if (req.method() === "POST" && /\/notifications\/[^/]+\/read/.test(url)) {
        readCalls += 1;
        item.read = true;
        await route.fulfill(createMockResponse({ status: "ok" }));
        return;
      }

      await route.fulfill(
        createMockResponse({
          items: [item],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      );
    });

    await page.goto("/dashboard");
    await page.getByTestId("notification-panel-trigger").click();
    await expect(page.getByText("הצעה חדשה")).toBeVisible();

    await page.getByText("הצעה חדשה").hover();
    await page
      .getByTestId("notification-panel-dialog")
      .locator('button[aria-label="סמן כנקרא"]')
      .click({ force: true });
    await expect.poll(() => readCalls).toBe(1);

    readAllCalls = 0;
    item.read = false;
    await page.getByTestId("notification-mark-all-read").click();
    await expect.poll(() => readAllCalls).toBe(1);
  });

  test("error state and retry refetches", async ({ page }) => {
    await setupAuthAndMocks(page, "resident", { skipDefaultNotifications: true });

    const ctrl = { failNextNotificationList: false };
    let listGets = 0;

    await page.route("**/api/v1/notifications**", async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes("unread-count")) {
        await route.fulfill(createMockResponse({ count: 0 }));
        return;
      }
      if (req.method() === "GET" && !url.includes("unread-count")) {
        listGets += 1;
        if (ctrl.failNextNotificationList) {
          ctrl.failNextNotificationList = false;
          await route.fulfill(createMockResponse({ detail: "server boom" }, 503));
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
        return;
      }
      await route.fulfill(createMockResponse({ status: "ok" }));
    });

    // Capture the initial mount fetch before navigating so we can wait for
    // it to complete before enabling failure mode. waitForTimeout(500) was
    // flaky on CI — the mount fetch can take >500 ms on slow runners, and
    // if it is still in-flight when failNextNotificationList is set, the
    // mount fetch (not the panel-open fetch) consumes the fail flag.
    const initialFetch = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/v1/notifications") &&
        !r.url().includes("unread-count"),
      { timeout: 30_000 },
    );
    await page.goto("/dashboard");
    await expect(page.getByTestId("notification-panel-trigger")).toBeVisible({
      timeout: 30_000,
    });
    await initialFetch; // wait for the mount fetch to finish
    ctrl.failNextNotificationList = true;
    const failedList = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/v1/notifications") &&
        !r.url().includes("unread-count") &&
        r.status() === 503,
      { timeout: 30_000 },
    );
    await page.getByTestId("notification-panel-trigger").click();
    await failedList;
    await expect(
      page.getByTestId("notification-panel-dialog").getByRole("alert"),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("notification-retry").click();
    await expect.poll(() => listGets).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("notification-panel-empty")).toBeVisible();
  });

  test("optimistic rollback when mark-single read fails", async ({ page }) => {
    await setupAuthAndMocks(page, "resident", { skipDefaultNotifications: true });

    const item = {
      id: "n-rollback",
      type: "info",
      title: "צריך סימון",
      body: null,
      data: null,
      read: false,
      created_at: new Date().toISOString(),
    };

    await page.route("**/api/v1/notifications**", async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes("unread-count")) {
        await route.fulfill(createMockResponse({ count: 1 }));
        return;
      }
      if (req.method() === "POST" && url.includes("/n-rollback/read")) {
        await route.fulfill(createMockResponse({ detail: "fail" }, 500));
        return;
      }
      await route.fulfill(
        createMockResponse({
          items: [item],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      );
    });

    await page.goto("/dashboard");
    await page.getByTestId("notification-panel-trigger").click();
    await expect(page.getByText("צריך סימון")).toBeVisible();

    await page.getByText("צריך סימון").hover();
    // force:true bypasses the opacity-0→opacity-100 CSS transition race:
    // the button is inside a group-hover div and may still be mid-transition
    // when Playwright's actionability check runs, causing flakiness on CI.
    await page
      .getByTestId("notification-panel-dialog")
      .locator('button[aria-label="סמן כנקרא"]')
      .click({ force: true });

    await expect(
      page.getByTestId("notification-panel-dialog").getByRole("alert"),
    ).toContainText(/לא ניתן לעדכן/);
  });

  test("loading skeleton visible when list is slow", async ({ page }) => {
    await setupAuthAndMocks(page, "resident", { skipDefaultNotifications: true });

    let listPass = 0;
    await page.route("**/api/v1/notifications**", async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes("unread-count")) {
        await route.fulfill(createMockResponse({ count: 0 }));
        return;
      }
      if (req.method() === "GET" && !url.includes("unread-count")) {
        listPass += 1;
        if (listPass === 1) {
          await route.fulfill(
            createMockResponse({
              items: [],
              total: 0,
              limit: 50,
              offset: 0,
            }),
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
        await route.fulfill(
          createMockResponse({
            items: [],
            total: 0,
            limit: 50,
            offset: 0,
          }),
        );
        return;
      }
      await route.fulfill(createMockResponse({ status: "ok" }));
    });

    // The mount useEffect calls refresh() immediately; if it is still in-flight
    // when we click the trigger, its finally{setLoading(false)} races with the
    // panel-open refresh()'s setLoading(true) and the skeleton never appears.
    // Wait for the mount fetch to resolve before opening the panel.
    const mountDone = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().includes("/api/v1/notifications") &&
        !r.url().includes("unread-count"),
      { timeout: 30_000 },
    );
    await page.goto("/dashboard");
    await expect(page.getByTestId("notification-panel-trigger")).toBeVisible({
      timeout: 30_000,
    });
    await mountDone;
    await page.getByTestId("notification-panel-trigger").click();
    await expect(page.getByTestId("notification-panel-loading")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("notification-panel-empty")).toBeVisible({
      timeout: 15000,
    });
  });
});
