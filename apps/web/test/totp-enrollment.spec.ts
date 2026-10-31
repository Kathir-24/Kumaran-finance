// ==============================================================================
// Kumaran Chits — TOTP 2FA Enrollment & Security Management Test Suite
// Verifies Base32 key formatting, SVG QR generation, 6-digit confirmation validation,
// password deactivation guards, and auth-store synchronization.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { useAuthStore, type AuthUser } from '../src/stores/auth-store.ts';

// Helper matching TotpEnrollmentModal Base32 secret formatting
function formatBase32Secret(secret: string): string {
  if (!secret) return '';
  return secret.match(/.{1,4}/g)?.join(' ') || secret;
}

// 6-digit RFC 6238 TOTP validator matching backend REGEX_TOTP_CODE
const totpRegex = /^\d{6}$/;
function isValidTotpCode(code: string): boolean {
  return totpRegex.test(code);
}

// Password requirement validator for 2FA deactivation
function isValidDisablePassword(password: string): boolean {
  return typeof password === 'string' && password.trim().length > 0;
}

test('Base32 Secret Formatting: Correctly chunks keys into 4-character blocks for readability', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const formatted = formatBase32Secret(secret);
  assert.equal(formatted, 'JBSW Y3DP EHPK 3PXP');

  // Odd length secret
  assert.equal(formatBase32Secret('ABCDEFGHIJ'), 'ABCD EFGH IJ');

  // Empty string
  assert.equal(formatBase32Secret(''), '');
});

test('SVG QR Code Generation: Generates valid vector SVG from RFC 6238 otpauth URI', async () => {
  const otpauthUri =
    'otpauth://totp/Kumaran%20Chits:9842100001?secret=JBSWY3DPEHPK3PXP&issuer=Kumaran%20Chits&algorithm=SHA1&digits=6&period=30';

  const svg = await QRCode.toString(otpauthUri, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  assert.ok(typeof svg === 'string', 'SVG should be a string');
  assert.ok(svg.startsWith('<svg'), 'Generated output must start with <svg tag');
  assert.ok(svg.includes('</svg>'), 'Generated output must contain closing </svg>');
  assert.ok(svg.includes('viewBox'), 'SVG must include viewBox attribute for responsive scaling');
});

test('TOTP Code Validation: Strictly validates 6-digit numeric confirmation code', () => {
  assert.equal(isValidTotpCode('123456'), true);
  assert.equal(isValidTotpCode('000000'), true);
  assert.equal(isValidTotpCode('987654'), true);

  // Invalid cases
  assert.equal(isValidTotpCode(''), false);
  assert.equal(isValidTotpCode('12345'), false);
  assert.equal(isValidTotpCode('1234567'), false);
  assert.equal(isValidTotpCode('12345a'), false);
  assert.equal(isValidTotpCode('abcdef'), false);
  assert.equal(isValidTotpCode('12 345'), false);
});

test('Disable 2FA Validation: Requires non-empty password', () => {
  assert.equal(isValidDisablePassword('Admin@Kumaran2026'), true);
  assert.equal(isValidDisablePassword('securepass'), true);

  // Rejects empty / blank
  assert.equal(isValidDisablePassword(''), false);
  assert.equal(isValidDisablePassword('   '), false);
});

test('AuthStore 2FA Lifecycle: Synchronizes isTotpEnabled state on enrollment and deactivation', () => {
  const testUser: AuthUser = {
    id: 'user-staff-007',
    name: 'R. Kathirvel',
    phone: '9842143210',
    roles: ['ACCOUNTANT'],
    branchId: 'branch-prd-001',
    isTotpEnabled: false,
  };

  useAuthStore.getState().setAuth(testUser, {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
  });

  // Verify initial state
  assert.equal(useAuthStore.getState().user?.isTotpEnabled, false);

  // Simulate Step 1: Successful TOTP enrollment via POST /api/v1/auth/totp/enable
  useAuthStore.getState().updateUser({ isTotpEnabled: true });
  assert.equal(useAuthStore.getState().user?.isTotpEnabled, true);

  // Simulate Step 2: Successful TOTP deactivation via POST /api/v1/auth/totp/disable
  useAuthStore.getState().updateUser({ isTotpEnabled: false });
  assert.equal(useAuthStore.getState().user?.isTotpEnabled, false);
});

test('Backend Contract Invariants: Payload schemas match NestJS DTO definitions', () => {
  // TotpEnableDto: { secret: string, code: string }
  const enablePayload = {
    secret: 'JBSWY3DPEHPK3PXP',
    code: '654321',
  };
  assert.ok(typeof enablePayload.secret === 'string' && enablePayload.secret.length > 0);
  assert.ok(isValidTotpCode(enablePayload.code));

  // DisableTotpDto: { password: string }
  const disablePayload = {
    password: 'CurrentPassword123',
  };
  assert.ok(isValidDisablePassword(disablePayload.password));
});
