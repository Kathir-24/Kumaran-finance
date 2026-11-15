import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { generateSecret, generateSync } from 'otplib';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { UserController } from '../../src/user/user.controller';
import { UserService } from '../../src/user/user.service';

describe('Phase 1 Security Remediation: Adversarial Verification (F01, F02, F03, F04, F10, F16)', () => {
  let authService: AuthService;
  let authController: AuthController;
  let userService: UserService;
  let userController: UserController;
  let jwtStrategy: JwtStrategy;
  let jwtService: JwtService;
  let configService: ConfigService;
  let prismaMock: any;
  let redisClientMock: any;
  let redisProviderMock: any;
  let smsServiceMock: any;

  const mockUserId = 'user-staff-001';
  const mockAdminId = 'user-admin-001';
  const mockBranchId = 'branch-prd-001';
  const rawDefaultPassword = 'Temp#Secret123!';
  let defaultPasswordHash: string;

  beforeAll(async () => {
    defaultPasswordHash = await bcrypt.hash(rawDefaultPassword, 12);
  });

  beforeEach(() => {
    const redisStore = new Map<string, string>();

    redisClientMock = {
      get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      set: jest.fn(async (key: string, val: string, ...args: any[]) => {
        if (args.includes('NX') && redisStore.has(key)) {
          return null;
        }
        redisStore.set(key, val);
        return 'OK';
      }),
      del: jest.fn(async (...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (redisStore.delete(k)) count++;
        }
        return count;
      }),
      ttl: jest.fn(async () => 300),
      incr: jest.fn(async (key: string) => {
        const val = (parseInt(redisStore.get(key) || '0', 10) + 1).toString();
        redisStore.set(key, val);
        return parseInt(val, 10);
      }),
      expire: jest.fn(async () => 1),
    };

    redisProviderMock = {
      getClient: () => redisClientMock,
      getIsConnected: () => true,
    };

    prismaMock = {
      $transaction: jest.fn(async (cb: any) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      customer: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      session: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ id: mockBranchId, code: 'PRD' }),
      },
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-phase1-secret-32-chars-long-minimum!',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
    });

    jwtService = new JwtService({
      secret: 'test-phase1-secret-32-chars-long-minimum!',
      signOptions: { expiresIn: '15m' },
    });

    smsServiceMock = {
      sendOtpSms: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-123' }),
    };

    authService = new AuthService(
      prismaMock,
      jwtService,
      configService,
      smsServiceMock,
      redisProviderMock,
    );

    authController = new AuthController(authService);

    userService = new UserService(
      prismaMock,
      redisProviderMock,
    );

    userController = new UserController(userService);

    jwtStrategy = new JwtStrategy(
      configService,
      prismaMock,
      redisProviderMock,
    );
  });

  // =========================================================================
  // F01: MPIN BYPASS & TOKEN PURPOSE RESTRICTION
  // =========================================================================
  describe('F01: MPIN Setup Token Purpose & Single-Use Enforcement', () => {
    it('should reject POST /auth/mobile/set-mpin when Authorization header carries a totp_pending token', async () => {
      const totpPendingToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'totp_pending',
      });

      await expect(
        authController.setMpin(
          { mpin: '123456' },
          `Bearer ${totpPendingToken}`,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject POST /auth/mobile/set-mpin when Authorization header carries a refresh token', async () => {
      const refreshToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'refresh',
      });

      await expect(
        authController.setMpin(
          { mpin: '123456' },
          `Bearer ${refreshToken}`,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject replayed mpin_setup token with 401 when already consumed', async () => {
      const jti = crypto.randomUUID();
      const setupToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'mpin_setup',
        jti,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        roles: [Role.COLLECTION_AGENT],
      });
      prismaMock.user.update.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        roles: [Role.COLLECTION_AGENT],
      });

      // First use: succeeds
      const firstRes = await authService.setMpin(undefined, {
        mpin: '123456',
        setupToken,
      });
      expect(firstRes.success).toBe(true);

      // Replay attempt: rejected by Redis NX atomic lock
      await expect(
        authService.setMpin(undefined, {
          mpin: '123456',
          setupToken,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should allow active access token to update MPIN in settings without issuing redundant tokens', async () => {
      const accessToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'access',
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        roles: [Role.COLLECTION_AGENT],
      });
      prismaMock.user.update.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        roles: [Role.COLLECTION_AGENT],
      });

      const res = await authController.setMpin(
        { mpin: '654321' },
        `Bearer ${accessToken}`,
      );

      expect(res.success).toBe(true);
      expect(res).not.toHaveProperty('accessToken');
    });

    it('should reject setMpin with Bearer token when token was issued before user.tokenRevokedBefore', async () => {
      const issuedAt = Math.floor(Date.now() / 1000) - 60;
      const accessToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'access',
        iat: issuedAt,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        tokenRevokedBefore: new Date(Date.now() - 10000),
        roles: [Role.COLLECTION_AGENT],
      });

      await expect(
        authController.setMpin(
          { mpin: '654321' },
          `Bearer ${accessToken}`,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject setMpin with setupToken when Redis provider is disconnected (fail-closed)', async () => {
      const setupToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'mpin_setup',
      });

      jest.spyOn(redisProviderMock, 'getIsConnected').mockReturnValueOnce(false);

      await expect(
        authController.setMpin({
          setupToken,
          mpin: '123456',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should reject setMpin when user.mustChangePassword is true', async () => {
      const accessToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'access',
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        tokenRevokedBefore: null,
        mustChangePassword: true,
        roles: [Role.COLLECTION_AGENT],
      });

      await expect(
        authController.setMpin(
          { mpin: '654321' },
          `Bearer ${accessToken}`,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // F02 & F04: AUTHORITATIVE REVOCATION & POSTGRESQL tokenRevokedBefore
  // =========================================================================
  describe('F02 & F04: Durable PostgreSQL Session Revocation & Cold Redis Invariants', () => {
    it('resetPassword stamps tokenRevokedBefore in PostgreSQL and invalidates existing access token even with cold Redis', async () => {
      const issuedAtMs = Date.now() - 5000;
      const oldAccessToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.ACCOUNTANT],
        branchId: mockBranchId,
        tokenType: 'access',
        issuedAtMs,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        name: 'Accountant Staff',
        passwordHash: defaultPasswordHash,
      });
      prismaMock.user.update.mockResolvedValue({});

      // Admin resets staff password
      await userService.resetPassword(mockUserId, { temporaryPassword: 'NewTemp#Password123!' }, mockAdminId);

      // Verify PostgreSQL update was called with tokenRevokedBefore timestamp
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenRevokedBefore: expect.any(Date),
            refreshTokenHash: null,
          }),
        }),
      );

      // Simulate cold Redis restart (no Redis keys exist)
      const coldRedisProvider: any = {
        getClient: () => ({
          get: jest.fn().mockResolvedValue(null),
          set: jest.fn(),
          del: jest.fn(),
        }),
        getIsConnected: () => true,
      };

      const coldJwtStrategy = new JwtStrategy(
        configService,
        prismaMock,
        coldRedisProvider,
      );

      // PostgreSQL returns the stamped tokenRevokedBefore date
      const revocationDate = new Date(issuedAtMs + 2000);
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        isPartner: false,
        roles: [Role.ACCOUNTANT],
        tokenRevokedBefore: revocationDate,
      });

      const payload = jwtService.verify(oldAccessToken);

      // Must be rejected by durable PostgreSQL authority!
      await expect(coldJwtStrategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('client-scoped logout on WEB revokes WEB session while preserving MOBILE session in Session vault', async () => {
      const sessionVault = new Map<string, any>();
      prismaMock.session.upsert.mockImplementation((args: any) => {
        const key = `${args.create.userId}:${args.create.clientType}`;
        sessionVault.set(key, { ...args.create });
        return Promise.resolve(args.create);
      });
      prismaMock.session.updateMany.mockImplementation((args: any) => {
        const key = `${args.where.userId || args.where.customerId}:${args.where.clientType}`;
        const record = sessionVault.get(key);
        if (record) {
          sessionVault.set(key, { ...record, ...args.data });
        }
        return Promise.resolve({ count: 1 });
      });

      // Staff user logs out specifically from WEB
      await authService.logout(mockUserId, 'WEB');

      // Verify WEB session marked revoked, and Redis web key deleted
      expect(redisClientMock.del).toHaveBeenCalledWith(`auth:session:${mockUserId}:WEB`);
    });

    it('refreshToken rejects token when payload clientType does not match requested clientType', async () => {
      const refreshToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'refresh',
        clientType: 'WEB',
      });

      await expect(
        authService.refreshToken({
          refreshToken,
          clientType: 'MOBILE',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refreshToken rejects with 401 when Session table indicates revoked session, eliminating global hash fallback', async () => {
      const refreshToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.ACCOUNTANT],
        branchId: mockBranchId,
        tokenType: 'refresh',
        clientType: 'WEB',
      });

      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        tokenRevokedBefore: null,
        refreshTokenHash: refreshHash,
      });

      redisClientMock.get.mockResolvedValue(null);

      prismaMock.session.findUnique.mockResolvedValue({
        id: 'session-001',
        userId: mockUserId,
        clientType: 'WEB',
        refreshTokenHash: refreshHash,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(
        authService.refreshToken({
          refreshToken,
          clientType: 'WEB',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refreshToken rejects with 401 when no Session row exists in PostgreSQL and Redis is cold', async () => {
      const refreshToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.ACCOUNTANT],
        branchId: mockBranchId,
        tokenType: 'refresh',
        clientType: 'WEB',
      });

      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        tokenRevokedBefore: null,
        refreshTokenHash: refreshHash,
      });

      redisClientMock.get.mockResolvedValue(null);
      prismaMock.session.findUnique.mockResolvedValue(null);

      await expect(
        authService.refreshToken({
          refreshToken,
          clientType: 'WEB',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('resetPassword propagates error and rolls back if database transaction fails', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        name: 'Accountant Staff',
      });

      prismaMock.$transaction.mockRejectedValueOnce(new Error('PostgreSQL Transaction Failed'));

      await expect(
        userService.resetPassword(mockUserId, {}, mockAdminId),
      ).rejects.toThrow('PostgreSQL Transaction Failed');
    });
  });

  // =========================================================================
  // F03: RBAC ROLE SYNCHRONIZATION & REVOCATION
  // =========================================================================
  describe('F03: Role Revocation & Live PostgreSQL Role Synchronization', () => {
    it('updateRoles invalidates old access token and updates roles in JwtStrategy', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        roles: [Role.SUPER_ADMIN, Role.ACCOUNTANT],
      });
      prismaMock.user.update.mockResolvedValue({
        id: mockUserId,
        roles: [Role.ACCOUNTANT],
      });

      // Demote user from SUPER_ADMIN
      await userController.updateRoles(
        mockUserId,
        { roles: [Role.ACCOUNTANT] },
        mockAdminId,
      );

      // Verify session revocation called
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenRevokedBefore: expect.any(Date),
            refreshTokenHash: null,
          }),
        }),
      );

      // Verify that JwtStrategy synchronizes payload.roles from DB
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        isPartner: false,
        roles: [Role.ACCOUNTANT], // Demoted in PostgreSQL
        tokenRevokedBefore: null,
      });

      const payload: any = {
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.SUPER_ADMIN], // Stale claim in JWT
        branchId: mockBranchId,
        tokenType: 'access',
      };

      const validatedPayload = await jwtStrategy.validate(payload);
      expect(validatedPayload.roles).toEqual([Role.ACCOUNTANT]);
      expect(validatedPayload.roles).not.toContain(Role.SUPER_ADMIN);
    });

    it('JwtStrategy rejects token when structured Redis cache has newer tokenRevokedBeforeMs', async () => {
      const issuedAt = Math.floor(Date.now() / 1000) - 30;
      const payload: any = {
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access',
        iat: issuedAt,
      };

      await redisClientMock.set(
        `user:status:${mockUserId}`,
        JSON.stringify({
          status: 'ACTIVE',
          tokenRevokedBeforeMs: (issuedAt + 10) * 1000,
          roles: [Role.ACCOUNTANT],
          isPartner: false,
        }),
      );

      await expect(jwtStrategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // =========================================================================
  // F10: TOTP FACTOR REPLACEMENT & CHALLENGE EXPIRY
  // =========================================================================
  describe('F10: TOTP Enrollment Challenge & Factor Replacement Guard', () => {
    it('throws BadRequestException if enableTotp is called without setup challenge initiated', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isTotpEnabled: false,
      });

      await expect(
        authService.enableTotp(mockUserId, {
          secret: 'JBSWY3DPEHPK3PXP',
          code: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException if replacing existing TOTP without account password', async () => {
      const secret = generateSecret();
      const code = generateSync({ secret });

      // Simulate active challenge in Redis
      await redisClientMock.set(`auth:totp_setup:${mockUserId}`, secret);

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isTotpEnabled: true, // Already enrolled!
        passwordHash: defaultPasswordHash,
      });

      // Calling without password
      await expect(
        authService.enableTotp(mockUserId, {
          secret,
          code,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('successfully replaces TOTP factor when valid password is provided and revokes past sessions', async () => {
      const secret = generateSecret();
      const code = generateSync({ secret });

      await redisClientMock.set(`auth:totp_setup:${mockUserId}`, secret);

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isTotpEnabled: true,
        passwordHash: defaultPasswordHash,
      });
      prismaMock.user.update.mockResolvedValue({});

      const res = await authService.enableTotp(mockUserId, {
        secret,
        code,
        password: rawDefaultPassword,
      });

      expect(res.success).toBe(true);
      // Challenge consumed from Redis
      expect(await redisClientMock.get(`auth:totp_setup:${mockUserId}`)).toBeNull();
      // Revoked previous sessions
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tokenRevokedBefore: expect.any(Date),
          }),
        }),
      );
    });

    it('setupTotp and enableTotp throw ServiceUnavailableException when Redis is offline (fail-closed)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        phone: '9842100001',
        isTotpEnabled: false,
      });

      jest.spyOn(redisProviderMock, 'getIsConnected').mockReturnValue(false);

      await expect(authService.setupTotp(mockUserId)).rejects.toThrow(
        ServiceUnavailableException,
      );

      await expect(
        authService.enableTotp(mockUserId, {
          secret: 'JBSWY3DPEHPK3PXP',
          code: '123456',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('enableTotp consumes challenge once and rejects replayed attempts', async () => {
      const secret = generateSecret();
      const code = generateSync({ secret });

      await redisClientMock.set(`auth:totp_setup:${mockUserId}`, secret);

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isTotpEnabled: false,
        passwordHash: defaultPasswordHash,
      });
      prismaMock.user.update.mockResolvedValue({});

      // First call succeeds
      const res = await authService.enableTotp(mockUserId, { secret, code });
      expect(res.success).toBe(true);

      // Replay attempt with same challenge throws BadRequestException
      await expect(
        authService.enableTotp(mockUserId, { secret, code }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // F16: DEFAULT CREDENTIAL ELIMINATION & ONBOARDING TOKEN ENFORCEMENT
  // =========================================================================
  describe('F16: First-Login Password Change Enforcement & Default Credential Elimination', () => {
    it('creates staff user with random temporary password and mustChangePassword = true', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.create.mockImplementation((args: any) => Promise.resolve({
        id: 'new-user-001',
        ...args.data,
      }));

      const created = await userService.create({
        name: 'New Agent',
        phone: '9842199999',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
      });

      expect(created).toHaveProperty('temporaryPassword');
      expect(created.temporaryPassword).not.toBe('Admin@Kumaran2026');
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mustChangePassword: true,
          }),
        }),
      );
    });

    it('login with temporary password returns onboarding_restricted token (no access/refresh tokens)', async () => {
      const mockUser: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'New Staff',
        phone: '9842100001',
        passwordHash: defaultPasswordHash,
        roles: [Role.COLLECTION_AGENT],
        isPartner: false,
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        tokenRevokedBefore: null,
        mustChangePassword: true, // Flagged!
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(mockUser);

      const res = await authService.login({
        phone: '9842100001',
        password: rawDefaultPassword,
      });

      expect(res).toHaveProperty('mustChangePassword', true);
      expect(res).toHaveProperty('tempToken');
      expect(res).not.toHaveProperty('accessToken');
      expect(res).not.toHaveProperty('refreshToken');

      // Verify token type is onboarding_restricted
      const payload: any = jwtService.verify((res as any).tempToken);
      expect(payload.tokenType).toBe('onboarding_restricted');

      // Assert JwtStrategy rejects this token for normal API access
      await expect(jwtStrategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('completeOnboarding exchanges restricted token and permanent password for full access tokens', async () => {
      const tempToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'onboarding_restricted',
      });

      const mockUser: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'New Staff',
        phone: '9842100001',
        passwordHash: defaultPasswordHash,
        roles: [Role.COLLECTION_AGENT],
        isPartner: false,
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        tokenRevokedBefore: null,
        mustChangePassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({
        ...mockUser,
        mustChangePassword: false,
      });

      const res = await authController.completeOnboarding({
        tempToken,
        newPassword: 'MyPermanentStrongPassword#2026',
      });

      expect(res).toHaveProperty('accessToken');
      expect(res).toHaveProperty('refreshToken');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUserId },
          data: expect.objectContaining({
            mustChangePassword: false,
          }),
        }),
      );
    });

    it('completeOnboarding rejects replayed onboarding token with 401 when already consumed', async () => {
      const tempToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'onboarding_restricted',
      });

      const mockUser: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'New Staff',
        phone: '9842100001',
        passwordHash: defaultPasswordHash,
        roles: [Role.COLLECTION_AGENT],
        isPartner: false,
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        tokenRevokedBefore: null,
        mustChangePassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({
        ...mockUser,
        mustChangePassword: false,
      });

      // First consumption succeeds
      const firstRes = await authController.completeOnboarding({
        tempToken,
        newPassword: 'MyPermanentStrongPassword#2026',
      });
      expect(firstRes).toHaveProperty('accessToken');

      // Second replay attempt with identical token is rejected
      await expect(
        authController.completeOnboarding({
          tempToken,
          newPassword: 'MyPermanentStrongPassword#2026',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('completeOnboarding rejects with 400 if user.mustChangePassword is already false', async () => {
      const tempToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'onboarding_restricted',
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        mustChangePassword: false, // Already completed
      });

      await expect(
        authController.completeOnboarding({
          tempToken,
          newPassword: 'AnotherStrongPassword#2026',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('completeOnboarding rejects with 401 if token was issued before user.tokenRevokedBefore', async () => {
      const issuedAt = Math.floor(Date.now() / 1000) - 120;
      const tempToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'onboarding_restricted',
        iat: issuedAt,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isActive: true,
        mustChangePassword: true,
        tokenRevokedBefore: new Date(Date.now() - 30000), // Newer revocation timestamp
      });

      await expect(
        authController.completeOnboarding({
          tempToken,
          newPassword: 'AnotherStrongPassword#2026',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('completeOnboarding issues totp_pending token instead of normal tokens if user has isTotpEnabled', async () => {
      const tempToken = jwtService.sign({
        sub: mockUserId,
        phone: '9842100001',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'onboarding_restricted',
      });

      const mockUserWithTotp: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Staff with 2FA',
        phone: '9842100001',
        passwordHash: defaultPasswordHash,
        roles: [Role.COLLECTION_AGENT],
        isPartner: false,
        isActive: true,
        totpSecret: 'encrypted-secret',
        isTotpEnabled: true,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        tokenRevokedBefore: null,
        mustChangePassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(mockUserWithTotp);
      prismaMock.user.update.mockResolvedValue({
        ...mockUserWithTotp,
        mustChangePassword: false,
      });

      const res: any = await authController.completeOnboarding({
        tempToken,
        newPassword: 'MyPermanentStrongPassword#2026',
      });

      expect(res.requiresTotp).toBe(true);
      expect(res).toHaveProperty('tempToken');
      expect(res).not.toHaveProperty('accessToken');
      expect(res).not.toHaveProperty('refreshToken');

      const decoded: any = jwtService.verify(res.tempToken);
      expect(decoded.tokenType).toBe('totp_pending');
    });

    it('loginMpin rejects login with 401 when user.mustChangePassword is true', async () => {
      const mpinHash = await bcrypt.hash('123456', 12);
      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        phone: '9842100001',
        isActive: true,
        mpinHash,
        mustChangePassword: true, // Pending onboarding
      });

      await expect(
        authService.loginMpin({
          phone: '9842100001',
          mpin: '123456',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
