import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as crypto from 'crypto';
import { AuthService } from '../../src/auth/auth.service';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { BullBoardAuthMiddleware } from '../../src/jobs/bull-board/bull-board-auth.middleware';
import { MetricsAuthGuard } from '../../src/metrics/guards/metrics-auth.guard';
import { ReportController } from '../../src/report/report.controller';
import { ReportService } from '../../src/report/report.service';

describe('Phase 4: Concurrency, Queues & SSE Streams (F11, F13, F15)', () => {
  const jwtSecret = 'test-phase-4-jwt-secret-key-32-chars-minimum!';
  const jwtService = new JwtService({ secret: jwtSecret });

  const superAdminPayload: JwtPayload = {
    sub: 'user-super-admin-001',
    phone: '+919876543210',
    roles: [Role.SUPER_ADMIN],
    branchId: 'branch-prd-001',
    tokenType: 'access',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  const branchManagerPayload: JwtPayload = {
    sub: 'user-bm-001',
    phone: '+919876543212',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-prd-001',
    tokenType: 'access',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  const customerPayload: JwtPayload = {
    sub: 'cust-alice-001',
    phone: '+919443322110',
    roles: [Role.CUSTOMER],
    branchId: null,
    tokenType: 'access',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  // ============================================================================
  // F11: Bull Board Super Admin Session Authentication & Metrics Hardening
  // ============================================================================
  describe('F11: Bull Board Queue Monitor & Metrics Authentication', () => {
    let middleware: BullBoardAuthMiddleware;
    let configServiceMock: any;
    let prismaMock: any;
    let redisMock: any;
    let redisClient: any;

    beforeEach(() => {
      configServiceMock = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return jwtSecret;
          if (key === 'BULL_BOARD_USER') return 'secure_admin';
          if (key === 'BULL_BOARD_PASSWORD') return 'secure_custom_password_2026';
          return null;
        }),
      };

      prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: superAdminPayload.sub,
            isActive: true,
            tokenRevokedBefore: null,
          }),
        },
      };

      redisClient = {
        get: jest.fn().mockResolvedValue(null),
      };

      redisMock = {
        getClient: jest.fn().mockReturnValue(redisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      middleware = new BullBoardAuthMiddleware(
        configServiceMock as any,
        prismaMock as any,
        redisMock as any,
      );
    });

    it('F11-1: Super Admin with valid Bearer token accesses Bull Board successfully', async () => {
      const token = jwtService.sign(superAdminPayload);
      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        query: {},
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.sub).toBe(superAdminPayload.sub);
    });

    it('F11-2: Super Admin with query parameter ?token= accesses Bull Board successfully', async () => {
      const token = jwtService.sign(superAdminPayload);
      const req: any = {
        headers: {},
        query: { token },
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.sub).toBe(superAdminPayload.sub);
    });

    it('F11-3: Super Admin with access_token cookie accesses Bull Board successfully', async () => {
      const token = jwtService.sign(superAdminPayload);
      const req: any = {
        headers: { cookie: `access_token=${token}` },
        query: {},
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.sub).toBe(superAdminPayload.sub);
    });

    it('F11-4: Non-Super-Admin (Branch Manager / Customer) is rejected with 403 Forbidden', async () => {
      const token = jwtService.sign(branchManagerPayload);
      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        query: {},
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringMatching(/requires Super Admin role/i),
        }),
      );
    });

    it('F11-5: Revoked session in Redis triggers 401 Unauthorized', async () => {
      // Redis cutoff is after token iat
      redisClient.get.mockResolvedValue(String(Date.now() + 100000));
      const token = jwtService.sign(superAdminPayload);
      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        query: {},
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: expect.stringMatching(/Session revoked or user deactivated/i),
        }),
      );
    });

    it('F11-6: Insecure default Basic credentials (admin:chitflow_secret) are strictly rejected', async () => {
      // Reconfigure with default credentials
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return jwtSecret;
        if (key === 'BULL_BOARD_USER') return 'admin';
        if (key === 'BULL_BOARD_PASSWORD') return 'chitflow_secret';
        return null;
      });

      const creds = Buffer.from('admin:chitflow_secret').toString('base64');
      const req: any = {
        headers: { authorization: `Basic ${creds}` },
        query: {},
      };
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('F11-7: MetricsAuthGuard rejects default credentials when NODE_ENV is production', () => {
      const prodConfigService: any = {
        get: jest.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'METRICS_USER') return 'admin';
          if (key === 'METRICS_PASSWORD') return 'chitflow_secret';
          return null;
        }),
      };
      const guard = new MetricsAuthGuard(prodConfigService);
      const context: any = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
      };

      expect(() => guard.canActivate(context)).toThrow(
        /Production credentials required/i,
      );
    });
  });

  // ============================================================================
  // F13: Atomic Redis OTP Verification & Lockout Under Concurrency
  // ============================================================================
  describe('F13: Atomic Concurrency-Safe OTP Verification via Redis Lua Script', () => {
    let authService: AuthService;
    let redisMock: any;
    let redisClient: any;
    let prismaMock: any;
    let configServiceMock: any;
    let smsServiceMock: any;

    beforeEach(() => {
      redisClient = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        ttl: jest.fn(),
        eval: jest.fn(),
      };

      redisMock = {
        getClient: jest.fn().mockReturnValue(redisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-001',
            phone: '+919876543210',
            isActive: true,
            mustChangePassword: false,
            mpinHash: 'mpin-hashed-123',
            roles: [Role.SUPER_ADMIN],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        customer: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'cust-001',
            phone: '+919443322110',
            fullName: 'Alice Walker',
            branchId: 'branch-prd-001',
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      configServiceMock = {
        get: jest.fn((key: string) => {
          if (key === 'JWT_SECRET') return jwtSecret;
          if (key === 'JWT_EXPIRES_IN') return '15m';
          if (key === 'REFRESH_TOKEN_EXPIRES_IN') return '7d';
          return null;
        }),
      };

      smsServiceMock = {
        sendOtpSms: jest.fn().mockResolvedValue({ success: true }),
      };

      authService = new AuthService(
        prismaMock as any,
        jwtService,
        configServiceMock as any,
        smsServiceMock as any,
        redisMock as any,
      );
    });

    it('F13-1: Correct OTP code via Redis Lua script succeeds and consumes session atomically', async () => {
      // Mock Redis Lua script returning SUCCESS
      redisClient.eval.mockResolvedValue(
        JSON.stringify({
          status: 'SUCCESS',
          record: {
            entityId: 'user-001',
            isCustomer: false,
            hashedOtp: crypto.createHash('sha256').update('123456').digest('hex'),
            attempts: 0,
            expiresAt: Date.now() + 300000,
          },
        }),
      );

      const result = await authService.verifyOtp({
        phone: '+919876543210',
        otp: '123456',
      });

      expect(result.verified).toBe(true);
      expect(redisClient.eval).toHaveBeenCalledTimes(1);
    });

    it('F13-2: Incorrect OTP code via Redis Lua script returns 400 with remaining attempts', async () => {
      // Mock Redis Lua script returning INVALID_CODE with 2 attempts remaining
      redisClient.eval.mockResolvedValue(
        JSON.stringify({
          status: 'INVALID_CODE',
          attempts: 1,
          remainingAttempts: 2,
        }),
      );

      await expect(
        authService.verifyOtp({
          phone: '+919876543210',
          otp: '999999', // Wrong OTP
        }),
      ).rejects.toThrow(/Invalid OTP code.*2 attempt\(s\) remaining/i);
    });

    it('F13-3: 3rd failed attempt via Redis Lua script triggers 429 lockout immediately', async () => {
      // Mock Redis Lua script returning MAX_ATTEMPTS_EXCEEDED
      redisClient.eval.mockResolvedValue(
        JSON.stringify({
          status: 'MAX_ATTEMPTS_EXCEEDED',
          attempts: 3,
        }),
      );

      await expect(
        authService.verifyOtp({
          phone: '+919876543210',
          otp: '000000',
        }),
      ).rejects.toThrow(/temporarily locked out for 5 minutes/i);
    });

    it('F13-4: Verification request during active lockout returns 429 with remaining seconds', async () => {
      redisClient.eval.mockResolvedValue(
        JSON.stringify({
          status: 'LOCKED',
          remainingSeconds: 240,
        }),
      );

      await expect(
        authService.verifyOtp({
          phone: '+919876543210',
          otp: '123456',
        }),
      ).rejects.toThrow(/temporarily locked out.*240 seconds/i);
    });
  });

  // ============================================================================
  // F15: SSE Approvals Stream Heartbeat & Session Lifecycle Guard
  // ============================================================================
  describe('F15: SSE Approvals Stream Authorization Lifecycle Guard', () => {
    let reportService: ReportService;
    let reportController: ReportController;
    let prismaMock: any;
    let redisMock: any;
    let redisClient: any;

    beforeEach(() => {
      redisClient = {
        get: jest.fn().mockResolvedValue(null),
      };

      redisMock = {
        getClient: jest.fn().mockReturnValue(redisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      prismaMock = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: superAdminPayload.sub,
            isActive: true,
            tokenRevokedBefore: null,
            roles: [Role.SUPER_ADMIN],
          }),
        },
      };

      reportService = new ReportService(
        prismaMock as any,
        {} as any, // StatutoryReportService
        redisMock as any,
      );

      reportController = new ReportController(reportService);
    });

    it('F15-1: Active Super Admin passes assertStreamAuthorization', async () => {
      await expect(
        reportService.assertStreamAuthorization(superAdminPayload),
      ).resolves.toBeUndefined();
    });

    it('F15-2: Expired access token throws UnauthorizedException and terminates stream', async () => {
      const expiredPayload: JwtPayload = {
        ...superAdminPayload,
        exp: Math.floor(Date.now() / 1000) - 10, // Expired 10s ago
      };

      await expect(
        reportService.assertStreamAuthorization(expiredPayload),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        reportService.assertStreamAuthorization(expiredPayload),
      ).rejects.toThrow(/Access token expired: SSE stream terminated/i);
    });

    it('F15-3: Revoked session cutoff in Redis throws UnauthorizedException', async () => {
      // Redis cutoff is after token iat
      redisClient.get.mockResolvedValue(String(Date.now() + 50000));

      await expect(
        reportService.assertStreamAuthorization(superAdminPayload),
      ).rejects.toThrow(/Session revoked: SSE stream terminated/i);
    });

    it('F15-4: Deactivated user account in database throws UnauthorizedException', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: superAdminPayload.sub,
        isActive: false, // Account suspended/deactivated!
        tokenRevokedBefore: null,
        roles: [Role.SUPER_ADMIN],
      });

      await expect(
        reportService.assertStreamAuthorization(superAdminPayload),
      ).rejects.toThrow(/User account deactivated: SSE stream terminated/i);
    });

    it('F15-5: User whose roles were demoted throws ForbiddenException', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: superAdminPayload.sub,
        isActive: true,
        tokenRevokedBefore: null,
        roles: [Role.CUSTOMER], // Demoted from Super Admin!
      });

      await expect(
        reportService.assertStreamAuthorization(superAdminPayload),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        reportService.assertStreamAuthorization(superAdminPayload),
      ).rejects.toThrow(/User no longer authorized for approvals stream/i);
    });
  });
});
