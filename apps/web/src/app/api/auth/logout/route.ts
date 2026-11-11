// ==============================================================================
// Kumaran Chits — BFF Auth Logout Route Handler (/api/auth/logout)
// Invalidates BFF refresh caches, revokes token in NestJS & Redis, purges cookies.
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  getBackendApiUrl,
  shouldUseSecureCookies,
} from '@/lib/auth-cookies';
import {
  clearAuthCookies,
  executeBffRefresh,
  invalidateBffRefreshCache,
} from '@/lib/bff-token-refresh';

export async function POST(request: NextRequest) {
  try {
    const backendUrl = getBackendApiUrl();
    let accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

    // Immediately evict any recent/in-flight BFF refresh entries before calling backend logout
    if (refreshToken) {
      invalidateBffRefreshCache(refreshToken);
    }

    // If short-lived access token already expired while refresh token remains active,
    // obtain a short Bearer token cleanly so NestJS always revokes the Redis/DB session family
    if (!accessToken && refreshToken) {
      try {
        const refreshed = await executeBffRefresh(backendUrl, refreshToken);
        if (refreshed?.accessToken) {
          accessToken = refreshed.accessToken;
          invalidateBffRefreshCache(refreshToken);
          invalidateBffRefreshCache(refreshed.refreshToken);
        }
      } catch {
        // Proceed gracefully to local cookie purge even if refresh token already expired
      }
    }

    // Notify NestJS backend to revoke token family in PostgreSQL and Redis
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

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    clearAuthCookies(response, shouldUseSecureCookies(request));
    return response;
  } catch (error: any) {
    console.error('[BFF Logout] Error during logout:', error);
    const errorResponse = NextResponse.json(
      { success: false, message: error?.message || 'Logout encountered an issue' },
      { status: 500 },
    );
    clearAuthCookies(errorResponse, shouldUseSecureCookies(request));
    return errorResponse;
  }
}
