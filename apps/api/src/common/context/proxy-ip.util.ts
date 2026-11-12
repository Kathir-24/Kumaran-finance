// ==============================================================================
// Kumaran Chits — Reverse-Proxy Trust Configuration & Client IP Normalization
// Prevents X-Forwarded-For spoofing across multi-hop Docker/Nginx/BFF chains
// while ensuring IPv4-mapped IPv6 addresses resolve consistently (DEF-FE-06).
// ==============================================================================

export const DEFAULT_TRUST_PROXY = ['loopback', 'linklocal', 'uniquelocal'] as const;

export type TrustProxyValue = boolean | number | string[];

/**
 * Parses `TRUST_PROXY` environment configuration for Express.
 * Defaults to `['loopback', 'linklocal', 'uniquelocal']` so 1-hop (Mobile -> Nginx -> API),
 * 2-hop (Browser -> Nginx -> Next.js BFF -> API), and local dev reject public-internet
 * left-injected `X-Forwarded-For` headers instead of blindly popping fixed hop counts.
 */
export function parseTrustProxySetting(raw?: string): TrustProxyValue {
  if (raw === undefined || raw.trim() === '') {
    return [...DEFAULT_TRUST_PROXY];
  }

  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'true') {
    return true;
  }
  if (lower === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(trimmed)) {
    const hops = Number(trimmed);
    if (!Number.isInteger(hops) || hops < 0) {
      throw new Error(
        `Invalid TRUST_PROXY hop count: "${trimmed}". Must be a non-negative integer, boolean, or comma-separated IP/CIDR list.`,
      );
    }
    return hops;
  }

  const entries = trimmed.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => entry.length === 0)) {
    throw new Error(
      `Invalid TRUST_PROXY list: "${trimmed}". Comma-separated entries cannot be empty.`,
    );
  }

  return entries;
}

/**
 * Normalizes IP strings from Express (`req.ip`) or Node sockets by stripping
 * IPv6 brackets and IPv4-mapped `::ffff:` prefixes so throttling and AuditLog
 * store a single canonical IP per client.
 */
export function normalizeClientIp(rawIp: string | null | undefined): string | undefined {
  if (typeof rawIp !== 'string') {
    return undefined;
  }

  let ip = rawIp.trim();
  if (!ip) {
    return undefined;
  }

  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1).trim();
  }

  if (ip.toLowerCase().startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  return ip || undefined;
}
