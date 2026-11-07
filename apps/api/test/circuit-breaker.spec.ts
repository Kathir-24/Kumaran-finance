import {
  CircuitBreaker,
  CircuitBreakerOpenException,
} from '../src/common/utils/circuit-breaker.util';

describe('CircuitBreaker Unit Tests', () => {
  it('should initialize in CLOSED state and execute successful actions', async () => {
    const breaker = new CircuitBreaker({
      name: 'TEST_SERVICE',
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenSuccessThreshold: 2,
    });

    expect(breaker.getState()).toBe('CLOSED');

    const result = await breaker.execute(async () => 'OK');
    expect(result).toBe('OK');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should trip to OPEN after reaching failureThreshold', async () => {
    const breaker = new CircuitBreaker({
      name: 'TEST_SERVICE',
      failureThreshold: 3,
      resetTimeoutMs: 200,
      halfOpenSuccessThreshold: 2,
    });

    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(async () => {
          throw new Error(`Failure ${i + 1}`);
        }),
      ).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('OPEN');

    // Subsequent call must fail fast with CircuitBreakerOpenException
    await expect(
      breaker.execute(async () => 'should not run'),
    ).rejects.toThrow(CircuitBreakerOpenException);
  });

  it('should execute fallback callback when breaker is OPEN', async () => {
    const breaker = new CircuitBreaker({
      name: 'TEST_SERVICE',
      failureThreshold: 2,
      resetTimeoutMs: 200,
    });

    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Downstream error');
        });
      } catch {}
    }

    expect(breaker.getState()).toBe('OPEN');

    const fallbackResult = await breaker.execute(
      async () => 'primary call',
      (err) => `fallback executed: ${err.message}`,
    );

    expect(fallbackResult).toContain('fallback executed');
    expect(fallbackResult).toContain('is OPEN');
  });

  it('should transition to HALF_OPEN after resetTimeoutMs and recover to CLOSED after consecutive successes', async () => {
    const breaker = new CircuitBreaker({
      name: 'TEST_SERVICE',
      failureThreshold: 2,
      resetTimeoutMs: 50,
      halfOpenSuccessThreshold: 2,
    });

    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('Crash');
        });
      } catch {}
    }

    expect(breaker.getState()).toBe('OPEN');

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 60));

    expect(breaker.getState()).toBe('HALF_OPEN');

    // 1st success in HALF_OPEN
    await breaker.execute(async () => 'success-1');
    expect(breaker.getState()).toBe('HALF_OPEN');

    // 2nd success in HALF_OPEN -> closes breaker
    await breaker.execute(async () => 'success-2');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should synchronize OPEN state across instances via shared Redis client', async () => {
    const memoryStore = new Map<string, string>();
    const mockRedis = {
      get: jest.fn(async (key: string) => memoryStore.get(key) || null),
      set: jest.fn(async (key: string, val: string) => {
        memoryStore.set(key, val);
        return 'OK';
      }),
      del: jest.fn(async (key: string) => {
        memoryStore.delete(key);
        return 1;
      }),
    };

    const breakerInstanceA = new CircuitBreaker({
      name: 'DISTRIBUTED_SMS',
      failureThreshold: 2,
      resetTimeoutMs: 5000,
      redisClient: mockRedis,
    });

    const breakerInstanceB = new CircuitBreaker({
      name: 'DISTRIBUTED_SMS',
      failureThreshold: 2,
      resetTimeoutMs: 5000,
      redisClient: mockRedis,
    });

    // Instance A experiences 2 failures and trips to OPEN
    for (let i = 0; i < 2; i++) {
      try {
        await breakerInstanceA.execute(async () => {
          throw new Error('Downstream failure on Pod A');
        });
      } catch {}
    }

    expect(breakerInstanceA.getState()).toBe('OPEN');
    expect(mockRedis.set).toHaveBeenCalled();

    // Instance B has 0 local failures, but should immediately sync OPEN state from Redis
    await expect(
      breakerInstanceB.execute(async () => 'Pod B should not hit downstream'),
    ).rejects.toThrow(CircuitBreakerOpenException);

    expect(breakerInstanceB.getState()).toBe('OPEN');

    // Reset on Instance A clears Redis state
    breakerInstanceA.reset();
    expect(mockRedis.del).toHaveBeenCalled();
  });
});
