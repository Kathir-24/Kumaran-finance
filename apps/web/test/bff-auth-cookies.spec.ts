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
  COOKIE_TOTP_PENDING,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionActiveCookieOptions,
  getTotpPendingCookieOptions,
  getBackendApiUrl,
  shouldUseSecureCookies,
} from '../src/lib/auth-cookies.ts';
import {
  applyRefreshedCookies,
  applyTotpPendingCookie,
  clearAuthCookies,
  clearTotpPendingCookie,
} from '../src/lib/bff-token-refresh.ts';

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

test('BFF Cookies: clearAuthCookies mirrors applyRefreshedCookies Secure attributes symmetrically', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');

  const createMockCookieResponse = () => {
    const setCalls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    return {
      setCalls,
      cookies: {
        set(name: string, value: string, options: Record<string, unknown>) {
          setCalls.push({ name, value, options });
        },
      },
    };
  };

  const httpsRes = createMockCookieResponse();
  applyRefreshedCookies(
    httpsRes as any,
    { accessToken: 'acc.jwt', refreshToken: 'ref.jwt' },
    true,
  );
  assert.equal(httpsRes.setCalls.every((c) => c.options.secure === true), true);

  const httpsClearRes = createMockCookieResponse();
  clearAuthCookies(httpsClearRes as any, true);
  assert.equal(httpsClearRes.setCalls.length, 3);
  assert.equal(httpsClearRes.setCalls.every((c) => c.options.secure === true && c.options.maxAge === 0), true);

  const httpClearRes = createMockCookieResponse();
  clearAuthCookies(httpClearRes as any, false);
  assert.equal(httpClearRes.setCalls.length, 3);
  assert.equal(httpClearRes.setCalls.every((c) => c.options.secure === false && c.options.maxAge === 0), true);

  const sessionRouteSrc = readFileSync(
    resolve(process.cwd(), 'src/app/api/auth/session/route.ts'),
    'utf8',
  );
  assert.match(sessionRouteSrc, /shouldUseSecureCookies\(request\)/);
  assert.doesNotMatch(
    sessionRouteSrc,
    /clearAuthCookies\([^,)]+\)/,
    '/api/auth/session must never call clearAuthCookies without symmetric isSecure flag',
  );
});

test('BFF Cookies: Pending 2FA TOTP cookie enforces HttpOnly, 5-minute TTL, and symmetric clear', () => {
  const opts = getTotpPendingCookieOptions(true);
  assert.equal(opts.name, COOKIE_TOTP_PENDING);
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/');
  assert.equal(opts.maxAge, 5 * 60);
  assert.equal(opts.secure, true);

  const setCalls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const mockRes = {
    cookies: {
      set(name: string, value: string, options: Record<string, unknown>) {
        setCalls.push({ name, value, options });
      },
    },
  } as any;

  applyTotpPendingCookie(mockRes, 'pending-totp.jwt', true);
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0].name, COOKIE_TOTP_PENDING);
  assert.equal(setCalls[0].value, 'pending-totp.jwt');
  assert.equal(setCalls[0].options.httpOnly, true);
  assert.equal(setCalls[0].options.secure, true);

  setCalls.length = 0;
  clearTotpPendingCookie(mockRes, false);
  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0].name, COOKIE_TOTP_PENDING);
  assert.equal(setCalls[0].value, '');
  assert.equal(setCalls[0].options.maxAge, 0);
  assert.equal(setCalls[0].options.httpOnly, true);
  assert.equal(setCalls[0].options.secure, false);
});
