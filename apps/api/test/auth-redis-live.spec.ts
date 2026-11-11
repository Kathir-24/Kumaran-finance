import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { AuthService } from '../src/auth/auth.service';
import { SmsService } from '../src/notification/services/sms.service';
import { PrismaService } from '../src/prisma/prisma.service';

const preHash = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Live Redis 7 Integration Verification for Issue #1 (DEF-FE-01)
 *
 * Tests real ioredis Lua `eval`, `SET PX NX`, `INCR`, `DECR`, and key expiry
 * against a live Redis 7 container on 127.0.0.1:6379.
 */
describe('AuthService Concurrent Refresh Coalescing (Real Redis 7 Integration)', () => {
  let redisClient: Redis | null = null;
  let isRedisLive = false;
  let jwtService: JwtService;
  let configService: ConfigService;
  let smsServiceMock: any;

  const testUserId = `redis-live-user-${Date.now()}`;
  const testUserPhone = '9842100999';
  const testBranchId = 'branch-prd-001';

  beforeAll(async () => {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);

    redisClient = new Redis({
      host,
      port,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });

    try {
      await redisClient.connect();
      const pong = await redisClient.ping();
      isRedisLive = pong === 'PONG';
    } catch {
      isRedisLive = false;
      console.warn('⚠️ Live Redis 7 not accessible on 127.0.0.1:6379. Skipping live Redis test.');
    }

    configService = new ConfigService({
      JWT_SECRET: 'live-redis-test-secret-minimum-32-chars',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
    });

    jwtService = new JwtService({
      secret: 'live-redis-test-secret-minimum-32-chars',
      signOptions: { expiresIn: '15m' },
    });

    smsServiceMock = {
      sendOtpSms: jest.fn().mockResolvedValue({ success: true }),
    };
  });

  afterAll(async () => {
    if (redisClient && isRedisLive) {
      await redisClient.del(`auth:session:${testUserId}:WEB`).catch(() => {});
      await redisClient.quit().catch(() => {});
    }
  });

  it('LIVE-REDIS-DEF-FE-01: two independent replicas coalesce overlapping refresh calls using real Redis Lua & NX locks, then strictly trap sequential replay', async () => {
    if (!isRedisLive || !redisClient) {
      return;
    }

    const realRedisProvider: any = {
      getClient: () => redisClient,
      getIsConnected: () => true,
    };

    const staffRefresh = jwtService.sign(
      {
        sub: testUserId,
        phone: testUserPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: testBranchId,
        tokenType: 'refresh',
        jti: `jti-live-redis-${Date.now()}`,
      },
      { expiresIn: '7d' },
    );

    const tokenDigest = preHash(staffRefresh);
    const initialHash = await bcrypt.hash(tokenDigest, 10);
    await redisClient.set(`auth:session:${testUserId}:WEB`, initialHash, 'EX', 120);

    const userRecord: any = {
      id: testUserId,
      name: 'Live Redis Tester',
      phone: testUserPhone,
      roles: [Role.SUPER_ADMIN],
      branchId: testBranchId,
      isActive: true,
      isTotpEnabled: false,
      mpinHash: null,
      refreshTokenHash: initialHash,
    };

    const prismaMock: any = {
      user: {
        findUnique: jest.fn(async () => ({ ...userRecord })),
        update: jest.fn(async (args: any) => {
          userRecord.refreshTokenHash = args.data.refreshTokenHash;
          return { ...userRecord };
        }),
      },
    };

    const replicaA = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtService,
      configService,
      smsServiceMock as unknown as SmsService,
      realRedisProvider,
    );
    const replicaB = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtService,
      configService,
      smsServiceMock as unknown as SmsService,
      realRedisProvider,
    );

    // 1. Overlapping concurrent burst across 2 independent AuthService replicas hitting real Redis
    const [resA, resB] = await Promise.all([
      replicaA.refreshToken({ refreshToken: staffRefresh, clientType: 'WEB' }),
      replicaB.refreshToken({ refreshToken: staffRefresh, clientType: 'WEB' }),
    ]);

    expect(resA.accessToken).toBeDefined();
    expect(resB.accessToken).toBe(resA.accessToken);
    expect(resB.refreshToken).toBe(resA.refreshToken);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);

    // Verify transient Redis keys were cleanly removed after consumption (0ms replay residual!)
    const lingeringLock = await redisClient.get(`lock:auth:refresh:${tokenDigest}`);
    const lingeringWaiters = await redisClient.get(`auth:refresh_waiters:${tokenDigest}`);
    const lingeringResult = await redisClient.get(`auth:refresh_inflight_result:${tokenDigest}`);

    expect(lingeringLock).toBeNull();
    expect(lingeringWaiters).toBeNull();
    expect(lingeringResult).toBeNull();

    // 2. Immediately replay the already-rotated token sequentially against real Redis -> RFC 6819 trap fires
    await expect(
      replicaA.refreshToken({ refreshToken: staffRefresh, clientType: 'WEB' }),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Token reuse detected. Active session revoked for security. Please sign in again.',
      ),
    );

    const activeSessionAfterTrap = await redisClient.get(`auth:session:${testUserId}:WEB`);
    expect(activeSessionAfterTrap).toBeNull();
  }, 15000);
});
