import { test, expect } from '@playwright/test';

test.describe('Admin CSV Bulk Import', () => {
  // Test assumes admin@example.com or admin@insightslm.com exists,
  // we will just write the structural test that can be run when DB is seeded.
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Simple check if we are on login page and need to log in
    const emailInput = page.getByPlaceholder(/email/i);
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@insightslm.com');
      const passwordInput = page.getByPlaceholder(/mật khẩu/i);
      await passwordInput.fill('admin123456');
      await page.getByRole('button', { name: /đăng nhập/i }).click();
      await expect(page.getByRole('button', { name: /đăng nhập/i })).not.toBeVisible();
    }
    
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: /quản lý/i })).toBeVisible();
  });

  test('should parse and preview CSV upload', async ({ page }) => {
    // Open Dialog
    await page.getByRole('button', { name: /nhập csv/i }).click();
    await expect(page.getByRole('dialog', { name: /tạo người dùng/i })).toBeVisible();

    // Create a mock CSV buffer
    const mockCsvContent = `email,full_name
testuser1@example.com,Test User 1
testuser2@example.com,Test User 2
invalid-email,Test User 3
testuser1@example.com,Duplicate`;
    
    // Upload CSV via hidden input created by react-dropzone
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: 'test-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(mockCsvContent),
    });

    // Wait for parse to complete
    await expect(page.getByText('4 tổng')).toBeVisible();
    await expect(page.getByText('2 hợp lệ')).toBeVisible();
    await expect(page.getByText('2 lỗi')).toBeVisible();

    // Check rows in preview
    await expect(page.getByRole('cell', { name: 'testuser1@example.com', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'invalid-email' })).toBeVisible();
    await expect(page.getByText('Email không hợp lệ')).toBeVisible();
    
    // Dismiss Dialog
    await page.getByRole('button', { name: /hủy/i }).click();
    await expect(page.getByRole('dialog', { name: /tạo người dùng/i })).not.toBeVisible();
  });
});
