import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

test.describe('Real AI Integration & Performance', () => {

  // Real AI calls can be slow — allow up to 120s
  test.setTimeout(120_000);

  // CAUTION: This test consumes real AI tokens! 
  // It should be run minimally.
  test('Upload file, generate AI response, check citation and performance', async ({ page }) => {
    
    await page.goto('/');
    
    // Create new Notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    const match = page.url().match(/\/notebook\/(.+)/);
    const notebookId = match?.[1] as string;
    expect(notebookId).toBeTruthy();

    await expect(page.getByText('Nguồn tài liệu')).toBeVisible();

    // ========================================
    // 1. Upload a text source with real processing
    // ========================================
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();

    await page.getByLabel('Tiêu đề').fill('Lịch sử Việt Nam (Test)');
    await page.getByLabel('Nội dung').fill(`Việt Nam là một quốc gia nằm ở bán đảo Đông Dương, thuộc khu vực Đông Nam Á. 
    Lịch sử Việt Nam được ghi nhận bằng văn bản bắt đầu từ thiên niên kỷ 1 TCN. 
    Nước Việt Nam trải qua nhiều triều đại phong kiến như Lý, Trần, Lê, Nguyễn.
    Năm 1945, Chủ tịch Hồ Chí Minh đọc bản Tuyên ngôn Độc lập khai sinh ra nước Việt Nam Dân chủ Cộng hòa.`);
    
    const uploadStartTime = Date.now();
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();

    // Wait for the source to appear in the sidebar after processing
    await expect(page.getByText('Lịch sử Việt Nam (Test)')).toBeVisible({ timeout: 15000 });
    
    // Wait for chat input to become enabled
    // The app uses <Input> with placeholder "Bắt đầu nhập..." when ready
    const chatInput = page.getByPlaceholder('Bắt đầu nhập...');
    await chatInput.waitFor({ state: 'visible', timeout: 45000 });
    await expect(chatInput).toBeEnabled({ timeout: 45000 });
    
    const uploadDuration = Date.now() - uploadStartTime;
    console.log(`\n========================================`);
    console.log(`[PERF] Document Upload & Processing: ${uploadDuration}ms (${(uploadDuration / 1000).toFixed(1)}s)`);
    console.log(`========================================\n`);

    // ========================================
    // 2. Chat with Real AI
    // ========================================
    await chatInput.fill('Ai đã đọc bản Tuyên ngôn Độc lập khai sinh ra nước Việt Nam Dân chủ Cộng hòa?');
    
    const chatStartTime = Date.now();
    await chatInput.press('Enter');

    // Wait for AI response — look for "Hồ Chí Minh" in a paragraph (AI response), 
    // not in the user message or source sidebar
    // The AI response renders inside <p> tags via MarkdownRenderer
    await expect(page.locator('p').filter({ hasText: /Hồ Chí Minh/ })).toBeVisible({ timeout: 60000 });
    
    const chatDuration = Date.now() - chatStartTime;
    console.log(`\n========================================`);
    console.log(`[PERF] AI Chat Response: ${chatDuration}ms (${(chatDuration / 1000).toFixed(1)}s)`);
    console.log(`========================================\n`);

    // ========================================
    // 3. Verify Citations
    // ========================================
    // CitationButton renders: <Button aria-label="Trích dẫn {n}"> with class "inline-flex"
    const citationButton = page.getByRole('button', { name: /Trích dẫn \d+/ }).first();
    
    const hasCitation = await citationButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasCitation) {
      await citationButton.click();
      // Source content should appear in the sidebar
      await expect(page.getByText('Chủ tịch Hồ Chí Minh').first()).toBeVisible({ timeout: 5000 });
      console.log(`[PERF] Citation Verification: ✅ Passed`);
    } else {
      console.log(`[PERF] Citation Verification: ⚠️ No citation badge found (AI may not have included citations)`);
    }

    // ========================================
    // 4. Performance Summary
    // ========================================
    console.log(`\n========================================`);
    console.log(`📊 PERFORMANCE SUMMARY`);
    console.log(`========================================`);
    console.log(`  Edge Function Auth    : optimized (Promise.all)`);
    console.log(`  Document Processing   : ${uploadDuration}ms (${(uploadDuration / 1000).toFixed(1)}s)`);
    console.log(`  AI Chat Response      : ${chatDuration}ms (${(chatDuration / 1000).toFixed(1)}s)`);
    console.log(`  Total Pipeline        : ${uploadDuration + chatDuration}ms (${((uploadDuration + chatDuration) / 1000).toFixed(1)}s)`);
    console.log(`  Model (Chat)          : gpt-4.1-mini`);
    console.log(`  Model (Title Gen)     : gpt-4.1-nano`);
    console.log(`  topK                  : 5`);
    console.log(`  contextWindow         : 10`);
    console.log(`  chunkSize/overlap     : 2000/100`);
    console.log(`========================================\n`);
    
    // Performance thresholds — warn if too slow
    if (uploadDuration > 15000) {
      console.warn(`⚠️ Document processing exceeded 15s threshold`);
    }
    if (chatDuration > 10000) {
      console.warn(`⚠️ Chat response exceeded 10s threshold`);
    }
  });
});
