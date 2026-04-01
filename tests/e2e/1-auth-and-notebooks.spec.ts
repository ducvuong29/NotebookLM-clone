import { test, expect } from '@playwright/test';

test.describe('Epic 1 & 2: Auth Bypass and Notebook Management', () => {
  
  test('User flow: access dashboard -> create notebook -> view on dashboard', async ({ page }) => {
    // 1. Dashboard UI
    await page.goto('/');
    
    // Expect the dashboard header to be visible
    await expect(page.getByText('Chào mừng đến InsightsLM')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu người dùng' })).toBeVisible();

    // 2. Create Notebook
    // Either the + Tạo mới button on grid, or Tạo notebook button on empty dashboard
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Wait for navigation
    await page.waitForURL(/\/notebook\/.+/);

    // Verify notebook page elements
    await expect(page.getByPlaceholder('Tải nguồn lên để bắt đầu')).toBeVisible(); // Chat input
    await expect(page.getByText('Nguồn tài liệu')).toBeVisible(); // Source panel

    // 3. Return to Dashboard
    await page.goto('/');

    // Wait for notebook specifically in Private Notebooks Section
    // Since we created it as 'Notebook chưa đặt tên' or 'Untitled notebook'
    await expect(page.getByText(/Untitled notebook|Notebook chưa đặt tên/i).first()).toBeVisible();
  });
});
