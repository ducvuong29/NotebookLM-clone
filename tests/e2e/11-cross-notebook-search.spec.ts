import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// ============================================================================
// Helpers
// ============================================================================

/** Intercept the search_notebook_content RPC and return a mock result */
async function mockSearchRpc(page: import('@playwright/test').Page, matchTitle: string, matchSnippet: string) {
  await page.route('**/rest/v1/rpc/search_notebook_content*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          notebook_id: 'mock-id-001',
          notebook_title: matchTitle,
          notebook_description: 'Description for search result',
          notebook_icon: '📚',
          notebook_color: 'blue',
          notebook_visibility: 'private',
          notebook_updated_at: new Date().toISOString(),
          source_title: 'Sample Document.pdf',
          source_snippet: matchSnippet,
          match_count: 3,
          match_rank: 1.0,
        },
      ]),
    });
  });
}

// ============================================================================
// Tests
// ============================================================================
test.describe('Cross-Notebook Full-Text Search', () => {

  test('Typing in SearchBar switches from notebook grid to search results view', async ({ page }) => {
    await mockSearchRpc(page, 'SearchTest Notebook', 'This is a <b>matching</b> snippet from content');
    await page.goto('/');

    // Notebook grid should be visible initially  
    await expect(page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first()).toBeVisible({ timeout: 10000 });

    // Type a search query in the SearchBar (at least 2 chars to trigger search)
    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"], input[placeholder*="ìm kiếm"], input[placeholder*="Search"]')).first();
    await searchInput.fill('test search query');

    // Wait for SearchResults component to render (replaces NotebookGrid)
    // Debounce is 300ms, so we wait a bit
    await page.waitForTimeout(500);

    // The create button should be gone (notebook grid hidden)
    await expect(page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first()).not.toBeVisible({ timeout: 5000 });

    // Search result card should appear
    await expect(page.getByText('SearchTest Notebook')).toBeVisible({ timeout: 5000 });
  });

  test('Search query syncs to URL ?q= parameter', async ({ page }) => {
    await mockSearchRpc(page, 'URL Sync Notebook', 'snippet text');
    await page.goto('/');

    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"], input[placeholder*="ìm kiếm"], input[placeholder*="Search"]')).first();
    const searchQuery = 'urlsynctest';
    await searchInput.fill(searchQuery);

    // Wait for URL to update  
    await page.waitForTimeout(500);
    const currentUrl = page.url();
    expect(currentUrl).toContain(`q=${encodeURIComponent(searchQuery)}`);
  });

  test('Navigating directly to /?q=term pre-populates search and shows results', async ({ page }) => {
    await mockSearchRpc(page, 'Prepopulated Result', 'context snippet for direct navigation');
    await page.goto('/?q=testterm');

    // SearchBar input should be pre-populated
    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"], input[placeholder*="ìm kiếm"], input[placeholder*="Search"]')).first();
    await expect(searchInput).toHaveValue('testterm', { timeout: 5000 });

    // Results should render immediately  
    await page.waitForTimeout(600); // debounce + render
    await expect(page.getByText('Prepopulated Result')).toBeVisible({ timeout: 8000 });
  });

  test('Clearing search returns to notebook grid', async ({ page }) => {
    await mockSearchRpc(page, 'Clearable Result', 'snippet');
    await page.goto('/');

    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"], input[placeholder*="ìm kiếm"], input[placeholder*="Search"]')).first();
    await searchInput.fill('some query');
    await page.waitForTimeout(500);

    // SearchResults visible
    await expect(page.getByText('Clearable Result')).toBeVisible({ timeout: 8000 });

    // Clear the search (Escape or clear button)
    const clearButton = page.locator('button[aria-label*="Xóa"], button[aria-label*="clear"]').first();
    if (await clearButton.isVisible()) {
      await clearButton.click();
    } else {
      await searchInput.clear();
      await searchInput.press('Escape');
    }

    await page.waitForTimeout(500);

    // Notebook grid should return
    await expect(page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first()).toBeVisible({ timeout: 8000 });

    // URL should not have ?q param  
    expect(page.url()).not.toContain('q=');
  });

  test('Clicking a search result navigates to notebook page with fromSearch state', async ({ page }) => {
    await mockSearchRpc(page, 'Clickable Notebook', 'result snippet');
    await page.goto('/');

    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"], input[placeholder*="ìm kiếm"], input[placeholder*="Search"]')).first();
    await searchInput.fill('clickable');
    await page.waitForTimeout(600);

    // Click on the result card
    const resultCard = page.getByText('Clickable Notebook').first();
    await expect(resultCard).toBeVisible({ timeout: 8000 });
    await resultCard.click();

    // Should navigate to notebook page
    await page.waitForURL(/\/notebook\/.+/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/notebook\/.+/);

    // The back button should say "Quay lại Dashboard" (fromSearch breadcrumb)
    await expect(page.getByText('Quay lại Dashboard')).toBeVisible({ timeout: 8000 });
  });

  test('Empty query (less than 2 chars) does not trigger search', async ({ page }) => {
    let searchCalled = false;
    await page.route('**/rest/v1/rpc/search_notebook_content*', async (route) => {
      searchCalled = true;
      await route.continue();
    });

    await page.goto('/');

    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"], input[placeholder*="ìm kiếm"], input[placeholder*="Search"]')).first();

    // Type only 1 char — should not trigger search (hook requires >= 2 chars)
    await searchInput.fill('a');
    await page.waitForTimeout(600);

    // Notebook grid should still show (not in search mode)
    await expect(page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first()).toBeVisible({ timeout: 5000 });
    expect(searchCalled).toBe(false);
  });
});
