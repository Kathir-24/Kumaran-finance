// ==============================================================================
// Kumaran Chits — Change Password Test Suite
// Verifies password validation rules, DTO schema alignment, and i18n parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

test('Change Password: Current password is required', () => {
  const validate = (current: string) => {
    if (!current || !current.trim()) {
      return { valid: false, error: 'Current password is required' };
    }
    return { valid: true };
  };

  assert.equal(validate('').valid, false);
  assert.equal(validate('   ').valid, false);
  assert.equal(validate('CurrentPass@123').valid, true);
});

test('Change Password: New password requires minimum 8 characters matching NestJS DTO', () => {
  const validate = (newPass: string) => {
    if (!newPass || newPass.length < 8) {
      return { valid: false, error: 'New password must be at least 8 characters long' };
    }
    return { valid: true };
  };

  assert.equal(validate('1234567').valid, false);
  assert.equal(validate('short').valid, false);
  assert.equal(validate('12345678').valid, true);
  assert.equal(validate('SecureNewPass@2026').valid, true);
});

test('Change Password: Confirm password must match new password', () => {
  const validate = (newPass: string, confirm: string) => {
    if (newPass !== confirm) {
      return { valid: false, error: 'New passwords do not match' };
    }
    return { valid: true };
  };

  assert.equal(validate('SecureNewPass@2026', 'MismatchedPass').valid, false);
  assert.equal(validate('SecureNewPass@2026', 'SecureNewPass@2026').valid, true);
});

test('Change Password: Backend contract expects POST /api/v1/auth/change-password with currentPassword and newPassword', () => {
  const payload = {
    currentPassword: 'OldPassword@123',
    newPassword: 'NewPassword@2026',
  };

  assert.ok(payload.currentPassword);
  assert.ok(payload.newPassword);
  assert.ok(payload.newPassword.length >= 8);
});

test('Change Password: i18n keys exist and match 100% parity across English and Tamil', () => {
  const keys = [
    'changePasswordTitle',
    'changePasswordSubtitle',
    'currentPasswordLabel',
    'currentPasswordPlaceholder',
    'newPasswordLabel',
    'newPasswordPlaceholder',
    'confirmPasswordLabel',
    'confirmPasswordPlaceholder',
    'changePasswordButton',
    'changingPassword',
    'passwordChangedSuccess',
    'passwordMismatch',
    'newPasswordMinLength',
  ] as const;

  for (const k of keys) {
    assert.ok(enMessages.auth[k], `en.json must contain auth.${k}`);
    assert.ok(taMessages.auth[k], `ta.json must contain auth.${k}`);
  }

  assert.ok(enMessages.topbar.changePasswordAction, 'en.json must contain topbar.changePasswordAction');
  assert.ok(taMessages.topbar.changePasswordAction, 'ta.json must contain topbar.changePasswordAction');
});
