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

    streamController?.enqueue(new TextEncoder().encode('data: {"type":"update"}\n\n'));
    const secondChunk = await reader.read();
    assert.ok(new TextDecoder().decode(secondChunk.value).includes('"type":"update"'));

    streamController?.close();
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
