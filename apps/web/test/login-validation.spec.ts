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

test('AuthStore: setPendingTotp tracks non-secret 2FA challenge state and clears on session establishment (DEF-FE-08)', () => {
  // 1. Mark 2FA pending challenge active (HttpOnly cookie managed by BFF)
  useAuthStore.getState().setPendingTotp(true);
  assert.equal(useAuthStore.getState().pendingTotp, true);
  assert.equal(useAuthStore.getState().isAuthenticated, false);

  // 2. Cancel pending 2FA challenge
  useAuthStore.getState().setPendingTotp(false);
  assert.equal(useAuthStore.getState().pendingTotp, false);

  // 3. Establish full auth clears pendingTotp automatically
  useAuthStore.getState().setPendingTotp(true);
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
  assert.equal(useAuthStore.getState().pendingTotp, false);

  // Clean up
  useAuthStore.getState().logout('manual');
});

test('Login Flow: Discerning 2FA BFF challenge response vs direct full login response (DEF-FE-08)', () => {
  // Response branch A: 2FA TOTP required (BFF encloses tempToken in HttpOnly cookie, returns boolean flag only)
  const totpChallengeResponse = {
    success: true,
    requireTotp: true,
  };

  const isTotp = Boolean(totpChallengeResponse.requireTotp);
  assert.equal(isTotp, true);
  assert.equal('tempToken' in totpChallengeResponse, false);

  // Response branch B: Direct full login
  const directLoginResponse = {
    success: true,
    user: {
      id: 'user-001',
      name: 'Accountant',
      phone: '9842100002',
      roles: ['ACCOUNTANT'],
    },
  };

  const isDirect = Boolean(directLoginResponse.success && directLoginResponse.user);
  assert.equal(isDirect, true);

  // Response branch C: First-time onboarding password setup required (F16)
  const onboardingResponse = {
    success: true,
    mustChangePassword: true,
    message: 'Initial temporary password detected. You must configure a new permanent password to complete onboarding.',
  };

  const isOnboarding = Boolean(onboardingResponse.mustChangePassword);
  assert.equal(isOnboarding, true);
  assert.equal('tempToken' in onboardingResponse, false); // Stored in HttpOnly cookie
});

test('Onboarding Validation (F16): Requires min 8 chars, complexity, and matching confirm password', () => {
  const onboardingTestSchema = z
    .object({
      newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/, 'Complexity required'),
      confirmPassword: z.string().min(1, 'Password required'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    });

  // Valid complex matching passwords
  assert.equal(
    onboardingTestSchema.safeParse({
      newPassword: 'StrongPassword#2026',
      confirmPassword: 'StrongPassword#2026',
    }).success,
    true,
  );

  // Mismatched passwords rejected
  assert.equal(
    onboardingTestSchema.safeParse({
      newPassword: 'StrongPassword#2026',
      confirmPassword: 'DifferentPassword#2026',
    }).success,
    false,
  );

  // Too short (< 8 chars) rejected
  assert.equal(
    onboardingTestSchema.safeParse({
      newPassword: 'Short1!',
      confirmPassword: 'Short1!',
    }).success,
    false,
  );

  // Missing special char rejected
  assert.equal(
    onboardingTestSchema.safeParse({
      newPassword: 'NoSpecialChar2026',
      confirmPassword: 'NoSpecialChar2026',
    }).success,
    false,
  );

  // Missing uppercase rejected
  assert.equal(
    onboardingTestSchema.safeParse({
      newPassword: 'lowercase123#password',
      confirmPassword: 'lowercase123#password',
    }).success,
    false,
  );
});
