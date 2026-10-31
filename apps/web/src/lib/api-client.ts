// ==============================================================================
// Kumaran Chits — API Client Integration (Real Backend Connection)
// Connects to NestJS 12 backend with Bearer JWT, Idempotency-Key & Mutex Refresh.
// ==============================================================================

import {
  createKumaranClient,
  type KumaranApiClient,
  KumaranApiError,
  type ApiErrorPayload,
} from '@kumaran/api-client';

// Storage keys for authentication tokens
export const ACCESS_TOKEN_KEY = 'kc_access_token';
export const REFRESH_TOKEN_KEY = 'kc_refresh_token';

/**
 * Returns the configured backend API base URL.
 * Priority: NEXT_PUBLIC_API_URL -> http://localhost:3000
 */
export function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://localhost:3000';
}

/**
 * SSR-safe getter for stored JWT access token.
 */
export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * SSR-safe getter for stored JWT refresh token.
 */
export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * SSR-safe setter for auth tokens.
 */
export function setStoredTokens(tokens: { accessToken: string; refreshToken?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
    window.dispatchEvent(new CustomEvent('kumaran:auth_change', { detail: tokens }));
  } catch (err) {
    console.error('[ApiClient] Failed to store auth tokens in localStorage', err);
  }
}

/**
 * SSR-safe clearer for auth tokens on logout or session expiration.
 */
export function clearStoredTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('kumaran:unauthorized'));
  } catch (err) {
    console.error('[ApiClient] Failed to clear auth tokens', err);
  }
}

/**
 * Factory creating configured Kumaran API Client instance.
 */
export function createWebApiClient(): KumaranApiClient {
  return createKumaranClient({
    baseUrl: getApiBaseUrl(),
    getAccessToken: () => getStoredAccessToken(),
    getRefreshToken: () => getStoredRefreshToken(),
    onTokenRefreshed: (tokens) => {
      setStoredTokens(tokens);
    },
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
 *
 * @example
 * const me = await unwrapApiResponse(apiClient.GET('/api/v1/auth/me'));
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

export { KumaranApiError, type KumaranApiClient };
