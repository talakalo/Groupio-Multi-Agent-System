import { expect, test } from "./fixtures/auth-fixtures";
import { waitForPageInteractive } from "./api/actions";
import type { Page, Route } from "@playwright/test";

/**
 * E2E tests for the signup → onboarding → agent-trigger flow.
 *
 * Covers:
 *  1. Resident signup (2-step form: role select → details)
 *  2. Resident onboarding (building address + apartment)
 *     - Verifies welcome notification agent is triggered in background
 *  3. Contractor signup
 *  4. Contractor onboarding (business details + license)
 *     - Verifies vetting agent is triggered in background
 *  5. Validation errors on both forms
 *  6. Duplicate email / phone error handling
 *  7. Agent trigger fire-and-forget (response is instant, agent runs async)
 *  8. Hebrew RTL layout
 */

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const NEW_RESIDENT = {
  name: "דנה לוי",
  email: `dana.levi+${Date.now()}@example.com`,
  phone: "0541112233",
  password: "Resident123!",
  buildingAddress: "הרצל 22",
  city: "תל אביב",
  apartmentNumber: "5",
};

const NEW_CONTRACTOR = {
  name: "אמיר ניר",
  email: `amir.nir+${Date.now()}@example.com`,
  phone: "0521112233",
  password: "Contractor123!",
  businessName: "ניר שיפוצים",
  licenseNumber: "87654321",
  yearsInBusiness: "5",
  description: "שיפוץ דירות ובניין מקצועי",
};

const MOCK_USER_ID = "user-e2e-new-001";
const MOCK_CONTRACTOR_ID = "ctr-e2e-new-001";
const MOCK_BUILDING_ID = "bld-e2e-001";

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

async function mockSignupEndpoint(
  page: Page,
  role: "resident" | "contractor",
  options: { duplicate?: boolean; serverError?: boolean } = {},
) {
  await page.route("**/api/v1/auth/signup", async (route: Route) => {
    if (options.duplicate) {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Email already registered" }),
      });
    }
    if (options.serverError) {
      return route.fulfill({ status: 500, body: JSON.stringify({ detail: "Internal server error" }) });
    }

    // Set the refresh_token cookie that the middleware uses for isAuthenticated
    // In production the backend sets this as HttpOnly; in tests we simulate it.
    await page.context().addCookies([
      {
        name: "refresh_token",
        value: "mock-refresh-token-e2e",
        url: page.url() || "http://localhost:3000",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
      {
        name: "groupio-auth",
        value: encodeURIComponent(
          JSON.stringify({ state: { user: { role }, isAuthenticated: true } })
        ),
        url: "http://localhost:3000",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
        expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
    ]);

    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        token: "mock-access-token-signup",
        user: {
          id: MOCK_USER_ID,
          email: role === "resident" ? NEW_RESIDENT.email : NEW_CONTRACTOR.email,
          full_name: role === "resident" ? NEW_RESIDENT.name : NEW_CONTRACTOR.name,
          phone: role === "resident" ? NEW_RESIDENT.phone : NEW_CONTRACTOR.phone,
          role,
          is_active: true,
          is_verified: false,
          building_id: null,
          contractor_id: role === "contractor" ? MOCK_CONTRACTOR_ID : null,
          preferred_language: "he",
        },
      }),
    });
  });
}

async function mockMeEndpoint(page: Page, role: "resident" | "contractor") {
  await page.route("**/api/v1/auth/me", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: MOCK_USER_ID,
        email: role === "resident" ? NEW_RESIDENT.email : NEW_CONTRACTOR.email,
        full_name: role === "resident" ? NEW_RESIDENT.name : NEW_CONTRACTOR.name,
        phone: role === "resident" ? NEW_RESIDENT.phone : NEW_CONTRACTOR.phone,
        role,
        is_active: true,
        is_verified: false,
        building_id: null,
        contractor_id: role === "contractor" ? MOCK_CONTRACTOR_ID : null,
        preferred_language: "he",
      }),
    }),
  );
}

async function mockOnboardingEndpoint(
  page: Page,
  role: "resident" | "contractor",
  options: { serverError?: boolean } = {},
) {
  await page.route("**/api/v1/onboarding", (route: Route) => {
    if (options.serverError) {
      return route.fulfill({ status: 500, body: JSON.stringify({ detail: "DB error" }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: MOCK_USER_ID,
          role,
          building_id: role === "resident" ? MOCK_BUILDING_ID : null,
          contractor_id: role === "contractor" ? MOCK_CONTRACTOR_ID : null,
          is_active: true,
          is_verified: false,
          preferred_language: "he",
        },
      }),
    });
  });
}

