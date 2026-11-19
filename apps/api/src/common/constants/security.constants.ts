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

export const OTP_COOLDOWN_SECONDS = 60; // 60 seconds re-request cooldown

export const OTP_LOCKOUT_SECONDS = 300; // 5-minute temporary lockout on repeated failed attempts

export const OTP_MAX_VERIFY_ATTEMPTS = 3; // Lockout triggered on 3rd invalid attempt

export const OTP_MAX_DAILY_REQUESTS = 5; // Maximum 5 OTP dispatches per mobile number per rolling 24 hours

export const OTP_DAILY_WINDOW_SECONDS = 86400; // 24-hour rolling rate-limit window

export const DEFAULT_JWT_ACCESS_EXPIRES_IN = '15m';

export const DEFAULT_JWT_REFRESH_EXPIRES_IN = '7d';

export const TOTP_ISSUER_NAME = 'Kumaran Finance';

const isDev = process.env.NODE_ENV !== 'production';

/** Global default rate limit: 60 requests per minute in production, 10,000 in dev */
export const THROTTLE_DEFAULT_TTL_MS = 60_000;
export const THROTTLE_DEFAULT_LIMIT = isDev ? 10_000 : 60;

/** High-security auth rate limit: 5 attempts per 15 minutes in production, 1,000 in dev */
export const THROTTLE_AUTH_TTL_MS = isDev ? 60_000 : 900_000;
export const THROTTLE_AUTH_LIMIT = isDev ? 1_000 : 5;

/** OTP / TOTP verification rate limit: 5 attempts per 5 minutes in production, 1,000 in dev */
export const THROTTLE_OTP_TTL_MS = isDev ? 60_000 : 300_000;
export const THROTTLE_OTP_LIMIT = isDev ? 1_000 : 5;

/** Bilingual PDF generation rate limit: 15 documents per minute in production, 1,000 in dev */
export const THROTTLE_PDF_TTL_MS = 60_000;
export const THROTTLE_PDF_LIMIT = isDev ? 1_000 : 15;

/** Large KYC file upload rate limit: 5 uploads per minute in production, 1,000 in dev */
export const THROTTLE_UPLOAD_TTL_MS = 60_000;
export const THROTTLE_UPLOAD_LIMIT = isDev ? 1_000 : 5;

/** Customer self-reported UPI claims: 5 submissions per 15 minutes in production, 1,000 in dev */
export const THROTTLE_UPI_CLAIM_TTL_MS = isDev ? 60_000 : 900_000;
export const THROTTLE_UPI_CLAIM_LIMIT = isDev ? 1_000 : 5;

/** Allowed web frontend origins (configurable via CORS_ALLOWED_ORIGINS in .env) */
export const DEFAULT_CORS_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : [
      'http://localhost:3000',
      'http://localhost:3001',
    ];

/** Permitted HTTP request headers for cross-origin calls */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Branch-Id',
  'Idempotency-Key',
  'X-Request-ID',
  'X-Requested-With',
  'Accept',
];

/** Headers exposed to the client in browser cross-origin requests */
export const CORS_EXPOSED_HEADERS = [
  'Content-Disposition',
  'Retry-After',
  'X-Request-ID',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
];

/** Permitted HTTP methods */
export const CORS_ALLOWED_METHODS = [
  'GET',
  'HEAD',
  'PUT',
  'PATCH',
  'POST',
  'DELETE',
  'OPTIONS',
];

/** Preflight cache duration: 24 hours (86,400 seconds) */
export const CORS_MAX_AGE_SECONDS = 86_400;

/**
 * Canonical Staff RBAC Roles:
 * Strictly excludes Role.CUSTOMER which is reserved for chit subscribers.
 */
export const STAFF_ROLES = [
  'SUPER_ADMIN',
  'PARTNER',
  'BRANCH_MANAGER',
  'ACCOUNTANT',
  'COLLECTION_AGENT',
  'AUDITOR',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

