import { test, expect } from './api/test';
import type { Page } from '@playwright/test';
import { loginAsAdmin } from './api/actions';
import { createAdminCredentials } from './helpers/user.factory';

const MOCK_ADMIN_USER = {
  id: 'admin-1',
  email: createAdminCredentials().email,
  role: 'admin',
};

async function setupAdminAuth(page: Page) {
  await loginAsAdmin(page);
}

test.describe('Admin Management Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ADMIN_USER),
      })
    );

    // Mock health endpoint
    await page.route('**/api/v1/health', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ status: 'healthy' }),
      })
    );
  });

  test('should navigate to users page and display user list', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/users*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              id: 'u1',
              name: 'Test User',
              email: 'test@test.com',
              phone: '0541234567',
              role: 'resident',
              status: 'active',
              created_at: '2026-01-15T10:00:00Z',
            },
            {
              id: 'u2',
              name: 'Admin User',
              email: 'admin2@groupio.co.il',
              phone: '0549876543',
              role: 'admin',
              status: 'active',
              created_at: '2026-01-10T10:00:00Z',
            },
          ],
        }),
      })
    );

    await page.goto('/users');

    await expect(page.getByText('Test User')).toBeVisible();
    await expect(page.getByText('Admin User')).toBeVisible();
    await expect(page.getByText('User Management')).toBeVisible();
  });

  test('should search users in the user list', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/users*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              id: 'u1',
              name: 'Test User',
              email: 'test@test.com',
              role: 'resident',
              status: 'active',
              created_at: '2026-01-15T10:00:00Z',
            },
            {
              id: 'u2',
              name: 'Another Person',
              email: 'another@test.com',
              role: 'resident',
              status: 'active',
              created_at: '2026-01-10T10:00:00Z',
            },
          ],
        }),
      })
    );

    await page.goto('/users');

    await expect(page.getByText('Test User')).toBeVisible();

    // Type in the search field — client-side filtering
    await page.fill('input[placeholder*="Search"]', 'Another');

    await expect(page.getByText('Another Person')).toBeVisible();
    await expect(page.getByText('Test User')).not.toBeVisible();
  });

  test('should navigate to offers management', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/offers*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          offers: [
            {
              id: 'offer-1',
              title: 'AC Installation Group Buy',
              category: 'ac_installation',
              building: 'Rothschild 15',
              status: 'pending',
              participants: 8,
              price: 4500,
              flagged: false,
              created_at: '2026-01-20T10:00:00Z',
            },
          ],
        }),
      })
    );

    await page.goto('/offers');

    await expect(page.getByText('Offer Management')).toBeVisible();
    await expect(page.getByText('AC Installation Group Buy')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('should navigate to settings page and display tabs', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/settings*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          general: {
            platformName: 'Groupio',
            supportEmail: 'support@groupio.co.il',
            defaultLanguage: 'he',
          },
          notifications: {
            emailEnabled: true,
            whatsappEnabled: true,
            pushEnabled: false,
            templates: ['welcome', 'offer_created'],
          },
          agents: [
            {
              key: 'router',
              name: 'Router',
              enabled: true,
              confidenceThreshold: 0.85,
              temperature: 0.3,
            },
          ],
          security: {
            rateLimitPerUser: 100,
            jwtExpiryMinutes: 60,
            enforce2FA: true,
            corsOrigins: 'https://app.groupio.co.il',
          },
        }),
      })
    );

    await page.goto('/settings');

    await expect(page.getByText(/system settings/i)).toBeVisible();
    await expect(page.getByText('General')).toBeVisible();
    await expect(page.getByText('Notifications')).toBeVisible();
    await expect(page.getByText('Agents')).toBeVisible();
    await expect(page.getByText('Security')).toBeVisible();
  });

  test('should navigate to audit logs', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/audit-logs*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'log-1',
              user_email: 'admin@groupio.co.il',
              action: 'create',
              resource_type: 'user',
              resource_id: 'user-123',
              ip_address: '192.168.1.1',
              timestamp: '2026-01-26T10:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
          total_pages: 1,
        }),
      })
    );

    await page.goto('/settings/audit-logs');

    await expect(page.getByText(/audit/i)).toBeVisible();
    await expect(page.getByText('admin@groupio.co.il')).toBeVisible();
  });

  test('admin login flow', async ({ page }) => {
    await page.route('**/api/v1/auth/login/json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          token: 'test-token',
        }),
      })
    );

    await page.goto('/login');

    // Fill in the login form
    await page.fill('input[type="email"]', 'admin@groupio.co.il');
    await page.fill('input[type="password"]', 'AdminSecure123!');
    await page.click('button[type="submit"]');

    // After successful login, the page should transition to 2FA step
    await expect(
      page.getByText(/two-factor|verification|2fa|authenticator/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('should suspend a user from users page', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/users', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            users: [
              {
                id: 'u1',
                name: 'Active User',
                email: 'active@test.com',
                role: 'resident',
                status: 'active',
                created_at: '2026-01-15T10:00:00Z',
              },
            ],
          }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/v1/admin/users/u1', (route) => {
      if (route.request().method() === 'PUT') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'u1',
            name: 'Active User',
            email: 'active@test.com',
            role: 'resident',
            status: 'suspended',
          }),
        });
      }
      return route.continue();
    });

    await page.goto('/users');

    await expect(page.getByText('Active User')).toBeVisible();

    // Click the Suspend button
    await page.click('button:has-text("Suspend")');

    // Verify the API was called
    const request = await page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/admin/users/u1') &&
        req.method() === 'PUT'
    );
    const body = request.postDataJSON();
    expect(body.status).toBe('suspended');
  });

  test('should open create admin modal from users page', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/users*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [] }),
      })
    );

    await page.goto('/users');

    // Click Create Admin User
    await page.click('button:has-text("Create Admin User")');

    // Verify the modal form appears
    await expect(page.getByPlaceholder('John Doe')).toBeVisible();
    await expect(page.getByPlaceholder('admin@groupio.co.il')).toBeVisible();
  });

  test('should save settings from settings page', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/settings', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            general: {
              platformName: 'Groupio',
              supportEmail: 'support@groupio.co.il',
              defaultLanguage: 'he',
            },
            notifications: {
              emailEnabled: true,
              whatsappEnabled: true,
              pushEnabled: false,
              templates: ['welcome'],
            },
            agents: [
              {
                key: 'router',
                name: 'Router',
                enabled: true,
                confidenceThreshold: 0.85,
                temperature: 0.3,
              },
            ],
            security: {
              rateLimitPerUser: 100,
              jwtExpiryMinutes: 60,
              enforce2FA: true,
              corsOrigins: 'https://app.groupio.co.il',
            },
          }),
        });
      }
      if (route.request().method() === 'PUT') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: route.request().postData() || '{}',
        });
      }
      return route.continue();
    });

    await page.goto('/settings');

    await expect(page.getByText('General Settings')).toBeVisible();

    // Click the top Save Changes button
    await page.click('button:has-text("Save Changes")');

    // Verify save was triggered
    const request = await page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/admin/settings') &&
        req.method() === 'PUT'
    );
    expect(request).toBeTruthy();
  });

  test('should export CSV from audit logs page', async ({ page }) => {
    await setupAdminAuth(page);

    await page.route('**/api/v1/admin/audit-logs*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'log-1',
              user_email: 'admin@groupio.co.il',
              action: 'create',
              resource_type: 'user',
              resource_id: 'user-123',
              ip_address: '192.168.1.1',
              timestamp: '2026-01-26T10:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 25,
          total_pages: 1,
        }),
      })
    );

    await page.goto('/settings/audit-logs');

    await expect(page.getByText('admin@groupio.co.il')).toBeVisible();

    // Click Export CSV
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export CSV")'),
    ]);

    expect(download.suggestedFilename()).toContain('audit-logs');
  });
});
