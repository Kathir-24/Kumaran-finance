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
  totpPendingToken?: string;
  onboardingToken?: string;
  jwtSecret?: string;
}

export type EdgeAuthDecision =
  | { action: 'next' }
  | {
      action: 'redirect';
      location: string;
      clearStaleCookies: boolean;
      clearPendingTotpCookie?: boolean;
    };

export interface TotpPendingEvaluation {
  valid: boolean;
  expired: boolean;
  hadToken: boolean;
  secretConfigured: boolean;
}

export interface OnboardingEvaluation {
  valid: boolean;
  expired: boolean;
  hadToken: boolean;
  secretConfigured: boolean;
}

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
    trimmed.startsWith('/2fa?') ||
    trimmed === '/onboarding' ||
    trimmed.startsWith('/onboarding?')
  ) {
    return '/';
  }
  return trimmed;
}

async function verifySingleJwt(
  token: string,
  secretKey: Uint8Array,
  expectedType: 'access' | 'refresh' | 'totp_pending' | 'onboarding_restricted',
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

function resolveJwtSecretKey(explicitSecret?: string): Uint8Array | null {
  const secret = (explicitSecret ?? process.env.JWT_SECRET)?.trim();
  if (!secret) {
    if (!hasWarnedMissingSecret) {
      hasWarnedMissingSecret = true;
      console.error('[EdgeAuth] JWT_SECRET is missing; failing closed on protected web routes.');
    }
    return null;
  }

  return new TextEncoder().encode(secret);
}

/**
 * Cryptographically verifies an HttpOnly `kc_totp_pending_token` JWT (DEF-FE-08).
 * Fails closed if JWT_SECRET is unset or if `tokenType !== 'totp_pending'`.
 */
export async function verifyTotpPendingJwt(
  token?: string,
  explicitSecret?: string,
): Promise<TotpPendingEvaluation> {
  const cleanToken = token?.trim();
  const hadToken = Boolean(cleanToken);
  const secretKey = resolveJwtSecretKey(explicitSecret);

  if (!secretKey) {
    return {
      valid: false,
      expired: false,
      hadToken,
      secretConfigured: false,
    };
  }

  if (!cleanToken) {
    return {
      valid: false,
      expired: false,
      hadToken: false,
      secretConfigured: true,
    };
  }

  const result = await verifySingleJwt(cleanToken, secretKey, 'totp_pending');
  return {
    valid: Boolean(result.valid && result.sub),
    expired: result.expired,
    hadToken: true,
    secretConfigured: true,
  };
}

/**
 * Cryptographically verifies an HttpOnly `kc_onboarding_token` JWT (F16).
 * Fails closed if JWT_SECRET is unset or if `tokenType !== 'onboarding_restricted'`.
 */
export async function verifyOnboardingJwt(
  token?: string,
  explicitSecret?: string,
): Promise<OnboardingEvaluation> {
  const cleanToken = token?.trim();
  const hadToken = Boolean(cleanToken);
  const secretKey = resolveJwtSecretKey(explicitSecret);

  if (!secretKey) {
    return {
      valid: false,
      expired: false,
      hadToken,
      secretConfigured: false,
    };
  }

  if (!cleanToken) {
    return {
      valid: false,
      expired: false,
      hadToken: false,
      secretConfigured: true,
    };
  }

  const result = await verifySingleJwt(cleanToken, secretKey, 'onboarding_restricted');
  return {
    valid: Boolean(result.valid && result.sub),
    expired: result.expired,
    hadToken: true,
    secretConfigured: true,
  };
}

async function verifyEdgeTokens(
  accessToken?: string,
  refreshToken?: string,
  explicitSecret?: string,
): Promise<TokenEvaluationResult> {
  const cleanAccess = accessToken?.trim();
  const cleanRefresh = refreshToken?.trim();
  const hadTokens = Boolean(cleanAccess || cleanRefresh);

  const secretKey = resolveJwtSecretKey(explicitSecret);
  if (!secretKey) {
    return {
      authenticated: false,
      roles: [],
      hadTokens,
      secretConfigured: false,
    };
  }

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
    totpPendingToken,
    onboardingToken,
    jwtSecret,
  } = params;

  if (isPublicAssetOrApiPath(pathname)) {
    return { action: 'next' };
  }

  const isLoginPage = pathname === '/login' || pathname.startsWith('/login/');
  const isTwoFactorPage = pathname === '/2fa' || pathname.startsWith('/2fa/');
  const isOnboardingPage = pathname === '/onboarding' || pathname.startsWith('/onboarding/');
  const isAuthPage = isLoginPage || isTwoFactorPage || isOnboardingPage;

  const auth = await verifyEdgeTokens(accessToken, refreshToken, jwtSecret);

  if (!auth.authenticated) {
    if (isOnboardingPage) {
      const onboarding = await verifyOnboardingJwt(onboardingToken, jwtSecret);
      if (onboarding.valid) {
        return { action: 'next' };
      }

      const reason = onboarding.hadToken ? 'temp_session_expired' : 'missing_temp_token';
      const safeRedirect = sanitizeSafeRedirectPath(redirectParam);
      const loginQuery =
        safeRedirect !== '/'
          ? `reason=${reason}&redirect=${encodeURIComponent(safeRedirect)}`
          : `reason=${reason}`;

      return {
        action: 'redirect',
        location: `/login?${loginQuery}`,
        clearStaleCookies: auth.hadTokens && auth.secretConfigured,
      };
    }

    if (isTwoFactorPage) {
      const pending = await verifyTotpPendingJwt(totpPendingToken, jwtSecret);
      if (pending.valid) {
        return { action: 'next' };
      }

      const reason = pending.hadToken ? 'temp_session_expired' : 'missing_temp_token';
      const safeRedirect = sanitizeSafeRedirectPath(redirectParam);
      const loginQuery =
        safeRedirect !== '/'
          ? `reason=${reason}&redirect=${encodeURIComponent(safeRedirect)}`
          : `reason=${reason}`;

      return {
        action: 'redirect',
        location: `/login?${loginQuery}`,
        clearStaleCookies: auth.hadTokens && auth.secretConfigured,
        clearPendingTotpCookie: pending.hadToken && pending.secretConfigured,
      };
    }

    if (isLoginPage) {
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
