// ==============================================================================
// Kumaran Chits — Shared BFF Authentication Route Handler Core (DEF-FE-08)
// Centralizes login, TOTP 2FA verification, session hydration, and logout logic
// while strictly enclosing all session and pending-2FA JWTs inside HttpOnly cookies.
// ==============================================================================

import type { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_TOTP_PENDING,
  COOKIE_ONBOARDING_TOKEN,
  getBackendApiUrl,
  shouldUseSecureCookies,
} from './auth-cookies.ts';
import {
  applyOnboardingCookie,
  applyRefreshedCookies,
  applyTotpPendingCookie,
  clearAuthCookies,
  clearOnboardingCookie,
  clearTotpPendingCookie,
  executeBffRefresh,
  invalidateBffRefreshCache,
} from './bff-token-refresh.ts';
import { buildBffForwardHeaders } from './bff-forward-headers.ts';
import { verifyTotpPendingJwt } from './edge-auth.ts';

export type BffJsonResponseFactory = (
  body: unknown,
  init?: ResponseInit,
) => NextResponse;

export interface BffRouteContextOverrides {
  isSecure?: boolean;
  forwardHeaders?: Headers;
  jwtSecret?: string;
}

/**
 * Distinguishes an expired/invalid 5-minute 2FA challenge JWT from a mistyped
 * 6-digit Microsoft Authenticator code so failed code attempts allow retry.
 */
function isTotpPendingSessionExpiredMessage(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    /Temporary 2FA session|Invalid token type|2FA not configured/i.test(message)
  );
}

/**
 * Handles POST /api/auth/login:
 * - 2FA branch stores `tempToken` exclusively inside HttpOnly `kc_totp_pending_token`.
 * - Direct branch sets HttpOnly session cookies and clears any stale pending cookie.
 */
export async function handleBffLoginPost(
  request: NextRequest,
  createJsonResponse: BffJsonResponseFactory,
  overrides?: BffRouteContextOverrides,
): Promise<NextResponse> {
  const isSecure = overrides?.isSecure ?? shouldUseSecureCookies(request);
  const forwardHeaders =
    overrides?.forwardHeaders ??
    buildBffForwardHeaders(request.headers, { contentType: 'application/json' });

  try {
    const body = await request.json();
    const backendUrl = getBackendApiUrl();

    const backendRes = await fetch(`${backendUrl}/api/v1/auth/web/login`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        phone: body.phone,
        password: body.password,
        clientType: 'WEB',
      }),
    });

    const responsePayload = await backendRes.json();

    if (!backendRes.ok) {
      return createJsonResponse(responsePayload, { status: backendRes.status });
    }

    const authData = responsePayload.data || responsePayload;

    // Case 0: First-login onboarding password change required -> enclose tempToken in HttpOnly cookie
    if ((authData.mustChangePassword || authData.must_change_password) && authData.tempToken) {
      const response = createJsonResponse({
        success: true,
        mustChangePassword: true,
        message:
          authData.message ||
          'Initial temporary password detected. You must configure a new permanent password to complete onboarding.',
      });
      applyOnboardingCookie(response, authData.tempToken, isSecure);
      return response;
    }

    // Case 1: 2FA TOTP is required -> enclose tempToken strictly in HttpOnly cookie
    if (authData.requireTotp && authData.tempToken) {
      const response = createJsonResponse({
        success: true,
        requireTotp: true,
      });
      applyTotpPendingCookie(response, authData.tempToken, isSecure);
      clearOnboardingCookie(response, isSecure);
      return response;
    }

    // Case 2: Direct authentication succeeded
    if (authData.accessToken && authData.user) {
      const response = createJsonResponse({
        success: true,
        user: authData.user,
      });

      applyRefreshedCookies(
        response,
        { accessToken: authData.accessToken, refreshToken: authData.refreshToken },
        isSecure,
      );
      clearTotpPendingCookie(response, isSecure);
      clearOnboardingCookie(response, isSecure);
      return response;
    }

    return createJsonResponse(
      { success: false, message: 'Invalid response from backend auth service' },
      { status: 500 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    console.error('[BFF Login] Request error:', error);
    return createJsonResponse(
      { success: false, message },
      { status: 500 },
    );
  }
}

/**
 * Handles POST /api/auth/verify-totp:
 * Reads `tempToken` strictly from the HttpOnly `kc_totp_pending_token` cookie,
 * ignoring any client-supplied `body.tempToken`.
 */
