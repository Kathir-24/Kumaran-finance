// ==============================================================================
// Kumaran Chits — BFF Auth Cookie Specifications & Constants
// Single source of truth for HttpOnly session cookies in Next.js 15 App Router.
// ==============================================================================

export const COOKIE_ACCESS_TOKEN = 'kc_access_token';
export const COOKIE_REFRESH_TOKEN = 'kc_refresh_token';
export const COOKIE_SESSION_ACTIVE = 'kc_session_active';
export const COOKIE_TOTP_PENDING = 'kc_totp_pending_token';
export const COOKIE_ONBOARDING_TOKEN = 'kc_onboarding_token';

export interface CookieSecurityContext {
  headers?: {
    get?(name: string): string | null | undefined;
  };
  nextUrl?: {
    protocol?: string;
  };
  url?: string;
}

/**
 * Determines whether authentication cookies must carry the `Secure` attribute.
 * Respects explicit `COOKIE_SECURE` env overrides, then inspects request transport
 * (`x-forwarded-proto` / URL scheme) so production HTTPS sends `Secure` cookies while
 * local HTTP `next start` (e.g. Playwright / plain HTTP Docker) retains cookies safely.
 */
export function shouldUseSecureCookies(context?: CookieSecurityContext): boolean {
  if (process.env.COOKIE_SECURE === 'true') {
    return true;
  }
  if (process.env.COOKIE_SECURE === 'false') {
    return false;
  }
  if (context) {
    const forwardedProto = context.headers
      ?.get?.('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      ?.toLowerCase();
    if (forwardedProto) {
      return forwardedProto === 'https';
    }
    if (context.nextUrl?.protocol) {
      return context.nextUrl.protocol === 'https:';
    }
    if (context.url) {
      return context.url.startsWith('https://');
    }
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

/**
 * Access token cookie options (15 minutes TTL, HttpOnly).
 */
export function getAccessTokenCookieOptions(isSecure?: boolean) {
  return {
    name: COOKIE_ACCESS_TOKEN,
    httpOnly: true,
    secure: isSecure ?? shouldUseSecureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 15 * 60, // 15 minutes
  };
}

/**
 * Refresh token cookie options (7 days TTL, HttpOnly).
 */
export function getRefreshTokenCookieOptions(isSecure?: boolean) {
  return {
    name: COOKIE_REFRESH_TOKEN,
    httpOnly: true,
    secure: isSecure ?? shouldUseSecureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

/**
 * Non-HttpOnly session presence flag for client JavaScript awareness.
 * Allows client code to know a session exists without exposing raw JWTs.
 */
export function getSessionActiveCookieOptions(isSecure?: boolean) {
  return {
    name: COOKIE_SESSION_ACTIVE,
    httpOnly: false,
    secure: isSecure ?? shouldUseSecureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

/**
 * Pending 2FA TOTP challenge JWT cookie options (5 minutes TTL, HttpOnly).
 * Scoped at `/` so Next.js Edge Middleware (/2fa) and BFF auth routes share it safely.
 */
export function getTotpPendingCookieOptions(isSecure?: boolean) {
  return {
    name: COOKIE_TOTP_PENDING,
    httpOnly: true,
    secure: isSecure ?? shouldUseSecureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 5 * 60, // 5 minutes matching backend JWT expiry
  };
}

/**
 * Restricted staff onboarding challenge JWT cookie options (15 minutes TTL, HttpOnly).
 */
export function getOnboardingTokenCookieOptions(isSecure?: boolean) {
  return {
    name: COOKIE_ONBOARDING_TOKEN,
    httpOnly: true,
    secure: isSecure ?? shouldUseSecureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 15 * 60, // 15 minutes matching backend onboarding JWT expiry
  };
}

/**
 * Cookie deletion options mirroring active session attributes (`sameSite`, `secure`)
 * so strict browsers expire HTTPS/Lax cookies cleanly across all environments.
 */
export function getClearedCookieOptions(httpOnly: boolean, isSecure?: boolean) {
  return {
    path: '/',
    maxAge: 0,
    httpOnly,
    sameSite: 'lax' as const,
    secure: isSecure ?? shouldUseSecureCookies(),
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
