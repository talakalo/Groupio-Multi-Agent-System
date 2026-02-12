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

    // Mock auth state in localStorage
    await page.addInitScript(() => {
      localStorage.setItem(
        'auth',
        JSON.stringify({
          user: {
            id: 'user-1',
            email: 'test@test.com',
            role: 'resident',
            buildingId: 'bld-001',
          },
          token: 'test-jwt-token',
        })
      );
      localStorage.setItem('auth_token', 'test-jwt-token');
    });
  });

  test('should display upload page with dropzone', async ({ page }) => {
    await page.goto('/architecture');

    // The page should show an upload area
    await expect(
      page.getByText(/upload|floor plan|architecture|dropzone/i)
    ).toBeVisible();
  });

  test('should upload and analyze a floor plan', async ({ page }) => {
    // Mock the upload endpoint
    await page.route('**/api/v1/uploads/architecture', (route) =>
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

    // Wait for the analysis results to appear
    await expect(
      page.getByText(/living room|bedroom|kitchen/i)
    ).toBeVisible({ timeout: 15000 });
  });

  test('should handle upload errors gracefully', async ({ page }) => {
    // Mock the upload endpoint to return 500
    await page.route('**/api/v1/uploads/architecture', (route) =>
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

    // Should show an error message
    await expect(
      page.getByText(/error|failed|try again/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show analyzing state during processing', async ({ page }) => {
    // Mock upload to succeed
    await page.route('**/api/v1/uploads/architecture', (route) =>
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

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'plan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake-pdf-data'),
    });

    // Should show analyzing/loading state
    await expect(
      page.getByText(/analyz|processing|loading/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
