// ==============================================================================
// Kumaran Chits — BFF 2FA HttpOnly Cookie & Route Handler Integration Tests
// Verifies DEF-FE-08: intermediate TOTP JWT never reaches client JSON or storage,
// verify-totp reads strictly from HttpOnly kc_totp_pending_token, mistyped codes
// allow retries, expired sessions clear cleanly, and Back-to-Login purges cookies.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SignJWT } from 'jose';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
  COOKIE_TOTP_PENDING,
} from '../src/lib/auth-cookies.ts';
import {
  handleBffLoginPost,
  handleBffLogoutPost,
  handleBffSessionGet,
  handleBffVerifyTotpPost,
} from '../src/lib/bff-auth-handlers.ts';
import { resetBffRefreshStateForTesting } from '../src/lib/bff-token-refresh.ts';

const TEST_SECRET = 'kumaran-test-hs256-jwt-secret-key-min-32-chars';

interface RecordedCookieSet {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

function buildMockNextRequest(
  url: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
) {
  const reqHeaders = new Headers(options.headers);
  const cookieStore = new Map(Object.entries(options.cookies || {}));

  return {
    url,
    method: options.method || 'POST',
    headers: reqHeaders,
    nextUrl: new URL(url),
    cookies: {
      get(name: string) {
        const value = cookieStore.get(name);
        return value !== undefined ? { name, value } : undefined;
      },
      has(name: string) {
        return cookieStore.has(name);
      },
    },
    async json() {
      return options.body ?? {};
    },
  } as any;
}

function createJsonResponseFactory() {
  return (payload: unknown, init?: ResponseInit) => {
    const cookieSets: RecordedCookieSet[] = [];
    const response = {
      status: init?.status ?? 200,
      payload,
      cookieSets,
      cookies: {
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieSets.push({ name, value, options });
        },
      },
      async json() {
        return payload;
      },
    };
    return response as any;
  };
}

