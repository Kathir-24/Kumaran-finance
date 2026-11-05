import { test, expect } from './fixtures/test-base.ts';
import { AUTH_PERSONAS } from './fixtures/auth-personas.ts';
import { loginViaUi, logoutViaUi } from './fixtures/auth-fixtures.ts';

test.describe('Suite 01: Staff Authentication & Inactivity Lifecycle', () => {
  test('1. Invalid credentials rejection shows localized alert', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const phoneInput = page.locator('input#phone, input[name="phone"]');
    const passwordInput = page.locator('input#password, input[name="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await phoneInput.fill('9876543210');
    await passwordInput.fill('WrongPassword@999');
    await submitBtn.click();

    // Verify server error alert is displayed
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 10_000 });
    // URL remains on /login
    expect(page.url()).toContain('/login');
  });

  test('2. Valid phone login authenticates and hydrates staff profile', async ({ page }) => {
    await loginViaUi(page, AUTH_PERSONAS.SUPER_ADMIN_MANAGING);

    // Redirected to dashboard
    await expect(page).toHaveURL(/\/(#.*)?$/);

    // Check staff greeting on dashboard
    const greeting = page.locator('h1, h2, h3, header').filter({ hasText: /Kumaran/i }).first();
    await expect(greeting).toBeVisible();

    // Verify auth tokens exist in localStorage
    const token = await page.evaluate(() => window.localStorage.getItem('kc_access_token'));
    expect(token).toBeTruthy();
  });

  test('3. Session persists across page reloads without re-authentication', async ({ managingPartnerPage }) => {
    await expect(managingPartnerPage).toHaveURL(/\/(#.*)?$/);

    // Reload page
    await managingPartnerPage.reload({ waitUntil: 'domcontentloaded' });

    // Still on dashboard, not kicked to /login
    await expect(managingPartnerPage).toHaveURL(/\/(#.*)?$/);
    const mainContent = managingPartnerPage.locator('main');
    await expect(mainContent).toBeVisible();
  });

  test('4. Logout revokes session and redirects to login with reason', async ({ page }) => {
    await loginViaUi(page, AUTH_PERSONAS.SUPER_ADMIN_MANAGING);
    await expect(page).toHaveURL(/\/(#.*)?$/);

    // Perform UI logout
    await logoutViaUi(page);

    // URL is now /login
    expect(page.url()).toContain('/login');

    // Tokens are purged from localStorage
    const tokenAfter = await page.evaluate(() => window.localStorage.getItem('kc_access_token'));
    expect(tokenAfter).toBeNull();
  });
});
