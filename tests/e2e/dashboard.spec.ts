import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test('should load the dashboard and exhibit correct state', async ({ page }) => {
    // Navigate to local test server
    await page.goto('/');

    // Wait for either the dashboard heading or the auth page text to appear
    const dashboardHeading = page.locator('h1', { hasText: /Chào mừng đến InsightsLM/ });
    const authHeading = page.getByRole('heading', { name: 'Đăng nhập' });

    // Wait for one of them to be visible
    await Promise.race([
      dashboardHeading.waitFor({ state: 'visible' }),
      authHeading.waitFor({ state: 'visible' })
    ]);

    if (page.url().includes('/auth')) {
      await expect(authHeading).toBeVisible();
    } else {
      await expect(dashboardHeading).toBeVisible();
    }
  });
});
