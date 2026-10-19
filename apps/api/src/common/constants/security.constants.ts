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

/** Global default rate limit: 60 requests per minute */
export const THROTTLE_DEFAULT_TTL_MS = 60_000;
export const THROTTLE_DEFAULT_LIMIT = 60;

/** High-security auth rate limit: 5 attempts per 15 minutes */
export const THROTTLE_AUTH_TTL_MS = 900_000;
export const THROTTLE_AUTH_LIMIT = 5;

/** OTP / TOTP verification rate limit: 5 attempts per 5 minutes */
export const THROTTLE_OTP_TTL_MS = 300_000;
export const THROTTLE_OTP_LIMIT = 5;
