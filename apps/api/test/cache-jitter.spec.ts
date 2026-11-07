import { withTtlJitter } from '../src/common/utils/cache-jitter.util';

describe('Cache TTL Jitter Utility (withTtlJitter)', () => {
  it('should generate TTLs within +/- 15% range of base TTL', () => {
    const baseTtl = 3600; // 1 hour
    const minExpected = Math.floor(baseTtl * (1 - 0.15));
    const maxExpected = Math.ceil(baseTtl * (1 + 0.15));

    for (let i = 0; i < 50; i++) {
      const jittered = withTtlJitter(baseTtl);
      expect(jittered).toBeGreaterThanOrEqual(minExpected);
      expect(jittered).toBeLessThanOrEqual(maxExpected);
    }
  });

  it('should produce distributed variances across repeated invocations', () => {
    const baseTtl = 1800; // 30 minutes
    const setOfTtls = new Set<number>();

    for (let i = 0; i < 30; i++) {
      setOfTtls.add(withTtlJitter(baseTtl));
    }

    // A randomized +/-15% on 1800 should produce multiple distinct integer values
    expect(setOfTtls.size).toBeGreaterThan(5);
  });

  it('should support custom jitter fractions (e.g. 10%)', () => {
    const baseTtl = 100;
    const minExpected = 90;
    const maxExpected = 110;

    for (let i = 0; i < 30; i++) {
      const jittered = withTtlJitter(baseTtl, 0.10);
      expect(jittered).toBeGreaterThanOrEqual(minExpected);
      expect(jittered).toBeLessThanOrEqual(maxExpected);
    }
  });

  it('should safely handle small boundary values without returning <= 0', () => {
    expect(withTtlJitter(1)).toBeGreaterThanOrEqual(1);
    expect(withTtlJitter(0)).toBeGreaterThanOrEqual(1);
    expect(withTtlJitter(-10)).toBeGreaterThanOrEqual(1);
  });
});
