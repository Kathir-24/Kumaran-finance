// ==============================================================================
// Kumaran Chits — BFF Transparent Backend API Proxy (/api/v1/[...path])
// Automatically translates HttpOnly cookies to Authorization Bearer headers,
// streams request/response payloads, and performs silent server-side 401 token refresh.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionActiveCookieOptions,
  getBackendApiUrl,
} from '@/lib/auth-cookies';

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

    let refreshedTokens: { accessToken: string; refreshToken?: string } | null = null;

    // If 401 Unauthorized and refresh token is available, attempt silent server-side refresh
    if (backendRes.status === 401 && refreshToken) {
      try {
        const refreshRes = await fetch(`${backendUrl}/api/v1/auth/refresh-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refreshToken,
            clientType: 'WEB',
          }),
        });

        if (refreshRes.ok) {
          const refreshPayload = await refreshRes.json();
          const authData = refreshPayload.data || refreshPayload;

          if (authData?.accessToken) {
            refreshedTokens = {
              accessToken: authData.accessToken,
              refreshToken: authData.refreshToken,
            };

            // Retry original request with the new access token
            forwardHeaders.set('Authorization', `Bearer ${authData.accessToken}`);
            backendRes = await fetch(targetUrl, {
              method: request.method,
              headers: forwardHeaders,
              body: requestBody,
            });
          }
        }
      } catch (refreshErr) {
        console.warn('[BFF Proxy] Silent refresh attempt failed:', refreshErr);
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

    // If tokens were silently refreshed, attach updated HttpOnly cookies
    if (refreshedTokens) {
      const accessOpts = getAccessTokenCookieOptions();
      const refreshOpts = getRefreshTokenCookieOptions();
      const sessionActiveOpts = getSessionActiveCookieOptions();

      clientResponse.cookies.set(accessOpts.name, refreshedTokens.accessToken, accessOpts);
      if (refreshedTokens.refreshToken) {
        clientResponse.cookies.set(refreshOpts.name, refreshedTokens.refreshToken, refreshOpts);
      }
      clientResponse.cookies.set(sessionActiveOpts.name, '1', sessionActiveOpts);
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
