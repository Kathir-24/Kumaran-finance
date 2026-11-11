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
