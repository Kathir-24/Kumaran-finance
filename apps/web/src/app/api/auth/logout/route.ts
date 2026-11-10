// ==============================================================================
// Kumaran Chits — BFF Auth Logout Route Handler (/api/auth/logout)
// Revokes token in NestJS & Redis, purges HttpOnly session cookies.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
  getBackendApiUrl,
} from '@/lib/auth-cookies';

export async function POST(request: NextRequest) {
  try {
    const backendUrl = getBackendApiUrl();
    const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;

    // 1. Notify NestJS backend to revoke token family in PostgreSQL and Redis
    if (accessToken) {
      try {
        await fetch(`${backendUrl}/api/v1/auth/logout?clientType=WEB`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (err) {
        console.warn('[BFF Logout] Backend logout failed, proceeding with cookie cleanup', err);
      }
    }

    // 2. Clear all session cookies
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    response.cookies.set(COOKIE_ACCESS_TOKEN, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
    });
    response.cookies.set(COOKIE_REFRESH_TOKEN, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
    });
    response.cookies.set(COOKIE_SESSION_ACTIVE, '', {
      path: '/',
      maxAge: 0,
      httpOnly: false,
    });

    return response;
  } catch (error: any) {
    console.error('[BFF Logout] Error during logout:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Logout encountered an issue' },
      { status: 500 },
    );
  }
}