async function signPendingTotpToken(expiresIn = '5m', tokenType = 'totp_pending'): Promise<string> {
  const key = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT({
    sub: 'staff-001',
    phone: '9842100001',
    roles: ['SUPER_ADMIN'],
    tokenType,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

test('DEF-FE-08: POST /api/auth/login (2FA) stores tempToken in HttpOnly cookie and omits it from JSON', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          requireTotp: true,
          tempToken: 'signed-5m-totp-jwt-secret',
          message: 'Two-factor authentication required.',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

  try {
    const req = buildMockNextRequest('https://chits.kumaranfinance.in/api/auth/login', {
      body: { phone: '9842100001', password: 'Password@123' },
      headers: { 'x-forwarded-proto': 'https' },
    });

    const res: any = await handleBffLoginPost(req, createJsonResponseFactory());
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { success: true, requireTotp: true });
    assert.equal('tempToken' in body, false, 'tempToken must never be exposed in JSON response');

    const pendingCookie = res.cookieSets.find((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING);
    assert.ok(pendingCookie, 'Expected HttpOnly kc_totp_pending_token cookie to be issued');
    assert.equal(pendingCookie.value, 'signed-5m-totp-jwt-secret');
    assert.equal(pendingCookie.options.httpOnly, true);
    assert.equal(pendingCookie.options.sameSite, 'lax');
    assert.equal(pendingCookie.options.path, '/');
    assert.equal(pendingCookie.options.maxAge, 300);
    assert.equal(pendingCookie.options.secure, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DEF-FE-08: POST /api/auth/login (direct) sets session cookies and clears stale pending cookie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          accessToken: 'acc-jwt',
          refreshToken: 'ref-jwt',
          user: { id: 'u1', name: 'Staff', phone: '9842100002', roles: ['ACCOUNTANT'] },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

  try {
    const req = buildMockNextRequest('http://localhost:3001/api/auth/login', {
      body: { phone: '9842100002', password: 'Password@123' },
    });

    const res: any = await handleBffLoginPost(req, createJsonResponseFactory(), { isSecure: false });
    assert.equal(res.status, 200);

    const pendingCleared = res.cookieSets.find((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING);
    assert.ok(pendingCleared);
    assert.equal(pendingCleared.value, '');
    assert.equal(pendingCleared.options.maxAge, 0);
    assert.equal(pendingCleared.options.secure, false);

    assert.ok(res.cookieSets.some((c: RecordedCookieSet) => c.name === COOKIE_ACCESS_TOKEN));
    assert.ok(res.cookieSets.some((c: RecordedCookieSet) => c.name === COOKIE_REFRESH_TOKEN));
    assert.ok(res.cookieSets.some((c: RecordedCookieSet) => c.name === COOKIE_SESSION_ACTIVE));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DEF-FE-08: POST /api/auth/verify-totp reads cookie only, ignores spoofed body.tempToken, and clears cookie on success', async () => {
  const originalFetch = globalThis.fetch;
  let sentBody: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body || '{}'));
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          accessToken: 'full-access-jwt',
          refreshToken: 'full-refresh-jwt',
          user: { id: 'staff-001', name: 'Managing Partner', phone: '9842100001', roles: ['SUPER_ADMIN'] },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const req = buildMockNextRequest('https://chits.kumaranfinance.in/api/auth/verify-totp', {
      cookies: { [COOKIE_TOTP_PENDING]: 'cookie-bound-pending-jwt' },
      body: {
        tempToken: 'attacker-injected-body-jwt',
        totpCode: '492817',
      },
      headers: { 'x-forwarded-proto': 'https' },
    });

    const res: any = await handleBffVerifyTotpPost(req, createJsonResponseFactory());
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(sentBody?.tempToken, 'cookie-bound-pending-jwt', 'Backend must receive cookie JWT, not body.tempToken');
    assert.equal(sentBody?.totpCode, '492817');

    const clearedPending = res.cookieSets.find((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING);
    assert.ok(clearedPending);
    assert.equal(clearedPending.value, '');
    assert.equal(clearedPending.options.maxAge, 0);
    assert.equal(clearedPending.options.httpOnly, true);
    assert.equal(clearedPending.options.secure, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DEF-FE-08: POST /api/auth/verify-totp fails closed when HttpOnly cookie is missing even if body.tempToken is supplied', async () => {
  const originalFetch = globalThis.fetch;
  let backendCalled = false;
  globalThis.fetch = (async () => {
    backendCalled = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  try {
    const req = buildMockNextRequest('http://localhost:3001/api/auth/verify-totp', {
      cookies: {},
      body: { tempToken: 'client-forged-token', totpCode: '492817' },
    });

    const res: any = await handleBffVerifyTotpPost(req, createJsonResponseFactory(), { isSecure: false });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.sessionExpired, true);
    assert.equal(backendCalled, false, 'Backend must not be called when HttpOnly cookie is absent');

    const clearedPending = res.cookieSets.find((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING);
    assert.ok(clearedPending && clearedPending.options.maxAge === 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DEF-FE-08: POST /api/auth/verify-totp preserves cookie on wrong 6-digit code, but clears on expired tempToken', async () => {
  const originalFetch = globalThis.fetch;

  try {
    // Branch 1: Wrong 6-digit Authenticator code -> keep kc_totp_pending_token intact for retry
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ statusCode: 401, message: 'Invalid or expired 6-digit TOTP code' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    const retryReq = buildMockNextRequest('http://localhost:3001/api/auth/verify-totp', {
      cookies: { [COOKIE_TOTP_PENDING]: 'valid-pending-jwt' },
      body: { totpCode: '000000' },
    });
    const retryRes: any = await handleBffVerifyTotpPost(retryReq, createJsonResponseFactory(), { isSecure: false });
    const retryBody = await retryRes.json();

    assert.equal(retryRes.status, 401);
    assert.equal(Boolean(retryBody.sessionExpired), false);
    assert.equal(
      retryRes.cookieSets.some((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING),
      false,
      'Wrong 6-digit code must preserve HttpOnly pending cookie for retry',
    );

    // Branch 2: Expired or invalid temporary 2FA session JWT -> clear cookie & flag sessionExpired
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ statusCode: 401, message: 'Temporary 2FA session expired or invalid' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    const expiredReq = buildMockNextRequest('http://localhost:3001/api/auth/verify-totp', {
      cookies: { [COOKIE_TOTP_PENDING]: 'expired-pending-jwt' },
      body: { totpCode: '492817' },
    });
    const expiredRes: any = await handleBffVerifyTotpPost(expiredReq, createJsonResponseFactory(), { isSecure: false });
    const expiredBody = await expiredRes.json();

    assert.equal(expiredRes.status, 401);
    assert.equal(expiredBody.sessionExpired, true);
    const cleared = expiredRes.cookieSets.find((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING);
    assert.ok(cleared && cleared.options.maxAge === 0);

    // Branch 3: Rate limited (429) -> forward 429 and preserve pending cookie
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ statusCode: 429, message: 'Too many verification attempts' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    const throttledRes: any = await handleBffVerifyTotpPost(retryReq, createJsonResponseFactory(), { isSecure: false });
    assert.equal(throttledRes.status, 429);
    assert.equal(
      throttledRes.cookieSets.some((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DEF-FE-08: GET /api/auth/session reports boolean pendingTotp without leaking JWT and preserves valid cookie', async () => {
  const validPendingJwt = await signPendingTotpToken('5m', 'totp_pending');
  const expiredPendingJwt = await signPendingTotpToken('-10s', 'totp_pending');

  // Valid pending cookie -> pendingTotp: true, cookie NOT cleared
  const validReq = buildMockNextRequest('http://localhost:3001/api/auth/session', {
    method: 'GET',
    cookies: { [COOKIE_TOTP_PENDING]: validPendingJwt },
  });
  const validRes: any = await handleBffSessionGet(validReq, createJsonResponseFactory(), {
    isSecure: false,
    jwtSecret: TEST_SECRET,
  });
  const validBody = await validRes.json();
  assert.deepEqual(validBody, { authenticated: false, user: null, pendingTotp: true });
  assert.equal(JSON.stringify(validBody).includes(validPendingJwt), false);
  assert.equal(
    validRes.cookieSets.some((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING),
    false,
    'Active pending 2FA cookie must remain untouched during session check',
  );

  // Expired pending cookie -> pendingTotp: false, expired cookie cleared
  const expiredReq = buildMockNextRequest('http://localhost:3001/api/auth/session', {
    method: 'GET',
    cookies: { [COOKIE_TOTP_PENDING]: expiredPendingJwt },
  });
  const expiredRes: any = await handleBffSessionGet(expiredReq, createJsonResponseFactory(), {
    isSecure: false,
    jwtSecret: TEST_SECRET,
  });
  const expiredBody = await expiredRes.json();
  assert.deepEqual(expiredBody, { authenticated: false, user: null, pendingTotp: false });
  const cleared = expiredRes.cookieSets.find((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING);
  assert.ok(cleared && cleared.options.maxAge === 0);
});

test('DEF-FE-08: POST /api/auth/logout clears kc_totp_pending_token cleanly even during Back-to-Login cancellation', async () => {
  resetBffRefreshStateForTesting();
  const req = buildMockNextRequest('https://chits.kumaranfinance.in/api/auth/logout', {
    cookies: { [COOKIE_TOTP_PENDING]: 'active-pending-2fa-jwt' },
    headers: { 'x-forwarded-proto': 'https' },
  });

  const res: any = await handleBffLogoutPost(req, createJsonResponseFactory());
  assert.equal(res.status, 200);
  const clearedPending = res.cookieSets.find((c: RecordedCookieSet) => c.name === COOKIE_TOTP_PENDING);
  assert.ok(clearedPending);
  assert.equal(clearedPending.value, '');
  assert.equal(clearedPending.options.maxAge, 0);
  assert.equal(clearedPending.options.httpOnly, true);
  assert.equal(clearedPending.options.secure, true);
});

test('DEF-FE-08: Static security guard — zero kc_temp_token or sessionStorage token persistence remains in apps/web/src', () => {
  const srcRoot = path.resolve(process.cwd(), 'src');
  const walkFiles = (dir: string): string[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  };

  for (const file of walkFiles(srcRoot)) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      /kc_temp_token/,
      `Forbidden legacy kc_temp_token reference found in ${file}`,
    );
    assert.doesNotMatch(
      content,
      /setTempToken|tempToken:\s*string\s*\|\s*null/,
      `Forbidden client tempToken state found in ${file}`,
    );
  }
});