export async function handleBffVerifyTotpPost(
  request: NextRequest,
  createJsonResponse: BffJsonResponseFactory,
  overrides?: BffRouteContextOverrides,
): Promise<NextResponse> {
  const isSecure = overrides?.isSecure ?? shouldUseSecureCookies(request);
  const forwardHeaders =
    overrides?.forwardHeaders ??
    buildBffForwardHeaders(request.headers, { contentType: 'application/json' });

  try {
    const pendingToken = request.cookies.get(COOKIE_TOTP_PENDING)?.value?.trim();
    if (!pendingToken) {
      const expiredResponse = createJsonResponse(
        {
          success: false,
          sessionExpired: true,
          message: '2FA verification session expired. Please sign in again.',
        },
        { status: 401 },
      );
      clearTotpPendingCookie(expiredResponse, isSecure);
      return expiredResponse;
    }

    const body = await request.json();
    const backendUrl = getBackendApiUrl();

    const backendRes = await fetch(`${backendUrl}/api/v1/auth/web/verify-totp`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        tempToken: pendingToken,
        totpCode: body?.totpCode,
      }),
    });

    const responsePayload = await backendRes.json();

    if (!backendRes.ok) {
      const sessionExpired = isTotpPendingSessionExpiredMessage(responsePayload?.message);
      const errorResponse = createJsonResponse(
        sessionExpired ? { ...responsePayload, sessionExpired: true } : responsePayload,
        { status: backendRes.status },
      );
      if (sessionExpired) {
        clearTotpPendingCookie(errorResponse, isSecure);
      }
      return errorResponse;
    }

    const authData = responsePayload.data || responsePayload;

    if (authData.accessToken && authData.user) {
      const response = createJsonResponse({
        success: true,
        user: authData.user,
      });

      applyRefreshedCookies(
        response,
        { accessToken: authData.accessToken, refreshToken: authData.refreshToken },
        isSecure,
      );
      clearTotpPendingCookie(response, isSecure);
      return response;
    }

    return createJsonResponse(
      { success: false, message: 'Invalid response from backend 2FA service' },
      { status: 500 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'TOTP verification failed';
    console.error('[BFF Verify TOTP] Request error:', error);
    return createJsonResponse(
      { success: false, message },
      { status: 500 },
    );
  }
}

/**
 * Handles GET /api/auth/session:
 * Verifies active session cookies and, when unauthenticated, reports whether a valid
 * HttpOnly 2FA pending challenge exists (`pendingTotp: boolean`) without leaking JWTs.
 */
export async function handleBffSessionGet(
  request: NextRequest,
  createJsonResponse: BffJsonResponseFactory,
  overrides?: BffRouteContextOverrides,
): Promise<NextResponse> {
  const isSecure = overrides?.isSecure ?? shouldUseSecureCookies(request);
  const forwardHeaders = overrides?.forwardHeaders ?? buildBffForwardHeaders(request.headers);

  try {
    const backendUrl = getBackendApiUrl();
    const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;
    const totpPendingToken = request.cookies.get(COOKIE_TOTP_PENDING)?.value;

    const fetchUserProfile = async (token: string) => {
      const profileHeaders = new Headers(forwardHeaders);
      profileHeaders.set('Authorization', `Bearer ${token}`);
      return fetch(`${backendUrl}/api/v1/auth/me`, {
        headers: profileHeaders,
      });
    };

    // Case 1: Active access token exists
    if (accessToken) {
      const profileRes = await fetchUserProfile(accessToken);
      if (profileRes.ok) {
        const payload = await profileRes.json();
        const user = payload.data || payload;
        return createJsonResponse({ authenticated: true, user });
      }

      if (profileRes.status !== 401 || !refreshToken) {
        const res = createJsonResponse({ authenticated: false, user: null, pendingTotp: false });
        clearAuthCookies(res, isSecure);
        return res;
      }
    }

    // Case 2: Access token missing or expired -> deduplicated silent refresh
    if (refreshToken) {
      const refreshData = await executeBffRefresh(backendUrl, refreshToken, forwardHeaders);
      if (refreshData?.accessToken) {
        const profileRes = await fetchUserProfile(refreshData.accessToken);
        if (profileRes.ok) {
          const payload = await profileRes.json();
          const user = payload.data || payload;

          const response = createJsonResponse({ authenticated: true, user });
          applyRefreshedCookies(response, refreshData, isSecure);
          return response;
        }
      }
    }

    // Case 3: No valid full session; evaluate HttpOnly pending 2FA state safely
    const pending = await verifyTotpPendingJwt(totpPendingToken, overrides?.jwtSecret);
    const emptyResponse = createJsonResponse({
      authenticated: false,
      user: null,
      pendingTotp: pending.valid,
    });
    clearAuthCookies(emptyResponse, isSecure);
    if (pending.hadToken && !pending.valid && pending.secretConfigured) {
      clearTotpPendingCookie(emptyResponse, isSecure);
    }
    return emptyResponse;
  } catch (error) {
    console.error('[BFF Session] Hydration error:', error);
    return createJsonResponse(
      { authenticated: false, user: null, pendingTotp: false },
      { status: 500 },
    );
  }
}

