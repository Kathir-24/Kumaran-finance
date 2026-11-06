import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { Redis } from 'ioredis';
import { RedisConnectionProvider } from '../../jobs/providers/redis-connection.provider';

interface MemoryRecord {
  totalHits: number;
  expiresAt: number;
  blockedUntil: number;
}

const REDIS_LUA_INCREMENT = `
local hitKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDurationMs = tonumber(ARGV[3])

if blockDurationMs > 0 then
  local blockTtl = redis.call('PTTL', blockKey)
  if blockTtl > 0 then
    local hits = redis.call('GET', hitKey) or limit
    return { tonumber(hits), 0, 1, math.ceil(blockTtl / 1000) }
  end
end

local totalHits = redis.call('INCR', hitKey)
if totalHits == 1 then
  redis.call('PEXPIRE', hitKey, ttlMs)
end

local pttl = redis.call('PTTL', hitKey)
if pttl < 0 then
  redis.call('PEXPIRE', hitKey, ttlMs)
  pttl = ttlMs
end
local timeToExpire = math.ceil(pttl / 1000)

local isBlocked = 0
local timeToBlockExpire = 0

if totalHits > limit then
  isBlocked = 1
  if blockDurationMs > 0 then
    redis.call('SET', blockKey, '1', 'PX', blockDurationMs)
    timeToBlockExpire = math.ceil(blockDurationMs / 1000)
  else
    timeToBlockExpire = timeToExpire
  end
end

return { totalHits, timeToExpire, isBlocked, timeToBlockExpire }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memoryStore = new Map<string, MemoryRecord>();
  private sweepInterval?: NodeJS.Timeout;

  constructor(private readonly redisProvider: RedisConnectionProvider) {
    this.sweepInterval = setInterval(() => this.cleanupMemoryStore(), 60_000);
    this.sweepInterval.unref?.();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redis = this.redisProvider?.getClient();
    const isRedisAvailable = Boolean(redis && this.redisProvider?.getIsConnected());

    if (isRedisAvailable && redis) {
      try {
        return await this.incrementRedis(redis, key, ttl, limit, blockDuration, throttlerName);
      } catch (err: any) {
        this.logger.warn(`Redis throttler error (${err.message}). Falling back to memory store.`);
      }
    }

    return this.incrementMemory(key, ttl, limit, blockDuration, throttlerName);
  }

  private async incrementRedis(
    redis: Redis,
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;

    const res = (await redis.eval(
      REDIS_LUA_INCREMENT,
      2,
      hitKey,
      blockKey,
      String(ttl),
      String(limit),
      String(blockDuration),
    )) as [number, number, number, number];

    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = res;

    return {
      totalHits,
      timeToExpire,
      isBlocked: Boolean(isBlocked),
      timeToBlockExpire,
    };
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const memoryKey = `${throttlerName}:${key}`;
    const now = Date.now();
    let record = this.memoryStore.get(memoryKey);

    if (record && record.blockedUntil > now) {
      return {
        totalHits: record.totalHits,
        timeToExpire: Math.max(0, Math.ceil((record.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.ceil((record.blockedUntil - now) / 1000),
      };
    }

    if (!record || record.expiresAt <= now) {
      record = {
        totalHits: 0,
        expiresAt: now + ttl,
        blockedUntil: 0,
      };
    }

    record.totalHits += 1;
    const timeToExpire = Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
    let isBlocked = false;
    let timeToBlockExpire = 0;

    if (record.totalHits > limit) {
      isBlocked = true;
      if (blockDuration > 0) {
        record.blockedUntil = now + blockDuration;
        timeToBlockExpire = Math.ceil(blockDuration / 1000);
      } else {
        timeToBlockExpire = timeToExpire;
      }
    }

    this.memoryStore.set(memoryKey, record);

    return {
      totalHits: record.totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }

  private cleanupMemoryStore(): void {
    const now = Date.now();
    for (const [key, record] of this.memoryStore.entries()) {
      if (record.expiresAt <= now && record.blockedUntil <= now) {
        this.memoryStore.delete(key);
      }
    }
  }

  onApplicationShutdown(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = undefined;
    }
    this.memoryStore.clear();
  }
}
