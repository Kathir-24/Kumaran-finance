import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateSync } from 'otplib';
import { AuthService } from '../src/auth/auth.service';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Module 1: Auth & Staff Identity Tests', () => {
  let authService: AuthService;
  let prismaMock: any;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockBranchId = 'branch-prd-001';
  const mockUserId = 'user-admin-001';
  const rawPassword = 'Admin@Kumaran2026';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(rawPassword, 12);
  });

  beforeEach(() => {
    prismaMock = {
      user: {
        findFirst: jest.fn(),
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
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
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
      expect(result.user.phone).toBe('9876543210');
      expect(result.user.roles).toContain(Role.SUPER_ADMIN);
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
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
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
        isActive: false,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
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
        isActive: true,
        totpSecret,
        isTotpEnabled: true,
        mpinHash: null,
        refreshTokenHash: null,
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
      expect(typeof loginResult.tempToken).toBe('string');
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
        isActive: true,
        totpSecret,
        isTotpEnabled: true,
        mpinHash: null,
        refreshTokenHash: null,
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

      const verifyResult = await authService.verifyTotp({
        tempToken: loginResult.tempToken!,
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
        isActive: true,
        totpSecret,
        isTotpEnabled: true,
        mpinHash: null,
        refreshTokenHash: null,
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

      await expect(
        authService.verifyTotp({
          tempToken: loginResult.tempToken!,
          totpCode: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
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
        isActive: true,
        totpSecret: null,
        isTotpEnabled: false,
        mpinHash: null,
        refreshTokenHash: null,
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

      const refreshToken = loginRes.refreshToken!;
      const hashed = await bcrypt.hash(refreshToken, 12);

      prismaMock.user.findUnique.mockResolvedValue({
        ...mockUser,
        refreshTokenHash: hashed,
      });

      const refreshRes = await authService.refreshToken({ refreshToken });
      expect(refreshRes).toHaveProperty('accessToken');
      expect(refreshRes).toHaveProperty('refreshToken');
    });

    it('should clear refresh token and fcmToken on logout', async () => {
      prismaMock.user.update.mockResolvedValue({});

      const result = await authService.logout(mockUserId);
      expect(result.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
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
});
