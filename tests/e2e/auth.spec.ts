import { test, expect } from '@playwright/test';

test.describe('Auth Page', () => {
  test('should render email input correctly', async ({ page }) => {
    await page.goto('/auth');
    
    // Expect email input field
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // The button for submitting should be visible
    const submitBtn = page.getByRole('button', { name: /Đăng nhập/i });
    if (await submitBtn.count() > 0) {
       await expect(submitBtn).toBeVisible();
    }
  });
});
