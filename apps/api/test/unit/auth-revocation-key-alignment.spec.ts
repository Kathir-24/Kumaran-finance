// ==============================================================================
// Kumaran Chits — Issue AUTH-01 Unit Test Suite
// Auth Session Token Revocation Key Alignment Verification
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: ADR-27, SEC-A, Guardrail 10/11 & docs/03-architecture/redis-architecture.md
// ==============================================================================

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { BullBoardAuthMiddleware } from '../../src/jobs/bull-board/bull-board-auth.middleware';
import { ReportService } from '../../src/report/report.service';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';

describe('AUTH-01: Auth Revocation Redis Key Alignment (auth:revoked_before:${sub})', () => {
  const JWT_SECRET = 'test_jwt_secret_perundurai_2026';
  const mockSub = 'user-superadmin-uuid-001';
  const mockPhone = '+919842100001';

  let jwtService: JwtService;
  let configServiceMock: jest.Mocked<ConfigService>;
  let redisClientMock: { get: jest.Mock };
  let redisProviderMock: any;
  let prismaMock: any;

  beforeEach(() => {
    jwtService = new JwtService({ secret: JWT_SECRET });

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return JWT_SECRET;
        if (key === 'BULL_BOARD_USER') return 'partner_admin';
        if (key === 'BULL_BOARD_PASSWORD') return 'secret_perundurai_2026';
        return null;
      }),
    } as any;

    redisClientMock = {
      get: jest.fn().mockResolvedValue(null),
    };

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockSub,
          isActive: true,
          tokenRevokedBefore: null,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
        }),
      },
      session: {
        findUnique: jest.fn(),
      },
    };
  });

  // ============================================================================
  // Part 1: BullBoardAuthMiddleware Token Revocation Key Alignment
  // ============================================================================
  describe('1. BullBoardAuthMiddleware', () => {
    let middleware: BullBoardAuthMiddleware;

    beforeEach(() => {
      middleware = new BullBoardAuthMiddleware(
        configServiceMock,
        prismaMock,
        redisProviderMock,
      );
    });

    describe('isUserRevokedOrInactive internal guard', () => {
      it('returns true (revoked) when token iat is before revocation cutoff', async () => {
        const tokenIatSeconds = 1700000000;
        // Revocation cutoff is 100 seconds after token issuance (token is revoked)
        const cutoffMs = (tokenIatSeconds + 100) * 1000;
        redisClientMock.get.mockResolvedValue(String(cutoffMs));

        const payload: JwtPayload = {
          sub: mockSub,
          phone: mockPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
          tokenType: 'access',
          iat: tokenIatSeconds,
          exp: tokenIatSeconds + 3600,
        };

        const isRevoked = await (middleware as any).isUserRevokedOrInactive(payload);

        expect(isRevoked).toBe(true);
        // Authoritative key assertion: MUST query auth:revoked_before:${sub}
        expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
        // Mismatched legacy key assertion: MUST NOT query auth:revoked:${sub}
        expect(redisClientMock.get).not.toHaveBeenCalledWith(`auth:revoked:${mockSub}`);
      });

      it('returns false (valid) when token iat is after revocation cutoff', async () => {
        const tokenIatSeconds = 1700000000;
        // Revocation cutoff is 100 seconds before token issuance (token was issued fresh)
        const cutoffMs = (tokenIatSeconds - 100) * 1000;
        redisClientMock.get.mockResolvedValue(String(cutoffMs));

        const payload: JwtPayload = {
          sub: mockSub,
          phone: mockPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
          tokenType: 'access',
          iat: tokenIatSeconds,
          exp: tokenIatSeconds + 3600,
        };

        const isRevoked = await (middleware as any).isUserRevokedOrInactive(payload);

        expect(isRevoked).toBe(false);
        expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
        expect(redisClientMock.get).not.toHaveBeenCalledWith(`auth:revoked:${mockSub}`);
      });

      it('correctly handles Unix seconds format cutoffs (< 1_000_000_000_000)', async () => {
        const tokenIatSeconds = 1700000000;
        const cutoffSeconds = tokenIatSeconds + 50; // revoked
        redisClientMock.get.mockResolvedValue(String(cutoffSeconds));

        const payload: JwtPayload = {
          sub: mockSub,
          phone: mockPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
          tokenType: 'access',
          iat: tokenIatSeconds,
          exp: tokenIatSeconds + 3600,
        };

        const isRevoked = await (middleware as any).isUserRevokedOrInactive(payload);
        expect(isRevoked).toBe(true);
      });

      it('correctly checks client-scoped revocation key auth:revoked_before:${sub}:${clientType}', async () => {
        const tokenIatSeconds = 1700000000;
        const cutoffMs = (tokenIatSeconds + 200) * 1000;

        // Global cutoff is null, but client-specific WEB cutoff is set
        redisClientMock.get.mockImplementation(async (key: string) => {
          if (key === `auth:revoked_before:${mockSub}`) return null;
          if (key === `auth:revoked_before:${mockSub}:WEB`) return String(cutoffMs);
          return null;
        });

        const payload: JwtPayload = {
          sub: mockSub,
          phone: mockPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
          tokenType: 'access',
          clientType: 'WEB',
          iat: tokenIatSeconds,
          exp: tokenIatSeconds + 3600,
        };

        const isRevoked = await (middleware as any).isUserRevokedOrInactive(payload);

        expect(isRevoked).toBe(true);
        expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
        expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}:WEB`);
      });

      it('falls back safely to PostgreSQL check when Redis throws an unexpected error', async () => {
        redisClientMock.get.mockRejectedValue(new Error('Redis cluster connection timeout'));

        const payload: JwtPayload = {
          sub: mockSub,
          phone: mockPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
          tokenType: 'access',
          iat: 1700000000,
          exp: 1700003600,
        };

        // When DB user is active, fallback returns false (valid) without throwing
        const isRevoked = await (middleware as any).isUserRevokedOrInactive(payload);
        expect(isRevoked).toBe(false);
        expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
          where: { id: mockSub },
          select: { isActive: true, tokenRevokedBefore: true },
        });
      });
    });

    describe('use() HTTP middleware execution flow', () => {
      let mockReq: any;
      let mockRes: any;
      let mockNext: jest.Mock;

      beforeEach(() => {
        mockReq = { headers: {} };
        mockRes = {
          setHeader: jest.fn(),
          status: jest.fn().mockReturnThis(),
          send: jest.fn(),
        };
        mockNext = jest.fn();
      });

      it('rejects with 401 Unauthorized when token iat is before revocation cutoff', async () => {
        const tokenIatSeconds = Math.floor(Date.now() / 1000) - 500;
        const cutoffMs = Date.now(); // Cutoff is now, issued 500s ago -> revoked
        redisClientMock.get.mockResolvedValue(String(cutoffMs));

        const token = jwtService.sign({
          sub: mockSub,
          phone: mockPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
          tokenType: 'access',
          iat: tokenIatSeconds,
          exp: tokenIatSeconds + 3600,
        });

        mockReq.headers.authorization = `Bearer ${token}`;

        await middleware.use(mockReq, mockRes, mockNext);

        expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.send).toHaveBeenCalledWith(
          expect.stringContaining('Session revoked or user deactivated'),
        );
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('calls next() successfully when token iat is after revocation cutoff', async () => {
        const tokenIatSeconds = Math.floor(Date.now() / 1000);
        const cutoffMs = (tokenIatSeconds - 500) * 1000; // Cutoff was 500s ago -> token valid
        redisClientMock.get.mockResolvedValue(String(cutoffMs));

        const token = jwtService.sign({
          sub: mockSub,
          phone: mockPhone,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
          tokenType: 'access',
          iat: tokenIatSeconds,
          exp: tokenIatSeconds + 3600,
        });

        mockReq.headers.authorization = `Bearer ${token}`;

        await middleware.use(mockReq, mockRes, mockNext);

        expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // Part 2: ReportService.assertStreamAuthorization Token Revocation Key Alignment
  // ============================================================================
  describe('2. ReportService.assertStreamAuthorization', () => {
    let reportService: ReportService;

    beforeEach(() => {
      reportService = new ReportService(
        prismaMock,
        {} as any, // StatutoryReportService
        redisProviderMock,
      );
    });

    it('throws UnauthorizedException when token iat is before revocation cutoff', async () => {
      const tokenIatSeconds = Math.floor(Date.now() / 1000) - 300;
      const cutoffMs = Date.now(); // Cutoff is current time -> token is revoked
      redisClientMock.get.mockResolvedValue(String(cutoffMs));

      const payload: JwtPayload = {
        sub: mockSub,
        phone: mockPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: null,
        tokenType: 'access',
        iat: tokenIatSeconds,
        exp: tokenIatSeconds + 3600,
      };

      await expect(
        reportService.assertStreamAuthorization(payload),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        reportService.assertStreamAuthorization(payload),
      ).rejects.toThrow('Session revoked: SSE stream terminated');

      // Authoritative key assertion: MUST query auth:revoked_before:${sub}
      expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
      // Mismatched legacy key assertion: MUST NOT query auth:revoked:${sub}
      expect(redisClientMock.get).not.toHaveBeenCalledWith(`auth:revoked:${mockSub}`);
    });

    it('does not throw when token iat is after revocation cutoff', async () => {
      const tokenIatSeconds = Math.floor(Date.now() / 1000);
      const cutoffMs = (tokenIatSeconds - 300) * 1000; // Cutoff was 300s ago -> token is valid
      redisClientMock.get.mockResolvedValue(String(cutoffMs));

      const payload: JwtPayload = {
        sub: mockSub,
        phone: mockPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: null,
        tokenType: 'access',
        iat: tokenIatSeconds,
        exp: tokenIatSeconds + 3600,
      };

      await expect(
        reportService.assertStreamAuthorization(payload),
      ).resolves.toBeUndefined();

      expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
      expect(redisClientMock.get).not.toHaveBeenCalledWith(`auth:revoked:${mockSub}`);
    });

    it('throws UnauthorizedException on client-scoped revocation (auth:revoked_before:${sub}:${clientType})', async () => {
      const tokenIatSeconds = Math.floor(Date.now() / 1000) - 200;
      const cutoffMs = Date.now();

      redisClientMock.get.mockImplementation(async (key: string) => {
        if (key === `auth:revoked_before:${mockSub}`) return null;
        if (key === `auth:revoked_before:${mockSub}:WEB`) return String(cutoffMs);
        return null;
      });

      const payload: JwtPayload = {
        sub: mockSub,
        phone: mockPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: null,
        tokenType: 'access',
        clientType: 'WEB',
        iat: tokenIatSeconds,
        exp: tokenIatSeconds + 3600,
      };

      await expect(
        reportService.assertStreamAuthorization(payload),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        reportService.assertStreamAuthorization(payload),
      ).rejects.toThrow('Session revoked: SSE stream terminated');

      expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}`);
      expect(redisClientMock.get).toHaveBeenCalledWith(`auth:revoked_before:${mockSub}:WEB`);
    });

    it('gracefully falls through to PostgreSQL check when Redis throws an unexpected error', async () => {
      redisClientMock.get.mockRejectedValue(new Error('Redis cluster read timeout'));

      const nowSeconds = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: mockSub,
        phone: mockPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: null,
        tokenType: 'access',
        iat: nowSeconds - 100,
        exp: nowSeconds + 3600,
      };

      // Since DB user is active with no tokenRevokedBefore, it resolves cleanly
      await expect(
        reportService.assertStreamAuthorization(payload),
      ).resolves.toBeUndefined();

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockSub },
        select: {
          isActive: true,
          tokenRevokedBefore: true,
          roles: true,
          branchId: true,
        },
      });
    });

    it('does not invoke Redis check when RedisProvider is disconnected', async () => {
      redisProviderMock.getIsConnected.mockReturnValue(false);

      const nowSeconds = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: mockSub,
        phone: mockPhone,
        roles: [Role.SUPER_ADMIN],
        branchId: null,
        tokenType: 'access',
        iat: nowSeconds - 100,
        exp: nowSeconds + 3600,
      };

      await expect(
        reportService.assertStreamAuthorization(payload),
      ).resolves.toBeUndefined();

      expect(redisClientMock.get).not.toHaveBeenCalled();
      expect(prismaMock.user.findUnique).toHaveBeenCalled();
    });
  });
});
