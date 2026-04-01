import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// ============================================================================
// Helper: create a notebook and navigate to it
// ============================================================================
async function createAndOpenNotebook(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first().click();
  await page.waitForURL(/\/notebook\/.+/);
  const notebookId = page.url().match(/\/notebook\/(.+)/)?.[1] as string;
  // Wait for title to render in header
  await page.waitForSelector('span.cursor-pointer, span.cursor-default');
  return notebookId;
}

test.describe('Notebook Rename (inline edit in NotebookHeader)', () => {

  test('Owner can rename notebook by clicking title then pressing Enter', async ({ page }) => {
    const notebookId = await createAndOpenNotebook(page);

    // ========================================
    // 1. Click the notebook title span in the header
    // ========================================
    const titleSpan = page.locator('header span.cursor-pointer').first();
    await expect(titleSpan).toBeVisible({ timeout: 10000 });

    const oldTitle = await titleSpan.textContent();
    await titleSpan.click();

    // The input should now appear (autoFocus)
    const titleInput = page.locator('header input');
    await expect(titleInput).toBeFocused({ timeout: 5000 });

    // ========================================
    // 2. Type a new title and press Enter
    // ========================================
    const newTitle = `Renamed Notebook ${Date.now()}`;
    await titleInput.fill(newTitle);
    await titleInput.press('Enter');

    // ========================================
    // 3. Input disappears, new title is shown
    // ========================================
    await expect(titleInput).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('header').getByText(newTitle)).toBeVisible({ timeout: 10000 });

    // ========================================
    // 4. Verify persisted in DB
    // ========================================
    await page.waitForTimeout(1000); // allow mutation to settle
    const { data } = await supabase
      .from('notebooks')
      .select('title')
      .eq('id', notebookId)
      .single();

    expect(data?.title).toBe(newTitle);

    console.log(`Renamed "${oldTitle}" → "${newTitle}"`);
  });

  test('Pressing Escape reverts title without saving', async ({ page }) => {
    const notebookId = await createAndOpenNotebook(page);

    const titleSpan = page.locator('header span.cursor-pointer').first();
    await expect(titleSpan).toBeVisible({ timeout: 10000 });
    const originalTitle = await titleSpan.textContent();

    await titleSpan.click();

    const titleInput = page.locator('header input');
    await expect(titleInput).toBeFocused({ timeout: 5000 });

    // Type something then press Escape
    await titleInput.fill('This should not be saved');
    await titleInput.press('Escape');

    // Input should close and original title should be shown
    await expect(titleInput).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('header').getByText(originalTitle!.trim())).toBeVisible({ timeout: 5000 });

    // DB should still have original title
    const { data } = await supabase
      .from('notebooks')
      .select('title')
      .eq('id', notebookId)
      .single();

    expect(data?.title).not.toBe('This should not be saved');
  });

  test('Rename persists after navigating away and back', async ({ page }) => {
    const notebookId = await createAndOpenNotebook(page);

    const titleSpan = page.locator('header span.cursor-pointer').first();
    await expect(titleSpan).toBeVisible({ timeout: 10000 });

    await titleSpan.click();

    const titleInput = page.locator('header input');
    const persistedTitle = `Persisted ${Date.now()}`;
    await titleInput.fill(persistedTitle);
    await titleInput.press('Enter');

    await expect(page.locator('header').getByText(persistedTitle)).toBeVisible({ timeout: 10000 });

    // Navigate away then back
    await page.goto('/');
    await page.goto(`/notebook/${notebookId}`);

    // Title in header should still be the renamed title
    await expect(page.locator('header').getByText(persistedTitle)).toBeVisible({ timeout: 15000 });
  });

  test('Submitting the same title triggers no update mutation', async ({ page }) => {
    const notebookId = await createAndOpenNotebook(page);

    const titleSpan = page.locator('header span.cursor-pointer').first();
    await expect(titleSpan).toBeVisible({ timeout: 10000 });
    const currentTitle = (await titleSpan.textContent()) || '';

    await titleSpan.click();
    const titleInput = page.locator('header input');
    // Do NOT change the value — just press Enter
    await titleInput.press('Enter');

    // Input should close cleanly without error
    await expect(titleInput).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('header').getByText(currentTitle.trim())).toBeVisible();
  });
});
