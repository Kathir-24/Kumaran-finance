import { JwtPayload } from '../interfaces/jwt-payload.interface';

const MILLISECOND_EPOCH_THRESHOLD = 1_000_000_000_000;

/**
 * Checks whether a JWT was issued before a user-level revocation cutoff.
 * Supports sub-second millisecond cutoffs (`Date.now()`) to avoid false 401s
 * when a user logs back in during the same Unix second as a logout, while
 * remaining backward compatible with legacy Unix-second timestamps.
 */
export function isTokenIssuedBeforeRevocation(
  payload: Pick<JwtPayload, 'iat' | 'issuedAtMs'>,
  revokedBeforeStr: string | null | undefined,
): boolean {
  if (!revokedBeforeStr) {
    return false;
  }

  const revokedBefore = Number(revokedBeforeStr);
  if (!Number.isFinite(revokedBefore)) {
    return false;
  }

  if (revokedBefore >= MILLISECOND_EPOCH_THRESHOLD) {
    if (typeof payload.issuedAtMs === 'number') {
      return payload.issuedAtMs < revokedBefore;
    }
    return typeof payload.iat === 'number' && payload.iat * 1000 <= revokedBefore;
  }

  if (typeof payload.issuedAtMs === 'number') {
    return payload.issuedAtMs < revokedBefore * 1000;
  }
  return typeof payload.iat === 'number' && payload.iat <= revokedBefore;
}

/**
 * Checks both global and client-scoped Redis revocation cutoffs so a scoped logout
 * (`WEB` vs `MOBILE`) invalidates only that device family's active access tokens while
 * global logout/password changes invalidate every client family.
 */
export async function isTokenRevokedInRedis(
  redis: { get(key: string): Promise<string | null> },
  payload: Pick<JwtPayload, 'sub' | 'iat' | 'issuedAtMs' | 'clientType'>,
): Promise<boolean> {
  const globalCutoff = await redis.get(`auth:revoked_before:${payload.sub}`);
  if (isTokenIssuedBeforeRevocation(payload, globalCutoff)) {
    return true;
  }

  if (payload.clientType) {
    const clientCutoff = await redis.get(
      `auth:revoked_before:${payload.sub}:${payload.clientType}`,
    );
    if (isTokenIssuedBeforeRevocation(payload, clientCutoff)) {
      return true;
    }
  }

  return false;
}
