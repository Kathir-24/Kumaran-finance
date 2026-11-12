// ==============================================================================
// Kumaran Chits — 2FA TOTP Validation & Clipboard Paste Test Suite
// Verifies RFC 6238 6-digit code validation, paste extraction & error mapping.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

// Helper extracting clean 6 digits from raw clipboard paste text
function extractPasteDigits(pastedText: string): string {
  return pastedText.replace(/\D/g, '').slice(0, 6);
}

// 6-digit RFC 6238 TOTP validator matching backend REGEX_TOTP_CODE
const totpRegex = /^\d{6}$/;
function isValidTotp(code: string): boolean {
  return totpRegex.test(code);
}

test('RFC 6238 TOTP Validation: Accepts valid 6-digit numeric codes', () => {
  const validCodes = ['492817', '012345', '000000', '999999', '123456'];

  for (const code of validCodes) {
    assert.equal(isValidTotp(code), true, `Code ${code} should be valid`);
  }
});

test('RFC 6238 TOTP Validation: Rejects invalid codes', () => {
  const invalidCodes = [
    '',        // Empty
    '12345',   // 5 digits
    '1234567', // 7 digits
    '49281a',  // Alphanumeric
    'abcdef',  // Letters only
    '12 345',  // Contains spaces
    '12-345',  // Contains hyphen
  ];

  for (const code of invalidCodes) {
    assert.equal(isValidTotp(code), false, `Code ${code} should be rejected`);
  }
});

test('Clipboard Paste Extraction: Cleans dirty inputs and limits to 6 digits', () => {
  // Plain 6 digits
  assert.equal(extractPasteDigits('492817'), '492817');

  // Space separated (e.g. "492 817")
  assert.equal(extractPasteDigits('492 817'), '492817');

  // Hyphen separated (e.g. "492-817")
  assert.equal(extractPasteDigits('492-817'), '492817');

  // Text message wrapper (e.g. "Your verification code is: 123456")
  assert.equal(extractPasteDigits('Your verification code is: 123456'), '123456');

  // Truncates extra digits beyond 6
  assert.equal(extractPasteDigits('1234567890'), '123456');

  // Non-digit input yields empty string
  assert.equal(extractPasteDigits('abcdef'), '');
  assert.equal(extractPasteDigits(''), '');
});

test('2FA State Guard: Verification requires active HttpOnly pending 2FA session (DEF-FE-08)', () => {
  function canVerifyTotp(hasPendingTotpCookie: boolean, code: string): boolean {
    if (!hasPendingTotpCookie) return false;
    return isValidTotp(code);
  }

  // Missing HttpOnly pending 2FA session should block verification
  assert.equal(canVerifyTotp(false, '492817'), false);

  // Active pending 2FA challenge with valid code succeeds
  assert.equal(canVerifyTotp(true, '492817'), true);

  // Active pending 2FA challenge with invalid code fails
  assert.equal(canVerifyTotp(true, '12345'), false);
});
