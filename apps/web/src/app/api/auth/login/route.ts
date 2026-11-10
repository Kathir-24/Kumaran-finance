// ==============================================================================
// Kumaran Chits — BFF Auth Login Route Handler (/api/auth/login)
// Proxies staff credentials to NestJS backend, setting HttpOnly session cookies.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionActiveCookieOptions,
  getBackendApiUrl,
} from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = getBackendApiUrl();

    const backendRes = await fetch(`${backendUrl}/api/v1/auth/web/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: body.phone,
        password: body.password,
        clientType: 'WEB',
      }),
    });

    const responsePayload = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        responsePayload,
        { status: backendRes.status },
      );
    }

    // Unwrap NestJS envelope if present: { success: true, data: { ... } }
    const authData = responsePayload.data || responsePayload;

    // Case 1: 2FA TOTP is required
    if (authData.requireTotp && authData.tempToken) {
      return NextResponse.json({
        success: true,
        requireTotp: true,
        tempToken: authData.tempToken,
      });
    }

    // Case 2: Full authentication succeeded
    if (authData.accessToken && authData.user) {
      const response = NextResponse.json({
        success: true,
        user: authData.user,
      });

      // Set HttpOnly, SameSite=Lax, Secure cookies
      const accessOpts = getAccessTokenCookieOptions();
      const refreshOpts = getRefreshTokenCookieOptions();
      const sessionActiveOpts = getSessionActiveCookieOptions();

      response.cookies.set(accessOpts.name, authData.accessToken, accessOpts);
      if (authData.refreshToken) {
        response.cookies.set(refreshOpts.name, authData.refreshToken, refreshOpts);
      }
      response.cookies.set(sessionActiveOpts.name, '1', sessionActiveOpts);

      return response;
    }

    return NextResponse.json(
      { success: false, message: 'Invalid response from backend auth service' },
      { status: 500 },
    );
  } catch (error: any) {
    console.error('[BFF Login] Request error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Authentication failed' },
      { status: 500 },
    );
  }
}