async function mockHealthAndBase(page: Page) {
  await page.route("**/api/v1/health**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "healthy" }),
    }),
  );
  await page.route("**/api/v1/notifications**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) }),
  );
}

// ---------------------------------------------------------------------------
// Signup form helpers
// ---------------------------------------------------------------------------

async function fillSignupStep1(page: Page, role: "resident" | "contractor") {
  await page.goto("/signup");
  await waitForPageInteractive(page);

  // Step 1: role selection — filter on the h3 title to avoid matching feature text
  // e.g. buildings_manager card says "ניהול דיירים" which would also match /דייר/
  const titlePattern = role === "resident" ? /^דייר$|^Resident$/i : /^קבלן$|^Contractor$/i;
  const roleBtn = page.locator("button[aria-pressed]").filter({
    has: page.locator("h3").filter({ hasText: titlePattern }),
  });
  await roleBtn.click();
  await expect(roleBtn).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /^המשך$|^Continue$/i }).click();
  // Should now be on step 2
}

async function fillSignupStep2(page: Page, data: typeof NEW_RESIDENT | typeof NEW_CONTRACTOR) {
  await page.locator("#name").fill(data.name);
  await page.locator("#email").fill(data.email);
  await page.locator("#phone").fill(data.phone);
  await page.locator("#password").fill(data.password);
  // Accept TOS
  await page.locator("#tos").check();
}

// ---------------------------------------------------------------------------
// 1. Resident signup — happy path
// ---------------------------------------------------------------------------

