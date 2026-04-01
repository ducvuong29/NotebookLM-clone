/**
 * Auth Guard E2E Tests
 *
 * Verifies that unauthenticated users are redirected to /auth,
 * and that protected routes cannot be accessed directly.
 *
 * These tests use a SEPARATE browser context WITHOUT the pre-injected
 * auth storage state to simulate an unauthenticated session.
 */
import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

test.describe('Auth Guard — unauthenticated access', () => {
  // All tests in this group use a fresh context WITHOUT storage state
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Accessing / redirects unauthenticated user to /auth', async ({ page }) => {
    await page.goto('/');
    // Should redirect to /auth
    await page.waitForURL(/\/auth/, { timeout: 10000 });
    expect(page.url()).toContain('/auth');
  });

  test('Accessing /notebook/:id directly redirects to /auth', async ({ page }) => {
    // Use a fake UUID — no notebook needs to exist
    await page.goto('/notebook/00000000-0000-0000-0000-000000000001');
    await page.waitForURL(/\/auth/, { timeout: 10000 });
    expect(page.url()).toContain('/auth');
  });

  test('Auth page renders login/sign-up form', async ({ page }) => {
    await page.goto('/auth');
    // Should NOT redirect away — we're already at /auth
    await expect(page).toHaveURL(/\/auth/);

    // The auth page should contain a sign-in form
    // Common selectors: email input, password input, submit button
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
  });

  test('Already-authenticated user is NOT redirected away from /', async ({ browser }) => {
    // Create a context WITH storage state (the pre-injected auth from global.setup.ts)
    const authStatePath = path.resolve('playwright/.auth/user.json');
    const ctx = await browser.newContext({ storageState: authStatePath });
    const page = await ctx.newPage();

    await page.goto('/');

    // Should stay on / (dashboard) — not redirect to /auth
    await page.waitForURL(/^\/?(?![auth])/, { timeout: 10000 });
    expect(page.url()).not.toContain('/auth');

    // Dashboard heading should be visible
    await expect(page.getByText('Chào mừng đến InsightsLM')).toBeVisible({ timeout: 10000 });

    await ctx.close();
  });

  test('Auth page handles invalid login gracefully', async ({ page }) => {
    await page.goto('/auth');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill('nonexistent@test-auth-guard.com');
    await passwordInput.fill('wrongpassword123');
    await submitButton.click();

    // An error message should appear (not crash, not redirect to dashboard)
    // Different apps show different error messages — match common patterns
    const errorMsg = page.locator('[role="alert"], .text-destructive, [data-type="error"]').first();
    await expect(errorMsg).toBeVisible({ timeout: 8000 });

    // Should still be on /auth page
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe('Auth Guard — sign out flow', () => {
  // This group uses the real auth state
  test('Signing out redirects to /auth page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Chào mừng đến InsightsLM')).toBeVisible({ timeout: 10000 });

    // Click user avatar dropdown
    const userMenuButton = page.getByRole('button', { name: 'Menu người dùng' });
    await userMenuButton.click();

    // Click Sign Out
    await page.getByText('Sign Out').click();

    // Should redirect to /auth
    await page.waitForURL(/\/auth/, { timeout: 10000 });
    expect(page.url()).toContain('/auth');
  });
});