/**
 * Handles POST /api/auth/logout:
 * Invalidates refresh caches, revokes active sessions on NestJS, and clears both
 * full session cookies and any pending HttpOnly 2FA challenge cookie.
 */
export async function handleBffLogoutPost(
  request: NextRequest,
  createJsonResponse: BffJsonResponseFactory,
  overrides?: BffRouteContextOverrides,
): Promise<NextResponse> {
  const isSecure = overrides?.isSecure ?? shouldUseSecureCookies(request);
  const forwardHeaders = overrides?.forwardHeaders ?? buildBffForwardHeaders(request.headers);

  try {
    const backendUrl = getBackendApiUrl();
    let accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
    const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;

    if (refreshToken) {
      invalidateBffRefreshCache(refreshToken);
    }

    if (!accessToken && refreshToken) {
      try {
        const refreshed = await executeBffRefresh(backendUrl, refreshToken, forwardHeaders);
        if (refreshed?.accessToken) {
          accessToken = refreshed.accessToken;
          invalidateBffRefreshCache(refreshToken);
          invalidateBffRefreshCache(refreshed.refreshToken);
        }
      } catch {
        // Proceed gracefully to local cookie purge even if refresh token already expired
      }
    }

    if (accessToken) {
      try {
        const logoutHeaders = new Headers(forwardHeaders);
        logoutHeaders.set('Authorization', `Bearer ${accessToken}`);
        await fetch(`${backendUrl}/api/v1/auth/logout?clientType=WEB`, {
          method: 'POST',
          headers: logoutHeaders,
        });
      } catch (err) {
        console.warn('[BFF Logout] Backend logout failed, proceeding with cookie cleanup', err);
      }
    }

    const response = createJsonResponse({
      success: true,
      message: 'Logged out successfully',
    });

    clearAuthCookies(response, isSecure);
    clearTotpPendingCookie(response, isSecure);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Logout encountered an issue';
    console.error('[BFF Logout] Error during logout:', error);
    const errorResponse = createJsonResponse(
      { success: false, message },
      { status: 500 },
    );
    clearAuthCookies(errorResponse, isSecure);
    clearTotpPendingCookie(errorResponse, isSecure);
    return errorResponse;
  }
}

/**
 * Handles POST /api/auth/complete-onboarding:
 * Reads `tempToken` strictly from the HttpOnly `kc_onboarding_token` cookie (falling back to body),
 * forwards to backend /complete-onboarding, and hydrates session cookies on success.
 */
export async function handleBffCompleteOnboardingPost(
  request: NextRequest,
  createJsonResponse: BffJsonResponseFactory,
  overrides?: BffRouteContextOverrides,
): Promise<NextResponse> {
  const isSecure = overrides?.isSecure ?? shouldUseSecureCookies(request);
  const forwardHeaders =
    overrides?.forwardHeaders ??
    buildBffForwardHeaders(request.headers, { contentType: 'application/json' });

  try {
    const body = await request.json();
    const tokenFromCookie = request.cookies.get(COOKIE_ONBOARDING_TOKEN)?.value?.trim();
    const tempToken = tokenFromCookie || body.tempToken;

    if (!tempToken) {
      const expiredResponse = createJsonResponse(
        {
          success: false,
          sessionExpired: true,
          message:
            'Onboarding session expired or missing. Please log in again with your temporary password.',
        },
        { status: 401 },
      );
      clearOnboardingCookie(expiredResponse, isSecure);
      return expiredResponse;
    }

    const backendUrl = getBackendApiUrl();
    const backendRes = await fetch(`${backendUrl}/api/v1/auth/complete-onboarding`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify({
        tempToken,
        newPassword: body.newPassword,
      }),
    });

    const responsePayload = await backendRes.json();
    if (!backendRes.ok) {
      return createJsonResponse(responsePayload, { status: backendRes.status });
    }

    const authData = responsePayload.data || responsePayload;

    // Case 1: 2FA required after password update
    if ((authData.requireTotp || authData.requiresTotp) && authData.tempToken) {
      const response = createJsonResponse({
        success: true,
        requireTotp: true,
        message: authData.message,
      });
      applyTotpPendingCookie(response, authData.tempToken, isSecure);
      clearOnboardingCookie(response, isSecure);
      return response;
    }

    // Case 2: Full authentication succeeded
    if (authData.accessToken && authData.user) {
      const response = createJsonResponse({
        success: true,
        user: authData.user,
        message: authData.message,
      });
      applyRefreshedCookies(
        response,
        { accessToken: authData.accessToken, refreshToken: authData.refreshToken },
        isSecure,
      );
      clearOnboardingCookie(response, isSecure);
      clearTotpPendingCookie(response, isSecure);
      return response;
    }

    return createJsonResponse(responsePayload, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Onboarding completion failed';
    console.error('[BFF Complete Onboarding] Request error:', error);
    return createJsonResponse({ success: false, message }, { status: 500 });
  }
}
