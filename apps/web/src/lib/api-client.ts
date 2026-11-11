// ==============================================================================
// Kumaran Chits — API Client Integration (BFF + HttpOnly Cookie Architecture)
// Zero tokens in client-accessible storage; transparent Next.js BFF proxying.
// ==============================================================================

import {
  createKumaranClient,
  type KumaranApiClient,
  KumaranApiError,
  type ApiErrorPayload,
} from '@kumaran/api-client';

// Storage key strictly for cached non-sensitive user profile
export const USER_PROFILE_KEY = 'kc_user_profile';
// Deprecated legacy token keys retained for clean migration purges
export const ACCESS_TOKEN_KEY = 'kc_access_token';
export const REFRESH_TOKEN_KEY = 'kc_refresh_token';

/**
 * Returns the configured backend API base URL.
 * In browser environments, returns '/bff' so calls target the current
 * Next.js origin and route through the dedicated BFF proxy (/bff/api/v1/...)
 * without colliding with Nginx /api/v1/* Mobile REST routing.
 * In server/SSR environments, routes directly to the internal NestJS API.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/bff';
  }
  if (typeof process !== 'undefined') {
    if (process.env?.INTERNAL_API_URL) return process.env.INTERNAL_API_URL;
    if (process.env?.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://localhost:3000';
}

/**
 * SSR-safe getter for stored JWT access token.
 * Under BFF architecture, returns null to guarantee zero tokens in client storage.
 */
export function getStoredAccessToken(): string | null {
  return null;
}

/**
 * SSR-safe getter for stored JWT refresh token.
 * Under BFF architecture, returns null to guarantee zero tokens in client storage.
 */
export function getStoredRefreshToken(): string | null {
  return null;
}

/**
 * SSR-safe getter for stored user profile.
 */
export function getStoredUserProfile<T = any>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * SSR-safe setter for user profile.
 */
export function setStoredUserProfile<T = any>(user: T | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_PROFILE_KEY);
    }
  } catch (err) {
    console.error('[ApiClient] Failed to store user profile in localStorage', err);
  }
}

/**
 * Backward-compatible setter. Under BFF architecture, tokens are managed strictly via
 * HttpOnly cookies; this method purges any legacy tokens from localStorage.
 */
export function setStoredTokens(_tokens: { accessToken?: string; refreshToken?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    // Actively purge any legacy tokens that may have existed in older sessions
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('kumaran:auth_change'));
  } catch (err) {
    console.error('[ApiClient] Error cleaning legacy tokens', err);
  }
}

/**
 * SSR-safe clearer for auth session state on logout or session expiration.
 */
export function clearStoredTokens(options: { notify?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_PROFILE_KEY);
    if (options.notify !== false) {
      window.dispatchEvent(new CustomEvent('kumaran:unauthorized'));
    }
  } catch (err) {
    console.error('[ApiClient] Failed to clear session state', err);
  }
}

/**
 * Factory creating configured Kumaran API Client instance.
 * Transparently sends requests to Next.js BFF proxy with automatic credentials.
 */
export function createWebApiClient(): KumaranApiClient {
  return createKumaranClient({
    baseUrl: getApiBaseUrl(),
    getAccessToken: () => null,
    getRefreshToken: () => null,
    onTokenRefreshed: () => {},
    onUnauthorized: () => {
      clearStoredTokens();
    },
  });
}

// Global singleton client for web application
export const apiClient: KumaranApiClient = createWebApiClient();

/**
 * Helper to unwrap responses from openapi-fetch calls, automatically extracting
 * the inner `data` payload or throwing a typed `KumaranApiError`.
 */
export async function unwrapApiResponse<T>(
  responsePromise: Promise<{
    data?: any;
    error?: any;
    response: Response;
  }>,
): Promise<T> {
  const result = await responsePromise;
  const { data, error, response } = result;

  if (error || !response.ok) {
    const errorPayload: ApiErrorPayload =
      error && typeof error === 'object'
        ? {
            code: error.code || error.error || 'API_ERROR',
            message: error.message || response.statusText || 'Request failed',
            details: error.details || error.errors || [],
          }
        : {
            code: 'API_ERROR',
            message: typeof error === 'string' ? error : response.statusText || 'Request failed',
          };

    throw new KumaranApiError(response.status, errorPayload);
  }

  // Handle standard NestJS response envelope: { success: true, statusCode: 200, data: ... }
  if (data && typeof data === 'object' && 'data' in data && 'success' in data) {
    return data.data as T;
  }

  return data as T;
}

/**
 * Safely extracts array items from either a direct array (`T[]`) or an
 * `ApiPaginatedResponseEnvelope` payload (`{ data: T[], total, page, limit, totalPages }`).
 */
export function unwrapPaginatedList<T = any>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

export { KumaranApiError, type KumaranApiClient };
