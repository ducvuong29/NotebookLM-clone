/**
 * Flowchart Editing E2E Tests (Epic 7)
 *
 * Covers:
 *  - Opening the flowchart panel
 *  - AI Suggest text input and successful update (Mocked edge function)
 *  - Save Mechanism and Dirty state interactions
 *  - Unsaved Changes dialog interception
 *  - Export to PNG / PDF buttons trigger
 */
import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helper: navigate and mock flowchart data
// ---------------------------------------------------------------------------
async function setupFlowchartScenario(page: Page) {
  await page.goto('/');
  await page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first().click();
  await page.waitForURL(/\/notebook\/.+/);
  const notebookId = page.url().match(/\/notebook\/(.+)/)?.[1] as string;

  // Mock sources
  await page.route('**/rest/v1/sources**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'mock-source-7',
          notebook_id: notebookId,
          title: 'System Architecture',
          content_type: 'text',
          processing_status: 'completed',
        },
      ]),
    });
  });

  let mockFlowchartState = {
    id: 'mock-fc-1',
    notebook_id: notebookId,
    source_id: 'mock-source-7',
    title: 'Test Flowchart',
    summary: 'Summary of flowchart',
    mermaid_code: 'graph TD;\n  A-->B;',
    generation_status: 'completed',
  };

  // Mock flowcharts
  await page.route('**/rest/v1/flowcharts**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockFlowchartState]),
      });
    } else if (route.request().method() === 'PATCH' || route.request().method() === 'POST') {
      const postData = route.request().postDataJSON();
      if (postData) {
        mockFlowchartState = { ...mockFlowchartState, ...postData };
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockFlowchartState]),
      });
    } else {
      await route.continue();
    }
  });

  await page.reload();
  await page.waitForURL(/\/notebook\/.+/);
  
  // Click 'Sơ đồ' to toggle the panel
  const flowchartToggleBtn = page.getByRole('button', { name: "Sơ đồ", exact: true });
  await flowchartToggleBtn.click();
  
  // Wait for Flowchart Panel to appear
  await expect(page.getByPlaceholder('Tên quy trình...')).toHaveValue('Test Flowchart', { timeout: 10000 });

  return notebookId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe('Flowchart AI Editing & Export', () => {

  test('AI Suggest input updates CodeMirror after mock edge function call', async ({ page }) => {
    await setupFlowchartScenario(page);

    // Intercept edit-flowchart
    await page.route('**/functions/v1/edit-flowchart', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mermaid_code: 'graph TD;\n  A-->B;\n  B-->C;'
        })
      });
    });

    const aiInput = page.getByPlaceholder(/Yêu cầu AI/i).first();
    await aiInput.fill('Add node C');
    
    // Press Enter to submit
    await aiInput.press('Enter');

    // Wait for the new code to appear in the DOM (in the CodeMirror text)
    await expect(page.locator('.cm-content')).toContainText('B-->C', { timeout: 10000 });
  });

  test('Modifying flowchart code triggers dirty state and "Chưa lưu" hint', async ({ page }) => {
    await setupFlowchartScenario(page);

    // Type something in CodeMirror
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.insertText('\n  A-->D;');

    const saveBtn = page.getByRole('button', { name: 'Lưu', exact: true });

    // Dirty state causes the Save button to be enabled
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });

    // Click Save
    await saveBtn.click();

    // After save, the save button becomes disabled again
    await expect(saveBtn).toBeDisabled({ timeout: 5000 });
    // Toast notification "Đã lưu ..." should appear
    await expect(page.getByText('Đã lưu sơ đồ!', { exact: true }).first()).toBeVisible();
  });

  test('Unsaved changes dialog intercepts navigation', async ({ page }) => {
    await setupFlowchartScenario(page);

    // Make flowchart dirty
    await page.locator('.cm-content').click();
    await page.keyboard.insertText('\n  X-->Y;');

    // Try clicking NotebookLM Logo to navigate away
    const logoLink = page.locator('header').getByRole('button').filter({ has: page.locator('svg') }).nth(1); 
    // Easier target: The back button
    const backBtn = page.getByRole('button', { name: "Về trang chủ" }).or(page.locator('header svg.lucide-arrow-left')).first();
    await backBtn.click();

    // Dialog should appear
    await expect(page.getByText('Bạn có thay đổi chưa lưu')).toBeVisible({ timeout: 5000 });
    
    // Click Cancel to stay on page
    const cancelBtn = page.getByRole('button', { name: /Tiếp tục/i }).first();
    await cancelBtn.click();
    
    // Dialog disappears
    await expect(page.getByText('Bạn có thay đổi chưa lưu')).not.toBeVisible();
  });

  test('Export Image and PDF buttons trigger download event', async ({ page }) => {
    await setupFlowchartScenario(page);

    // Open export menu 
    const exportBtn = page.getByRole('button', { name: 'Xuất', exact: true }).or(page.getByRole('button', { name: /xuất sơ đồ/i })).first();
    await exportBtn.click();

    // Check PNG download
    const pngOption = page.getByText(/PNG/i).first();
    
    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download');
    await pngOption.click();
    const download = await downloadPromise;
    
    // Verify filename matching pattern (flowchart-*.png)
    expect(download.suggestedFilename()).toMatch(/.*\.png/);
    
    // Re-open and check PDF
    await exportBtn.click();
    const pdfOption = page.getByText(/PDF/i).first();
    
    const downloadPromisePdf = page.waitForEvent('download');
    await pdfOption.click();
    const downloadPdf = await downloadPromisePdf;
    expect(downloadPdf.suggestedFilename()).toMatch(/.*\.pdf/);
  });
});
