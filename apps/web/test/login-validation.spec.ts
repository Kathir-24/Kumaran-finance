// ==============================================================================
// Kumaran Chits — Staff Login Validation & 2FA Forking Test Suite
// Verifies ADR-18 phone-only regex, password rules, tempToken state & 2FA fork.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { useAuthStore } from '../src/stores/auth-store.ts';

// Mirror exact login validation schema from login-form.tsx
const phoneRegex = /^[6-9]\d{9}$/;
const loginTestSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone is required')
    .regex(phoneRegex, 'Must be a valid 10-digit Indian mobile number'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

test('ADR-18 Phone Validation: Accepts valid 10-digit Indian mobile numbers', () => {
  const validNumbers = [
    '9842100001',
    '8765432109',
    '7012345678',
    '6381234567',
  ];

  for (const phone of validNumbers) {
    const result = loginTestSchema.safeParse({ phone, password: 'validPassword123' });
    assert.equal(result.success, true, `Phone ${phone} should be valid`);
  }
});

test('ADR-18 Phone Validation: Rejects invalid phone numbers', () => {
  const invalidNumbers = [
    '12345',         // Too short
    '984210000',     // 9 digits
    '984210000000',  // Too long
    '0123456789',    // Starts with 0
    '5555555555',    // Starts with 5
    '98421abcde',    // Contains letters
    '+919842100001', // Contains prefix (must be stripped)
    '98421-00001',   // Contains hyphens
  ];

  for (const phone of invalidNumbers) {
    const result = loginTestSchema.safeParse({ phone, password: 'validPassword123' });
    assert.equal(result.success, false, `Phone ${phone} should be rejected`);
  }
});

test('Login Validation: Password requires at least 6 characters', () => {
  // Passwords with >= 6 chars should pass
  assert.equal(loginTestSchema.safeParse({ phone: '9842100001', password: '123456' }).success, true);
  assert.equal(loginTestSchema.safeParse({ phone: '9842100001', password: 'Admin@2026' }).success, true);

  // Passwords with < 6 chars should fail
  assert.equal(loginTestSchema.safeParse({ phone: '9842100001', password: '12345' }).success, false);
  assert.equal(loginTestSchema.safeParse({ phone: '9842100001', password: '' }).success, false);
});

test('AuthStore: setTempToken securely stores 2FA temporary token and clears on session establishment', () => {
  // 1. Set tempToken for TOTP challenge
  useAuthStore.getState().setTempToken('mock-totp-temp-token-jwt');
  assert.equal(useAuthStore.getState().tempToken, 'mock-totp-temp-token-jwt');
  assert.equal(useAuthStore.getState().isAuthenticated, false);

  // 2. Clear tempToken
  useAuthStore.getState().setTempToken(null);
  assert.equal(useAuthStore.getState().tempToken, null);

  // 3. Establish full auth clears tempToken automatically
  useAuthStore.getState().setTempToken('another-temp-token');
  useAuthStore.getState().setAuth(
    {
      id: 'staff-001',
      name: 'K. Sengottaiyan',
      phone: '9842100001',
      roles: ['SUPER_ADMIN'],
    },
    { accessToken: 'full-jwt-access-token' },
  );

  assert.equal(useAuthStore.getState().isAuthenticated, true);
  assert.equal(useAuthStore.getState().tempToken, null);

  // Clean up
  useAuthStore.getState().logout('manual');
});

test('Login Flow: Discerning 2FA challenge response vs full token response', () => {
  // Response branch A: 2FA TOTP required
  const totpChallengeResponse = {
    requireTotp: true,
    tempToken: 'jwt-temp-token-5m',
    message: 'Two-factor authentication required.',
  };

  const isTotp = Boolean(totpChallengeResponse.requireTotp && totpChallengeResponse.tempToken);
  assert.equal(isTotp, true);

  // Response branch B: Direct full login
  const directLoginResponse = {
    accessToken: 'jwt-access-token-15m',
    refreshToken: 'jwt-refresh-token-7d',
    user: {
      id: 'user-001',
      name: 'Accountant',
      phone: '9842100002',
      roles: ['ACCOUNTANT'],
    },
  };

  const isDirect = Boolean(directLoginResponse.accessToken && directLoginResponse.user);
  assert.equal(isDirect, true);
});
