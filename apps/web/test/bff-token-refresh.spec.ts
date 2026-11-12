// ==============================================================================
// Kumaran Chits — BFF Refresh Mutex & Cookie Helper Test Suite (DEF-FE-01)
// Verifies single-flight promise coalescing, 2s micro-cache, logout invalidation,
// failure non-poisoning, and cookie serialization invariants.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeBffRefresh,
  invalidateBffRefreshCache,
  resetBffRefreshStateForTesting,
  applyRefreshedCookies,
  clearAuthCookies,
} from '../src/lib/bff-token-refresh.ts';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
} from '../src/lib/auth-cookies.ts';

test('DEF-FE-01: 10 concurrent BFF refreshes coalesce into exactly 1 upstream network call', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async () => {
    fetchCount++;
    await new Promise((r) => setTimeout(r, 30));
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          accessToken: 'new-access-jwt-001',
          refreshToken: 'new-refresh-jwt-001',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        executeBffRefresh('http://localhost:3000', 'concurrent-refresh-token-A'),
      ),
    );

    assert.equal(fetchCount, 1, 'Expected exactly 1 upstream /auth/refresh-token call');
    for (const res of results) {
      assert.deepEqual(res, {
        accessToken: 'new-access-jwt-001',
        refreshToken: 'new-refresh-jwt-001',
      });
    }

    // Queued late arrival within 2000ms cookie-handoff window also reuses micro-cache
    const lateResult = await executeBffRefresh('http://localhost:3000', 'concurrent-refresh-token-A');
    assert.equal(fetchCount, 1, 'Late in-transit request within 2s must not re-call upstream');
    assert.equal(lateResult?.accessToken, 'new-access-jwt-001');
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});

test('DEF-FE-01: invalidateBffRefreshCache immediately evicts micro-cache on logout', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async () => {
    fetchCount++;
    return new Response(
      JSON.stringify({
        accessToken: `access-${fetchCount}`,
        refreshToken: `refresh-${fetchCount}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    await executeBffRefresh('http://localhost:3000', 'token-to-logout');
    assert.equal(fetchCount, 1);

    // Explicit logout invalidates cache immediately
    invalidateBffRefreshCache('token-to-logout');

    // Subsequent call cannot serve stale cached tokens
    await executeBffRefresh('http://localhost:3000', 'token-to-logout');
    assert.equal(fetchCount, 2, 'Evicted cache must force fresh validation instead of serving stale tokens');
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});

test('DEF-FE-01: upstream 401 refresh failure returns null cleanly without poisoning cache', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async () => {
    fetchCount++;
    await new Promise((r) => setTimeout(r, 15));
    return new Response(
      JSON.stringify({ message: 'Refresh token invalid' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const results = await Promise.all([
      executeBffRefresh('http://localhost:3000', 'revoked-token-xyz'),
      executeBffRefresh('http://localhost:3000', 'revoked-token-xyz'),
    ]);

    assert.equal(fetchCount, 1);
    assert.deepEqual(results, [null, null]);

    // Failed calls must NOT cache errors; subsequent valid recovery call hits backend cleanly
    globalThis.fetch = (async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({ accessToken: 'recovered', refreshToken: 'ref-2' }),
        { status: 200 },
      );
    }) as typeof fetch;

    const retryRes = await executeBffRefresh('http://localhost:3000', 'revoked-token-xyz');
    assert.equal(fetchCount, 2);
    assert.equal(retryRes?.accessToken, 'recovered');
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});

test('DEF-FE-01: applyRefreshedCookies and clearAuthCookies enforce HttpOnly cookie flags', () => {
  const cookieCalls: Array<{ name: string; value: string; options: any }> = [];
  const mockResponse = {
    cookies: {
      set(name: string, value: string, options: any) {
        cookieCalls.push({ name, value, options });
      },
    },
  } as any;

  applyRefreshedCookies(mockResponse, {
    accessToken: 'acc-123',
    refreshToken: 'ref-456',
  });

  assert.equal(cookieCalls.length, 3);
  const accSet = cookieCalls.find((c) => c.name === COOKIE_ACCESS_TOKEN)!;
  const refSet = cookieCalls.find((c) => c.name === COOKIE_REFRESH_TOKEN)!;
  const actSet = cookieCalls.find((c) => c.name === COOKIE_SESSION_ACTIVE)!;

  assert.equal(accSet.value, 'acc-123');
  assert.equal(accSet.options.httpOnly, true);
  assert.equal(accSet.options.maxAge, 900);

  assert.equal(refSet.value, 'ref-456');
  assert.equal(refSet.options.httpOnly, true);
  assert.equal(refSet.options.maxAge, 604800);

  assert.equal(actSet.value, '1');
  assert.equal(actSet.options.httpOnly, false);

  cookieCalls.length = 0;
  clearAuthCookies(mockResponse, true);
  assert.equal(cookieCalls.length, 3);
  for (const call of cookieCalls) {
    assert.equal(call.value, '');
    assert.equal(call.options.maxAge, 0);
    assert.equal(call.options.sameSite, 'lax');
    assert.equal(call.options.secure, true);
  }

  cookieCalls.length = 0;
  clearAuthCookies(mockResponse, false);
  for (const call of cookieCalls) {
    assert.equal(call.options.sameSite, 'lax');
    assert.equal(call.options.secure, false);
  }
});

test('DEF-FE-06: executeBffRefresh forwards client IP & trace headers without leaking Bearer token', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;
  let capturedHeaders: Headers | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeaders = new Headers(init?.headers);
    return new Response(
      JSON.stringify({
        accessToken: 'acc-forwarded',
        refreshToken: 'ref-forwarded',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const forwardHeaders = new Headers({
      'x-forwarded-for': '103.21.45.9',
      'x-real-ip': '103.21.45.9',
      'x-request-id': 'req-refresh-99',
      'user-agent': 'Firefox/135.0',
      authorization: 'Bearer stale-token',
    });

    const tokens = await executeBffRefresh('http://localhost:3000', 'refresh-token-xyz', forwardHeaders);
    assert.equal(tokens?.accessToken, 'acc-forwarded');
    assert.equal(capturedHeaders?.get('x-forwarded-for'), '103.21.45.9');
    assert.equal(capturedHeaders?.get('x-real-ip'), '103.21.45.9');
    assert.equal(capturedHeaders?.get('x-request-id'), 'req-refresh-99');
    assert.equal(capturedHeaders?.get('user-agent'), 'Firefox/135.0');
    assert.equal(capturedHeaders?.get('content-type'), 'application/json');
    assert.equal(capturedHeaders?.get('authorization'), null);
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});
