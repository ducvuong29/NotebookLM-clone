import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const viewerEmail = `e2e-viewer-${Date.now()}@example.com`;
const viewerPassword = 'E2E-Password-123!!';
let viewerId = '';

test.describe('Epic 4b: Collaboration Roles (Owner & Viewer)', () => {

  test.beforeAll(async () => {
    // Create a Viewer user via Admin API
    const { data: userData, error } = await supabase.auth.admin.createUser({
      email: viewerEmail,
      password: viewerPassword,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Viewer' }
    });
    if (error) throw new Error(`[Setup] Error creating viewer user: ${error.message}`);
    viewerId = userData.user.id;
  });

  test.afterAll(async () => {
    if (viewerId) {
      await supabase.auth.admin.deleteUser(viewerId).catch(() => {});
    }
  });

  test('Owner can invite Viewer and Viewer has restricted access', async ({ browser }) => {
    const ownerContext = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
    const ownerPage = await ownerContext.newPage();
    
    // 1. Owner creates a notebook
    await ownerPage.goto('/');
    const createButton = ownerPage.locator('button:has-text("Tạo mới"), button:has-text("Tạo notebook")').first();
    await createButton.click();
    await ownerPage.waitForURL(/\/notebook\/.+/);

    const match = ownerPage.url().match(/\/notebook\/(.+)/);
    const notebookId = match?.[1] as string;
    expect(notebookId).toBeTruthy();

    await expect(ownerPage.getByText('Nguồn tài liệu')).toBeVisible();

    // 2. Owner opens Member Panel and Invites Viewer
    await ownerPage.getByRole('button', { name: 'Thành viên' }).click();
    await ownerPage.getByRole('button', { name: 'Mời' }).click();
    
    // In InvitationDialog
    const emailInput = ownerPage.getByPlaceholder('Nhập địa chỉ email');
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(viewerEmail);
    
    // Select viewer role
    await ownerPage.getByRole('combobox').click();
    await ownerPage.getByRole('option', { name: 'Người xem' }).click();
    
    // Send invitation
    await ownerPage.getByRole('button', { name: 'Gửi lời mời' }).click();
    
    // Wait for success toast or invite dialog to close
    await expect(ownerPage.getByRole('button', { name: 'Gửi lời mời' })).toBeHidden({ timeout: 5000 });
    
    // Close MemberPanel
    await ownerPage.keyboard.press('Escape');
    
    // 3. Open Viewer Session
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    
    // Viewer logs in
    await viewerPage.goto('/login');
    await viewerPage.getByPlaceholder('Email address', { exact: false }).or(viewerPage.getByLabel('Email')).fill(viewerEmail);
    await viewerPage.getByPlaceholder('Password', { exact: false }).or(viewerPage.getByLabel('Mật khẩu')).fill(viewerPassword);
    await viewerPage.getByRole('button', { name: 'Đăng nhập' }).or(viewerPage.getByRole('button', { name: 'Log in' })).click();
    
    // Check if on dashboard and can see the shared notebook
    await viewerPage.waitForURL('/');
    await expect(viewerPage.getByText('Notebook chưa có tiêu đề').first()).toBeVisible({ timeout: 10000 });
    
    // Navigate to notebook
    await viewerPage.goto(`/notebook/${notebookId}`);
    await expect(viewerPage.getByText('Nguồn tài liệu')).toBeVisible();

    // 4. Validate Viewer restrictions
    // Cannot add source
    await expect(viewerPage.getByRole('button', { name: 'Thêm nguồn' })).toBeHidden();
    
    // Open Member Panel
    await viewerPage.getByRole('button', { name: 'Thành viên' }).click();
    
    // Cannot invite
    await expect(viewerPage.getByRole('button', { name: 'Mời' })).toBeHidden();
    
    // Cannot change role or remove members (Selectors will be disabled or hidden)
    const selectTrigger = viewerPage.getByRole('combobox', { name: /Thay đổi vai trò/ });
    if (await selectTrigger.count() > 0) {
      await expect(selectTrigger.first()).toBeDisabled();
    }
    
    // Viewer can write notes though? If notebook supports it.
    await viewerContext.close();
    await ownerContext.close();
  });
});
