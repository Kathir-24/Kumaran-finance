import { ConflictException } from '@nestjs/common';
import { DistributedLockService } from '../src/jobs/services/distributed-lock.service';
import { DailyArrearsService } from '../src/jobs/services/daily-arrears.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
});
