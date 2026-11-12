import { ConflictException, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { acquireRedisMutexLock, REDIS_RELEASE_LOCK_LUA } from '../src/common/utils/redis-lock.util';
import { DistributedLockService } from '../src/jobs/services/distributed-lock.service';
import { DailyArrearsService } from '../src/jobs/services/daily-arrears.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function createLiveTestRedis(): Promise<Redis | null> {
  const client = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || '6379'),
    db: Number(process.env.REDIS_DB || '0') || 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 1000,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    if ((await client.ping()) === 'PONG') {
      return client;
    }
  } catch {
    // Redis offline
  }
  client.disconnect();
  return null;
}

describe('DistributedLockService: Safe Redis Distributed Locking & Token Verification', () => {
  let lockService: DistributedLockService;
  let redisClientMock: any;
  let redisProviderMock: any;
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();

    redisClientMock = {
      set: jest.fn().mockImplementation((key: string, val: string, _px: string, _ttl: number, _nx: string) => {
        if (store.has(key)) return Promise.resolve(null);
        store.set(key, val);
        return Promise.resolve('OK');
      }),
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) || null)),
      eval: jest.fn().mockImplementation((script: string, numKeys: number, key: string, token: string) => {
        // Simulates releaseLockLua: if redis.call("get", key) == token then del key
        if (store.get(key) === token) {
          store.delete(key);
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      }),
    };

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    lockService = new DistributedLockService(redisProviderMock as any);
  });

  it('LOCK-01: acquireLock sets key with unique token and returns release function', async () => {
    const lock = await lockService.acquireLock('test-resource', 5000);

    expect(lock.acquired).toBe(true);
    expect(lock.token).toBeDefined();
    expect(store.get('lock:test-resource')).toBe(lock.token);

    // Call release -> executes atomic Lua script
    await lock.release();
    expect(store.has('lock:test-resource')).toBe(false);
  });

  it('LOCK-02: release function MUST NOT delete foreign lock if token changed (TTL expired)', async () => {
    const lock1 = await lockService.acquireLock('report-cache', 2000);
    expect(lock1.acquired).toBe(true);

    // Simulate TTL expiration and second worker acquiring lock
    store.set('lock:report-cache', 'worker-2-new-token');

    // Worker 1 attempts to release expired lock
    await lock1.release();

    // CRITICAL: The lock belonging to worker 2 was NOT deleted!
    expect(store.get('lock:report-cache')).toBe('worker-2-new-token');
  });

  it('LOCK-03: runWithLock executes operation and cleans up lock on completion', async () => {
    let executed = false;
    const result = await lockService.runWithLock('daily-arrears', 5000, async () => {
      expect(store.has('lock:daily-arrears')).toBe(true);
      executed = true;
      return 'BATCH_DONE';
    });

    expect(executed).toBe(true);
    expect(result).toBe('BATCH_DONE');
    expect(store.has('lock:daily-arrears')).toBe(false);
  });

  it('LOCK-04: runWithLock throws ConflictException when lock is currently held by another worker', async () => {
    store.set('lock:daily-arrears', 'other-process-token');

    await expect(
      lockService.runWithLock('daily-arrears', 5000, async () => 'SHOULD_NOT_RUN'),
    ).rejects.toThrow(ConflictException);
  });

  it('LOCK-05: DailyArrearsService acquires lock through DistributedLockService', async () => {
    const prismaMock: any = {
      installmentDue: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      subscriberTicket: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const notificationMock: any = { dispatchDefaultWarningNotice: jest.fn() };

    const arrearsService = new DailyArrearsService(
      prismaMock as unknown as PrismaService,
      notificationMock,
      lockService,
    );

    const result = await arrearsService.processDailyOverdueAndArrears(new Date());

    expect(result.duesTransitionedToOverdue).toBe(0);
    expect(redisClientMock.set).toHaveBeenCalledWith('lock:daily-arrears', expect.any(String), 'PX', 60000, 'NX');
    expect(redisClientMock.eval).toHaveBeenCalled();
  });

  it('LOCK-06: acquireRedisMutexLock issues unique tokens and handles eval failures safely', async () => {
    const logger = new Logger('TestLock');
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const lock1 = await acquireRedisMutexLock(redisClientMock, 'shared-res-a', 4000, logger);
      expect(lock1.acquired).toBe(true);
      expect(lock1.token).toMatch(/^[0-9a-f-]{36}$/i);

      redisClientMock.eval.mockRejectedValueOnce(new Error('ETIMEDOUT'));
      await expect(lock1.release()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lock:shared-res-a'));
      expect(REDIS_RELEASE_LOCK_LUA).toContain('redis.call("get", KEYS[1]) == ARGV[1]');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('LOCK-07: Live Redis 7 atomic Lua preserves foreign holder lock on stale token release', async () => {
    const redis = await createLiveTestRedis();
    if (!redis) {
      return;
    }

    const resourceKey = `def-db-04-live-${Date.now()}`;
    const lockKey = `lock:${resourceKey}`;

    try {
      const staleHolder = await acquireRedisMutexLock(redis, resourceKey, 4000);
      expect(staleHolder.acquired).toBe(true);
      expect(await redis.get(lockKey)).toBe(staleHolder.token);

      // Simulate TTL expiry and another worker acquiring the same key with a new token
      await redis.set(lockKey, 'foreign-worker-token', 'PX', 4000);

      // Stale holder releases -> Lua token check must preserve foreign lock
      await staleHolder.release();
      expect(await redis.get(lockKey)).toBe('foreign-worker-token');

      // Now simulate fresh acquisition and normal own-token release
      await redis.del(lockKey);
      const owner = await acquireRedisMutexLock(redis, resourceKey, 4000);
      expect(owner.acquired).toBe(true);
      await owner.release();
      expect(await redis.get(lockKey)).toBeNull();
    } finally {
      await redis.del(lockKey);
      await redis.quit();
    }
  });
});
