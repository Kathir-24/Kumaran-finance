/**
 * Security & Cryptography Guardrails:
 * - Bcrypt cost factor: 12 rounds for passwords and MPINs.
 * - MPIN: 6 numeric digits for field agents and customers.
 * - OTP: 6 numeric digits with 300s (5-minute) TTL.
 * - JWT defaults: 15-minute access token, 7-day refresh token.
 */

export const BCRYPT_SALT_ROUNDS = 12;

export const MPIN_LENGTH = 6;

export const OTP_LENGTH = 6;

export const OTP_EXPIRY_SECONDS = 300; // 5 minutes

export const DEFAULT_JWT_ACCESS_EXPIRES_IN = '15m';

export const DEFAULT_JWT_REFRESH_EXPIRES_IN = '7d';

export const TOTP_ISSUER_NAME = 'Kumaran Finance';
