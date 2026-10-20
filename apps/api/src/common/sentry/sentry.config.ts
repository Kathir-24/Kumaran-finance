// ==============================================================================
// Kumaran Chits — Sentry Error Monitoring & APM Configuration
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Indian DPDP Act 2023 (PII Sanitization), BigInt Serialization Safety
// ==============================================================================

import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { PhoneHelper } from '../../notification/helpers/phone.helper';

const logger = new Logger('SentryConfig');

/**
 * Sensitive field names that must be scrubbed before transmission to external APM
 */
export const SENSITIVE_KEYS = new Set([
  'password',
  'mpin',
  'mpinhash',
  'refreshtoken',
  'token',
  'authorization',
  'cookie',
  'totpsecret',
  'jwtsecret',
  'aadhaar',
  'aadhaarnumber',
  'pan',
  'spannumber',
  'bankaccountnumber',
  'chequenumber',
  'authkey',
  'x-api-key',
]);

/**
 * Recursively scrubs sensitive data and masks PII in objects, arrays, and strings.
 * Also converts BigInts to string representation to ensure JSON serialization safety.
 */
export function scrubPii<T = any>(val: T, depth = 0): T {
  if (depth > 6 || val === null || val === undefined) {
    return val;
  }

  // Handle BigInt serialization safety
  if (typeof val === 'bigint') {
    return (val as bigint).toString() as unknown as T;
  }

  // Handle string phone numbers or sensitive strings
  if (typeof val === 'string') {
    if (PhoneHelper.isValidIndianMobile(val)) {
      return PhoneHelper.maskPhone(val) as unknown as T;
    }
    return val;
  }

  // Handle Arrays
  if (Array.isArray(val)) {
    return val.map((item) => scrubPii(item, depth + 1)) as unknown as T;
  }

  // Handle Objects
  if (typeof val === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      const lowerKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (SENSITIVE_KEYS.has(lowerKey)) {
        cleaned[k] = '[FILTERED]';
      } else {
        cleaned[k] = scrubPii(v, depth + 1);
      }
    }
    return cleaned as T;
  }

  return val;
}

/**
 * Sentry beforeSend hook enforcing DPDP Act compliance.
 */
export function beforeSend(event: Sentry.ErrorEvent, _hint?: Sentry.EventHint): Sentry.ErrorEvent | null {
  try {
    // 1. Scrub request data if present
    if (event.request) {
      if (event.request.headers) {
        event.request.headers = scrubPii(event.request.headers);
      }
      if (event.request.data) {
        event.request.data = scrubPii(event.request.data);
      }
      if (event.request.query_string) {
        event.request.query_string = scrubPii(event.request.query_string);
      }
    }

    // 2. Sanitize user context (only retain non-PII operational identifiers)
    if (event.user) {
      event.user = {
        id: event.user.id,
        // Exclude unmasked phone, email, ip_address
        ...(event.user.username ? { username: event.user.username } : {}),
      };
    }

    // 3. Scrub breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => {
        if (crumb.data) {
          crumb.data = scrubPii(crumb.data);
        }
        return crumb;
      });
    }

    // 4. Scrub extra context
    if (event.extra) {
      event.extra = scrubPii(event.extra);
    }
  } catch (err: any) {
    logger.warn(`Failed to scrub Sentry event PII: ${err.message}`);
  }

  return event;
}

/**
 * Initializes Sentry if SENTRY_DSN is configured.
 * If SENTRY_DSN is empty or unset, gracefully bypasses Sentry initialization.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();

  if (!dsn) {
    logger.log('Sentry DSN is not configured. Crash reporting is in safe-bypass mode (no external calls).');
    return false;
  }

  try {
    const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
    const tracesSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE !== undefined
      ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
      : environment === 'production'
        ? 0.1
        : 1.0;

    Sentry.init({
      dsn,
      environment,
      release: process.env.npm_package_version || '1.0.0',
      tracesSampleRate: isNaN(tracesSampleRate) ? 0.1 : tracesSampleRate,
      beforeSend,
    });

    logger.log(`Sentry initialized successfully (Environment: ${environment}, TracesRate: ${tracesSampleRate})`);
    return true;
  } catch (err: any) {
    logger.error(`Failed to initialize Sentry: ${err.message}`);
    return false;
  }
}

/**
 * Helper to check whether Sentry is active
 */
let activeOverride: boolean | null = null;
let customCaptureFn: ((exception: unknown) => string | undefined) | null = null;

export function setSentryActiveOverride(active: boolean | null): void {
  activeOverride = active;
}

export function setCustomCaptureFn(fn: ((exception: unknown) => string | undefined) | null): void {
  customCaptureFn = fn;
}

export function captureSentryException(exception: unknown): string | undefined {
  if (customCaptureFn) {
    return customCaptureFn(exception);
  }
  return Sentry.captureException(exception);
}

export function isSentryActive(): boolean {
  if (activeOverride !== null) {
    return activeOverride;
  }
  try {
    return typeof Sentry.isInitialized === 'function' ? Sentry.isInitialized() : false;
  } catch {
    return false;
  }
}
