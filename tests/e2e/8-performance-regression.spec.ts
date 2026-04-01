import { test, expect } from '@playwright/test';

/**
 * Performance Regression Test
 * 
 * This test runs the REAL AI pipeline (no mocking) and asserts that
 * key performance metrics stay within acceptable thresholds.
 * 
 * IMPORTANT: This test consumes real AI tokens!
 * Run it only when validating pipeline performance after optimization or changes.
 * 
 * Baseline (31/03/2026):
 * - Document Processing: ~10s
 * - AI Chat Response: ~9s
 * - Total Pipeline: ~19.5s
 * 
 * Thresholds (with 50% safety margin):
 * - Document Processing: < 20s
 * - AI Chat Response: < 15s
 * - Total Pipeline: < 35s
 */
test.describe('Performance Regression Tests', () => {

  // Real AI calls can be slow
  test.setTimeout(120_000);

  test('Document processing and chat response within performance thresholds', async ({ page }) => {
    await page.goto('/');

    // Create notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    await expect(page.getByText('Nguồn tài liệu')).toBeVisible();

    // ========================================
    // 1. Measure Document Processing Time
    // ========================================
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();

    await page.getByLabel('Tiêu đề').fill('Perf Test Document');
    await page.getByLabel('Nội dung').fill(
      'Đây là tài liệu thử nghiệm hiệu suất cho pipeline InsightsLM. ' +
      'Nội dung này được sử dụng để đo thời gian xử lý tài liệu và phản hồi AI. ' +
      'Việt Nam nằm ở khu vực Đông Nam Á, có diện tích khoảng 331.212 km². ' +
      'Thủ đô Hà Nội là trung tâm chính trị, văn hóa và kinh tế quan trọng.'
    );

    const docStartTime = Date.now();
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();

    // Wait for source to appear
    await expect(page.getByText('Perf Test Document')).toBeVisible({ timeout: 20000 });

    // Wait for chat input to become enabled (processing complete)
    const chatInput = page.getByPlaceholder('Bắt đầu nhập...');
    await chatInput.waitFor({ state: 'visible', timeout: 45000 });
    await expect(chatInput).toBeEnabled({ timeout: 45000 });

    const docDuration = Date.now() - docStartTime;

    // ========================================
    // 2. Measure AI Chat Response Time
    // ========================================
    await chatInput.fill('Thủ đô của Việt Nam là gì?');

    const chatStartTime = Date.now();
    await chatInput.press('Enter');

    // Wait for AI response
    await expect(page.locator('p').filter({ hasText: /Hà Nội/ })).toBeVisible({ timeout: 60000 });

    const chatDuration = Date.now() - chatStartTime;

    const totalDuration = docDuration + chatDuration;

    // ========================================
    // 3. Performance Report
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE REGRESSION REPORT');
    console.log('='.repeat(60));
    console.log(`  Document Processing : ${docDuration}ms (${(docDuration / 1000).toFixed(1)}s)`);
    console.log(`  AI Chat Response    : ${chatDuration}ms (${(chatDuration / 1000).toFixed(1)}s)`);
    console.log(`  Total Pipeline      : ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log('='.repeat(60));

    // ========================================
    // 4. Assert Performance Thresholds
    // ========================================
    const DOC_THRESHOLD = 20_000;   // 20 seconds
    const CHAT_THRESHOLD = 15_000;  // 15 seconds
    const TOTAL_THRESHOLD = 35_000; // 35 seconds

    // Log threshold status
    const docStatus = docDuration <= DOC_THRESHOLD ? '✅ PASS' : '❌ FAIL';
    const chatStatus = chatDuration <= CHAT_THRESHOLD ? '✅ PASS' : '❌ FAIL';
    const totalStatus = totalDuration <= TOTAL_THRESHOLD ? '✅ PASS' : '❌ FAIL';

    console.log(`\n  Thresholds:`);
    console.log(`  Doc Processing  <= ${DOC_THRESHOLD / 1000}s : ${docStatus} (${(docDuration / 1000).toFixed(1)}s)`);
    console.log(`  Chat Response   <= ${CHAT_THRESHOLD / 1000}s : ${chatStatus} (${(chatDuration / 1000).toFixed(1)}s)`);
    console.log(`  Total Pipeline  <= ${TOTAL_THRESHOLD / 1000}s : ${totalStatus} (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log('='.repeat(60) + '\n');

    // Hard assertions — test fails if thresholds exceeded
    expect(docDuration, 
      `Document processing took ${(docDuration/1000).toFixed(1)}s, exceeding ${DOC_THRESHOLD/1000}s threshold`
    ).toBeLessThanOrEqual(DOC_THRESHOLD);

    expect(chatDuration, 
      `Chat response took ${(chatDuration/1000).toFixed(1)}s, exceeding ${CHAT_THRESHOLD/1000}s threshold`
    ).toBeLessThanOrEqual(CHAT_THRESHOLD);

    expect(totalDuration, 
      `Total pipeline took ${(totalDuration/1000).toFixed(1)}s, exceeding ${TOTAL_THRESHOLD/1000}s threshold`
    ).toBeLessThanOrEqual(TOTAL_THRESHOLD);
  });

  test('Page load performance', async ({ page }) => {
    // Measure time to load the dashboard
    const dashStart = Date.now();
    await page.goto('/');
    await expect(page.getByText('Chào mừng đến InsightsLM')).toBeVisible({ timeout: 10000 });
    const dashDuration = Date.now() - dashStart;

    console.log(`\n  Dashboard load: ${dashDuration}ms (${(dashDuration / 1000).toFixed(1)}s)`);

    // Dashboard should load within 5 seconds
    expect(dashDuration,
      `Dashboard took ${(dashDuration/1000).toFixed(1)}s to load, exceeding 5s threshold`
    ).toBeLessThanOrEqual(5000);

    // Measure notebook creation + load time
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    const nbStart = Date.now();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);
    await expect(page.getByText('Nguồn tài liệu')).toBeVisible();
    const nbDuration = Date.now() - nbStart;

    console.log(`  Notebook creation + load: ${nbDuration}ms (${(nbDuration / 1000).toFixed(1)}s)`);

    // Notebook creation should complete within 5 seconds
    expect(nbDuration,
      `Notebook creation took ${(nbDuration/1000).toFixed(1)}s, exceeding 5s threshold`
    ).toBeLessThanOrEqual(5000);
  });
});
