import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

test.describe('Notebook Delete', () => {

  test('User can delete a notebook from dashboard and it disappears from the list', async ({ page }) => {
    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create a notebook to delete
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    const match = page.url().match(/\/notebook\/(.+)/);
    const notebookId = match?.[1] as string;
    expect(notebookId).toBeTruthy();

    // Navigate back to dashboard
    await page.goto('/');

    // The notebook card should be visible (title = "Untitled notebook" by default)
    const notebookCard = page.locator('h3').filter({ hasText: /Untitled notebook|Notebook chưa đặt tên/i }).first();
    await expect(notebookCard).toBeVisible({ timeout: 10000 });

    // ========================================
    // 1. Click the delete (trash) button on the card
    // ========================================
    // The delete button has aria-label "Xóa notebook <title>"
    const deleteBtn = page.locator(`button[aria-label*="Xóa notebook"]`).first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // ========================================
    // 2. AlertDialog confirmation should appear
    // ========================================
    await expect(page.getByText('Xóa notebook này?')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Bạn sắp xóa notebook này và toàn bộ nội dung bên trong.')).toBeVisible();

    // Click "Xóa" to confirm
    await page.getByRole('button', { name: 'Xóa' }).click();

    // ========================================
    // 3. Notebook should disappear from dashboard
    // ========================================
    // Wait for toast "Đã xóa notebook"
    await expect(page.getByText('Đã xóa notebook').first()).toBeVisible({ timeout: 10000 });

    // Re-check: the notebook with that ID should no longer be in the DOM
    await expect(page.locator('h3').filter({ hasText: /Untitled notebook|Notebook chưa đặt tên/i })).not.toBeVisible({ timeout: 5000 });

    // ========================================
    // 4. Verify cascade delete in database
    // ========================================
    const { data: remainingNotebook } = await supabase
      .from('notebooks')
      .select('id')
      .eq('id', notebookId);

    expect(remainingNotebook?.length || 0).toBe(0);
  });

  test('Cancelling delete dialog keeps the notebook intact', async ({ page }) => {
    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create a notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    const match = page.url().match(/\/notebook\/(.+)/);
    const notebookId = match?.[1] as string;

    // Navigate back to dashboard
    await page.goto('/');

    const notebookCard = page.locator('h3').filter({ hasText: /Untitled notebook|Notebook chưa đặt tên/i }).first();
    await expect(notebookCard).toBeVisible({ timeout: 10000 });

    // Click delete button
    const deleteBtn = page.locator(`button[aria-label*="Xóa notebook"]`).first();
    await deleteBtn.click();

    // AlertDialog appears
    await expect(page.getByText('Xóa notebook này?')).toBeVisible({ timeout: 5000 });

    // Click "Hủy" to cancel
    await page.getByRole('button', { name: 'Hủy' }).click();

    // Dialog should close
    await expect(page.getByText('Xóa notebook này?')).not.toBeVisible({ timeout: 3000 });

    // Notebook should still be visible
    await expect(page.locator('h3').filter({ hasText: /Untitled notebook|Notebook chưa đặt tên/i }).first()).toBeVisible();

    // Verify still in database
    const { data: stillExists } = await supabase
      .from('notebooks')
      .select('id')
      .eq('id', notebookId)
      .single();

    expect(stillExists?.id).toBe(notebookId);
  });

  test('Deleting one notebook does not remove other notebooks', async ({ page }) => {
    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create first notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);
    const firstId = page.url().match(/\/notebook\/(.+)/)?.[1] as string;

    // Rename first notebook in DB to have consistent unique title
    await supabase.from('notebooks').update({ title: 'NB Keep' }).eq('id', firstId);

    // Create second notebook
    await page.goto('/');
    const createButton2 = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton2.click();
    await page.waitForURL(/\/notebook\/.+/);
    const secondId = page.url().match(/\/notebook\/(.+)/)?.[1] as string;

    // Rename second notebook
    await supabase.from('notebooks').update({ title: 'NB Delete' }).eq('id', secondId);

    // Go to dashboard, reload to pick up renamed titles
    await page.goto('/');
    await page.reload();

    await expect(page.getByText('NB Keep').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('NB Delete').first()).toBeVisible({ timeout: 5000 });

    // Delete the second notebook (NB Delete)
    const deleteBtn = page.locator(`button[aria-label="Xóa notebook NB Delete"]`).first();
    await deleteBtn.click();
    await expect(page.getByText('Xóa notebook này?')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Xóa' }).click();

    // Wait for deletion toast
    await expect(page.getByText('Đã xóa notebook').first()).toBeVisible({ timeout: 10000 });

    // NB Delete should be gone, NB Keep should still be visible
    await expect(page.getByText('NB Delete')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('NB Keep').first()).toBeVisible();
  });
});
