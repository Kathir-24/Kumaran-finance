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
