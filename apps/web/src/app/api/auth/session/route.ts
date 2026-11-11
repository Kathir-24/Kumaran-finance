// ==============================================================================
// Kumaran Chits — BFF Auth Session Hydration Route Handler (/api/auth/session)
// Verifies session cookies with NestJS, uses shared BFF refresh deduplication,
// and returns sanitized staff identity.
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
} from '@/lib/bff-token-refresh';

export async function GET(request: NextRequest) {
  try {
    const backendUrl = getBackendApiUrl();
    const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

    const fetchUserProfile = async (token: string) => {
      return fetch(`${backendUrl}/api/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    };

    // Case 1: Active access token exists
    if (accessToken) {
      const profileRes = await fetchUserProfile(accessToken);
      if (profileRes.ok) {
        const payload = await profileRes.json();
        const user = payload.data || payload;
        return NextResponse.json({ authenticated: true, user });
      }

      // If non-401 or no refresh token available, clear stale cookies and conclude unauthenticated
      if (profileRes.status !== 401 || !refreshToken) {
        const res = NextResponse.json({ authenticated: false, user: null });
        clearAuthCookies(res);
        return res;
      }
    }

    // Case 2: Access token missing or expired -> deduplicated silent refresh
    if (refreshToken) {
      const refreshData = await executeBffRefresh(backendUrl, refreshToken);
      if (refreshData?.accessToken) {
        const profileRes = await fetchUserProfile(refreshData.accessToken);
        if (profileRes.ok) {
          const payload = await profileRes.json();
          const user = payload.data || payload;

          const response = NextResponse.json({ authenticated: true, user });
          applyRefreshedCookies(response, refreshData);
          return response;
        }
      }
    }

    // Case 3: No valid session
    const emptyResponse = NextResponse.json({ authenticated: false, user: null });
    clearAuthCookies(emptyResponse);
    return emptyResponse;
  } catch (error: any) {
    console.error('[BFF Session] Hydration error:', error);
    return NextResponse.json({ authenticated: false, user: null }, { status: 500 });
  }
}
