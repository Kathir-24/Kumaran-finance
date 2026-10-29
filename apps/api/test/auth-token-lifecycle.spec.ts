import {
  BadRequestException,
  ConflictException,
  NotFoundException,
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
});
