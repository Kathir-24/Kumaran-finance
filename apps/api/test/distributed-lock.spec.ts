import { ConflictException } from '@nestjs/common';
import { DistributedLockService } from '../src/jobs/services/distributed-lock.service';
import { RedisConnectionProvider } from '../src/jobs/providers/redis-connection.provider';

describe('DistributedLockService Unit Tests', () => {
  let lockService: DistributedLockService;
  let redisClientMock: any;
  let redisProviderMock: any;

  beforeEach(() => {
    redisClientMock = {
      set: jest.fn(),
      eval: jest.fn(),
    };

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    lockService = new DistributedLockService(
      redisProviderMock as unknown as RedisConnectionProvider,
    );
  });

  it('should acquire lock, execute operation, and atomically release lock via Lua script in finally', async () => {
    redisClientMock.set.mockResolvedValue('OK');
    redisClientMock.eval.mockResolvedValue(1);

    const result = await lockService.runWithLock('test-handover', 5000, async () => {
      return { success: true };
    });

    expect(result).toEqual({ success: true });
    expect(redisClientMock.set).toHaveBeenCalledWith(
      'lock:test-handover',
      expect.any(String),
      'PX',
      5000,
      'NX',
    );
    expect(redisClientMock.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("del", KEYS[1])'),
      1,
      'lock:test-handover',
      expect.any(String),
    );
  });

  it('should throw ConflictException if lock is already held by another process', async () => {
    redisClientMock.set.mockResolvedValue(null); // Lock not acquired

    await expect(
      lockService.runWithLock('test-handover', 5000, async () => {
        return { success: true };
      }),
    ).rejects.toThrow(ConflictException);

    expect(redisClientMock.eval).not.toHaveBeenCalled();
  });

  it('should guarantee lock release via Lua script even when the operation throws an error', async () => {
    redisClientMock.set.mockResolvedValue('OK');
    redisClientMock.eval.mockResolvedValue(1);

    await expect(
      lockService.runWithLock('error-task', 5000, async () => {
        throw new Error('Database transaction failed inside lock');
      }),
    ).rejects.toThrow('Database transaction failed inside lock');

    expect(redisClientMock.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'lock:error-task',
      expect.any(String),
    );
  });

  it('should execute operation directly when Redis is offline in fallback mode', async () => {
    redisProviderMock.getIsConnected.mockReturnValue(false);

    const result = await lockService.runWithLock('offline-task', 5000, async () => {
      return { fallback: true };
    });

    expect(result).toEqual({ fallback: true });
    expect(redisClientMock.set).not.toHaveBeenCalled();
  });
});
