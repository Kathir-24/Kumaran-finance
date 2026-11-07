// ==============================================================================
// Kumaran Chits — Cache TTL Jitter Utility (Avalanche Prevention)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/caching-architecture.md (§7)
// ==============================================================================

/**
 * Applies a random variance (+/- jitterFraction, default 15%) to a base TTL in seconds.
 * Prevents simultaneous mass expiration (cache avalanche) across horizontal instances.
 *
 * @param baseSeconds Base expiration time in seconds (e.g. 3600 for 1h, 1800 for 30m, 60 for 1m)
 * @param jitterFraction Fractional delta range (default 0.15 for +/- 15%)
 * @returns Desynchronized integer TTL in seconds (always >= 1)
 */
export function withTtlJitter(baseSeconds: number, jitterFraction: number = 0.15): number {
  if (baseSeconds <= 1) {
    return Math.max(1, Math.floor(baseSeconds));
  }
  const maxDelta = Math.max(1, Math.floor(baseSeconds * jitterFraction));
  const randomDelta = Math.floor(Math.random() * (2 * maxDelta + 1)) - maxDelta;
  return Math.max(1, baseSeconds + randomDelta);
}
