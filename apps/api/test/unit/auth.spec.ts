import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateSync } from 'otplib';
import { AuthService } from '../../src/auth/auth.service';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { SmsService } from '../../src/notification/services/sms.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Module 1: Auth & Staff Identity Tests', () => {
  let authService: AuthService;
  let prismaMock: any;
  let jwtService: JwtService;
  let configService: ConfigService;
  let smsServiceMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockUserId = 'user-admin-001';
  const rawPassword = 'Admin@Kumaran2026';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(rawPassword, 12);
  });

  beforeEach(() => {
    smsServiceMock = {
      sendOtpSms: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-otp-123' }),
      sendPaymentReceiptSms: jest.fn(),
      sendAuctionReminderSms: jest.fn(),
      sendDefaultWarningSms: jest.fn(),
    };

    prismaMock = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-secret-key-1234567890-test',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
    });

    jwtService = new JwtService({
      secret: 'test-secret-key-1234567890-test',
      signOptions: { expiresIn: '15m' },
    });

    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      jwtService,
      configService,
      smsServiceMock as unknown as SmsService,
    );
  });

  describe('1. Web Login & Password Authentication', () => {
    it('should authenticate user successfully with correct phone and password', async () => {
      const mockUser: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Kumaran Partner Admin',
        phone: '9876543210',
        passwordHash,
        roles: [Role.SUPER_ADMIN],
        isPartner: true,
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({ ...mockUser, lastLoginAt: new Date() });

      const result = await authService.login({
        phone: '9876543210',
        password: rawPassword,
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      if ('user' in result) {
        expect(result.user.phone).toBe('9876543210');
        expect(result.user.roles).toContain(Role.SUPER_ADMIN);
      }
      expect(prismaMock.user.update).toHaveBeenCalled();
    });

    it('should reject login if password is incorrect (401 Unauthorized)', async () => {
      const mockUser: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Kumaran Partner Admin',
        phone: '9876543210',
        passwordHash,
        roles: [Role.SUPER_ADMIN],
        isPartner: true,
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        authService.login({
          phone: '9876543210',
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login if user account is deactivated (401 Unauthorized)', async () => {
      const inactiveUser: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Deactivated Staff',
        phone: '9876543210',
        passwordHash,
        roles: [Role.COLLECTION_AGENT],
        isPartner: false,
        isActive: false,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(inactiveUser);

      await expect(
        authService.login({
          phone: '9876543210',
          password: rawPassword,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('2. RFC 6238 TOTP 2FA Authentication', () => {
    it('should challenge for TOTP code when user has 2FA enabled', async () => {
      const totpSecret = generateSecret();
      const mockUserWithTotp: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Kumaran Partner Admin',
        phone: '9876543210',
        passwordHash,
        roles: [Role.SUPER_ADMIN],
        isPartner: true,
        isActive: true,
        totpSecret,
        isTotpEnabled: true,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(mockUserWithTotp);

      const loginResult = await authService.login({
        phone: '9876543210',
        password: rawPassword,
      });

      expect(loginResult).toHaveProperty('requireTotp', true);
      expect(loginResult).toHaveProperty('tempToken');
      if ('tempToken' in loginResult) {
        expect(typeof loginResult.tempToken).toBe('string');
      }
    });

    it('should complete login when valid 6-digit TOTP code is provided', async () => {
      const totpSecret = generateSecret();
      const mockUserWithTotp: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Kumaran Partner Admin',
        phone: '9876543210',
        passwordHash,
        roles: [Role.SUPER_ADMIN],
        isPartner: true,
        isActive: true,
        totpSecret,
        isTotpEnabled: true,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(mockUserWithTotp);
      prismaMock.user.findUnique.mockResolvedValue(mockUserWithTotp);
      prismaMock.user.update.mockResolvedValue(mockUserWithTotp);

      const loginResult = await authService.login({
        phone: '9876543210',
        password: rawPassword,
      });

      const validTotpCode = generateSync({ secret: totpSecret });

      if (!('tempToken' in loginResult)) throw new Error('Expected tempToken');

      const verifyResult = await authService.verifyTotp({
        tempToken: loginResult.tempToken,
        totpCode: validTotpCode,
      });

      expect(verifyResult).toHaveProperty('accessToken');
      expect(verifyResult).toHaveProperty('refreshToken');
      expect(verifyResult.user.id).toBe(mockUserId);
    });

    it('should reject invalid 6-digit TOTP code (401 Unauthorized)', async () => {
      const totpSecret = generateSecret();
      const mockUserWithTotp: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Kumaran Partner Admin',
        phone: '9876543210',
        passwordHash,
        roles: [Role.SUPER_ADMIN],
        isPartner: true,
        isActive: true,
        totpSecret,
        isTotpEnabled: true,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(mockUserWithTotp);
      prismaMock.user.findUnique.mockResolvedValue(mockUserWithTotp);

      const loginResult = await authService.login({
        phone: '9876543210',
        password: rawPassword,
      });

      if (!('tempToken' in loginResult)) throw new Error('Expected tempToken');

      await expect(
        authService.verifyTotp({
          tempToken: loginResult.tempToken,
          totpCode: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should encrypt totpSecret with AES-256-GCM before storing in database', async () => {
      const rawSecret = generateSecret();
      const code = generateSync({ secret: rawSecret });

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockUserId,
        isTotpEnabled: false,
      });
      prismaMock.user.update.mockResolvedValue({});

      const res = await authService.enableTotp(mockUserId, { secret: rawSecret, code });
      expect(res.success).toBe(true);

      const updateCall = prismaMock.user.update.mock.calls[0][0];
      expect(updateCall.data.isTotpEnabled).toBe(true);
      expect(updateCall.data.totpSecret).not.toBe(rawSecret);
      expect(updateCall.data.totpSecret).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    });
  });

  describe('3. Token Refresh and Session Revocation (Logout)', () => {
    it('should rotate access and refresh tokens successfully', async () => {
      const mockUser: User = {
        id: mockUserId,
        branchId: mockBranchId,
        name: 'Kumaran Partner Admin',
        phone: '9876543210',
        passwordHash,
        roles: [Role.SUPER_ADMIN],
        isPartner: true,
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
        fcmToken: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findFirst.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue(mockUser);

      const loginRes = await authService.login({
        phone: '9876543210',
        password: rawPassword,
      });

      if (!('refreshToken' in loginRes)) throw new Error('Expected refreshToken in login response');
      const refreshToken = loginRes.refreshToken;
      const hashed = await bcrypt.hash(refreshToken, 12);

      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshTokenHash: hashed,
      });

      const refreshRes = await authService.refreshToken({ refreshToken });
      expect(refreshRes).toHaveProperty('accessToken');
      expect(refreshRes).toHaveProperty('refreshToken');
    });

    it('should successfully rotate tokens for Chit Subscriber (Role.CUSTOMER)', async () => {
      const customerId = 'cust-uuid-999';
      const mockCustomer = {
        id: customerId,
        fullName: 'K. Subscriber',
        phone: '9876500001',
        branchId: 'branch-uuid-001',
      };

      const customerPayload = {
        sub: customerId,
        phone: mockCustomer.phone,
        roles: [Role.CUSTOMER],
        branchId: mockCustomer.branchId,
        tokenType: 'refresh',
      };
      const customerRefreshToken = jwtService.sign(customerPayload, { expiresIn: '7d' });
      const hashedRefreshToken = await bcrypt.hash(customerRefreshToken, 12);

      prismaMock.customer.findUnique.mockResolvedValue({
        ...mockCustomer,
        refreshTokenHash: hashedRefreshToken,
      });
      prismaMock.customer.update.mockResolvedValue({
        ...mockCustomer,
        refreshTokenHash: hashedRefreshToken,
      });

      const refreshRes = await authService.refreshToken({ refreshToken: customerRefreshToken });
      expect(refreshRes).toHaveProperty('accessToken');
      expect(refreshRes).toHaveProperty('refreshToken');
      expect(refreshRes.user.roles).toContain(Role.CUSTOMER);
      expect(refreshRes.user.name).toBe(mockCustomer.fullName);
      expect(prismaMock.customer.update).toHaveBeenCalled();
    });

    it('should clear refresh token and fcmToken on staff logout', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: mockUserId });
      prismaMock.user.update.mockResolvedValue({});

      const result = await authService.logout(mockUserId);
      expect(result.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { refreshTokenHash: null, fcmToken: null },
      });
    });

    it('should clear refreshTokenHash and fcmToken on customer logout without touching User table', async () => {
      const customerId = 'cust-uuid-888';
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.customer.findUnique.mockResolvedValue({ id: customerId });
      prismaMock.customer.update.mockResolvedValue({});

      const result = await authService.logout(customerId);
      expect(result.success).toBe(true);
      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: customerId },
        data: { refreshTokenHash: null, fcmToken: null },
      });
    });
  });

  describe('4. RolesGuard Authorization & Multi-Role Support', () => {
    let reflector: Reflector;
    let rolesGuard: RolesGuard;

    beforeEach(() => {
      reflector = new Reflector();
      rolesGuard = new RolesGuard(reflector);
    });

    const createMockExecutionContext = (userPayload: any) => {
      return {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: userPayload }),
        }),
      } as any;
    };

    it('should allow access if no roles are defined on the endpoint', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const context = createMockExecutionContext({
        sub: mockUserId,
        roles: [Role.COLLECTION_AGENT],
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if user has the required SUPER_ADMIN role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SUPER_ADMIN]);

      const context = createMockExecutionContext({
        sub: mockUserId,
        roles: [Role.SUPER_ADMIN],
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if user has one of multi-roles (e.g. COLLECTION_AGENT wearing ACCOUNTANT hat)', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ACCOUNTANT]);

      const context = createMockExecutionContext({
        sub: mockUserId,
        roles: [Role.COLLECTION_AGENT, Role.ACCOUNTANT],
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException if user lacks required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SUPER_ADMIN]);

      const context = createMockExecutionContext({
        sub: mockUserId,
        roles: [Role.COLLECTION_AGENT],
      });

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('5. User Device FCM Push Token Registration', () => {
    const mockUser = {
      id: mockUserId,
      phone: '9842143210',
      roles: [Role.COLLECTION_AGENT],
      isActive: true,
    } as any;

    it('should register a valid FCM token for the user', async () => {
      const mockToken = 'fcm-device-token-sample-12345';
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({
        id: mockUserId,
        roles: [Role.COLLECTION_AGENT],
        fcmToken: mockToken,
        updatedAt: new Date(),
      });

      const res = await authService.updateFcmToken(mockUserId, mockToken);
      expect(res.success).toBe(true);
      expect(res.fcmToken).toBe(mockToken);
      expect(res.message).toContain('registered successfully');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { fcmToken: mockToken },
        select: expect.any(Object),
      });
    });

    it('should deregister/clear the FCM token when token is null', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockUser);
      prismaMock.user.update.mockResolvedValue({
        id: mockUserId,
        roles: [Role.COLLECTION_AGENT],
        fcmToken: null,
        updatedAt: new Date(),
      });

      const res = await authService.updateFcmToken(mockUserId, null);
      expect(res.success).toBe(true);
      expect(res.fcmToken).toBeNull();
      expect(res.message).toContain('deregistered successfully');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { fcmToken: null },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user is not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.updateFcmToken('unknown-user-id', 'some-token'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('6. Mobile First-Time Onboarding (SMS-OTP & MPIN Setup)', () => {
    const staffPhone = '9876543210';
    const customerPhone = '9842100101';

    const mockStaffUser: User = {
      id: mockUserId,
      branchId: mockBranchId,
      name: 'Kumaran Partner Admin',
      phone: staffPhone,
      passwordHash,
      roles: [Role.SUPER_ADMIN],
      isPartner: true,
      isActive: true,
      totpSecret: null,
      isTotpEnabled: false,
      mpinHash: null,
      refreshTokenHash: null,
      fcmToken: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockCustomer = {
      id: 'cust-uuid-001',
      branchId: mockBranchId,
      customerCode: 'KC-CUST-00101',
      fullName: 'K. Thangavel',
      phone: customerPhone,
      isKycVerified: true,
    };

    it('should dispatch SMS OTP successfully for registered staff user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);

      const res = await authService.requestOtp({ phone: staffPhone });
      expect(res.success).toBe(true);
      expect(res.expiresInSeconds).toBe(300);
      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledWith(
        staffPhone,
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('should dispatch SMS OTP successfully for registered subscriber/customer', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);

      const res = await authService.requestOtp({ phone: customerPhone });
      expect(res.success).toBe(true);
      expect(smsServiceMock.sendOtpSms).toHaveBeenCalledWith(
        customerPhone,
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('should throw NotFoundException if phone number is not found in staff or customer records', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        authService.requestOtp({ phone: '9999999999' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException if staff account is deactivated', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockStaffUser,
        isActive: false,
      });

      await expect(
        authService.requestOtp({ phone: staffPhone }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should verify OTP and return mpin_setup token for staff without MPIN', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      await authService.requestOtp({ phone: staffPhone });

      const sentOtp = smsServiceMock.sendOtpSms.mock.calls[0][1];

      const verifyRes = await authService.verifyOtp({
        phone: staffPhone,
        otp: sentOtp,
      });

      expect(verifyRes.verified).toBe(true);
      expect((verifyRes as any).setupToken).toBeDefined();

      const decoded = jwtService.verify((verifyRes as any).setupToken!) as any;
      expect(decoded.tokenType).toBe('mpin_setup');
      expect(decoded.sub).toBe(mockUserId);
    });

    it('should verify OTP and return full session tokens for subscribers', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.customer.findUnique.mockResolvedValue(mockCustomer);
      await authService.requestOtp({ phone: customerPhone });

      const sentOtp = smsServiceMock.sendOtpSms.mock.calls[0][1];

      const verifyRes = await authService.verifyOtp({
        phone: customerPhone,
        otp: sentOtp,
      });

      expect(verifyRes.verified).toBe(true);
      if ('accessToken' in verifyRes) {
        expect(verifyRes.accessToken).toBeDefined();
        expect(verifyRes.refreshToken).toBeDefined();
        expect(verifyRes.user.roles).toContain(Role.CUSTOMER);
      }
    });

    it('should throw BadRequestException if OTP code is incorrect', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      await authService.requestOtp({ phone: staffPhone });

      await expect(
        authService.verifyOtp({
          phone: staffPhone,
          otp: '000000',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set MPIN using valid setupToken and return full session tokens', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue({
        ...mockStaffUser,
        mpinHash: '$2b$12$newMpinHash',
      });

      const tempPayload = {
        sub: mockUserId,
        phone: staffPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'mpin_setup' as const,
      };
      const setupToken = jwtService.sign(tempPayload, { expiresIn: '10m' });

      const setMpinRes = await authService.setMpin(undefined, {
        mpin: '123456',
        setupToken,
      });

      expect(setMpinRes.success).toBe(true);
      expect((setMpinRes as any).accessToken).toBeDefined();
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUserId },
          data: expect.objectContaining({
            mpinHash: expect.any(String),
          }),
        }),
      );
    });

    it('should store OTP in Redis with 300s TTL and delete upon successful verification when Redis is connected', async () => {
      const mockRedisClient = {
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn(),
        del: jest.fn().mockResolvedValue(1),
        ttl: jest.fn().mockImplementation((key: string) => {
          if (key.startsWith('auth:otp:') && !key.includes('lockout') && !key.includes('cooldown')) {
            return Promise.resolve(295);
          }
          return Promise.resolve(-2);
        }),
      };
      const mockRedisProvider = {
        getClient: jest.fn().mockReturnValue(mockRedisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      const redisAuthService = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtService,
        configService,
        smsServiceMock as unknown as SmsService,
        mockRedisProvider as any,
      );

      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      await redisAuthService.requestOtp({ phone: staffPhone });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `auth:otp:${staffPhone}`,
        expect.any(String),
        'EX',
        300,
      );

      const savedPayload = JSON.parse(mockRedisClient.set.mock.calls[0][1]);
      const sentOtp = smsServiceMock.sendOtpSms.mock.calls[smsServiceMock.sendOtpSms.mock.calls.length - 1][1];

      mockRedisClient.get.mockResolvedValue(JSON.stringify(savedPayload));

      const verifyRes = await redisAuthService.verifyOtp({
        phone: staffPhone,
        otp: sentOtp,
      });

      expect(verifyRes.verified).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `auth:otp:${staffPhone}`,
        `auth:otp:cooldown:${staffPhone}`,
        `auth:otp:lockout:${staffPhone}`,
      );
    });

    it('should increment attempts in Redis on mismatch and lockout after 3 failed attempts', async () => {
      const mockRedisClient = {
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn(),
        del: jest.fn().mockResolvedValue(1),
        ttl: jest.fn().mockImplementation((key: string) => {
          if (key.startsWith('auth:otp:') && !key.includes('lockout') && !key.includes('cooldown')) {
            return Promise.resolve(280);
          }
          return Promise.resolve(-2);
        }),
      };
      const mockRedisProvider = {
        getClient: jest.fn().mockReturnValue(mockRedisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      const redisAuthService = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtService,
        configService,
        smsServiceMock as unknown as SmsService,
        mockRedisProvider as any,
      );

      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      await redisAuthService.requestOtp({ phone: staffPhone });

      const savedPayload = JSON.parse(mockRedisClient.set.mock.calls[0][1]);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(savedPayload));

      // Attempt 1: wrong OTP
      await expect(
        redisAuthService.verifyOtp({ phone: staffPhone, otp: '000000' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `auth:otp:${staffPhone}`,
        expect.any(String),
        'EX',
        280,
      );

      // Attempt 3: triggers 5-minute lockout penalty and removes active OTP
      savedPayload.attempts = 2; // Increments to 3 on verify
      mockRedisClient.get.mockResolvedValue(JSON.stringify(savedPayload));

      await expect(
        redisAuthService.verifyOtp({ phone: staffPhone, otp: '000000' }),
      ).rejects.toThrow('Too many invalid verification attempts');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `auth:otp:lockout:${staffPhone}`,
        expect.any(String),
        'EX',
        300,
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(`auth:otp:${staffPhone}`);
    });
  });
});
