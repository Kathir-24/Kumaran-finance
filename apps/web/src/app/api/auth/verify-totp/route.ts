// ==============================================================================
// Kumaran Chits — BFF Auth TOTP Verification Route Handler (/api/auth/verify-totp)
// Validates 2FA code with NestJS backend, setting HttpOnly session cookies.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getBackendApiUrl,
  shouldUseSecureCookies,
} from '@/lib/auth-cookies';
import { applyRefreshedCookies } from '@/lib/bff-token-refresh';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = getBackendApiUrl();

    const backendRes = await fetch(`${backendUrl}/api/v1/auth/web/verify-totp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tempToken: body.tempToken,
        totpCode: body.totpCode,
      }),
    });

    const responsePayload = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        responsePayload,
        { status: backendRes.status },
      );
    }

    const authData = responsePayload.data || responsePayload;

    if (authData.accessToken && authData.user) {
      const response = NextResponse.json({
        success: true,
        user: authData.user,
      });

      applyRefreshedCookies(
        response,
        { accessToken: authData.accessToken, refreshToken: authData.refreshToken },
        shouldUseSecureCookies(request),
      );

      return response;
    }

    return NextResponse.json(
      { success: false, message: 'Invalid response from backend 2FA service' },
      { status: 500 },
    );
  } catch (error: any) {
    console.error('[BFF Verify TOTP] Request error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'TOTP verification failed' },
      { status: 500 },
    );
  }
}
