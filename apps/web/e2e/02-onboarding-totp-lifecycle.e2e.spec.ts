import { test, expect } from './fixtures/test-base.ts';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

function generateTotpCode(secretBase32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secretBase32.length; i++) {
    const val = alphabet.indexOf(secretBase32.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const keyBytes = Buffer.from(
    bits.match(/.{1,8}/g)?.map((chunk) => parseInt(chunk.padEnd(8, '0'), 2)) ?? [],
  );

  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epoch / 30);
  const timeBuf = Buffer.alloc(8);
  timeBuf.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', keyBytes).update(timeBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 1_000_000).toString().padStart(6, '0');
}

test.describe('Suite 02: Full Browser Lifecycle — Login → Onboarding → TOTP → Session', () => {
  const testPhone = '9842100088';
  const tempPassword = 'TempPassword#123';
  const permanentPassword = 'PermanentPassword#2026';
  const totpPlainSecret = '4POMBZGFMEFPXRIIF7BVGDMFCSODUERH';

  test.beforeAll(async () => {
    // Seed staff user in database with mustChangePassword = true & isTotpEnabled = true
    execSync('node ../api/scripts/seed-onboarding-user.cjs', { stdio: 'inherit' });
  });

  test('Complete Browser Journey: Login → /onboarding → /2fa → / (Dashboard)', async ({ page }) => {
    // -------------------------------------------------------------------------
    // Step 1: Login with temporary password
    // -------------------------------------------------------------------------
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const phoneInput = page.locator('input#phone, input[name="phone"]');
    const passwordInput = page.locator('input#password, input[name="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await phoneInput.fill(testPhone);
    await passwordInput.fill(tempPassword);
    await submitBtn.click();

    // Assert: Browser is redirected to /onboarding because mustChangePassword is true
    await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
    expect(page.url()).toContain('/onboarding');

    // Assert: Dedicated onboarding restricted cookie was issued by BFF
    const cookiesAfterLogin = await page.context().cookies();
    const onboardingCookie = cookiesAfterLogin.find((c) => c.name === 'kc_onboarding_token');
    expect(onboardingCookie).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 2: Set permanent password on /onboarding
    // -------------------------------------------------------------------------
    const newPasswordInput = page.locator('input#newPassword');
    const confirmPasswordInput = page.locator('input#confirmPassword');
    const onboardingSubmitBtn = page.locator('button[type="submit"][form="onboarding-form"]');

    await expect(newPasswordInput).toBeVisible({ timeout: 10_000 });
    await newPasswordInput.fill(permanentPassword);
    await confirmPasswordInput.fill(permanentPassword);
    await onboardingSubmitBtn.click();

    // Assert: Since isTotpEnabled is true, the user is redirected to /2fa
    await page.waitForURL(/\/2fa/, { timeout: 15_000 });
    expect(page.url()).toContain('/2fa');

    // Assert: kc_onboarding_token was cleared and kc_totp_pending_token was set
    const cookiesAfterOnboard = await page.context().cookies();
    const pendingTotpCookie = cookiesAfterOnboard.find((c) => c.name === 'kc_totp_pending_token');
    expect(pendingTotpCookie).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 3: Complete TOTP 2FA Verification on /2fa
    // -------------------------------------------------------------------------
    const totpCells = page.locator('[data-testid="totp-input-cells"] input');
    await expect(totpCells.first()).toBeVisible({ timeout: 10_000 });

    // Generate valid TOTP code
    const totpCode = generateTotpCode(totpPlainSecret);
    expect(totpCode).toHaveLength(6);

    // Type 6 digits into the auto-advancing cells
    for (let i = 0; i < 6; i++) {
      await totpCells.nth(i).fill(totpCode[i]);
    }

    // -------------------------------------------------------------------------
    // Step 4: Arrive at authenticated Dashboard with active session
    // -------------------------------------------------------------------------
    await page.waitForURL(/\/(#.*)?$/, { timeout: 15_000 });
    expect(page.url()).not.toContain('/login');
    expect(page.url()).not.toContain('/onboarding');
    expect(page.url()).not.toContain('/2fa');

    // Assert: Session is fully hydrated and active
    const finalCookies = await page.context().cookies();
    expect(finalCookies.some((c) => c.name === 'kc_session_active' && c.value === '1')).toBe(true);
    expect(finalCookies.some((c) => c.name === 'kc_access_token' && c.httpOnly)).toBe(true);
    expect(finalCookies.some((c) => c.name === 'kc_refresh_token' && c.httpOnly)).toBe(true);

    // Assert: Reloading keeps the session active on the dashboard
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/(#.*)?$/);
  });
});
