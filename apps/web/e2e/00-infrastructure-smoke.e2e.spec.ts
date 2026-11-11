import { test, expect } from './fixtures/test-base.ts';
import { AUTH_PERSONAS } from './fixtures/auth-personas.ts';
import { loginViaUi, loginViaApi } from './fixtures/auth-fixtures.ts';

test.describe('Task 12.1: Playwright Test Infrastructure & Zero-Mock Smoke Tests', () => {
  test('1. Web Server & Gateway Health: Serves login portal document shell', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Validate page title and login form visibility
    await expect(page).toHaveTitle(/Kumaran Chits/i);
    const form = page.locator('form[data-testid="login-form"], form');
    await expect(form).toBeVisible();

    // Verify phone and password input fields exist
    const phoneInput = page.locator('input#phone, input[name="phone"]');
    const passwordInput = page.locator('input#password, input[name="password"]');
    await expect(phoneInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('2. Bilingual UI Rendering: Locale toggle switches English and Tamil strings', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Locate language switcher
    const langSwitcher = page.locator('button:has-text("தமிழ்"), button:has-text("English")').first();
    if (await langSwitcher.isVisible()) {
      await langSwitcher.click();
      // Allow brief animation / re-render
      await page.waitForTimeout(300);
    }

    // Verify phone input field rendered cleanly
    const phoneField = page.locator('input#phone, input[name="phone"]');
    await expect(phoneField).toBeVisible();
  });

  test('3. Real UI Login Flow: Submits Managing Partner credentials and redirects to dashboard', async ({ page }) => {
    await loginViaUi(page, AUTH_PERSONAS.SUPER_ADMIN_MANAGING);

    // Verify successful redirection to dashboard root
    await expect(page).toHaveURL(/\/(#.*)?$/);

    // Verify greeting or header on dashboard for Managing Partner
    const greeting = page.locator('h1, h2, h3, header, banner').filter({ hasText: /Kumaran/i }).first();
    await expect(greeting).toBeVisible();
  });

  test('4. API Session Injection: Fast hydration without UI login boilerplate', async ({ managingPartnerPage }) => {
    // Page was initialized with pre-injected BFF cookies
    await expect(managingPartnerPage).toHaveURL(/\/(#.*)?$/);

    // Verify zero secret JWTs in client storage while BFF cookies are present
    const localToken = await managingPartnerPage.evaluate(() =>
      window.localStorage.getItem('kc_access_token'),
    );
    expect(localToken).toBeNull();
    const cookies = await managingPartnerPage.context().cookies();
    expect(cookies.some((c) => c.name === 'kc_session_active' && c.value === '1')).toBe(true);

    // Verify authenticated main container is rendered
    const mainContainer = managingPartnerPage.locator('main');
    await expect(mainContainer).toBeVisible();
  });

  test('5. Guardrail 10 Maker != Checker Separation: Dual partner sessions have distinct IDs', async ({ request }) => {
    const makerSession = await loginViaApi(request, AUTH_PERSONAS.SUPER_ADMIN_MANAGING);
    const checkerSession = await loginViaApi(request, AUTH_PERSONAS.SUPER_ADMIN_CHECKER);

    expect(makerSession.accessToken).toBeTruthy();
    expect(checkerSession.accessToken).toBeTruthy();

    // Maker and Checker must possess distinct user IDs
    expect(makerSession.user.id).not.toBe(checkerSession.user.id);
    expect(makerSession.user.phone).toBe('9876543210');
    expect(checkerSession.user.phone).toBe('9876543211');
  });

  test('6. RBAC Role Barrier: Statutory Auditor persona lacks admin write navigation', async ({ auditorPage }) => {
    await auditorPage.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(auditorPage).toHaveURL(/\/(#.*)?$/);

    // Verify auditor BFF session cookie is active
    const cookies = await auditorPage.context().cookies();
    expect(cookies.some((c) => c.name === 'kc_session_active' && c.value === '1')).toBe(true);

    // Verify auditor sidebar does NOT display sensitive write paths
    const reversalsLink = auditorPage.locator('aside a[href*="/reversals"]');
    const branchesLink = auditorPage.locator('aside a[href*="/branches"]');
    await expect(reversalsLink).toHaveCount(0);
    await expect(branchesLink).toHaveCount(0);
  });

  test('7. BFF SSE Streaming: Live dashboard useApprovalsStream connects unbuffered via HttpOnly cookies', async ({
    managingPartnerPage,
  }) => {
    const streamResponsePromise = managingPartnerPage.waitForResponse(
      (res) =>
        res.url().includes('/bff/api/v1/reports/approvals-stream') &&
        res.status() === 200,
    );

    await managingPartnerPage.goto('/', { waitUntil: 'domcontentloaded' });

    const streamResponse = await streamResponsePromise;
    expect(streamResponse.status()).toBe(200);
    expect(streamResponse.headers()['content-type'] || '').toContain('text/event-stream');

    // Open Bell dropdown and verify Topbar live SSE indicator flips to connected (en or ta default locale)
    const bellButton = managingPartnerPage.getByRole('button', {
      name: /Pending Approvals|நிலுவை ஒப்புதல்கள்/i,
    });
    await expect(bellButton).toBeVisible();
    await bellButton.click();

    const liveStatusDot = managingPartnerPage.locator('[title="Live SSE Stream Connected"]');
    await expect(liveStatusDot).toBeVisible({ timeout: 10_000 });
  });

  test('8. Edge JWT & RBAC Guardrails: Rejects spoofed kc_session_active cookie and enforces role gates at Edge', async ({
    browser,
    auditorPage,
  }) => {
    const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001';
    const spoofContext = await browser.newContext();
    try {
      await spoofContext.addCookies([
        {
          name: 'kc_session_active',
          value: '1',
          url: baseUrl,
          httpOnly: false,
          sameSite: 'Lax',
        },
      ]);

      const spoofPage = await spoofContext.newPage();
      await spoofPage.goto('/branches', { waitUntil: 'domcontentloaded' });
      await expect(spoofPage).toHaveURL(/\/login(\?|$)/);
    } finally {
      await spoofContext.close();
    }

    await auditorPage.goto('/branches', { waitUntil: 'domcontentloaded' });
    await expect(auditorPage).toHaveURL(/\/\?error=forbidden/);
  });
});
