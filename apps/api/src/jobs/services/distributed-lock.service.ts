import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisConnectionProvider } from '../providers/redis-connection.provider';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  // Atomic Lua script: evaluates whether lock still belongs to token before deletion
  private readonly releaseLockLua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor(private readonly redisProvider: RedisConnectionProvider) {}

  /**
   * Acquires a transient lock returning an atomic release callback that only deletes
   * the lock if the token still matches, preventing accidental release of foreign locks.
   */
  async acquireLock(
    resourceKey: string,
    ttlMs: number = 5000,
  ): Promise<{ acquired: boolean; token: string; release: () => Promise<void> }> {
    const client = this.redisProvider.getClient();
    if (!client || !this.redisProvider.getIsConnected()) {
      return { acquired: true, token: '', release: async () => {} };
    }

    const lockKey = `lock:${resourceKey}`;
    const token = crypto.randomUUID();

    try {
      const acquired = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
      return {
        acquired: acquired === 'OK',
        token,
        release: async () => {
          try {
            await client.eval(this.releaseLockLua, 1, lockKey, token);
          } catch (err: any) {
            this.logger.warn(`Failed to cleanly release lock [${lockKey}]: ${err.message}`);
          }
        },
      };
    } catch (err: any) {
      this.logger.warn(`Failed to acquire lock [${lockKey}]: ${err.message}`);
      return { acquired: false, token, release: async () => {} };
    }
  }

  /**
   * Executes an asynchronous operation while holding an exclusive distributed lock in Redis.
   * - Sets key with NX (only if not exists) and PX (millisecond TTL fail-safe).
   * - Uses an atomic Lua script in the finally block to guarantee the lock is only released
   *   if the token matches, preventing accidental deletion of another worker's expired lock.
   */
  async runWithLock<T>(
    resourceKey: string,
    ttlMs: number = 8000,
    operation: () => Promise<T>,
  ): Promise<T> {
    const client = this.redisProvider.getClient();
    if (!client || !this.redisProvider.getIsConnected()) {
      // In local development or fallback mode when Redis is offline, execute directly
      return await operation();
    }

    const lockKey = `lock:${resourceKey}`;
    const token = crypto.randomUUID();

    try {
      const acquired = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
      if (!acquired) {
        throw new ConflictException(
          `Resource [${resourceKey}] is currently locked by another concurrent process. Please retry shortly.`,
        );
      }
    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
      this.logger.warn(`Failed to contact Redis for lock [${lockKey}]: ${err.message}. Proceeding in fallback mode.`);
      return await operation();
    }

    try {
      return await operation();
    } finally {
      try {
        await client.eval(this.releaseLockLua, 1, lockKey, token);
      } catch (err: any) {
        this.logger.warn(`Failed to cleanly release distributed lock [${lockKey}]: ${err.message}`);
      }
    }
  }
}
