// ==============================================================================
// Kumaran Chits — BFF Proxy SSE Streaming & Cookie Symmetry Unit Tests
// Verifies unbuffered text/event-stream pass-through, 401 refresh retry, and
// matching Secure / SameSite attributes on terminal 401 cookie clears.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBffProxyRequest } from '../src/lib/bff-api-proxy.ts';
import { resetBffRefreshStateForTesting } from '../src/lib/bff-token-refresh.ts';

function buildMockNextRequest(
  url: string,
  options: {
    method?: string;
    body?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
) {
  const reqHeaders = new Headers(options.headers);
  const cookieStore = new Map(Object.entries(options.cookies || {}));
  const abortController = new AbortController();

  return {
    request: {
      url,
      method: options.method || 'GET',
      headers: reqHeaders,
      nextUrl: new URL(url),
      signal: abortController.signal,
      arrayBuffer: async () => new TextEncoder().encode(options.body || '').buffer,
      cookies: {
        get: (name: string) => {
          const value = cookieStore.get(name);
          return value !== undefined ? { name, value } : undefined;
        },
      },
    } as any,
    abortController,
  };
}

test('BFF Proxy: streams text/event-stream responses immediately without buffering', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;
  let capturedSignal: AbortSignal | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  globalThis.fetch = (async (_input: any, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode('data: {"type":"connected"}\n\n'));
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }) as typeof fetch;

  try {
    const { request } = buildMockNextRequest(
      'http://localhost:3001/bff/api/v1/reports/approvals-stream',
      { cookies: { kc_access_token: 'valid-jwt' } },
    );

    // Must resolve before streamController.close() is ever called (proves zero arrayBuffer buffering)
    const response = await handleBffProxyRequest(request, {
      params: Promise.resolve({ path: ['reports', 'approvals-stream'] }),
    });

    assert.equal(response.status, 200);
    assert.ok(capturedSignal, 'Must forward client AbortSignal upstream');
    assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform');
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    assert.ok(response.body, 'SSE proxy response must expose a live ReadableStream');

    const reader = response.body.getReader();
    const firstChunk = await reader.read();
    const decoded = new TextDecoder().decode(firstChunk.value);
    assert.ok(decoded.includes('"type":"connected"'));

    const activeController = streamController as ReadableStreamDefaultController<Uint8Array> | null;
    assert.ok(activeController, 'SSE stream controller must be initialized');

    activeController.enqueue(new TextEncoder().encode('data: {"type":"update"}\n\n'));
    const secondChunk = await reader.read();
    assert.ok(new TextDecoder().decode(secondChunk.value).includes('"type":"update"'));

    activeController.close();
    const endChunk = await reader.read();
    assert.equal(endChunk.done, true);
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});

test('BFF Proxy: clears cookies with matching Secure & SameSite=lax flags on terminal 401 behind HTTPS proxy', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const { request } = buildMockNextRequest(
      'http://web:3001/bff/api/v1/reports/dashboard',
      {
        headers: { 'x-forwarded-proto': 'https' },
        cookies: { kc_access_token: 'expired-token' },
      },
    );

    const response = await handleBffProxyRequest(request, {
      params: Promise.resolve({ path: ['reports', 'dashboard'] }),
    });

    assert.equal(response.status, 401);
    const setCookies = response.headers.getSetCookie();
    assert.equal(setCookies.length, 3);
    for (const cookieHeader of setCookies) {
      assert.ok(cookieHeader.includes('Max-Age=0'), `Expected Max-Age=0 in: ${cookieHeader}`);
      assert.ok(cookieHeader.toLowerCase().includes('samesite=lax'), `Expected SameSite=lax in: ${cookieHeader}`);
      assert.ok(cookieHeader.includes('Secure'), `Expected Secure attribute behind https proxy in: ${cookieHeader}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});

test('BFF Proxy: handles client-aborted SSE/fetch (ResponseAborted / AbortError) quietly with 499', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    const err = new Error('Client closed stream');
    err.name = 'ResponseAborted';
    throw err;
  }) as typeof fetch;

  try {
    const { request } = buildMockNextRequest(
      'http://localhost:3001/bff/api/v1/reports/approvals-stream',
      { cookies: { kc_access_token: 'valid-jwt' } },
    );

    const response = await handleBffProxyRequest(request, {
      params: Promise.resolve({ path: ['reports', 'approvals-stream'] }),
    });
    assert.equal(response.status, 499);
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});

test('DEF-FE-06: BFF Proxy forwards client IP, proto, host, user-agent & request-id on direct & 401-retry upstream calls', async () => {
  resetBffRefreshStateForTesting();
  const originalFetch = globalThis.fetch;
  const capturedCalls: Array<{ url: string; headers: Headers }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    capturedCalls.push({ url, headers: new Headers(init?.headers) });

    if (url.includes('/api/v1/auth/refresh-token')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            accessToken: 'refreshed-access-jwt',
            refreshToken: 'refreshed-refresh-jwt',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (capturedCalls.length === 1) {
      return new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { 'content-type': 'application/json', 'x-request-id': 'req-trace-xyz' },
      });
    }

    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-trace-xyz' },
    });
  }) as typeof fetch;

  try {
    const { request } = buildMockNextRequest(
      'http://web:3001/bff/api/v1/collections',
      {
        method: 'POST',
        headers: {
          'x-forwarded-for': '106.51.10.22',
          'x-real-ip': '106.51.10.22',
          'x-forwarded-proto': 'https',
          host: 'chits.kumaranfinance.in',
          'x-request-id': 'req-trace-xyz',
          'user-agent': 'KumaranBrowser/1.0',
          'content-type': 'application/json',
          'idempotency-key': 'idem-key-001',
        },
        cookies: {
          kc_access_token: 'stale-access-jwt',
          kc_refresh_token: 'valid-refresh-jwt',
        },
      },
    );

    const response = await handleBffProxyRequest(request, {
      params: Promise.resolve({ path: ['collections'] }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'req-trace-xyz');
    // Call 1: initial POST; Call 2: executeBffRefresh; Call 3: retried POST
    assert.equal(capturedCalls.length, 3);

    for (const call of capturedCalls) {
      assert.equal(call.headers.get('x-forwarded-for'), '106.51.10.22');
      assert.equal(call.headers.get('x-real-ip'), '106.51.10.22');
      assert.equal(call.headers.get('x-forwarded-proto'), 'https');
      assert.equal(call.headers.get('x-forwarded-host'), 'chits.kumaranfinance.in');
      assert.equal(call.headers.get('x-request-id'), 'req-trace-xyz');
      assert.equal(call.headers.get('user-agent'), 'KumaranBrowser/1.0');
    }
    assert.equal(capturedCalls[1].headers.get('authorization'), null, 'Refresh call must drop stale Bearer header');
    assert.equal(capturedCalls[2].headers.get('authorization'), 'Bearer refreshed-access-jwt');
    assert.equal(capturedCalls[2].headers.get('idempotency-key'), 'idem-key-001');
  } finally {
    globalThis.fetch = originalFetch;
    resetBffRefreshStateForTesting();
  }
});
