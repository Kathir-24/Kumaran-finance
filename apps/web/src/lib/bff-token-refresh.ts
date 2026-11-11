// ==============================================================================
// Kumaran Chits — Shared BFF Token Refresh Deduplication & Cookie Utilities
// Prevents concurrent 401 refresh bursts (DEF-FE-01) across /api/v1/* and
// /api/auth/session from triggering the backend RFC 6819 Token Reuse Trap.
// ==============================================================================

import * as crypto from 'node:crypto';
import type { NextResponse } from 'next/server';
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_SESSION_ACTIVE,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionActiveCookieOptions,
} from './auth-cookies.ts';

export interface BffRefreshedTokens {
  accessToken: string;
  refreshToken?: string;
}

interface CachedRefreshEntry {
  tokens: BffRefreshedTokens;
  expiresAt: number;
}

const RECENT_REFRESH_TTL_MS = 2000;

const inFlightRefreshes = new Map<string, Promise<BffRefreshedTokens | null>>();
const recentRefreshCache = new Map<string, CachedRefreshEntry>();

function hashTokenKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function pruneExpiredCache(now: number): void {
  for (const [key, entry] of recentRefreshCache.entries()) {
    if (entry.expiresAt <= now) {
      recentRefreshCache.delete(key);
    }
  }
}

/**
 * Deduplicates concurrent silent token refresh requests sharing the same refreshToken.
 * Combines active promise coalescing with a 2,000ms post-completion cache to shield
 * queued browser requests still carrying the previous cookie during Set-Cookie handoff.
 */
export async function executeBffRefresh(
  backendUrl: string,
  refreshToken: string,
): Promise<BffRefreshedTokens | null> {
  if (!refreshToken) {
    return null;
  }

  const now = Date.now();
  pruneExpiredCache(now);

  const tokenKey = hashTokenKey(refreshToken);

  const recent = recentRefreshCache.get(tokenKey);
  if (recent && recent.expiresAt > now) {
    return recent.tokens;
  }

  const existingPromise = inFlightRefreshes.get(tokenKey);
  if (existingPromise) {
    return existingPromise;
  }

  const refreshPromise = (async (): Promise<BffRefreshedTokens | null> => {
    try {
      const refreshRes = await fetch(`${backendUrl}/api/v1/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken,
          clientType: 'WEB',
        }),
      });

      if (!refreshRes.ok) {
        return null;
      }

      const payload = await refreshRes.json();
      const authData = payload?.data || payload;
      if (!authData?.accessToken) {
        return null;
      }

      const tokens: BffRefreshedTokens = {
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
      };

      recentRefreshCache.set(tokenKey, {
        tokens,
        expiresAt: Date.now() + RECENT_REFRESH_TTL_MS,
      });

      return tokens;
    } catch (err) {
      console.warn('[BFF Refresh] Upstream token refresh failed:', err);
      return null;
    } finally {
      inFlightRefreshes.delete(tokenKey);
    }
  })();

  inFlightRefreshes.set(tokenKey, refreshPromise);
  return refreshPromise;
}

/**
 * Purges any cached or in-flight refresh entry on explicit user logout so stale
 * tokens can never be served after session termination.
 */
export function invalidateBffRefreshCache(refreshToken?: string): void {
  if (!refreshToken) return;
  const tokenKey = hashTokenKey(refreshToken);
  recentRefreshCache.delete(tokenKey);
  inFlightRefreshes.delete(tokenKey);
}

/**
 * Clears all BFF refresh state cleanly (intended strictly for unit test isolation).
 */
export function resetBffRefreshStateForTesting(): void {
  inFlightRefreshes.clear();
  recentRefreshCache.clear();
}

/**
 * Writes rotated HttpOnly access/refresh cookies and client session marker onto response.
 */
export function applyRefreshedCookies(
  response: NextResponse,
  tokens: BffRefreshedTokens,
  isSecure?: boolean,
): void {
  const accessOpts = getAccessTokenCookieOptions(isSecure);
  const refreshOpts = getRefreshTokenCookieOptions(isSecure);
  const sessionActiveOpts = getSessionActiveCookieOptions(isSecure);

  response.cookies.set(accessOpts.name, tokens.accessToken, accessOpts);
  if (tokens.refreshToken) {
    response.cookies.set(refreshOpts.name, tokens.refreshToken, refreshOpts);
  }
  response.cookies.set(sessionActiveOpts.name, '1', sessionActiveOpts);
}

/**
 * Expires all web authentication cookies immediately (Max-Age=0) on logout or invalid session.
 */
export function clearAuthCookies(response: NextResponse): void {
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
}
