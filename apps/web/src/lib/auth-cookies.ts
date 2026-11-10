// ==============================================================================
// Kumaran Chits — BFF Auth Cookie Specifications & Constants
// Single source of truth for HttpOnly session cookies in Next.js 15 App Router.
// ==============================================================================

export const COOKIE_ACCESS_TOKEN = 'kc_access_token';
export const COOKIE_REFRESH_TOKEN = 'kc_refresh_token';
export const COOKIE_SESSION_ACTIVE = 'kc_session_active';

/**
 * Access token cookie options (15 minutes TTL, HttpOnly).
 */
export function getAccessTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: COOKIE_ACCESS_TOKEN,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 15 * 60, // 15 minutes
  };
}

/**
 * Refresh token cookie options (7 days TTL, HttpOnly).
 */
export function getRefreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: COOKIE_REFRESH_TOKEN,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

/**
 * Non-HttpOnly session presence flag for client JavaScript awareness.
 * Allows client code to know a session exists without exposing raw JWTs.
 */
export function getSessionActiveCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: COOKIE_SESSION_ACTIVE,
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

/**
 * Returns backend API base URL for server-to-server calls from Next.js BFF.
 */
export function getBackendApiUrl(): string {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://localhost:3000';
}
