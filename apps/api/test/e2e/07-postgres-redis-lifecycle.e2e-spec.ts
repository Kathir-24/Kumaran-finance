import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Redis } from 'ioredis';
import { AuthService } from '../../src/auth/auth.service';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { RedisConnectionProvider } from '../../src/jobs/providers/redis-connection.provider';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Real PostgreSQL 17 & Redis 7 Lifecycle Tests (e2e)', () => {
  let prisma: PrismaService;
  let redisProvider: RedisConnectionProvider;
  let redisClient: Redis;
  let configService: ConfigService;
  let jwtService: JwtService;
  let authService: AuthService;
  let jwtStrategy: JwtStrategy;

  let testBranchId: string;
  let testUserId: string;
  const testPhone = '9842100077';
  const testPassword = 'LifecyclePassword#2026';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ||
      'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_DB = '1';

    configService = new ConfigService({
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 6379,
      REDIS_DB: 1,
      JWT_SECRET: 'test-real-lifecycle-secret-32-chars-long!',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
    });

    prisma = new PrismaService();
    await prisma.$connect();

    redisProvider = new RedisConnectionProvider(configService);
    redisClient = redisProvider.getClient()!;
    await redisClient.connect().catch(() => {});
    await redisClient.flushdb(); // Clear DB 1

    jwtService = new JwtService({
      secret: configService.get<string>('JWT_SECRET'),
      signOptions: { expiresIn: '15m' },
    });

    authService = new AuthService(
      prisma,
      jwtService,
      configService,
      {} as any, // smsService not needed for password login
      redisProvider,
    );

    jwtStrategy = new JwtStrategy(configService, prisma, redisProvider);

    // Clean up any previous test artifacts
    await prisma.session.deleteMany({
      where: {
        OR: [{ user: { phone: testPhone } }, { customer: { phone: testPhone } }],
      },
    });
    await prisma.user.deleteMany({ where: { phone: testPhone } });
    await prisma.branch.deleteMany({ where: { code: 'TST' } });

    // Seed test branch & staff user
    const branch = await prisma.branch.create({
      data: {
        code: 'TST',
        name: 'Test Branch Perundurai',
        nameTamil: 'பரிசோதனை கிளை',
        address: '123 Test Street, Perundurai',
        phone: '9842100000',
      },
    });
    testBranchId = branch.id;

    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        name: 'Real Lifecycle Staff',
        passwordHash,
        roles: [Role.SUPER_ADMIN],
        isPartner: true,
        branchId: testBranchId,
        isActive: true,
        mustChangePassword: false,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    try {
      await prisma.session.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.branch.deleteMany({ where: { id: testBranchId } });
      await redisClient.flushdb();
      await prisma.$disconnect();
      await redisClient.quit();
    } catch {}
  });

  it('1. Real Token Issuance & PostgreSQL Session Vault Persistence', async () => {
    const loginResult = await authService.login({
      phone: testPhone,
      password: testPassword,
      clientType: 'WEB',
    });

    if (!('accessToken' in loginResult)) {
      throw new Error('Expected full tokens');
    }

    expect(loginResult.accessToken).toBeDefined();
    expect(loginResult.refreshToken).toBeDefined();

    const decodedAccess: JwtPayload = jwtService.verify(loginResult.accessToken);
    expect(decodedAccess.sub).toBe(testUserId);
    expect(decodedAccess.clientType).toBe('WEB');
    expect(decodedAccess.sid).toBeDefined();

    // Verify row exists in real PostgreSQL database
    const sessionInDb = await prisma.session.findUnique({
      where: { userId_clientType: { userId: testUserId, clientType: 'WEB' } },
    });
    expect(sessionInDb).toBeDefined();
    expect(sessionInDb?.id).toBe(decodedAccess.sid);
    expect(sessionInDb?.revokedAt).toBeNull();
    expect(sessionInDb?.refreshTokenHash).toBeTruthy();

    // Verify Redis session vault key exists
    const redisHash = await redisClient.get(`auth:session:${testUserId}:WEB`);
    expect(redisHash).toBeTruthy();

    // Validate access token via JwtStrategy
    const validated = await jwtStrategy.validate(decodedAccess);
    expect(validated.sub).toBe(testUserId);
    expect(validated.isPartner).toBe(true);
  });

  it('2. Real Multi-Device Session Isolation (WEB and MOBILE coexist)', async () => {
    // Login on MOBILE
    const mobileLogin = await authService.login({
      phone: testPhone,
      password: testPassword,
      clientType: 'MOBILE',
    });
    if (!('accessToken' in mobileLogin)) {
      throw new Error('Expected mobile full tokens');
    }

    const mobileDecoded: JwtPayload = jwtService.verify(mobileLogin.accessToken);
    expect(mobileDecoded.clientType).toBe('MOBILE');

    // Both sessions exist simultaneously in PostgreSQL
    const webSession = await prisma.session.findUnique({
      where: { userId_clientType: { userId: testUserId, clientType: 'WEB' } },
    });
    const mobileSession = await prisma.session.findUnique({
      where: { userId_clientType: { userId: testUserId, clientType: 'MOBILE' } },
    });

    expect(webSession).toBeTruthy();
    expect(mobileSession).toBeTruthy();
    expect(webSession?.id).not.toBe(mobileSession?.id);

    // Both pass validation independently
    await expect(jwtStrategy.validate(mobileDecoded)).resolves.toMatchObject({ sub: testUserId });
  });

  it('3. Real Scoped Logout: revokes target family while preserving concurrent family', async () => {
    // Log out of WEB only
    await authService.logout(testUserId, 'WEB');

    // PostgreSQL Session for WEB is revoked
    const webSession = await prisma.session.findUnique({
      where: { userId_clientType: { userId: testUserId, clientType: 'WEB' } },
    });
    expect(webSession?.revokedAt).toBeInstanceOf(Date);
    expect(webSession?.refreshTokenHash).toBeNull();

    // PostgreSQL Session for MOBILE remains active
    const mobileSession = await prisma.session.findUnique({
      where: { userId_clientType: { userId: testUserId, clientType: 'MOBILE' } },
    });
    expect(mobileSession?.revokedAt).toBeNull();
    expect(mobileSession?.refreshTokenHash).toBeTruthy();

    // Redis WEB key is purged
    expect(await redisClient.get(`auth:session:${testUserId}:WEB`)).toBeNull();

    // Refresh on WEB fails with 401
    const dummyWebRefresh = jwtService.sign({
      sub: testUserId,
      tokenType: 'refresh',
      clientType: 'WEB',
    });
    await expect(
      authService.refreshToken({ refreshToken: dummyWebRefresh, clientType: 'WEB' }),
    ).rejects.toThrow();
  });

  it('4. Real Redis Flush / Restart Invariant: Cold Redis consults PostgreSQL durable authority', async () => {
    // Simulate total Redis outage or flush/restart
    await redisClient.flushdb();

    // WEB session was revoked in PostgreSQL:
    // Even though Redis has no record of the cutoff, JwtStrategy consults PostgreSQL Session row and rejects!
    const revokedWebPayload: JwtPayload = {
      sub: testUserId,
      phone: testPhone,
      roles: [Role.SUPER_ADMIN],
      branchId: testBranchId,
      tokenType: 'access',
      clientType: 'WEB',
      sid: 'old-revoked-sid',
      issuedAtMs: Date.now() - 60000,
    };

    await expect(jwtStrategy.validate(revokedWebPayload)).rejects.toThrow(
      'Session terminated or logged out. Please sign in again.',
    );

    // MOBILE session was active in PostgreSQL:
    // With cold Redis, JwtStrategy queries PostgreSQL, succeeds, and re-populates the cache!
    const activeMobileSession = await prisma.session.findUnique({
      where: { userId_clientType: { userId: testUserId, clientType: 'MOBILE' } },
    });
    expect(activeMobileSession).toBeTruthy();

    const activeMobilePayload: JwtPayload = {
      sub: testUserId,
      phone: testPhone,
      roles: [Role.SUPER_ADMIN],
      branchId: testBranchId,
      tokenType: 'access',
      clientType: 'MOBILE',
      sid: activeMobileSession!.id,
      issuedAtMs: activeMobileSession!.createdAt.getTime(),
    };

    const validated = await jwtStrategy.validate(activeMobilePayload);
    expect(validated.sub).toBe(testUserId);

    // Verify cache was re-populated in Redis
    const repopulatedCache = await redisClient.get(`user:status:${testUserId}:MOBILE`);
    expect(repopulatedCache).toBeTruthy();
    expect(JSON.parse(repopulatedCache!).status).toBe('ACTIVE');
  });

  it('5. Real Replacement Login: Older access tokens are superseded even after revokedAt is reset to null', async () => {
    // 1. Fresh login on WEB gives Token 1 with sid_1
    const login1 = await authService.login({
      phone: testPhone,
      password: testPassword,
      clientType: 'WEB',
    });
    if (!('accessToken' in login1)) {
      throw new Error('Expected login1 full tokens');
    }
    const payload1: JwtPayload = jwtService.verify(login1.accessToken);
    const sid1 = payload1.sid;

    // 2. User logs out on WEB (Session revoked)
    await authService.logout(testUserId, 'WEB');

    // 3. User logs back in on WEB -> produces Token 2 with sid_2; resets revokedAt = null
    const login2 = await authService.login({
      phone: testPhone,
      password: testPassword,
      clientType: 'WEB',
    });
    if (!('accessToken' in login2)) {
      throw new Error('Expected login2 full tokens');
    }
    const payload2: JwtPayload = jwtService.verify(login2.accessToken);
    const sid2 = payload2.sid;
    expect(sid2).not.toBe(sid1);

    // Cold Redis to test database durability
    await redisClient.flushdb();

    // Presenting Token 2 (current) succeeds
    await expect(jwtStrategy.validate(payload2)).resolves.toMatchObject({ sub: testUserId });

    // Presenting Token 1 (from previous session) must fail with superseded
    await expect(jwtStrategy.validate(payload1)).rejects.toThrow(
      'Session terminated or superseded. Please sign in again.',
    );
  });

  it('6. Real Concurrent Refresh: Parallel refreshes rotate or coalesce safely without token theft false alerts', async () => {
    // Fresh login
    const login = await authService.login({
      phone: testPhone,
      password: testPassword,
      clientType: 'WEB',
    });
    if (!('refreshToken' in login)) {
      throw new Error('Expected login refresh token');
    }

    const refreshDto: { refreshToken: string; clientType: 'WEB' } = {
      refreshToken: login.refreshToken,
      clientType: 'WEB',
    };

    // Fire 2 concurrent refresh requests simultaneously against real Redis & PostgreSQL
    const [res1, res2] = await Promise.allSettled([
      authService.refreshToken(refreshDto),
      authService.refreshToken(refreshDto),
    ]);

    // At least one must succeed
    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Both tokens returned should validate against the database session
    for (const r of fulfilled) {
      const tokens = (r as PromiseFulfilledResult<any>).value;
      const decoded: JwtPayload = jwtService.verify(tokens.accessToken);
      await expect(jwtStrategy.validate(decoded)).resolves.toMatchObject({ sub: testUserId });
    }
  });
});
