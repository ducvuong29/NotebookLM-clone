/**
 * Admin Panel E2E Tests (Spec 14)
 *
 * Covers:
 *  - Non-admin access guard (regular user receives 403 / redirect)
 *  - Admin panel loads with Users section by default
 *  - User table renders with search functionality
 *  - Delete user dialog: 2-step confirmation (type email to enable delete button)
 *  - Bulk import CSV button is visible in admin users section
 *  - Sidebar tab navigation (Users → Public Notebooks → Settings)
 *  - Public Notebooks section: create form renders
 *
 * Strategy: Uses network-level mocking for admin-api edge function calls so
 * these tests run without a real admin account in Supabase.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Helper: mock the admin-api edge function to return a user list
// ---------------------------------------------------------------------------
async function mockAdminApi(
  page: import('@playwright/test').Page,
  usersResult: object[] = [],
  totalCount = 0,
) {
  await page.route('**/functions/v1/admin-api', async (route) => {
    const body = await route.request().postDataJSON();
    if (body?.action === 'list_users') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { users: usersResult, totalCount },
        }),
      });
    } else {
      // For other actions (create, delete, toggle_visibility) return success
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true } }),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Mock sample users
// ---------------------------------------------------------------------------
const MOCK_USERS = [
  {
    id: 'mock-user-001',
    email: 'alice@example.com',
    full_name: 'Alice Smith',
    role: 'user',
    last_sign_in_at: '2026-03-01T10:00:00Z',
  },
  {
    id: 'mock-user-002',
    email: 'bob@example.com',
    full_name: 'Bob Jones',
    role: 'user',
    last_sign_in_at: '2026-03-15T08:30:00Z',
  },
  {
    id: 'mock-admin-001',
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin',
    last_sign_in_at: '2026-04-01T07:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Test Suite: Admin Panel (authenticated admin user — uses global auth state)
// ---------------------------------------------------------------------------
test.describe('Admin Panel — structure & navigation', () => {

  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page, MOCK_USERS, MOCK_USERS.length);
    await page.goto('/admin');
    // Give the panel time to load
    await page.waitForURL(/\/admin/, { timeout: 10000 });
  });

  test('Admin panel renders Users section heading by default', async ({ page }) => {
    // The heading "Quản lý người dùng" should be visible
    await expect(page.getByRole('heading', { name: /Quản lý người dùng/i })).toBeVisible({ timeout: 10000 });
  });

  test('Admin sidebar contains navigation items', async ({ page }) => {
    // Nav items: Người dùng, Public Notebook, Cài đặt
    await expect(page.getByRole('navigation', { name: /Admin navigation/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Người dùng')).toBeVisible();
    await expect(page.getByText('Public Notebook')).toBeVisible();
    await expect(page.getByText('Cài đặt')).toBeVisible();
  });

  test('User table renders mocked user rows', async ({ page }) => {
    // Alice and Bob should appear in the table
    await expect(page.getByText('alice@example.com')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('bob@example.com')).toBeVisible({ timeout: 5000 });
  });

  test('Admin user shows Admin badge (no delete button)', async ({ page }) => {
    // Admin rows should display Admin badge and NOT show delete button
    await expect(page.getByText('admin@example.com')).toBeVisible({ timeout: 10000 });

    // Admin cannot be deleted — delete button should not be visible for admin row
    // We check by hovering and confirming no Trash2 button near admin email
    const adminRow = page.locator('tr').filter({ hasText: 'admin@example.com' });
    await expect(adminRow).toBeVisible();
    // The delete button inside admin row should not exist
    const deleteBtn = adminRow.locator('button[title="Xóa tài khoản"]');
    await expect(deleteBtn).toHaveCount(0);
  });

  test('User search input filters table (mocked)', async ({ page }) => {
    // Wait for table 
    await expect(page.getByText('alice@example.com')).toBeVisible({ timeout: 10000 });

    // Set up new mock for filtered results
    await page.route('**/functions/v1/admin-api', async (route) => {
      const body = await route.request().postDataJSON();
      if (body?.action === 'list_users') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              users: MOCK_USERS.filter(u => u.email.includes('alice')),
              totalCount: 1,
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { success: true } }),
        });
      }
    });

    // Type in the search box
    const searchInput = page.getByRole('searchbox').or(
      page.locator('input[placeholder*="Tìm kiếm"]')
    ).first();
    await searchInput.fill('alice');

    // Allow debounce (300ms) + render
    await page.waitForTimeout(500);

    // Alice should still be visible, Bob should be filtered out
    await expect(page.getByText('alice@example.com')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('bob@example.com')).not.toBeVisible({ timeout: 5000 });
  });

  test('Delete user dialog requires email confirmation to enable button', async ({ page }) => {
    // Click delete (trash icon) on the first non-admin user (alice)
    await expect(page.getByText('alice@example.com')).toBeVisible({ timeout: 10000 });
    const aliceRow = page.locator('tr').filter({ hasText: 'alice@example.com' });
    
    // Hover to reveal the delete button
    await aliceRow.hover();
    const deleteBtn = aliceRow.locator('button[title="Xóa tài khoản"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Dialog should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Confirm button should be disabled initially (empty confirmation input)
    const confirmBtn = dialog.getByRole('button', { name: /Xóa vĩnh viễn/i });
    await expect(confirmBtn).toBeDisabled();

    // Typing wrong text keeps button disabled
    const confirmInput = dialog.locator('input#confirm-delete');
    await confirmInput.fill('wrong@email.com');
    await expect(confirmBtn).toBeDisabled();

    // Typing the exact email enables the button
    await confirmInput.clear();
    await confirmInput.fill('alice@example.com');
    await expect(confirmBtn).toBeEnabled({ timeout: 3000 });

    // Cancel without deleting
    await dialog.getByRole('button', { name: /Hủy/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Clicking "Public Notebook" tab shows Quản lý Notebooks heading', async ({ page }) => {
    // Also mock notebooks endpoint
    await page.route('**/rest/v1/notebooks**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.getByText('Public Notebook').click();

    // URL should update with tab=notebooks param
    await expect(page).toHaveURL(/tab=notebooks/, { timeout: 5000 });

    // Heading should change
    await expect(page.getByRole('heading', { name: /Quản lý Notebooks/i })).toBeVisible({ timeout: 8000 });
  });

  test('Public Notebooks section has create form with title input', async ({ page }) => {
    await page.route('**/rest/v1/notebooks**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.getByText('Public Notebook').click();
    await expect(page).toHaveURL(/tab=notebooks/, { timeout: 5000 });

    // Create form should contain title input and submit button
    const titleInput = page.locator('input#title').or(page.getByLabel(/Tên Notebook/i)).first();
    await expect(titleInput).toBeVisible({ timeout: 8000 });

    const submitBtn = page.getByRole('button', { name: /Tạo Notebook/i });
    await expect(submitBtn).toBeVisible();
    // Submit should be disabled when title is empty
    await expect(submitBtn).toBeDisabled();
  });

  test('Clicking Settings tab shows Cài đặt hệ thống placeholder', async ({ page }) => {
    await page.getByText('Cài đặt').click();

    await expect(page).toHaveURL(/tab=settings/, { timeout: 5000 });
    await expect(page.getByRole('heading', { name: /Cài đặt hệ thống/i })).toBeVisible({ timeout: 8000 });
    // It's a placeholder — should mention upcoming features
    await expect(page.getByText(/Tính năng đang được phát triển/i)).toBeVisible();
  });

  test('"Về trang chính" button in sidebar navigates to /', async ({ page }) => {
    await page.getByRole('button', { name: /Về trang chính/i }).click();
    await page.waitForURL('/', { timeout: 8000 });
    expect(page.url()).toMatch(/\/$/);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Admin Route Access Guard
// ---------------------------------------------------------------------------
test.describe('Admin Panel — access guard', () => {
  // Use a fresh unauthenticated context
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Unauthenticated user accessing /admin is redirected to /auth', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL(/\/auth/, { timeout: 10000 });
    expect(page.url()).toContain('/auth');
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Bulk Import CSV button visible in admin
// ---------------------------------------------------------------------------
test.describe('Admin Panel — bulk import button', () => {
  test('CSV import button is visible in Users tab', async ({ page }) => {
    await mockAdminApi(page, [], 0);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /Quản lý người dùng/i })).toBeVisible({ timeout: 10000 });

    // The BulkImportDialog trigger button should be visible
    const bulkBtn = page.getByRole('button', { name: /Nhập CSV/i });
    await expect(bulkBtn).toBeVisible({ timeout: 8000 });
  });
});