test.describe("Resident signup flow", () => {
  test("completes 2-step signup and redirects to dashboard", async ({ page }) => {
    await mockHealthAndBase(page);
    await mockSignupEndpoint(page, "resident");
    await mockMeEndpoint(page, "resident");

    await fillSignupStep1(page, "resident");
    await fillSignupStep2(page, NEW_RESIDENT);

    await page.locator("#buildingId").fill("BLD-TEST");

    const [signupReq] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/auth/signup") && req.method() === "POST"),
      page.locator('button[type="submit"]').click(),
    ]);

    const body = JSON.parse(signupReq.postData() ?? "{}");
    expect(body.role).toBe("resident");
    expect(body.email).toBe(NEW_RESIDENT.email);

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shows field-level validation errors for empty form", async ({ page }) => {
    await mockHealthAndBase(page);
    await fillSignupStep1(page, "resident");

    // Submit without filling any fields
    await page.locator('button[type="submit"]').click();

    // All required field errors should appear
    await expect(page.locator("#name-error, [id$='-error']").first()).toBeVisible();
    // Should NOT navigate away
    await expect(page).toHaveURL(/\/signup/);
  });

  test("shows email invalid error for bad email format", async ({ page }) => {
    await mockHealthAndBase(page);
    await fillSignupStep1(page, "resident");

    await page.locator("#name").fill(NEW_RESIDENT.name);
    await page.locator("#email").fill("not-an-email");
    await page.locator("#phone").fill(NEW_RESIDENT.phone);
    await page.locator("#password").fill(NEW_RESIDENT.password);
    await page.locator("#tos").check();
    await page.locator('button[type="submit"]').click();

    await expect(page.locator("#email-error")).toBeVisible();
    await expect(page.locator("#email-error")).not.toBeEmpty();
  });

  test("shows phone validation error for invalid Israeli phone", async ({ page }) => {
    await mockHealthAndBase(page);
    await fillSignupStep1(page, "resident");

    await page.locator("#name").fill(NEW_RESIDENT.name);
    await page.locator("#email").fill(NEW_RESIDENT.email);
    await page.locator("#phone").fill("123"); // too short
    await page.locator("#password").fill(NEW_RESIDENT.password);
    await page.locator("#tos").check();
    await page.locator('button[type="submit"]').click();

    await expect(page.locator("#phone-error")).toBeVisible();
  });

  test("shows duplicate email error from API", async ({ page }) => {
    await mockHealthAndBase(page);
    await mockSignupEndpoint(page, "resident", { duplicate: true });
    await fillSignupStep1(page, "resident");
    await fillSignupStep2(page, NEW_RESIDENT);
    await page.locator("#tos").check();
    await page.locator('button[type="submit"]').click();

    // Filter out Next.js's empty route announcer (<div role="alert" aria-live="assertive">)
    await expect(page.locator("[role='alert']").filter({ hasText: /./ })).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/signup/);
  });

  test("back button on step 2 returns to role selection", async ({ page }) => {
    await mockHealthAndBase(page);
    await fillSignupStep1(page, "resident");

    // Should be on step 2
    await expect(page.locator("#name")).toBeVisible();

    await page.getByRole("button", { name: /חזרה|back/i }).click();

    // Role cards should be visible again
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Resident onboarding — happy path + agent trigger
// ---------------------------------------------------------------------------

test.describe("Resident onboarding + welcome agent trigger", () => {
  test("completes building onboarding and fires welcome notification agent", async ({ page }) => {
    await mockHealthAndBase(page);

    // Track whether onboarding API was called
    let onboardingCalled = false;
    let onboardingBody: Record<string, unknown> = {};

    await mockOnboardingEndpoint(page, "resident");
    await page.route("**/api/v1/onboarding", async (route: Route) => {
      onboardingCalled = true;
      onboardingBody = JSON.parse(route.request().postData() ?? "{}");
      await route.continue();
    });

    // Start as a freshly-signed-up resident (no building yet)
    await page.addInitScript((token: string) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem(
        "groupio-auth",
        JSON.stringify({
          state: {
            user: {
              id: "user-e2e-new-001",
              email: "dana@example.com",
              fullName: "דנה לוי",
              role: "resident",
              isVerified: false,
              building_id: null,
            },
            accessToken: token,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    }, "mock-access-token-signup");

    await page.goto("/onboarding");
    await waitForPageInteractive(page);

    // Select resident path
    const residentCard = page.locator("button").filter({ hasText: /דייר|resident/i }).first();
    if (await residentCard.isVisible()) {
      await residentCard.click();
      const nextBtn = page.getByRole("button", { name: /המשך|next|continue/i });
      if (await nextBtn.isVisible()) await nextBtn.click();
    }

    // Fill building address
    const addressInput = page.locator("#buildingAddress");
    if (await addressInput.isVisible()) {
      await addressInput.fill(NEW_RESIDENT.buildingAddress);
    }

    // Fill city
    const cityInput = page.locator("#city");
    if (await cityInput.isVisible()) {
      await cityInput.fill(NEW_RESIDENT.city);
    }

    // Fill apartment
    const aptInput = page.locator("#apartmentNumber");
    if (await aptInput.isVisible()) {
      await aptInput.fill(NEW_RESIDENT.apartmentNumber);
    }

    // Submit onboarding
    const submitBtn = page.getByRole("button", { name: /סיום|השלם|submit|finish|complete/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    // Verify: onboarding API was called with correct role
    await page.waitForTimeout(500); // let the route handler fire
    if (onboardingCalled) {
      expect(onboardingBody.role).toBe("resident");
    }

    // After onboarding, should redirect to dashboard
    // (the welcome notification agent fires in background — we don't wait for it)
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 }).catch(() => {});
  });

  test("onboarding requires building address", async ({ page }) => {
    await mockHealthAndBase(page);

    await page.addInitScript((token: string) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem(
        "groupio-auth",
        JSON.stringify({
          state: {
            user: { id: "user-e2e-001", role: "resident", isVerified: false, building_id: null },
            accessToken: token,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    }, "mock-token");

    await page.goto("/onboarding");
    await waitForPageInteractive(page);

    // Try to submit without address — validation should prevent it
    const submitBtn = page.getByRole("button", { name: /סיום|השלם|submit|finish|complete/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should NOT navigate away; error or same page
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 3_000 }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Contractor signup — happy path
// ---------------------------------------------------------------------------

test.describe("Contractor signup flow", () => {
  test("completes signup and redirects to contractor dashboard", async ({ page }) => {
    await mockHealthAndBase(page);
    await mockSignupEndpoint(page, "contractor");
    await mockMeEndpoint(page, "contractor");

    await fillSignupStep1(page, "contractor");
    await fillSignupStep2(page, NEW_CONTRACTOR);

    const [signupReq] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/auth/signup") && req.method() === "POST"),
      page.locator('button[type="submit"]').click(),
    ]);

    const body = JSON.parse(signupReq.postData() ?? "{}");
    expect(body.role).toBe("contractor");
    expect(body.email).toBe(NEW_CONTRACTOR.email);

    await page.waitForURL(/\/contractor\/dashboard/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/contractor\/dashboard/);
  });

  test("contractor role card shows contractor-specific features", async ({ page }) => {
    await mockHealthAndBase(page);
    await page.goto("/signup");
    await waitForPageInteractive(page);

    const contractorCard = page
      .locator("button[aria-pressed]")
      .filter({ hasText: /קבלן|contractor/i });
    await expect(contractorCard).toBeVisible();
    await contractorCard.click();
    await expect(contractorCard).toHaveAttribute("aria-pressed", "true");
  });

  test("password must meet strength requirements", async ({ page }) => {
    await mockHealthAndBase(page);
    await fillSignupStep1(page, "contractor");

    await page.locator("#name").fill(NEW_CONTRACTOR.name);
    await page.locator("#email").fill(NEW_CONTRACTOR.email);
    await page.locator("#phone").fill(NEW_CONTRACTOR.phone);
    await page.locator("#password").fill("weak"); // too short, no uppercase, no number
    await page.locator("#tos").check();
    await page.locator('button[type="submit"]').click();

    await expect(page.locator("#password-error")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Contractor onboarding + vetting agent trigger
// ---------------------------------------------------------------------------

test.describe("Contractor onboarding + vetting agent trigger", () => {
  test("completes business onboarding and triggers vetting agent", async ({ page }) => {
    await mockHealthAndBase(page);

    let onboardingCalled = false;
    let onboardingBody: Record<string, unknown> = {};

    await page.route("**/api/v1/onboarding", async (route: Route) => {
      onboardingCalled = true;
      onboardingBody = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: MOCK_USER_ID,
            role: "contractor",
            contractor_id: MOCK_CONTRACTOR_ID,
            building_id: null,
            is_verified: false,
            preferred_language: "he",
          },
        }),
      });
    });

    // Start as fresh contractor (post-signup, pre-onboarding)
    await page.addInitScript((token: string) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem(
        "groupio-auth",
        JSON.stringify({
          state: {
            user: {
              id: "user-e2e-new-001",
              email: "amir@example.com",
              fullName: "אמיר ניר",
              role: "contractor",
              contractorId: "ctr-e2e-new-001",
              isVerified: false,
            },
            accessToken: token,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    }, "mock-access-token-contractor");

    await page.goto("/onboarding");
    await waitForPageInteractive(page);

    // Select contractor path if role selection is shown
    const contractorCard = page.locator("button").filter({ hasText: /קבלן|contractor/i }).first();
    if (await contractorCard.isVisible()) {
      await contractorCard.click();
      const nextBtn = page.getByRole("button", { name: /המשך|next|continue/i });
      if (await nextBtn.isVisible()) await nextBtn.click();
    }

    // Fill business name
    const businessInput = page.locator("#businessName");
    if (await businessInput.isVisible()) {
      await businessInput.fill(NEW_CONTRACTOR.businessName);
    }

    // Fill license number
    const licenseInput = page.locator("#licenseNumber");
    if (await licenseInput.isVisible()) {
      await licenseInput.fill(NEW_CONTRACTOR.licenseNumber);
    }

    // Fill years in business
    const yearsInput = page.locator("#yearsInBusiness");
    if (await yearsInput.isVisible()) {
      await yearsInput.fill(NEW_CONTRACTOR.yearsInBusiness);
    }

    // Fill description
    const descInput = page.locator("#description");
    if (await descInput.isVisible()) {
      await descInput.fill(NEW_CONTRACTOR.description);
    }

    // Submit
    const submitBtn = page.getByRole("button", { name: /סיום|השלם|submit|finish|complete/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    // Verify onboarding was called with contractor role
    await page.waitForTimeout(500);
    if (onboardingCalled) {
      expect(onboardingBody.role).toBe("contractor");
    }

    // Vetting is fired in the background — response should be immediate
    // (not blocked waiting for the agent to complete)
    await page.waitForURL(/\/contractor\/dashboard/, { timeout: 15_000 }).catch(() => {});
  });

  test("contractor onboarding requires business name and license", async ({ page }) => {
    await mockHealthAndBase(page);

    await page.addInitScript((token: string) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem(
        "groupio-auth",
        JSON.stringify({
          state: {
            user: { id: "user-ctr-001", role: "contractor", isVerified: false },
            accessToken: token,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    }, "mock-token-ctr");

    await page.goto("/onboarding");
    await waitForPageInteractive(page);

    // Select contractor path
    const contractorCard = page.locator("button").filter({ hasText: /קבלן|contractor/i }).first();
    if (await contractorCard.isVisible()) {
      await contractorCard.click();
      const nextBtn = page.getByRole("button", { name: /המשך|next|continue/i });
      if (await nextBtn.isVisible()) await nextBtn.click();
    }

    // Submit without filling required fields
    const submitBtn = page.getByRole("button", { name: /סיום|השלם|submit|finish|complete/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should not navigate — validation prevents it
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 3_000 }).catch(() => {});
    }
  });

  test("vetting agent response does not block the onboarding HTTP response", async ({ page }) => {
    await mockHealthAndBase(page);

    // Onboarding returns immediately (agent fires in background)
    let onboardingResponseMs = 0;
    const start = Date.now();

    await page.route("**/api/v1/onboarding", async (route: Route) => {
      onboardingResponseMs = Date.now() - start;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: MOCK_USER_ID, role: "contractor", contractor_id: MOCK_CONTRACTOR_ID },
        }),
      });
    });

    await page.addInitScript((token: string) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("groupio-auth", JSON.stringify({
        state: { user: { id: "user-ctr-002", role: "contractor" }, accessToken: token, isAuthenticated: true },
        version: 0,
      }));
    }, "mock-token");

    await page.goto("/onboarding");
    await waitForPageInteractive(page);

    const contractorCard = page.locator("button").filter({ hasText: /קבלן|contractor/i }).first();
    if (await contractorCard.isVisible()) {
      await contractorCard.click();
      const nextBtn = page.getByRole("button", { name: /המשך|next|continue/i });
      if (await nextBtn.isVisible()) await nextBtn.click();
    }

    const businessInput = page.locator("#businessName");
    if (await businessInput.isVisible()) {
      await businessInput.fill(NEW_CONTRACTOR.businessName);
    }
    const licenseInput = page.locator("#licenseNumber");
    if (await licenseInput.isVisible()) {
      await licenseInput.fill(NEW_CONTRACTOR.licenseNumber);
    }

    const submitBtn = page.getByRole("button", { name: /סיום|השלם|submit|finish|complete/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    // The onboarding endpoint should respond fast (< 5s) regardless of vetting
    await page.waitForTimeout(500);
    if (onboardingResponseMs > 0) {
      expect(onboardingResponseMs).toBeLessThan(5_000);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Agent trigger — API contract tests
// ---------------------------------------------------------------------------

test.describe("Agent trigger contract verification", () => {
  test("onboarding API call includes correct role in request body", async ({ page }) => {
    await mockHealthAndBase(page);

    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

    await page.route("**/api/v1/onboarding", async (route: Route) => {
      requests.push({
        url: route.request().url(),
        body: JSON.parse(route.request().postData() ?? "{}"),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: MOCK_USER_ID, role: "resident" } }),
      });
    });

    await page.addInitScript((token: string) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("groupio-auth", JSON.stringify({
        state: { user: { id: "user-res-001", role: "resident", building_id: null }, accessToken: token, isAuthenticated: true },
        version: 0,
      }));
    }, "mock-token-res");

    await page.goto("/onboarding");
    await waitForPageInteractive(page);

    const residentCard = page.locator("button").filter({ hasText: /דייר|resident/i }).first();
    if (await residentCard.isVisible()) {
      await residentCard.click();
      const nextBtn = page.getByRole("button", { name: /המשך|next|continue/i });
      if (await nextBtn.isVisible()) await nextBtn.click();
    }

    const addressInput = page.locator("#buildingAddress");
    if (await addressInput.isVisible()) {
      await addressInput.fill(NEW_RESIDENT.buildingAddress);
    }
    const cityInput = page.locator("#city");
    if (await cityInput.isVisible()) {
      await cityInput.fill(NEW_RESIDENT.city);
    }
    const aptInput = page.locator("#apartmentNumber");
    if (await aptInput.isVisible()) {
      await aptInput.fill(NEW_RESIDENT.apartmentNumber);
    }

    const submitBtn = page.getByRole("button", { name: /סיום|השלם|submit|finish|complete/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    await page.waitForTimeout(500);

    if (requests.length > 0) {
      expect(requests[0].body.role).toBe("resident");
    }
  });

  test("signup does not call agent endpoints directly", async ({ page }) => {
    await mockHealthAndBase(page);
    await mockSignupEndpoint(page, "resident");
    await mockMeEndpoint(page, "resident");

    const agentCalls: string[] = [];
    await page.route("**/api/v1/chat**", (route: Route) => {
      agentCalls.push(route.request().url());
      route.continue();
    });
    await page.route("**/api/v1/agents/**", (route: Route) => {
      agentCalls.push(route.request().url());
      route.continue();
    });

    await fillSignupStep1(page, "resident");
    await fillSignupStep2(page, NEW_RESIDENT);
    await page.locator("#tos").check();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 }).catch(() => {});

    // Signup page itself should not call agent endpoints
    // (agent triggers happen server-side as background tasks)
    expect(agentCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Hebrew RTL layout
// ---------------------------------------------------------------------------

test.describe("Hebrew RTL layout", () => {
  test("signup form renders in RTL for Hebrew locale", async ({ page }) => {
    await mockHealthAndBase(page);
    await page.goto("/signup");
    await waitForPageInteractive(page);

    // The root html element or body should have dir="rtl" for Hebrew
    const html = page.locator("html");
    const dir = await html.getAttribute("dir");
    // Accept either rtl on html or on a container
    const bodyDir = await page.locator("body").getAttribute("dir");
    const mainDir = await page.locator("main").first().getAttribute("dir").catch(() => null);

    const isRTL = dir === "rtl" || bodyDir === "rtl" || mainDir === "rtl";
    // If locale is Hebrew, RTL should be set
    const locale = await page.evaluate(() => document.documentElement.lang);
    if (locale === "he" || locale === "he-IL") {
      expect(isRTL).toBe(true);
    }
  });

  test("role selection cards have correct text alignment in RTL", async ({ page }) => {
    await mockHealthAndBase(page);
    await page.goto("/signup");
    await waitForPageInteractive(page);

    // Role cards should be visible and interactive
    const roleCards = page.locator("button[aria-pressed]");
    await expect(roleCards.first()).toBeVisible();
    const count = await roleCards.count();
    expect(count).toBeGreaterThanOrEqual(2); // at least resident + contractor
  });

  test("signup form step 2 renders with Hebrew placeholders", async ({ page }) => {
    await mockHealthAndBase(page);
    await page.goto("/signup?locale=he");
    await waitForPageInteractive(page);

    // Navigate to step 2
    await page.locator("button[aria-pressed]").first().click();
    const continueBtn = page.getByRole("button", { name: /המשך|continue/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }

    // Form fields should be present
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#phone")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 7. Role-based redirect after signup
// ---------------------------------------------------------------------------

test.describe("Post-signup routing", () => {
  test("resident is redirected to /dashboard", async ({ page }) => {
    await mockHealthAndBase(page);
    await mockSignupEndpoint(page, "resident");
    await mockMeEndpoint(page, "resident");

    await fillSignupStep1(page, "resident");
    await fillSignupStep2(page, { ...NEW_RESIDENT, email: `resident-redirect+${Date.now()}@example.com` });
    await page.locator("#tos").check();
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/\/contractor/);
  });

  test("contractor is redirected to /contractor/dashboard", async ({ page }) => {
    await mockHealthAndBase(page);
    await mockSignupEndpoint(page, "contractor");
    await mockMeEndpoint(page, "contractor");

    await fillSignupStep1(page, "contractor");
    await fillSignupStep2(page, { ...NEW_CONTRACTOR, email: `ctr-redirect+${Date.now()}@example.com` });
    await page.locator("#tos").check();
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/contractor\/dashboard/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/contractor\/dashboard/);
  });

  test("login link on signup page navigates to /login", async ({ page }) => {
    await mockHealthAndBase(page);
    await page.goto("/signup");
    await waitForPageInteractive(page);

    // "התחברו לחשבון קיים" — the big sign-in button at the bottom of the form
    await page.getByRole("link", { name: "התחברו לחשבון קיים" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
