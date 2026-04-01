import { test, expect } from '@playwright/test';
import { mockProcessDocumentEndpoint } from './utils/mock-helpers';

test.describe('Note CRUD Operations', () => {

  test('User can create, edit, and delete a note', async ({ page }) => {
    await mockProcessDocumentEndpoint(page);
    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create a new notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    // Wait for the notebook page to fully load
    await expect(page.getByText('Nguồn tài liệu')).toBeVisible({ timeout: 10000 });

    // Verify Studio sidebar — it's always present in desktop layout
    // Need to wait for the sidebar to be rendered
    const studioHeader = page.locator('h2').filter({ hasText: 'Studio' });
    await expect(studioHeader).toBeVisible({ timeout: 10000 });
    
    // Verify notes section exists
    const ghiChuSection = page.locator('h3').filter({ hasText: 'Ghi chú' });
    await expect(ghiChuSection).toBeVisible({ timeout: 5000 });

    // ========================================
    // 1. CREATE a new note
    // ========================================
    await page.getByRole('button', { name: 'Thêm ghi chú' }).click();

    // NoteEditor should open with "New Note" header
    await expect(page.getByText('New Note')).toBeVisible({ timeout: 5000 });

    // Fill in title and content
    await page.getByPlaceholder('Note title').fill('E2E Test Note Title');
    await page.getByPlaceholder('Write your note here...').fill('This is test note content created by E2E automation.');

    // Click Save
    await page.getByRole('button', { name: /Save/i }).click();

    // Verify the note appears in the notes list (note title renders as h4)
    await expect(page.locator('h4').filter({ hasText: 'E2E Test Note Title' })).toBeVisible({ timeout: 10000 });

    // ========================================
    // 2. EDIT the note
    // ========================================
    // Click on the note card to open it
    await page.locator('h4').filter({ hasText: 'E2E Test Note Title' }).click();

    // The note should open in edit mode (since it's a user note)
    await expect(page.getByPlaceholder('Note title')).toBeVisible({ timeout: 5000 });

    // Update the title
    await page.getByPlaceholder('Note title').clear();
    await page.getByPlaceholder('Note title').fill('Updated E2E Note Title');

    // Update the content
    await page.getByPlaceholder('Write your note here...').clear();
    await page.getByPlaceholder('Write your note here...').fill('Updated content by E2E test automation.');

    // Save the edit
    await page.getByRole('button', { name: /Save/i }).click();

    // Verify the updated note appears
    await expect(page.locator('h4').filter({ hasText: 'Updated E2E Note Title' })).toBeVisible({ timeout: 10000 });

    // ========================================
    // 3. DELETE the note
    // ========================================
    // Click on the note to open it
    await page.locator('h4').filter({ hasText: 'Updated E2E Note Title' }).click();

    // Wait for NoteEditor to load
    await expect(page.getByPlaceholder('Note title')).toBeVisible({ timeout: 5000 });

    // Click the Delete button
    await page.locator('button').filter({ hasText: /^Delete$/ }).click();

    // Verify the note is removed from the list
    await expect(page.locator('h4').filter({ hasText: 'Updated E2E Note Title' })).not.toBeVisible({ timeout: 10000 });

    // Verify the empty state message appears
    await expect(page.getByText('Ghi chú đã lưu sẽ xuất hiện ở đây')).toBeVisible({ timeout: 5000 });
  });

  test('Create multiple notes and verify both exist', async ({ page }) => {
    await page.goto('/');
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Create a notebook
    const createButton = page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await page.waitForURL(/\/notebook\/.+/);

    // Wait for notebook page to fully load  
    await expect(page.getByText('Nguồn tài liệu')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h2').filter({ hasText: 'Studio' })).toBeVisible({ timeout: 10000 });

    // Create first note
    await page.getByRole('button', { name: 'Thêm ghi chú' }).click();
    await expect(page.getByPlaceholder('Note title')).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder('Note title').fill('First Note');
    await page.getByPlaceholder('Write your note here...').fill('Content of first note.');
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for note to appear in list (h4 title)
    await expect(page.locator('h4').filter({ hasText: 'First Note' })).toBeVisible({ timeout: 10000 });

    // Create second note
    await page.getByRole('button', { name: 'Thêm ghi chú' }).click();
    await expect(page.getByPlaceholder('Note title')).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder('Note title').fill('Second Note');
    await page.getByPlaceholder('Write your note here...').fill('Content of second note.');
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for second note to appear
    await expect(page.locator('h4').filter({ hasText: 'Second Note' })).toBeVisible({ timeout: 10000 });

    // Both notes should be visible in the notes list
    await expect(page.locator('h4').filter({ hasText: 'First Note' })).toBeVisible();
    await expect(page.locator('h4').filter({ hasText: 'Second Note' })).toBeVisible();
  });
});
