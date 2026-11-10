// ==============================================================================
// Kumaran Chits — BFF Auth Session Hydration Route Handler (/api/auth/session)
// Verifies session cookies with NestJS, handles silent refresh, returns user profile.
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

export async function GET(request: NextRequest) {
  try {
    const backendUrl = getBackendApiUrl();
    const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

    // Helper to fetch user profile with a given access token
    const fetchUserProfile = async (token: string) => {
      return fetch(`${backendUrl}/api/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    };

    // Helper to rotate refresh token
    const performTokenRefresh = async (refToken: string) => {
      const res = await fetch(`${backendUrl}/api/v1/auth/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: refToken,
          clientType: 'WEB',
        }),
      });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload.data || payload;
    };

    // Case 1: Active access token exists
    if (accessToken) {
      const profileRes = await fetchUserProfile(accessToken);
      if (profileRes.ok) {
        const payload = await profileRes.json();
        const user = payload.data || payload;
        return NextResponse.json({ authenticated: true, user });
      }

      // If access token returned 401, fall through to refresh flow if refresh token is available
      if (profileRes.status !== 401 || !refreshToken) {
        const res = NextResponse.json({ authenticated: false, user: null });
        res.cookies.delete(COOKIE_ACCESS_TOKEN);
        res.cookies.delete(COOKIE_REFRESH_TOKEN);
        res.cookies.delete(getSessionActiveCookieOptions().name);
        return res;
      }
    }

    // Case 2: Access token missing or expired, attempt refresh using refreshToken
    if (refreshToken) {
      const refreshData = await performTokenRefresh(refreshToken);
      if (refreshData?.accessToken) {
        const profileRes = await fetchUserProfile(refreshData.accessToken);
        if (profileRes.ok) {
          const payload = await profileRes.json();
          const user = payload.data || payload;

          const response = NextResponse.json({ authenticated: true, user });
          const accessOpts = getAccessTokenCookieOptions();
          const refreshOpts = getRefreshTokenCookieOptions();
          const sessionActiveOpts = getSessionActiveCookieOptions();

          response.cookies.set(accessOpts.name, refreshData.accessToken, accessOpts);
          if (refreshData.refreshToken) {
            response.cookies.set(refreshOpts.name, refreshData.refreshToken, refreshOpts);
          }
          response.cookies.set(sessionActiveOpts.name, '1', sessionActiveOpts);
          return response;
        }
      }
    }

    // Case 3: No valid session
    const emptyResponse = NextResponse.json({ authenticated: false, user: null });
    emptyResponse.cookies.delete(COOKIE_ACCESS_TOKEN);
    emptyResponse.cookies.delete(COOKIE_REFRESH_TOKEN);
    emptyResponse.cookies.delete(getSessionActiveCookieOptions().name);
    return emptyResponse;
  } catch (error: any) {
    console.error('[BFF Session] Hydration error:', error);
    return NextResponse.json({ authenticated: false, user: null }, { status: 500 });
  }
}
