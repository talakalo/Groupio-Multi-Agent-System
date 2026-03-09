import { test, expect } from '@playwright/test';

test.describe('Architecture Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'user-1',
          email: 'test@test.com',
          role: 'resident',
          buildingId: 'bld-001',
        }),
      })
    );

    // Mock auth state in localStorage (Zustand persist key: groupio-auth)
    await page.addInitScript(() => {
      localStorage.setItem(
        'groupio-auth',
        JSON.stringify({
          state: {
            user: { id: 'user-1', email: 'test@test.com', fullName: 'Test User', phone: '0541234567', role: 'resident', preferredLanguage: 'he', isVerified: true, buildingId: 'bld-001' },
            accessToken: 'test-jwt-token',
            refreshToken: 'test-jwt-refresh',
            isAuthenticated: true,
          },
          version: 0,
        })
      );
    });

    // Set cookies the Next.js Edge middleware reads for auth decisions:
    // refresh_token (presence = session valid) + groupio-auth (role hint for routing)
    await page.context().addCookies([
      { name: 'refresh_token', value: 'e2e-refresh-token', url: 'http://localhost:3000' },
      { name: 'groupio-auth', value: encodeURIComponent(JSON.stringify({ state: { user: { role: 'resident' }, isAuthenticated: true } })), url: 'http://localhost:3000' },
    ]);
  });

  test('should display upload page with dropzone', async ({ page }) => {
    await page.goto('/architecture');

    // The page renders Hebrew text from i18n: "העלה את תוכנית הדירה שלך"
    // Also check for file input and the upload button
    await expect(
      page.getByText(/תוכנית|העלה|floor plan|upload/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should upload and analyze a floor plan', async ({ page }) => {
    // Mock the upload endpoint (** suffix covers ?building_id=... query params)
    await page.route('**/api/v1/uploads/architecture**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'file-1',
          file_name: 'floorplan.png',
          analysis_status: 'pending',
        }),
      })
    );

    // Mock the polling endpoint – returns completed analysis
    await page.route('**/api/v1/uploads/file-1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'file-1',
          file_name: 'floorplan.png',
          analysis_status: 'completed',
          analysis_result: {
            rooms_detected: [
              { name: 'Living Room', estimated_sqm: 25 },
              { name: 'Bedroom', estimated_sqm: 15 },
              { name: 'Kitchen', estimated_sqm: 10 },
            ],
            total_area_sqm: 80,
            suggestions: [
              {
                category: 'ac_installation',
                confidence: 0.92,
                description_he: 'התקנת מזגן מומלצת לסלון',
                description_en: 'AC installation recommended for living room',
                estimated_sqm: 25,
                estimated_units: 1,
                priority: 'high',
                matching_offers: ['offer-1'],
              },
              {
                category: 'painting',
                confidence: 0.85,
                description_he: 'צביעת חדרים',
                description_en: 'Room painting',
                estimated_sqm: 80,
                estimated_units: null,
                priority: 'medium',
                matching_offers: [],
              },
            ],
            summary_he: 'דירת 3 חדרים, 80 מ"ר',
            summary_en: '3-room apartment, 80 sqm',
          },
        }),
      })
    );

    await page.goto('/architecture');

    // Upload a file via the file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'floorplan.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-png-data'),
    });

    // Wait for the analysis results – use .first() to avoid strict mode violation
    // since each room name is rendered as a separate element
    await expect(
      page.getByText('Living Room').first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('should handle upload errors gracefully', async ({ page }) => {
    // Mock the upload endpoint to return 500 (** suffix covers ?building_id=... query params)
    await page.route('**/api/v1/uploads/architecture**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      })
    );

    await page.goto('/architecture');

    // Upload a file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'floorplan.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-png-data'),
    });

    // Should show an error message (Hebrew: "ההעלאה נכשלה" or "נסה שוב")
    await expect(
      page.getByText(/נכשל|error|failed|נסה שוב|try again/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show analyzing state during processing', async ({ page }) => {
    // Mock upload to succeed.  Use ** suffix to also catch ?building_id=... query params
    // that get appended when the Zustand store has a populated buildingId.
    await page.route('**/api/v1/uploads/architecture**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'file-2',
          file_name: 'plan.pdf',
          analysis_status: 'pending',
        }),
      })
    );

    // Mock polling to always return pending (simulating long processing)
    await page.route('**/api/v1/uploads/file-2', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'file-2',
          analysis_status: 'pending',
        }),
      })
    );

    await page.goto('/architecture');

    // Wait for the upload zone to be rendered before interacting with the file input
    await page.locator('input[type="file"]').waitFor({ state: 'attached' });
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'plan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake-pdf-data'),
    });

    // Should show analyzing/loading state (Hebrew: "מנתח" or spinner)
    await expect(
      page.getByText(/מנתח|analyz|processing|מעלה|uploading/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
