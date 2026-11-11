// ==============================================================================
// Kumaran Chits — BFF Auth Cookie & Security Options Test Suite
// Verifies OWASP ASVS v4.0.3 & RFC 6265bis HttpOnly cookie parameters.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionActiveCookieOptions,
  getBackendApiUrl,
  shouldUseSecureCookies,
} from '../src/lib/auth-cookies.ts';

test('BFF Cookies: Access token cookie enforces HttpOnly and 15-minute TTL', () => {
  const opts = getAccessTokenCookieOptions();
  assert.equal(opts.name, COOKIE_ACCESS_TOKEN);
  assert.equal(opts.httpOnly, true, 'Access token cookie MUST be HttpOnly to prevent XSS exfiltration');
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
  assert.equal(opts.maxAge, 15 * 60, 'Access token cookie maxAge must be 15 minutes (900s)');
});

test('BFF Cookies: Refresh token cookie enforces HttpOnly and 7-day TTL', () => {
  const opts = getRefreshTokenCookieOptions();
  assert.equal(opts.name, COOKIE_REFRESH_TOKEN);
  assert.equal(opts.httpOnly, true, 'Refresh token cookie MUST be HttpOnly to prevent XSS exfiltration');
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
  assert.equal(opts.maxAge, 7 * 24 * 60 * 60, 'Refresh token cookie maxAge must be 7 days (604,800s)');
});

test('BFF Cookies: Session active flag is accessible to client JS but holds no secret credentials', () => {
  const opts = getSessionActiveCookieOptions();
  assert.equal(opts.name, COOKIE_SESSION_ACTIVE);
  assert.equal(opts.httpOnly, false, 'Session active flag is non-HttpOnly for client awareness');
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
  assert.equal(opts.maxAge, 7 * 24 * 60 * 60);
});

test('BFF Cookies: getBackendApiUrl resolves environment correctly', () => {
  const originalInternal = process.env.INTERNAL_API_URL;
  const originalPublic = process.env.NEXT_PUBLIC_API_URL;

  try {
    delete process.env.INTERNAL_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    assert.equal(getBackendApiUrl(), 'http://localhost:3000');

    process.env.INTERNAL_API_URL = 'http://backend-service:3000';
    assert.equal(getBackendApiUrl(), 'http://backend-service:3000');
  } finally {
    if (originalInternal) process.env.INTERNAL_API_URL = originalInternal;
    else delete process.env.INTERNAL_API_URL;
    if (originalPublic) process.env.NEXT_PUBLIC_API_URL = originalPublic;
    else delete process.env.NEXT_PUBLIC_API_URL;
  }
});

test('BFF Cookies: shouldUseSecureCookies honors HTTPS transport and HTTP production loopback cleanly', () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  const originalCookieSecure = env.COOKIE_SECURE;

  try {
    env.NODE_ENV = 'production';
    delete env.COOKIE_SECURE;

    // Plain HTTP next start on localhost must NOT emit Secure so Chromium preserves HttpOnly cookies
    assert.equal(
      shouldUseSecureCookies({ url: 'http://localhost:3001/api/auth/login', nextUrl: { protocol: 'http:' } }),
      false,
    );

    // Reverse-proxied HTTPS production (Nginx X-Forwarded-Proto: https) MUST emit Secure
    assert.equal(
      shouldUseSecureCookies({
        url: 'http://web:3001/api/auth/login',
        headers: new Headers({ 'x-forwarded-proto': 'https' }),
      }),
      true,
    );

    // Direct HTTPS URL MUST emit Secure
    assert.equal(
      shouldUseSecureCookies({ url: 'https://chits.kumaranfinance.in/api/auth/login', nextUrl: { protocol: 'https:' } }),
      true,
    );

    // Explicit COOKIE_SECURE override wins regardless of request scheme
    env.COOKIE_SECURE = 'true';
    assert.equal(shouldUseSecureCookies({ url: 'http://localhost:3001/api/auth/login' }), true);
    env.COOKIE_SECURE = 'false';
    assert.equal(shouldUseSecureCookies({ url: 'https://chits.kumaranfinance.in/api/auth/login' }), false);
  } finally {
    if (originalEnv !== undefined) env.NODE_ENV = originalEnv;
    else delete env.NODE_ENV;
    if (originalCookieSecure !== undefined) env.COOKIE_SECURE = originalCookieSecure;
    else delete env.COOKIE_SECURE;
  }
});
