import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Atomic Lua script that releases a Redis mutex key only when the caller's unique
 * random token still matches the stored value, preventing slow callers from deleting
 * a lock re-acquired by another worker after TTL expiration.
 */
export const REDIS_RELEASE_LOCK_LUA =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export interface RedisMutexClient {
  set(key: string, value: string, ...args: any[]): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  get?(key: string): Promise<string | null>;
  del?(key: string): Promise<unknown>;
}

export interface AcquiredRedisLock {
  acquired: boolean;
  token: string;
  release: () => Promise<void>;
}

/**
 * Acquires a transient tokenized Redis mutex (`lock:<resourceKey>`) with `PX <ttlMs> NX`
 * and returns a safe atomic Lua release callback.
 */
export async function acquireRedisMutexLock(
  client: RedisMutexClient,
  resourceKey: string,
  ttlMs: number = 5000,
  logger?: Logger,
): Promise<AcquiredRedisLock> {
  const lockKey = `lock:${resourceKey}`;
  const token = crypto.randomUUID();

  try {
    const acquired = await client.set(lockKey, token, 'PX', ttlMs, 'NX');
    return {
      acquired: acquired === 'OK' || acquired === true,
      token,
      release: async () => {
        try {
          if (typeof client.eval === 'function') {
            await client.eval(REDIS_RELEASE_LOCK_LUA, 1, lockKey, token);
          } else if (
            typeof client.get === 'function' &&
            typeof client.del === 'function' &&
            (await client.get(lockKey)) === token
          ) {
            await client.del(lockKey);
          }
        } catch (err: any) {
          logger?.warn(`Failed to cleanly release lock [${lockKey}]: ${err?.message ?? err}`);
        }
      },
    };
  } catch (err: any) {
    logger?.warn(`Failed to acquire lock [${lockKey}]: ${err?.message ?? err}`);
    return { acquired: false, token, release: async () => {} };
  }
}
