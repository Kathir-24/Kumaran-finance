// ==============================================================================
// Kumaran Chits — E2E Test Runner Session & Auth Token Cache Helper
// Prevents tripping production rate limiters (HTTP 429) during consecutive runs
// ==============================================================================

interface CachedSession {
  token: string;
  userId: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedSession>();

/**
 * Retrieves a valid, non-expired Bearer access token for the specified phone number,
 * or authenticates once and caches the session token.
 */
export async function getCachedAuthToken(
  baseUrl: string,
  credentials: { phone: string; password?: string; mpin?: string },
  requestFn: (method: string, path: string, body?: any, token?: string) => Promise<{ status: number; json: any }>,
): Promise<{ token: string; userId: string }> {
  const cacheKey = credentials.phone;
  const now = Date.now();

  const cached = tokenCache.get(cacheKey);
  // Re-use cached token if still valid for at least 60 seconds
  if (cached && cached.expiresAt > now + 60_000) {
    return { token: cached.token, userId: cached.userId };
  }

  // Otherwise, authenticate via credentials
  const password = credentials.password || 'Admin@Kumaran2026';
  const loginRes = await requestFn('POST', '/auth/web/login', {
    phone: credentials.phone,
    password,
  });

  if (loginRes.status !== 200 || !loginRes.json?.data?.accessToken) {
    throw new Error(
      `[AuthTokenCache] Failed to authenticate user ${credentials.phone} (status: ${loginRes.status}, body: ${JSON.stringify(loginRes.json)})`,
    );
  }

  const token = loginRes.json.data.accessToken as string;
  const userId = (loginRes.json.data.user?.id || '') as string;

  // Standard 15-minute token TTL
  const expiresAt = now + 14 * 60 * 1000;
  tokenCache.set(cacheKey, { token, userId, expiresAt });

  return { token, userId };
}

/**
 * Clears the session token cache (useful between full resets).
 */
export function clearAuthTokenCache(): void {
  tokenCache.clear();
}
