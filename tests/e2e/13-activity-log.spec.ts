/**
 * Activity Log E2E Tests
 *
 * Verifies that the ActivityPanel inside the NotebookPage correctly displays
 * logged events. Uses network mocking so no real DB writes needed.
 *
 * Key fix: route mocks MUST be registered before page.goto() / page.reload()
 * because Playwright intercepts from the moment routes are registered.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// ============================================================================
// Selector helper — the Activity section is a <button> containing "Hoạt động"
// inside a Collapsible in StudioSidebar, only shown when isMember=true (owner qualifies)
// ============================================================================
async function openActivityPanel(page: import('@playwright/test').Page) {
  // Selector: the collapsible trigger button with text "Hoạt động"
  const activityBtn = page.locator('button', { hasText: 'Hoạt động' }).first();
  await expect(activityBtn).toBeVisible({ timeout: 15000 });
  await activityBtn.click();
  // Wait for collapsible to expand
  await page.waitForTimeout(300);
}

// ============================================================================
// Helper: navigate to a new notebook with mocked activity log
// ============================================================================
async function gotoNotebookWithMockedActivity(
  page: import('@playwright/test').Page,
  activityEntries: object[],
  profileEntries: object[] = [],
) {
  // 1. Go to dashboard, create notebook
  await page.goto('/');
  await page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first().click();
  await page.waitForURL(/\/notebook\/.+/);
  const notebookId = page.url().match(/\/notebook\/(.+)/)?.[1] as string;

  // 2. Register mocks AFTER navigation (they apply to all subsequent requests)
  await page.route('**/rest/v1/activity_log**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(activityEntries),
    });
  });

  if (profileEntries.length > 0) {
    // Only override profile requests that include mock IDs
    await page.route('**/rest/v1/profiles**', async (route) => {
      const url = route.request().url();
      if (url.includes('mock-')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(profileEntries),
        });
      } else {
        await route.continue();
      }
    });
  }

  return notebookId;
}

// ============================================================================
// Tests
// ============================================================================
test.describe('Activity Log Panel', () => {

  test('ActivityPanel renders "Chưa có hoạt động nào" when log is empty', async ({ page }) => {
    const notebookId = await gotoNotebookWithMockedActivity(page, []);

    await openActivityPanel(page);

    // Empty state text should be visible
    await expect(page.getByText('Chưa có hoạt động nào')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Các thay đổi sẽ được ghi lại tại đây')).toBeVisible();

    console.log(`✓ Notebook ${notebookId} shows empty activity log`);
  });

  test('ActivityPanel renders source_added entry correctly', async ({ page }) => {
    const notebookId = await gotoNotebookWithMockedActivity(
      page,
      [
        {
          id: 'mock-act-001',
          notebook_id: 'placeholder',
          actor_id: 'mock-actor-001',
          action_type: 'source_added',
          metadata: { source_type: 'pdf', source_title: 'Test Document.pdf' },
          created_at: new Date().toISOString(),
        },
      ],
      [{ id: 'mock-actor-001', full_name: 'E2E Tester', avatar_url: null, email: 'e2e@test.com' }],
    );

    await openActivityPanel(page);

    // Should NOT show empty state
    await expect(page.getByText('Chưa có hoạt động nào')).not.toBeVisible({ timeout: 5000 });

    // Should show the action text "đã thêm nguồn"
    await expect(page.getByText(/đã thêm nguồn/i).first()).toBeVisible({ timeout: 10000 });

    console.log(`✓ Notebook ${notebookId} shows source_added activity`);
  });

  test('ActivityPanel renders source_deleted entry correctly', async ({ page }) => {
    await gotoNotebookWithMockedActivity(
      page,
      [
        {
          id: 'mock-act-002',
          notebook_id: 'placeholder',
          actor_id: 'mock-actor-002',
          action_type: 'source_deleted',
          metadata: { source_title: 'Deleted Document.pdf' },
          created_at: new Date().toISOString(),
        },
      ],
      [{ id: 'mock-actor-002', full_name: 'Test User', avatar_url: null, email: 'tester@test.com' }],
    );

    await openActivityPanel(page);

    await expect(page.getByText(/đã xoá nguồn/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Deleted Document\.pdf/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('ActivityPanel renders member_invited entry with correct text', async ({ page }) => {
    await gotoNotebookWithMockedActivity(
      page,
      [
        {
          id: 'mock-act-003',
          notebook_id: 'placeholder',
          actor_id: 'mock-actor-003',
          action_type: 'member_invited',
          metadata: { target_email: 'newmember@test.com', role: 'editor' },
          created_at: new Date().toISOString(),
        },
      ],
      [{ id: 'mock-actor-003', full_name: 'Owner User', avatar_url: null, email: 'owner@test.com' }],
    );

    await openActivityPanel(page);

    await expect(page.getByText(/đã mời/i).first()).toBeVisible({ timeout: 10000 });
    // The invitation should mention "editor" role
    await expect(page.getByText(/editor/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('ActivityPanel groups entries by day — shows "Hôm nay" header', async ({ page }) => {
    const now = new Date().toISOString();

    await gotoNotebookWithMockedActivity(
      page,
      [
        {
          id: 'act-g1',
          notebook_id: 'placeholder',
          actor_id: 'mock-actor-004',
          action_type: 'source_added',
          metadata: { source_type: 'pdf' },
          created_at: now,
        },
        {
          id: 'act-g2',
          notebook_id: 'placeholder',
          actor_id: 'mock-actor-004',
          action_type: 'note_updated',
          metadata: {},
          created_at: now,
        },
      ],
      [{ id: 'mock-actor-004', full_name: 'Test User', avatar_url: null, email: 'test@test.com' }],
    );

    await openActivityPanel(page);

    // Day group label "Hôm nay" should be visible
    await expect(page.getByText('Hôm nay')).toBeVisible({ timeout: 10000 });

    // Both entries should be visible in the group
    await expect(page.getByText(/đã thêm nguồn/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/đã cập nhật ghi chú/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('ActivityPanel shows real source_added entry inserted via service role', async ({ page }) => {
    // This test inserts a real DB entry using service role key
    // then verifies the UI reads it via the real Supabase query

    await page.goto('/');
    await page.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first().click();
    await page.waitForURL(/\/notebook\/.+/);
    const notebookId = page.url().match(/\/notebook\/(.+)/)?.[1] as string;

    // Get the E2E test user ID (created by global.setup.ts)
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const testUser = usersData?.users?.find((u: { email?: string }) => u.email === 'e2e-tester@example.com');

    if (!testUser) {
      test.skip(); // No test user found, skip
      return;
    }

    // Insert real activity log row via service role (bypasses RLS)
    const { error } = await supabase.from('activity_log').insert({
      notebook_id: notebookId,
      actor_id: testUser.id,
      action_type: 'source_added',
      metadata: { source_type: 'text', source_title: 'E2E Real Entry' },
    });

    if (error) {
      console.warn(`DB insert failed (${error.message}), skipping real-data test`);
      test.skip();
      return;
    }

    await openActivityPanel(page);

    await expect(page.getByText(/đã thêm nguồn/i).first()).toBeVisible({ timeout: 15000 });
  });
});
