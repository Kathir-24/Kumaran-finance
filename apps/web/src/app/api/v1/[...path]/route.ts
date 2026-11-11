// ==============================================================================
// Kumaran Chits — BFF Transparent Backend API Proxy (/api/v1/[...path])
// Automatically translates HttpOnly cookies to Authorization Bearer headers,
// deduplicates silent token refreshes via shared BFF mutex (DEF-FE-01), and
// clears expired session cookies on terminal 401 failures.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  getBackendApiUrl,
} from '@/lib/auth-cookies';
import {
  applyRefreshedCookies,
  clearAuthCookies,
  executeBffRefresh,
  type BffRefreshedTokens,
} from '@/lib/bff-token-refresh';

async function handleProxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const subpath = path.join('/');
    const backendUrl = getBackendApiUrl();
    const search = request.nextUrl.search || '';
    const targetUrl = `${backendUrl}/api/v1/${subpath}${search}`;

    let accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

    // Build headers to forward to NestJS
    const forwardHeaders = new Headers();
    const headersToForward = [
      'content-type',
      'idempotency-key',
      'accept',
      'x-branch-id',
      'user-agent',
    ];

    for (const headerName of headersToForward) {
      const val = request.headers.get(headerName);
      if (val) {
        forwardHeaders.set(headerName, val);
      }
    }

    let refreshedTokens: BffRefreshedTokens | null = null;

    // Proactive refresh if browser already evicted expired 15-min kc_access_token
    if (!accessToken && refreshToken) {
      refreshedTokens = await executeBffRefresh(backendUrl, refreshToken);
      if (refreshedTokens?.accessToken) {
        accessToken = refreshedTokens.accessToken;
      } else {
        const expiredRes = NextResponse.json(
          { success: false, code: 'UNAUTHORIZED', message: 'Session expired. Please sign in again.' },
          { status: 401 },
        );
        clearAuthCookies(expiredRes);
        return expiredRes;
      }
    }

    if (accessToken) {
      forwardHeaders.set('Authorization', `Bearer ${accessToken}`);
    }

    // Read body for mutation requests
    const isMutation = !['GET', 'HEAD'].includes(request.method);
    let requestBody: ArrayBuffer | undefined = undefined;
    if (isMutation) {
      requestBody = await request.arrayBuffer();
    }

    // Dispatch request to NestJS backend
    let backendRes = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: requestBody,
    });

    // If 401 Unauthorized and we haven't already refreshed this call, deduplicate refresh and retry
    if (backendRes.status === 401 && refreshToken && !refreshedTokens) {
      refreshedTokens = await executeBffRefresh(backendUrl, refreshToken);
      if (refreshedTokens?.accessToken) {
        forwardHeaders.set('Authorization', `Bearer ${refreshedTokens.accessToken}`);
        backendRes = await fetch(targetUrl, {
          method: request.method,
          headers: forwardHeaders,
          body: requestBody,
        });
      }
    }

    // Prepare response to client
    const responseBody = await backendRes.arrayBuffer();
    const clientResponse = new NextResponse(responseBody, {
      status: backendRes.status,
      statusText: backendRes.statusText,
    });

    // Forward content-type header
    const contentType = backendRes.headers.get('content-type');
    if (contentType) {
      clientResponse.headers.set('content-type', contentType);
    }

    if (refreshedTokens) {
      applyRefreshedCookies(clientResponse, refreshedTokens);
    } else if (backendRes.status === 401) {
      // Terminal unauthorized session: purge stale cookies to prevent Edge Middleware loops
      clearAuthCookies(clientResponse);
    }

    return clientResponse;
  } catch (error: any) {
    console.error('[BFF Proxy] Unhandled proxy error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'GATEWAY_ERROR',
        message: error?.message || 'Failed to proxy request to backend service',
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleProxyRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleProxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleProxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleProxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return handleProxyRequest(request, context);
}
