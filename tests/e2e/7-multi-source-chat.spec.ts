import { test, expect } from '@playwright/test';
import { mockAIChatEndpoint, mockProcessDocumentEndpoint } from './utils/mock-helpers';

// Helper to locate a source title in the sidebar (the span with specific class)
const sourceTitle = (page: any /* eslint-disable-line @typescript-eslint/no-explicit-any */, title: string) => 
  page.locator('.text-sm.text-foreground.truncate').filter({ hasText: title });

test.describe('Multi-Source Chat', () => {

  test('User can upload multiple sources and chat with AI about them', async ({ page }) => {
    await mockAIChatEndpoint(page);
    await mockProcessDocumentEndpoint(page);

    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    await expect(page.getByText('Nguồn tài liệu')).toBeVisible();

    // ========================================
    // 1. Upload first text source
    // ========================================
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();

    await page.getByLabel('Tiêu đề').fill('Lịch sử Hà Nội');
    await page.getByLabel('Nội dung').fill(
      'Hà Nội là thủ đô của Việt Nam, có lịch sử hơn 1000 năm. ' +
      'Năm 1010, Lý Thái Tổ dời đô từ Hoa Lư về Thăng Long.'
    );
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();

    await expect(sourceTitle(page, 'Lịch sử Hà Nội')).toBeVisible({ timeout: 10000 });

    // ========================================
    // 2. Upload second text source
    // ========================================
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();

    await page.getByLabel('Tiêu đề').fill('Ẩm thực Việt Nam');
    await page.getByLabel('Nội dung').fill(
      'Phở là món ăn quốc hồn quốc túy của Việt Nam. Phở bắt nguồn từ miền Bắc ' +
      'vào đầu thế kỷ 20. Ngoài phở, Việt Nam còn nổi tiếng với bún chả, bánh mì.'
    );
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();

    await expect(sourceTitle(page, 'Ẩm thực Việt Nam')).toBeVisible({ timeout: 10000 });

    // ========================================
    // 3. Verify both sources are listed
    // ========================================
    await expect(sourceTitle(page, 'Lịch sử Hà Nội')).toBeVisible();
    await expect(sourceTitle(page, 'Ẩm thực Việt Nam')).toBeVisible();

    // ========================================
    // 4. Chat with AI (mocked)
    // ========================================
    const chatInput = page.getByPlaceholder('Bắt đầu nhập...', { exact: false });
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });

    await chatInput.fill('Hà Nội có lịch sử bao lâu?');
    await chatInput.press('Enter');

    await expect(page.getByText(/\[MOCK AI\]/).first()).toBeVisible({ timeout: 10000 });

    // ========================================
    // 5. Send a second question
    // ========================================
    await chatInput.fill('Phở bắt nguồn từ đâu?');
    await chatInput.press('Enter');

    // Wait for the second AI mock response
    await expect(page.getByText(/\[MOCK AI\]/)).toHaveCount(2, { timeout: 10000 });

    // ========================================
    // 6. Verify chat history persists
    // ========================================
    await expect(page.getByText('Hà Nội có lịch sử bao lâu?').first()).toBeVisible();
    await expect(page.getByText('Phở bắt nguồn từ đâu?').first()).toBeVisible();
  });

  test('Adding a source while chat exists does not clear chat history', async ({ page }) => {
    await mockAIChatEndpoint(page);
    await mockProcessDocumentEndpoint(page);

    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    // Upload first source
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();
    await page.getByLabel('Tiêu đề').fill('Source Alpha');
    await page.getByLabel('Nội dung').fill('Alpha content for multi-source testing.');
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();
    await expect(sourceTitle(page, 'Source Alpha')).toBeVisible({ timeout: 10000 });

    // Chat with AI
    const chatInput = page.getByPlaceholder('Bắt đầu nhập...', { exact: false });
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('Tell me about Alpha');
    await chatInput.press('Enter');

    await expect(page.getByText(/\[MOCK AI\]/).first()).toBeVisible({ timeout: 10000 });

    // Now upload a SECOND source
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();
    await page.getByLabel('Tiêu đề').fill('Source Beta');
    await page.getByLabel('Nội dung').fill('Beta content for multi-source testing.');
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();
    await expect(sourceTitle(page, 'Source Beta')).toBeVisible({ timeout: 10000 });

    // Verify previous chat history is still visible
    await expect(page.getByText('Tell me about Alpha').first()).toBeVisible();
    await expect(page.getByText(/\[MOCK AI\]/).first()).toBeVisible();

    // Verify both sources are listed
    await expect(sourceTitle(page, 'Source Alpha')).toBeVisible();
    await expect(sourceTitle(page, 'Source Beta')).toBeVisible();
  });
});
