// ==============================================================================
// Kumaran Chits — Strongly-Typed Client Factory
// Powered by openapi-fetch for zero-runtime overhead & 100% compile-time type safety.
// ==============================================================================

import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from '../generated/api-types.js';
import { KumaranApiError } from '../errors/api-error.js';

export interface KumaranClientConfig {
  baseUrl?: string;
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  getRefreshToken?: () => string | null | undefined | Promise<string | null | undefined>;
  onTokenRefreshed?: (tokens: { accessToken: string; refreshToken?: string }) => void | Promise<void>;
  onUnauthorized?: () => void | Promise<void>;
  fetch?: (input: Request) => Promise<Response>;
}

export type KumaranApiClient = Client<paths>;

/**
 * Generates standard UUID v4 for financial Idempotency-Key headers
 */
function generateUuidV4(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a strongly typed Kumaran Chits API client.
 */
export function createKumaranClient(config: KumaranClientConfig = {}): KumaranApiClient {
  const baseUrl = config.baseUrl || 'http://localhost:3000';
  const client = createClient<paths>({
    baseUrl,
    fetch: config.fetch,
  });

  // Mutex lock for token refreshing
  let isRefreshing = false;
  let refreshPromise: Promise<string | null> | null = null;

  const authAndIdempotencyMiddleware: Middleware = {
    async onRequest({ request }) {
      // 1. Inject Bearer Access Token if available
      if (config.getAccessToken) {
        const token = await config.getAccessToken();
        if (token && !request.headers.has('Authorization')) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      }

      // 2. Inject Idempotency-Key on mutation requests if missing
      const method = request.method.toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        if (!request.headers.has('Idempotency-Key')) {
          const url = request.url;
          // Auto-inject on payments, collections, reversals, disbursements
          if (
            url.includes('/payments') ||
            url.includes('/collections') ||
            url.includes('/disbursements') ||
            url.includes('/reversals')
          ) {
            request.headers.set('Idempotency-Key', generateUuidV4());
          }
        }
      }

      return request;
    },

    async onResponse({ response, request }) {
      // Handle 401 Unauthorized with automatic refresh token rotation
      if (response.status === 401 && config.getRefreshToken && config.onTokenRefreshed) {
        // Skip refresh attempts if this request was already the refresh endpoint
        if (request.url.includes('/auth/refresh-token')) {
          if (config.onUnauthorized) {
            await config.onUnauthorized();
          }
          return response;
        }

        try {
          if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = (async () => {
              try {
                const refreshToken = await config.getRefreshToken!();
                if (!refreshToken) return null;

                const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh-token`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken }),
                });

                if (!refreshRes.ok) {
                  return null;
                }

                const data = await refreshRes.json();
                const payload = data?.data || data;
                if (payload?.accessToken) {
                  await config.onTokenRefreshed!({
                    accessToken: payload.accessToken,
                    refreshToken: payload.refreshToken,
                  });
                  return payload.accessToken as string;
                }
                return null;
              } finally {
                isRefreshing = false;
              }
            })();
          }

          const newAccessToken = await refreshPromise;
          if (newAccessToken) {
            // Clone request and retry with new access token
            const retryHeaders = new Headers(request.headers);
            retryHeaders.set('Authorization', `Bearer ${newAccessToken}`);

            const retriedRequest = new Request(request.url, {
              method: request.method,
              headers: retryHeaders,
              body: request.body,
              // @ts-ignore
              duplex: 'half',
            });

            return fetch(retriedRequest);
          } else {
            if (config.onUnauthorized) {
              await config.onUnauthorized();
            }
          }
        } catch {
          if (config.onUnauthorized) {
            await config.onUnauthorized();
          }
        }
      }

      return response;
    },
  };

  client.use(authAndIdempotencyMiddleware);
  return client;
}
