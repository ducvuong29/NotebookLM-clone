import { test, expect } from '@playwright/test';
import { mockAIChatEndpoint, mockProcessDocumentEndpoint } from './utils/mock-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

test.describe('Epic 3 & 4a: Chat & Public Visibility', () => {

  test('User can chat and public guests can view notebook', async ({ page, browser }) => {
    // Enable AI/Network Mocking
    await mockAIChatEndpoint(page);
    await mockProcessDocumentEndpoint(page);

    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    
    // Create new Notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    const match = page.url().match(/\/notebook\/(.+)/);
    const notebookId = match?.[1] as string;
    expect(notebookId).toBeTruthy();

    await expect(page.getByText('Nguồn tài liệu')).toBeVisible();

    // 1. Upload a text source
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();

    await page.getByLabel('Tiêu đề').fill('E2E Test Text Source');
    await page.getByLabel('Nội dung').fill('Đây là nội dung thử nghiệm bằng văn bản cho E2E framework.');
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();

    await expect(page.getByText('E2E Test Text Source')).toBeVisible({ timeout: 10000 });

    // 2. Chat with AI
    // We expect the placeholder to either be 'Vui lòng chờ trong khi nguồn đang được xử lý...' or 'Bắt đầu nhập...' 
    // Since processing_status is marked completed by our mock within 1s, we should wait until it becomes enabled
    const chatInput = page.getByPlaceholder('Bắt đầu nhập...', { exact: false });
    
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('Xin chào, tôi là tester');
    await chatInput.press('Enter');

    // Wait for the AI mock response
    await expect(page.getByText(/\[MOCK AI\]/)).toBeVisible({ timeout: 10000 });

    // 3. Change Notebook Visibility to Public programmatically
    await supabase.from('notebooks').update({ visibility: 'public' }).eq('id', notebookId);

    // 4. Test Guest Context (Incognito context)
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    
    await guestPage.goto(`/notebook/${notebookId}`);
    
    // Notebook should load successfully without login for public notebook
    await expect(guestPage.getByText('Nguồn tài liệu')).toBeVisible();
    await expect(guestPage.getByText('E2E Test Text Source')).toBeVisible();

    // The chat input should either be disabled for guests or request login
    const guestChatInput = guestPage.locator('input').filter({ hasText: /bắt đầu nhập/i }).first();
    if (await guestChatInput.isVisible()) {
        await expect(guestChatInput).toBeDisabled();
    }

    await guestContext.close();
  });
});
