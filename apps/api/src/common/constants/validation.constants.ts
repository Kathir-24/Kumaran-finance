/**
 * Indian Statutory & Format Regular Expressions:
 * - Phone: Exactly 10 Indian mobile digits.
 * - PIN Code: Exactly 6 Indian postal digits.
 * - PAN: 10 alphanumeric characters (5 uppercase letters, 4 digits, 1 uppercase letter).
 * - Aadhaar Masked: Strictly last 4 digits (DPDP Act 2023 data minimization).
 * - MPIN: Exactly 6 numeric digits.
 */

export const REGEX_INDIAN_PHONE = /^[6-9]\d{9}$/;

export const REGEX_INDIAN_PINCODE = /^\d{6}$/;

export const REGEX_INDIAN_PAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const REGEX_AADHAAR_LAST_4 = /^\d{4}$/;

export const REGEX_MPIN = /^\d{6}$/;

export const REGEX_TOTP_CODE = /^\d{6}$/;

export const REGEX_NUMERIC_6_DIGITS = /^\d{6}$/;
