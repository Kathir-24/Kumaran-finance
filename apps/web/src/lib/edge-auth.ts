// ==============================================================================
// Kumaran Chits — Edge Authentication & RBAC Verification (jose HS256)
// Verifies HttpOnly BFF JWT cookies cryptographically at Next.js Edge Middleware
// and enforces canonical route RBAC without trusting client-set presence flags.
// ==============================================================================

import { jwtVerify } from 'jose/jwt/verify';
import * as joseErrors from 'jose/errors';
import { isRoleAuthorizedForPath } from './route-permissions.ts';

export interface EdgeAuthParams {
  pathname: string;
  redirectParam?: string | null;
  errorParam?: string | null;
  accessToken?: string;
  refreshToken?: string;
  jwtSecret?: string;
}

export type EdgeAuthDecision =
  | { action: 'next' }
  | { action: 'redirect'; location: string; clearStaleCookies: boolean };

interface SingleJwtVerification {
  valid: boolean;
  expired: boolean;
  sub?: string;
  roles?: string[];
}

interface TokenEvaluationResult {
  authenticated: boolean;
  sub?: string;
  roles: string[];
  hadTokens: boolean;
  secretConfigured: boolean;
}

let hasWarnedMissingSecret = false;

/**
 * Skips Next.js static chunks, internal API/BFF endpoints, and static file extensions.
 */
export function isPublicAssetOrApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/bff') ||
    pathname.includes('.')
  );
}

/**
 * Prevents open redirects by strictly allowing single-slash internal paths.
 */
export function sanitizeSafeRedirectPath(redirectParam?: string | null): string {
  if (!redirectParam) return '/';
  const trimmed = redirectParam.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    /[\r\n]/.test(trimmed) ||
    trimmed === '/login' ||
    trimmed.startsWith('/login?') ||
    trimmed === '/2fa' ||
    trimmed.startsWith('/2fa?')
  ) {
    return '/';
  }
  return trimmed;
}

async function verifySingleJwt(
  token: string,
  secretKey: Uint8Array,
  expectedType: 'access' | 'refresh',
): Promise<SingleJwtVerification> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return { valid: false, expired: false };
    }

    if (payload.tokenType !== expectedType) {
      return { valid: false, expired: false };
    }

    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((r): r is string => typeof r === 'string')
      : [];

    return {
      valid: true,
      expired: false,
      sub: payload.sub,
      roles,
    };
  } catch (err) {
    const isExpired =
      err instanceof joseErrors.JWTExpired ||
      (typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'ERR_JWT_EXPIRED');

    return {
      valid: false,
      expired: isExpired,
    };
  }
}

async function verifyEdgeTokens(
  accessToken?: string,
  refreshToken?: string,
  explicitSecret?: string,
): Promise<TokenEvaluationResult> {
  const cleanAccess = accessToken?.trim();
  const cleanRefresh = refreshToken?.trim();
  const hadTokens = Boolean(cleanAccess || cleanRefresh);

  const secret = (explicitSecret ?? process.env.JWT_SECRET)?.trim();
  if (!secret) {
    if (!hasWarnedMissingSecret) {
      hasWarnedMissingSecret = true;
      console.error('[EdgeAuth] JWT_SECRET is missing; failing closed on protected web routes.');
    }
    return {
      authenticated: false,
      roles: [],
      hadTokens,
      secretConfigured: false,
    };
  }

  const secretKey = new TextEncoder().encode(secret);

  if (cleanAccess) {
    const accessResult = await verifySingleJwt(cleanAccess, secretKey, 'access');
    if (accessResult.valid && accessResult.sub) {
      return {
        authenticated: true,
        sub: accessResult.sub,
        roles: accessResult.roles ?? [],
        hadTokens,
        secretConfigured: true,
      };
    }

    // Do not fall back to refresh cookie if access cookie was explicitly tampered or wrong tokenType
    if (!accessResult.expired) {
      return {
        authenticated: false,
        roles: [],
        hadTokens,
        secretConfigured: true,
      };
    }
  }

  if (cleanRefresh) {
    const refreshResult = await verifySingleJwt(cleanRefresh, secretKey, 'refresh');
    if (refreshResult.valid && refreshResult.sub) {
      return {
        authenticated: true,
        sub: refreshResult.sub,
        roles: refreshResult.roles ?? [],
        hadTokens,
        secretConfigured: true,
      };
    }
  }

  return {
    authenticated: false,
    roles: [],
    hadTokens,
    secretConfigured: true,
  };
}

/**
 * Evaluates incoming web route requests against cryptographically verified HS256 JWTs
 * and canonical RBAC rules. Never trusts non-HttpOnly `kc_session_active`.
 */
export async function evaluateEdgeAuth(params: EdgeAuthParams): Promise<EdgeAuthDecision> {
  const {
    pathname,
    redirectParam,
    errorParam,
    accessToken,
    refreshToken,
    jwtSecret,
  } = params;

  if (isPublicAssetOrApiPath(pathname)) {
    return { action: 'next' };
  }

  const isAuthPage =
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/2fa' ||
    pathname.startsWith('/2fa/');

  const auth = await verifyEdgeTokens(accessToken, refreshToken, jwtSecret);

  if (!auth.authenticated) {
    if (isAuthPage) {
      return { action: 'next' };
    }

    const safeRedirect = sanitizeSafeRedirectPath(pathname);
    const loginLocation =
      safeRedirect !== '/' ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : '/login';

    return {
      action: 'redirect',
      location: loginLocation,
      clearStaleCookies: auth.hadTokens && auth.secretConfigured,
    };
  }

  if (isAuthPage) {
    if (errorParam === 'forbidden' || !isRoleAuthorizedForPath('/', auth.roles)) {
      return { action: 'next' };
    }

    const candidate = sanitizeSafeRedirectPath(redirectParam);
    const destination = isRoleAuthorizedForPath(candidate, auth.roles) ? candidate : '/';
    return {
      action: 'redirect',
      location: destination,
      clearStaleCookies: false,
    };
  }

  if (!isRoleAuthorizedForPath(pathname, auth.roles)) {
    const destination = isRoleAuthorizedForPath('/', auth.roles)
      ? '/?error=forbidden'
      : '/login?error=forbidden';

    return {
      action: 'redirect',
      location: destination,
      clearStaleCookies: false,
    };
  }

  return { action: 'next' };
}
