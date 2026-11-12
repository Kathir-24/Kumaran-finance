import { RedisThrottlerStorage } from '../../src/common/throttler/redis-throttler-storage.service';
import { RedisConnectionProvider } from '../../src/jobs/providers/redis-connection.provider';

describe('RedisThrottlerStorage Unit Tests (Resilient Distributed + Memory Fallback)', () => {
  let storage: RedisThrottlerStorage;
  let redisProviderMock: {
    getClient: jest.Mock;
    getIsConnected: jest.Mock;
  };
  let redisClientMock: {
    eval: jest.Mock;
  };

  beforeEach(() => {
    redisClientMock = {
      eval: jest.fn(),
    };

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    storage = new RedisThrottlerStorage(
      redisProviderMock as unknown as RedisConnectionProvider,
    );
  });

  afterEach(() => {
    storage.onApplicationShutdown();
  });

  describe('Part 1: Redis Distributed Mode', () => {
    it('THROT-REDIS-1: should call redis.eval and return parsed record when below limit', async () => {
      // Redis eval returns [totalHits, timeToExpire, isBlocked (0 or 1), timeToBlockExpire]
      redisClientMock.eval.mockResolvedValue([1, 60, 0, 0]);

      const record = await storage.increment('test_key', 60000, 5, 0, 'default');

      expect(redisClientMock.eval).toHaveBeenCalledTimes(1);
      expect(record.totalHits).toBe(1);
      expect(record.timeToExpire).toBe(60);
      expect(record.isBlocked).toBe(false);
      expect(record.timeToBlockExpire).toBe(0);
    });

    it('THROT-REDIS-2: should return isBlocked=true when redis reports limit exceeded', async () => {
      redisClientMock.eval.mockResolvedValue([6, 55, 1, 55]);

      const record = await storage.increment('test_key', 60000, 5, 0, 'default');

      expect(record.totalHits).toBe(6);
      expect(record.isBlocked).toBe(true);
      expect(record.timeToBlockExpire).toBe(55);
    });

    it('THROT-REDIS-3: should gracefully fallback to memory if redis.eval throws', async () => {
      redisClientMock.eval.mockRejectedValue(new Error('Connection lost'));

      // 1st request falls back to memory and succeeds
      const record = await storage.increment('fallback_key', 60000, 3, 0, 'default');
      expect(record.totalHits).toBe(1);
      expect(record.isBlocked).toBe(false);
    });
  });

  describe('Part 2: In-Memory Resilience (Redis Offline / Down)', () => {
    beforeEach(() => {
      redisProviderMock.getIsConnected.mockReturnValue(false);
      redisProviderMock.getClient.mockReturnValue(null);
    });

    it('THROT-MEM-1: should track hits and expire cleanly in memory mode', async () => {
      const key = 'user_123';
      const ttl = 1000; // 1 second
      const limit = 2;

      // 1st hit
      const r1 = await storage.increment(key, ttl, limit, 0, 'default');
      expect(r1.totalHits).toBe(1);
      expect(r1.isBlocked).toBe(false);

      // 2nd hit
      const r2 = await storage.increment(key, ttl, limit, 0, 'default');
      expect(r2.totalHits).toBe(2);
      expect(r2.isBlocked).toBe(false);

      // 3rd hit (exceeds limit 2)
      const r3 = await storage.increment(key, ttl, limit, 0, 'default');
      expect(r3.totalHits).toBe(3);
      expect(r3.isBlocked).toBe(true);
      expect(r3.timeToBlockExpire).toBeGreaterThan(0);
    });

    it('THROT-MEM-2: separate keys must have independent hit counters', async () => {
      const r1 = await storage.increment('user_A', 60000, 2, 0, 'default');
      const r2 = await storage.increment('user_B', 60000, 2, 0, 'default');

      expect(r1.totalHits).toBe(1);
      expect(r2.totalHits).toBe(1);
    });
  });
});
