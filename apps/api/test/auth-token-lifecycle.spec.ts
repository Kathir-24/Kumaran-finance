import {
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from '../src/auth/auth.service';

const preHash = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
import { CustomerService } from '../src/customer/customer.service';
import { SmsService } from '../src/notification/services/sms.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { UserService } from '../src/user/user.service';

describe('Auth & Session Security: RFC 6819 Refresh Token Lifecycle & Reuse Detection', () => {
  let authService: AuthService;
  let customerService: CustomerService;
  let prismaMock: any;
  let jwtService: JwtService;
  let configService: ConfigService;
  let smsServiceMock: any;
  let storageServiceMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockUserId = 'user-admin-001';
  const mockCustomerId = 'cust-uuid-777';
  const mockCustomerPhone = '9876543210';
  const mockUserPhone = '9842100001';

  beforeEach(() => {
    smsServiceMock = {
      sendOtpSms: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-otp-123' }),
    };

    storageServiceMock = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      getPresignedUrl: jest.fn(),
    };

    prismaMock = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
      },
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-secret-key-32-chars-minimum-sample',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
    });

    jwtService = new JwtService({
      secret: 'test-secret-key-32-chars-minimum-sample',
      signOptions: { expiresIn: '15m' },
    });

    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtService,
      configService,
      smsServiceMock as unknown as SmsService,
    );

    customerService = new CustomerService(
      prismaMock as unknown as PrismaService,
      storageServiceMock as unknown as StorageService,
    );
  });

  // =========================================================================
  // 1. CUSTOMER TOKEN ISSUANCE & DATABASE PERSISTENCE
  // =========================================================================
  describe('1. Customer Token Issuance & Database Persistence', () => {
    it('AUTH-LIFE-01: verifyOtp for customer hashes refresh token and updates customer record', async () => {
      const mockCustomer = {
        id: mockCustomerId,
        fullName: 'Sundaram S',
        phone: mockCustomerPhone,
        branchId: mockBranchId,
        refreshTokenHash: null,
      };

      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      prismaMock.customer.update.mockResolvedValue(mockCustomer);

      // Request OTP first to establish session
      const reqRes = await authService.requestOtp({ phone: mockCustomerPhone });
      expect(reqRes.success).toBe(true);
      const debugOtp = (reqRes as any).debugOtp || '123456';

      // Verify OTP
      const verifyRes = await authService.verifyOtp({
        phone: mockCustomerPhone,
        otp: debugOtp,
      });

      expect(verifyRes.verified).toBe(true);
      expect(verifyRes.accessToken).toBeDefined();
      expect(verifyRes.refreshToken).toBeDefined();
      expect(verifyRes.user.roles).toContain(Role.CUSTOMER);

      // Verify Prisma customer.update was invoked with a bcrypt hash and lastLoginAt
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockCustomerId },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
            lastLoginAt: expect.any(Date),
          }),
        }),
      );

      const updateCall = prismaMock.customer.update.mock.calls[0][0];
      const storedHash = updateCall.data.refreshTokenHash;
      const isMatch = await bcrypt.compare(preHash(verifyRes.refreshToken!), storedHash);
      expect(isMatch).toBe(true);
    });
  });

  // =========================================================================
  // 2. CUSTOMER TOKEN ROTATION (HAPPY PATH)
  // =========================================================================
  describe('2. Customer Token Rotation (Happy Path)', () => {
    it('AUTH-LIFE-02: refreshToken rotates access & refresh tokens when presented token matches hash', async () => {
      const initialRefreshToken = jwtService.sign(
        {
          sub: mockCustomerId,
          phone: mockCustomerPhone,
          roles: [Role.CUSTOMER],
          branchId: mockBranchId,
          tokenType: 'refresh',
        },
        { expiresIn: '7d' },
      );

      const initialHash = await bcrypt.hash(preHash(initialRefreshToken), 10);

      const customerRecord = {
        id: mockCustomerId,
        fullName: 'Sundaram S',
        phone: mockCustomerPhone,
        branchId: mockBranchId,
        refreshTokenHash: initialHash,
      };

      prismaMock.customer.findUnique.mockResolvedValue(customerRecord);
      prismaMock.customer.update.mockResolvedValue(customerRecord);

      const rotateRes = await authService.refreshToken({ refreshToken: initialRefreshToken });

      expect(rotateRes.accessToken).toBeDefined();
      expect(rotateRes.refreshToken).toBeDefined();
      expect(rotateRes.refreshToken).not.toBe(initialRefreshToken);
      expect(rotateRes.user.roles).toContain(Role.CUSTOMER);

      // Verify database updated with the new refresh token's hash
      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockCustomerId },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
          }),
        }),
      );

      const updateCall = prismaMock.customer.update.mock.calls[0][0];
      const newHash = updateCall.data.refreshTokenHash;
      expect(newHash).not.toBe(initialHash);
      const isNewTokenValid = await bcrypt.compare(preHash(rotateRes.refreshToken), newHash);
      expect(isNewTokenValid).toBe(true);
    });
  });

  // =========================================================================
  // 3. CUSTOMER LOGOUT & SESSION REVOCATION
  // =========================================================================
  describe('3. Customer Logout & Session Revocation', () => {
    it('AUTH-LIFE-03: customer logout sets refreshTokenHash to null and clears fcmToken', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId });
      prismaMock.customer.update.mockResolvedValue({});

      const logoutRes = await authService.logout(mockCustomerId);
      expect(logoutRes.success).toBe(true);

      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: mockCustomerId },
        data: {
          refreshTokenHash: null,
          fcmToken: null,
        },
      });
    });

    it('AUTH-LIFE-04: refreshToken fails with 401 when customer session was logged out (hash is null)', async () => {
      const validJwtToken = jwtService.sign(
        {
          sub: mockCustomerId,
          phone: mockCustomerPhone,
          roles: [Role.CUSTOMER],
          branchId: mockBranchId,
          tokenType: 'refresh',
        },
        { expiresIn: '7d' },
      );

      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        fullName: 'Sundaram S',
        phone: mockCustomerPhone,
        branchId: mockBranchId,
        refreshTokenHash: null, // Logged out
      });

      await expect(
        authService.refreshToken({ refreshToken: validJwtToken }),
      ).rejects.toThrow(new UnauthorizedException('Session revoked or customer logged out'));

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. RFC 6819 TOKEN REUSE DETECTION & TRAP (CUSTOMER)
  // =========================================================================
  describe('4. RFC 6819 Customer Token Reuse Detection & Session Family Revocation', () => {
    it('AUTH-LIFE-05: replaying an already-rotated customer token triggers RFC 6819 trap, revoking session chain', async () => {
      // Step A: Original Token 1
      const token1 = jwtService.sign(
        {
          sub: mockCustomerId,
          phone: mockCustomerPhone,
          roles: [Role.CUSTOMER],
          branchId: mockBranchId,
          tokenType: 'refresh',
          jti: 'session-jti-token-1',
        },
        { expiresIn: '7d' },
      );

      // Step B: Rotated to Token 2; active hash in DB is now Hash 2
      const token2 = jwtService.sign(
        {
          sub: mockCustomerId,
          phone: mockCustomerPhone,
          roles: [Role.CUSTOMER],
          branchId: mockBranchId,
          tokenType: 'refresh',
          jti: 'session-jti-token-2',
        },
        { expiresIn: '7d' },
      );
      const hash2 = await bcrypt.hash(preHash(token2), 10);

      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        fullName: 'Sundaram S',
        phone: mockCustomerPhone,
        branchId: mockBranchId,
        refreshTokenHash: hash2, // Active hash belongs to Token 2
      });
      prismaMock.customer.update.mockResolvedValue({});

      // Step C: Attacker or stale client presents Token 1 (Token Reuse Attack)
      await expect(
        authService.refreshToken({ refreshToken: token1 }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Token reuse detected. Active session revoked for security. Please sign in again.',
        ),
      );

      // Step D: Invariant assertion — Database MUST immediately set refreshTokenHash = null
      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: mockCustomerId },
        data: { refreshTokenHash: null },
      });
    });

    it('AUTH-LIFE-06: after RFC 6819 revocation, the newer Token 2 is also blocked', async () => {
      const token2 = jwtService.sign(
        {
          sub: mockCustomerId,
          phone: mockCustomerPhone,
          roles: [Role.CUSTOMER],
          branchId: mockBranchId,
          tokenType: 'refresh',
        },
        { expiresIn: '7d' },
      );

      // Since session family was wiped, refreshTokenHash in DB is now null
      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomerId,
        fullName: 'Sundaram S',
        phone: mockCustomerPhone,
        branchId: mockBranchId,
        refreshTokenHash: null,
      });

      await expect(
        authService.refreshToken({ refreshToken: token2 }),
      ).rejects.toThrow(new UnauthorizedException('Session revoked or customer logged out'));
    });
  });

  // =========================================================================
  // 5. RFC 6819 TOKEN REUSE DETECTION & TRAP (STAFF USER)
  // =========================================================================
  describe('5. RFC 6819 Staff Token Reuse Detection & Session Family Revocation', () => {
    it('AUTH-LIFE-07: replaying an already-rotated staff token triggers RFC 6819 trap, revoking session chain', async () => {
      const staffToken1 = jwtService.sign(
        {
          sub: mockUserId,
          phone: mockUserPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: mockBranchId,
          tokenType: 'refresh',
          jti: 'staff-jti-token-1',
        },
        { expiresIn: '7d' },
      );

      const staffToken2 = jwtService.sign(
        {
          sub: mockUserId,
          phone: mockUserPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: mockBranchId,
          tokenType: 'refresh',
          jti: 'staff-jti-token-2',
        },
        { expiresIn: '7d' },
      );
      const hash2 = await bcrypt.hash(preHash(staffToken2), 10);

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        phone: mockUserPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        isActive: true,
        refreshTokenHash: hash2,
      });
      prismaMock.user.update.mockResolvedValue({});

      // Replay staffToken1
      await expect(
        authService.refreshToken({ refreshToken: staffToken1 }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Token reuse detected. Active session revoked for security. Please sign in again.',
        ),
      );

      // Invariant assertion — User refreshTokenHash is wiped to null
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { refreshTokenHash: null },
      });
    });
  });

  // =========================================================================
  // 6. NEGATIVE LIFECYCLE TESTS (EXPIRED & FORGED TOKENS)
  // =========================================================================
  describe('6. Negative Lifecycle Tests: Expired, Forged & Wrong-Type Tokens', () => {
    it('AUTH-LIFE-08: expired refresh token is rejected without updating database', async () => {
      const expiredToken = jwtService.sign(
        {
          sub: mockCustomerId,
          phone: mockCustomerPhone,
          roles: [Role.CUSTOMER],
          tokenType: 'refresh',
        },
        { expiresIn: '-1s' }, // Expired
      );

      await expect(
        authService.refreshToken({ refreshToken: expiredToken }),
      ).rejects.toThrow(new UnauthorizedException('Refresh token is invalid or expired'));

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('AUTH-LIFE-09: access token passed to refresh-token endpoint is rejected without updating database', async () => {
      const accessToken = jwtService.sign(
        {
          sub: mockCustomerId,
          phone: mockCustomerPhone,
          roles: [Role.CUSTOMER],
          branchId: mockBranchId,
          tokenType: 'access', // Incorrect token type
        },
        { expiresIn: '15m' },
      );

      await expect(
        authService.refreshToken({ refreshToken: accessToken }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid token type for refresh operation'),
      );

      expect(prismaMock.customer.update).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. PHONE NUMBER MUTATION SESSION REVOCATION
  // =========================================================================
  describe('7. Customer Phone Number Mutation Session Invalidation', () => {
    it('AUTH-LIFE-10: CustomerService.update invalidates sessions (refreshTokenHash = null) when phone is modified', async () => {
      const existingCustomer = {
        id: mockCustomerId,
        customerCode: 'KC-CUST-00042',
        fullName: 'Sundaram S',
        phone: '9876543210',
        branchId: mockBranchId,
        refreshTokenHash: 'active_bcrypt_hash_123',
      };

      prismaMock.customer.findUnique
        .mockResolvedValueOnce(existingCustomer) // First call: find by id
        .mockResolvedValueOnce(null); // Second call: check if new phone exists

      prismaMock.customer.update.mockResolvedValue({
        ...existingCustomer,
        phone: '9842199999',
        refreshTokenHash: null,
      });

      await customerService.update(mockCustomerId, {
        phone: '9842199999',
      });

      expect(prismaMock.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockCustomerId },
          data: expect.objectContaining({
            phone: '9842199999',
            refreshTokenHash: null,
          }),
        }),
      );
    });

    it('CustomerService.update preserves refreshTokenHash when phone number is NOT changed', async () => {
      const existingCustomer = {
        id: mockCustomerId,
        customerCode: 'KC-CUST-00042',
        fullName: 'Sundaram S',
        phone: '9876543210',
        branchId: mockBranchId,
        refreshTokenHash: 'active_bcrypt_hash_123',
      };

      prismaMock.customer.findUnique.mockResolvedValue(existingCustomer);
      prismaMock.customer.update.mockResolvedValue(existingCustomer);

      await customerService.update(mockCustomerId, {
        fullName: 'Sundaram Sengottaiyan',
      });

      const updateCall = prismaMock.customer.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('refreshTokenHash');
    });
  });

  // =========================================================================
  // 8. HIGH-THROUGHPUT JWT VALIDATION CACHING & EVICTION
  // =========================================================================
  describe('8. High-Throughput JWT Validation Caching & Cache Eviction', () => {
    let jwtStrategy: JwtStrategy;
    let userService: UserService;
    let redisClientMock: any;
    let redisProviderMock: any;

    beforeEach(() => {
      redisClientMock = {
        get: jest.fn(),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      };

      redisProviderMock = {
        getClient: jest.fn().mockReturnValue(redisClientMock),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      jwtStrategy = new JwtStrategy(
        configService,
        prismaMock as unknown as PrismaService,
        redisProviderMock as any,
      );

      userService = new UserService(
        prismaMock as unknown as PrismaService,
        redisProviderMock as any,
      );
    });

    it('JWT-CACHE-01: should return payload directly on Redis cache hit (ACTIVE) with zero DB queries', async () => {
      redisClientMock.get.mockResolvedValue('ACTIVE');

      const payload = {
        sub: 'user-001',
        phone: '9842100001',
        roles: [Role.SUPER_ADMIN],
        tokenType: 'access' as const,
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toBe(payload);
      expect(redisClientMock.get).toHaveBeenCalledWith('user:status:user-001');
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
    });

    it('JWT-CACHE-02: should immediately reject with UnauthorizedException on Redis cache hit (INACTIVE)', async () => {
      redisClientMock.get.mockResolvedValue('INACTIVE');

      const payload = {
        sub: 'user-deactivated',
        phone: '9842100001',
        roles: [Role.SUPER_ADMIN],
        tokenType: 'access' as const,
      };

      await expect(jwtStrategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException('User account is deactivated or no longer exists'),
      );

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('JWT-CACHE-03: should query DB and cache ACTIVE in Redis for 120s on cache miss', async () => {
      redisClientMock.get.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-001',
        isActive: true,
      });

      const payload = {
        sub: 'user-001',
        phone: '9842100001',
        roles: [Role.SUPER_ADMIN],
        tokenType: 'access' as const,
      };

      const result = await jwtStrategy.validate(payload);

      expect(result).toBe(payload);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-001' },
        select: { id: true, isActive: true },
      });
      expect(redisClientMock.set).toHaveBeenCalledWith(
        'user:status:user-001',
        'ACTIVE',
        'EX',
        120,
      );
    });

    it('JWT-CACHE-04: UserService.updateStatus should evict Redis cache key', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-001',
        isActive: true,
        refreshTokenHash: 'hash-1',
      });
      prismaMock.user.update.mockResolvedValue({
        id: 'user-001',
        name: 'Staff A',
        phone: '9842100001',
        roles: [Role.ACCOUNTANT],
        isActive: false,
      });

      await userService.updateStatus('user-001', { isActive: false }, 'super-admin-id');

      expect(redisClientMock.del).toHaveBeenCalledWith('user:status:user-001');
    });
  });

  // =========================================================================
  // 9. MULTI-DEVICE CONCURRENT SESSION ISOLATION (WEB + MOBILE)
  // =========================================================================
  describe('9. Multi-Device Concurrent Session Isolation (Web + Mobile)', () => {
    let authServiceWithRedis: AuthService;
    let redisClientMock: any;
    let redisProviderMock: any;
    const sessionMap = new Map<string, string>();

    beforeEach(() => {
      sessionMap.clear();
      redisClientMock = {
        get: jest.fn().mockImplementation((key: string) => Promise.resolve(sessionMap.get(key) || null)),
        set: jest.fn().mockImplementation((key: string, val: string) => {
          sessionMap.set(key, val);
          return Promise.resolve('OK');
        }),
        del: jest.fn().mockImplementation((...keys: string[]) => {
          let count = 0;
          for (const k of keys) {
            if (sessionMap.delete(k)) count++;
          }
          return Promise.resolve(count);
        }),
      };

      redisProviderMock = {
        getClient: jest.fn().mockReturnValue(redisClientMock),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      authServiceWithRedis = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtService,
        configService,
        smsServiceMock as unknown as SmsService,
        redisProviderMock as any,
      );
    });

    it('AUTH-MULTI-01: staff login on WEB and MOBILE isolates refresh token families in Redis without collision', async () => {
      const mockStaffUser = {
        id: mockUserId,
        phone: mockUserPhone,
        passwordHash: await bcrypt.hash('CorrectPass@123', 10),
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        isActive: true,
        isTotpEnabled: false,
        totpSecret: null,
        mpinHash: null,
        refreshTokenHash: null,
      };

      prismaMock.user.findFirst.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue(mockStaffUser);

      // Login on Web
      const webTokens = await authServiceWithRedis.login({
        phone: mockUserPhone,
        password: 'CorrectPass@123',
        clientType: 'WEB',
      });

      // Login on Mobile
      const mobileTokens = await authServiceWithRedis.login({
        phone: mockUserPhone,
        password: 'CorrectPass@123',
        clientType: 'MOBILE',
      });

      expect(webTokens.accessToken).toBeDefined();
      expect(mobileTokens.accessToken).toBeDefined();
      expect(webTokens.refreshToken).not.toEqual(mobileTokens.refreshToken);

      // Verify Redis keys exist independently
      expect(sessionMap.has(`auth:session:${mockUserId}:WEB`)).toBe(true);
      expect(sessionMap.has(`auth:session:${mockUserId}:MOBILE`)).toBe(true);
      expect(sessionMap.get(`auth:session:${mockUserId}:WEB`)).not.toEqual(
        sessionMap.get(`auth:session:${mockUserId}:MOBILE`),
      );
    });

    it('AUTH-MULTI-02: rotating WEB refresh token does not invalidate concurrent MOBILE session', async () => {
      const mockStaffUser = {
        id: mockUserId,
        phone: mockUserPhone,
        passwordHash: await bcrypt.hash('CorrectPass@123', 10),
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        isActive: true,
        isTotpEnabled: false,
        totpSecret: null,
        mpinHash: null,
        refreshTokenHash: null,
      };

      prismaMock.user.findFirst.mockResolvedValue(mockStaffUser);
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue(mockStaffUser);

      // Login Web & Mobile
      const webLogin = await authServiceWithRedis.login({
        phone: mockUserPhone,
        password: 'CorrectPass@123',
        clientType: 'WEB',
      });
      const mobileLogin = await authServiceWithRedis.login({
        phone: mockUserPhone,
        password: 'CorrectPass@123',
        clientType: 'MOBILE',
      });

      const initialMobileHash = sessionMap.get(`auth:session:${mockUserId}:MOBILE`);

      // Rotate Web token
      const webRefreshed = await authServiceWithRedis.refreshToken({
        refreshToken: webLogin.refreshToken,
        clientType: 'WEB',
      });
      expect(webRefreshed.accessToken).toBeDefined();

      // Mobile Redis key is completely untouched and still valid
      expect(sessionMap.get(`auth:session:${mockUserId}:MOBILE`)).toBe(initialMobileHash);

      // Mobile can now refresh smoothly
      const mobileRefreshed = await authServiceWithRedis.refreshToken({
        refreshToken: mobileLogin.refreshToken,
        clientType: 'MOBILE',
      });
      expect(mobileRefreshed.accessToken).toBeDefined();
    });

    it('AUTH-MULTI-03: RFC 6819 reuse trap on WEB revokes WEB family while keeping MOBILE family valid', async () => {
      const mockStaffUser = {
        id: mockUserId,
        phone: mockUserPhone,
        passwordHash: await bcrypt.hash('CorrectPass@123', 10),
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        isActive: true,
        isTotpEnabled: false,
        totpSecret: null,
        mpinHash: null,
        refreshTokenHash: null,
      };

      prismaMock.user.findFirst.mockResolvedValue(mockStaffUser);
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue(mockStaffUser);

      // Login Web & Mobile
      const webLogin = await authServiceWithRedis.login({
        phone: mockUserPhone,
        password: 'CorrectPass@123',
        clientType: 'WEB',
      });
      const mobileLogin = await authServiceWithRedis.login({
        phone: mockUserPhone,
        password: 'CorrectPass@123',
        clientType: 'MOBILE',
      });

      // Legitimate Web rotation
      await authServiceWithRedis.refreshToken({
        refreshToken: webLogin.refreshToken,
        clientType: 'WEB',
      });

      // Attacker replays old web token -> RFC 6819 trap triggered
      await expect(
        authServiceWithRedis.refreshToken({
          refreshToken: webLogin.refreshToken,
          clientType: 'WEB',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Web session slot is destroyed in Redis
      expect(sessionMap.has(`auth:session:${mockUserId}:WEB`)).toBe(false);

      // Mobile session slot is still healthy
      expect(sessionMap.has(`auth:session:${mockUserId}:MOBILE`)).toBe(true);
      const mobileRefreshed = await authServiceWithRedis.refreshToken({
        refreshToken: mobileLogin.refreshToken,
        clientType: 'MOBILE',
      });
      expect(mobileRefreshed.accessToken).toBeDefined();
    });

    it('AUTH-MULTI-04: client-specific logout revokes only target client slot, whereas ALL revokes all', async () => {
      const mockStaffUser = {
        id: mockUserId,
        phone: mockUserPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        isActive: true,
      };
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue(mockStaffUser);

      sessionMap.set(`auth:session:${mockUserId}:WEB`, 'hash-web');
      sessionMap.set(`auth:session:${mockUserId}:MOBILE`, 'hash-mobile');

      // Logout only WEB
      await authServiceWithRedis.logout(mockUserId, 'WEB');
      expect(sessionMap.has(`auth:session:${mockUserId}:WEB`)).toBe(false);
      expect(sessionMap.has(`auth:session:${mockUserId}:MOBILE`)).toBe(true);

      // Logout ALL
      await authServiceWithRedis.logout(mockUserId, 'ALL');
      expect(sessionMap.has(`auth:session:${mockUserId}:MOBILE`)).toBe(false);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { refreshTokenHash: null, fcmToken: null },
      });
    });
  });
});
