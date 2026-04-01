import { test, expect } from '@playwright/test';
import { mockProcessDocumentEndpoint } from './utils/mock-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

test.describe('Source Deletion', () => {

  // Helper to locate a source title in the sidebar (the span inside the source card)
  const sourceTitle = (page: any /* eslint-disable-line @typescript-eslint/no-explicit-any */, title: string) => 
    page.locator('.text-sm.text-foreground.truncate').filter({ hasText: title });

  test('User can delete a source via context menu and UI updates', async ({ page }) => {
    await mockProcessDocumentEndpoint(page);
    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    const match = page.url().match(/\/notebook\/(.+)/);
    const notebookId = match?.[1] as string;
    expect(notebookId).toBeTruthy();

    await expect(page.getByText('Nguồn tài liệu')).toBeVisible();

    // ========================================
    // 1. Add a text source
    // ========================================
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();

    await page.getByLabel('Tiêu đề').fill('Source To Delete');
    await page.getByLabel('Nội dung').fill('Nội dung sẽ bị xóa trong test E2E.');
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();

    // Wait for source to appear in the sidebar
    await expect(sourceTitle(page, 'Source To Delete')).toBeVisible({ timeout: 10000 });

    // ========================================
    // 2. Delete via context menu (right-click)
    // ========================================
    await sourceTitle(page, 'Source To Delete').click({ button: 'right' });

    // Wait for context menu to appear and click "Xóa nguồn"
    const deleteMenuItem = page.locator('[role="menuitem"]').filter({ hasText: 'Xóa nguồn' });
    await expect(deleteMenuItem).toBeVisible({ timeout: 3000 });
    await deleteMenuItem.click();

    // ========================================
    // 3. Confirm deletion in AlertDialog
    // ========================================
    await expect(page.getByText("You're about to delete this source")).toBeVisible({ timeout: 3000 });
    
    // Click Delete inside the dialog
    await page.locator('[role="alertdialog"] button').filter({ hasText: /^Delete$/ }).click();

    // ========================================
    // 4. Verify source removed from UI
    // ========================================
    await expect(sourceTitle(page, 'Source To Delete')).not.toBeVisible({ timeout: 10000 });

    // Toast notification should appear (use .first() as toast title+description may both match)
    await expect(page.getByText('Đã xóa nguồn').first()).toBeVisible({ timeout: 5000 });

    // Empty state should show
    await expect(page.getByText('Nguồn đã lưu sẽ xuất hiện ở đây')).toBeVisible({ timeout: 5000 });

    // ========================================
    // 5. Verify source removed from database
    // ========================================
    const { data: remainingSources } = await supabase
      .from('sources')
      .select('id')
      .eq('notebook_id', notebookId);

    expect(remainingSources?.length || 0).toBe(0);
  });

  test('Deletion of one source does not affect other sources', async ({ page }) => {
    await mockProcessDocumentEndpoint(page);
    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    await expect(page.getByText('Nguồn tài liệu')).toBeVisible();

    // Add first source
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();
    await page.getByLabel('Tiêu đề').fill('Source Keep');
    await page.getByLabel('Nội dung').fill('Nội dung này sẽ được giữ lại.');
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();
    await expect(sourceTitle(page, 'Source Keep')).toBeVisible({ timeout: 10000 });

    // Add second source
    await page.getByRole('button', { name: 'Thêm nguồn' }).click();
    await page.getByText('Dán văn bản').click();
    await page.getByLabel('Tiêu đề').fill('Source Remove');
    await page.getByLabel('Nội dung').fill('Nội dung này sẽ bị xóa.');
    await page.getByRole('button', { name: 'Thêm văn bản' }).click();
    await expect(sourceTitle(page, 'Source Remove')).toBeVisible({ timeout: 10000 });

    // Right-click on "Source Remove" to delete it
    await sourceTitle(page, 'Source Remove').click({ button: 'right' });

    const deleteMenuItem = page.locator('[role="menuitem"]').filter({ hasText: 'Xóa nguồn' });
    await expect(deleteMenuItem).toBeVisible({ timeout: 3000 });
    await deleteMenuItem.click();

    // Confirm deletion
    await expect(page.getByText("You're about to delete this source")).toBeVisible({ timeout: 3000 });
    await page.locator('[role="alertdialog"] button').filter({ hasText: /^Delete$/ }).click();

    // Verify: deleted source gone, kept source still visible
    await expect(sourceTitle(page, 'Source Remove')).not.toBeVisible({ timeout: 10000 });
    await expect(sourceTitle(page, 'Source Keep')).toBeVisible();
  });
});
