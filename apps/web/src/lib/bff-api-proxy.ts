// ==============================================================================
// Kumaran Chits — Shared BFF Transparent Backend API Proxy Helper
// Translates HttpOnly session cookies into Authorization Bearer headers,
// deduplicates silent 401 token refreshes (DEF-FE-01), streams SSE live feeds
// without buffering, and clears expired session cookies on terminal 401 errors.
// ==============================================================================

import type { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  getBackendApiUrl,
  shouldUseSecureCookies,
} from './auth-cookies.ts';
import {
  applyRefreshedCookies,
  clearAuthCookies,
  executeBffRefresh,
  type BffRefreshedTokens,
} from './bff-token-refresh.ts';
import { buildBffForwardHeaders } from './bff-forward-headers.ts';

export type ProxyResponseFactory = (
  body: BodyInit | null,
  init: ResponseInit,
) => NextResponse;

function jsonErrorResponse(
  createResponse: ProxyResponseFactory,
  payload: Record<string, unknown>,
  status: number,
): NextResponse {
  return createResponse(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function defaultProxyResponseFactory(
  body: BodyInit | null,
  init: ResponseInit,
): NextResponse {
  const baseRes = new Response(body, init) as unknown as NextResponse;

  (baseRes as any).cookies = {
    set(name: string, value: string, opts: any = {}) {
      const attrs = [`${name}=${encodeURIComponent(value)}`];
      if (opts.path) attrs.push(`Path=${opts.path}`);
      if (typeof opts.maxAge === 'number') attrs.push(`Max-Age=${opts.maxAge}`);
      if (opts.httpOnly) attrs.push('HttpOnly');
      if (opts.secure) attrs.push('Secure');
      if (opts.sameSite) attrs.push(`SameSite=${opts.sameSite}`);
      baseRes.headers.append('set-cookie', attrs.join('; '));
    },
  };

  return baseRes;
}

export async function handleBffProxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  createResponse: ProxyResponseFactory = defaultProxyResponseFactory,
): Promise<NextResponse> {
  const isSecure = shouldUseSecureCookies(request);

  try {
    const { path } = await context.params;
    const subpath = path.join('/');
    const backendUrl = getBackendApiUrl();
    const urlObj = new URL(request.url, 'http://localhost');
    const search = (request as any).nextUrl?.search ?? urlObj.search ?? '';
    const targetUrl = `${backendUrl}/api/v1/${subpath}${search}`;

    let accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

    // Build proxy + client identity headers to forward to NestJS (DEF-FE-06)
    const forwardHeaders = buildBffForwardHeaders(request.headers, {
      includeContentHeaders: true,
    });

    let refreshedTokens: BffRefreshedTokens | null = null;

    // Proactive refresh if browser already evicted expired 15-min kc_access_token
    if (!accessToken && refreshToken) {
      refreshedTokens = await executeBffRefresh(backendUrl, refreshToken, forwardHeaders);
      if (refreshedTokens?.accessToken) {
        accessToken = refreshedTokens.accessToken;
      } else {
        const expiredRes = jsonErrorResponse(
          createResponse,
          { success: false, code: 'UNAUTHORIZED', message: 'Session expired. Please sign in again.' },
          401,
        );
        clearAuthCookies(expiredRes, isSecure);
        return expiredRes;
      }
    }

    if (accessToken) {
      forwardHeaders.set('Authorization', `Bearer ${accessToken}`);
    }

    // Read body for mutation requests
    const isMutation = !['GET', 'HEAD'].includes(request.method);
    const requestBody = isMutation ? await request.arrayBuffer() : undefined;

    // Dispatch request to NestJS backend (propagating client abort signal for SSE streams)
    let backendRes = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: requestBody,
      signal: request.signal,
    });

    // If 401 Unauthorized and we haven't already refreshed this call, deduplicate refresh and retry
    if (backendRes.status === 401 && refreshToken && !refreshedTokens) {
      refreshedTokens = await executeBffRefresh(backendUrl, refreshToken, forwardHeaders);
      if (refreshedTokens?.accessToken) {
        forwardHeaders.set('Authorization', `Bearer ${refreshedTokens.accessToken}`);
        backendRes = await fetch(targetUrl, {
          method: request.method,
          headers: forwardHeaders,
          body: requestBody,
          signal: request.signal,
        });
      }
    }

    const contentType = backendRes.headers.get('content-type') || '';
    const responseRequestId =
      backendRes.headers.get('x-request-id') || forwardHeaders.get('x-request-id');

    // Stream Server-Sent Events directly without arrayBuffer() buffering
    if (backendRes.ok && backendRes.body && contentType.toLowerCase().includes('text/event-stream')) {
      const streamHeaders = new Headers();
      streamHeaders.set('content-type', contentType);
      streamHeaders.set('cache-control', 'no-cache, no-transform');
      streamHeaders.set('x-accel-buffering', 'no');
      streamHeaders.set('connection', 'keep-alive');
      if (responseRequestId) {
        streamHeaders.set('x-request-id', responseRequestId);
      }

      const sseResponse = createResponse(backendRes.body as BodyInit, {
        status: backendRes.status,
        statusText: backendRes.statusText,
        headers: streamHeaders,
      });

      if (refreshedTokens) {
        applyRefreshedCookies(sseResponse, refreshedTokens, isSecure);
      }

      return sseResponse;
    }

    // Standard buffered response for JSON, CSV, and binary PDF payloads
    const responseBody = await backendRes.arrayBuffer();
    const clientResponse = createResponse(responseBody, {
      status: backendRes.status,
      statusText: backendRes.statusText,
    });

    if (contentType) {
      clientResponse.headers.set('content-type', contentType);
    }
    if (responseRequestId) {
      clientResponse.headers.set('x-request-id', responseRequestId);
    }

    if (refreshedTokens) {
      applyRefreshedCookies(clientResponse, refreshedTokens, isSecure);
    } else if (backendRes.status === 401) {
      // Terminal unauthorized session: purge stale cookies to prevent Edge Middleware loops
      clearAuthCookies(clientResponse, isSecure);
    }

    return clientResponse;
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.name === 'ResponseAborted' || request.signal?.aborted) {
      return createResponse(null, { status: 499 });
    }
    console.error('[BFF Proxy] Unhandled proxy error:', error);
    return jsonErrorResponse(
      createResponse,
      {
        success: false,
        error: 'GATEWAY_ERROR',
        message: error?.message || 'Failed to proxy request to backend service',
      },
      502,
    );
  }
}
