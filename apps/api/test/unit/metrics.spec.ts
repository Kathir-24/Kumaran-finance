// ==============================================================================
// Kumaran Chits — Prometheus Metrics Exporter & Interceptor Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3)
// ==============================================================================

import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { DomainMetricsCollector } from '../../src/metrics/collectors/domain-metrics.collector';
import { MetricsController } from '../../src/metrics/controllers/metrics.controller';
import { MetricsAuthGuard } from '../../src/metrics/guards/metrics-auth.guard';
import { HttpMetricsInterceptor } from '../../src/metrics/interceptors/http-metrics.interceptor';
import { MetricsService } from '../../src/metrics/services/metrics.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { BullMqQueueProvider } from '../../src/jobs/providers/bullmq-queue.provider';

describe('Prometheus Metrics Exporter Suite', () => {
  let metricsService: MetricsService;
  let metricsAuthGuard: MetricsAuthGuard;
  let httpMetricsInterceptor: HttpMetricsInterceptor;
  let domainCollector: DomainMetricsCollector;
  let metricsController: MetricsController;

  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    chitGroup: { count: jest.fn().mockResolvedValue(5) },
    subscriberTicket: { count: jest.fn().mockResolvedValue(100) },
    installmentDue: { count: jest.fn().mockResolvedValue(2) },
    payment: {
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 75000n } }),
    },
    paymentReversal: { count: jest.fn().mockResolvedValue(1) },
    auctionWinner: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockQueue = {
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 2,
      active: 1,
      completed: 10,
      failed: 0,
      delayed: 0,
    }),
  };

  const mockQueueProvider = {
    getDailyMaintenanceQueue: jest.fn().mockReturnValue(mockQueue),
    getNotificationQueue: jest.fn().mockReturnValue(mockQueue),
    getReconciliationQueue: jest.fn().mockReturnValue(null),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'METRICS_USER') return 'admin';
      if (key === 'METRICS_PASSWORD') return 'chitflow_secret';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        DomainMetricsCollector,
        MetricsAuthGuard,
        HttpMetricsInterceptor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BullMqQueueProvider, useValue: mockQueueProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    metricsService = module.get<MetricsService>(MetricsService);
    metricsAuthGuard = module.get<MetricsAuthGuard>(MetricsAuthGuard);
    httpMetricsInterceptor = module.get<HttpMetricsInterceptor>(HttpMetricsInterceptor);
    domainCollector = module.get<DomainMetricsCollector>(DomainMetricsCollector);
    metricsController = module.get<MetricsController>(MetricsController);

    metricsService.onModuleInit();
  });

  describe('1. MetricsService Registry & Gauge Initialization', () => {
    it('should initialize registry with default labels and registered metrics', async () => {
      const output = await metricsService.getMetrics();
      expect(output).toContain('nodejs_');
      expect(output).toContain('http_requests_total');
      expect(output).toContain('http_request_duration_seconds');
      expect(output).toContain('chitflow_db_connected');
      expect(output).toContain('chitflow_active_chit_groups_total');
      expect(output).toContain('kumaran_sms_dispatches_total');
      expect(output).toContain('kumaran_sms_circuit_breaker_state');
      expect(metricsService.getContentType()).toContain('text/plain');
    });
  });

  describe('2. MetricsAuthGuard (HTTP Basic Auth Protection)', () => {
    const createMockContext = (authHeader?: string) => {
      const setHeader = jest.fn();
      const req = { headers: { authorization: authHeader } };
      const res = { setHeader };
      return {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
      } as unknown as ExecutionContext;
    };

    it('should reject request without authorization header and prompt Basic realm', () => {
      const ctx = createMockContext(undefined);
      expect(() => metricsAuthGuard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('should reject request with invalid credentials', () => {
      const badCreds = Buffer.from('admin:wrong_password').toString('base64');
      const ctx = createMockContext(`Basic ${badCreds}`);
      expect(() => metricsAuthGuard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('should allow request with valid Basic Auth credentials', () => {
      const validCreds = Buffer.from('admin:chitflow_secret').toString('base64');
      const ctx = createMockContext(`Basic ${validCreds}`);
      expect(metricsAuthGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('3. HttpMetricsInterceptor (Latency & Traffic Tracking)', () => {
    it('should record request duration and status code', async () => {
      const mockReq = {
        method: 'POST',
        url: '/api/v1/payments',
        originalUrl: '/api/v1/payments',
        baseUrl: '/api/v1',
        route: { path: '/payments' },
      };
      const mockRes = { statusCode: 201 };
      const ctx = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      } as unknown as ExecutionContext;

      const next = {
        handle: () => of({ success: true }),
      };

      const observeSpy = jest.spyOn(metricsService.httpRequestDurationSeconds, 'observe');
      const incSpy = jest.spyOn(metricsService.httpRequestsTotal, 'inc');

      await new Promise<void>((resolve) => {
        httpMetricsInterceptor.intercept(ctx, next).subscribe({
          complete: () => {
            // Small tick to ensure finalize callback finishes
            setTimeout(resolve, 10);
          },
        });
      });

      expect(incSpy).toHaveBeenCalledWith({
        method: 'POST',
        route: '/api/v1/payments',
        status_code: '201',
      });
      expect(observeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          route: '/api/v1/payments',
          status_code: '201',
        }),
        expect.any(Number),
      );
    });

    it('should exclude /metrics and /health from request telemetry', async () => {
      const mockReq = {
        method: 'GET',
        url: '/metrics',
        originalUrl: '/metrics',
      };
      const mockRes = { statusCode: 200 };
      const ctx = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      } as unknown as ExecutionContext;

      const next = {
        handle: () => of('metrics-data'),
      };

      const incSpy = jest.spyOn(metricsService.httpRequestsTotal, 'inc');

      await new Promise<void>((resolve) => {
        httpMetricsInterceptor.intercept(ctx, next).subscribe({
          complete: () => {
            setTimeout(resolve, 10);
          },
        });
      });

      expect(incSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. DomainMetricsCollector & MetricsController', () => {
    it('should collect live database, queue, and financial domain metrics', async () => {
      await domainCollector.collectAll();

      const output = await metricsService.getMetrics();
      expect(output).toMatch(/chitflow_db_connected\{.*\}\s+1/);
      expect(output).toMatch(/chitflow_active_chit_groups_total\{.*\}\s+5/);
      expect(output).toMatch(/chitflow_active_subscribers_total\{.*\}\s+100/);
      expect(output).toMatch(/chitflow_daily_collected_amount_rupees\{.*\}\s+75000/);
      expect(output).toContain('queue="daily-maintenance-queue"');
      expect(output).toContain('status="waiting"');
    });

    it('should return metrics with Prometheus text content type via controller', async () => {
      const setHeaderMock = jest.fn();
      const sendMock = jest.fn();
      const statusMock = jest.fn().mockReturnValue({ send: sendMock });
      const mockRes = {
        setHeader: setHeaderMock,
        status: statusMock,
      } as unknown as any;

      await metricsController.getMetrics(mockRes);

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/plain'));
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('http_requests_total'));
    });
  });

  describe('5. Module 7 Forensic Remediation Suite (Bearer Auth, TimingSafe, Cardinality Protection, Non-Blocking BigInt)', () => {
    const createMockContext = (authHeader?: string) => {
      const setHeader = jest.fn();
      const req = { headers: { authorization: authHeader } };
      const res = { setHeader };
      return {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
        setHeader,
      } as unknown as ExecutionContext & { setHeader: jest.Mock };
    };

    const makeGuard = (env: Record<string, string | null | undefined>) =>
      new MetricsAuthGuard({
        get: jest.fn((key: string) => env[key] ?? null),
      } as unknown as ConfigService);

    it('DEF-M7-MET-01: MetricsAuthGuard verifies METRICS_BEARER_TOKEN with constant-time crypto.timingSafeEqual and fails closed when unset', () => {
      const token = 'kmr_prod_metrics_token_9f8e7d6c5b4a3210';
      const prodBearerGuard = makeGuard({
        NODE_ENV: 'production',
        METRICS_BEARER_TOKEN: token,
      });

      // Valid bearer token passes
      expect(prodBearerGuard.canActivate(createMockContext(`Bearer ${token}`))).toBe(true);

      // Wrong token (different length, same length, and prefix) fails closed with UnauthorizedException (never RangeError)
      expect(() => prodBearerGuard.canActivate(createMockContext('Bearer wrong-short'))).toThrow(UnauthorizedException);
      expect(() => prodBearerGuard.canActivate(createMockContext(`Bearer ${token.slice(0, -1)}X`))).toThrow(UnauthorizedException);
      expect(() => prodBearerGuard.canActivate(createMockContext(`Bearer ${token}extra`))).toThrow(UnauthorizedException);

      // In production with only METRICS_BEARER_TOKEN set, default Basic auth MUST be rejected
      const defaultBasic = Buffer.from('admin:chitflow_secret').toString('base64');
      expect(() => prodBearerGuard.canActivate(createMockContext(`Basic ${defaultBasic}`))).toThrow(UnauthorizedException);

      // When METRICS_BEARER_TOKEN is unset in dev, Bearer header MUST fail closed
      const devBasicOnlyGuard = makeGuard({
        NODE_ENV: 'development',
        METRICS_USER: 'admin',
        METRICS_PASSWORD: 'dev_password',
      });
      expect(() => devBasicOnlyGuard.canActivate(createMockContext('Bearer anything'))).toThrow(UnauthorizedException);

      // In production & staging with BOTH METRICS_BEARER_TOKEN and METRICS_PASSWORD unset -> fail closed
      const prodUnconfigured = makeGuard({ NODE_ENV: 'production' });
      expect(() => prodUnconfigured.canActivate(createMockContext(`Bearer ${token}`))).toThrow(/Production credentials required/i);

      const stagingUnconfigured = makeGuard({ NODE_ENV: 'staging', METRICS_PASSWORD: 'chitflow_secret' });
      expect(() => stagingUnconfigured.canActivate(createMockContext(undefined))).toThrow(/Production credentials required/i);

      // R2-MET-5: Whitespace-only METRICS_PASSWORD must fail closed in production/staging
      const prodWhitespacePass = makeGuard({
        NODE_ENV: 'production',
        METRICS_USER: 'admin',
        METRICS_PASSWORD: '   ',
      });
      const wsBasic = Buffer.from('admin:   ').toString('base64');
      expect(() => prodWhitespacePass.canActivate(createMockContext(`Basic ${wsBasic}`))).toThrow(/Production credentials required/i);

      // XR-M7-MET-01: Unset NODE_ENV or non-dev/test env names ('prod', 'uat') MUST default to strict mode
      for (const strictEnvName of [undefined, '', 'prod', 'uat', 'live']) {
        const strictGuard = makeGuard({ NODE_ENV: strictEnvName });
        expect(() => strictGuard.canActivate(createMockContext(`Basic ${defaultBasic}`))).toThrow(
          /Production credentials required/i,
        );
      }

      // XR-M7-MET-01: Whitespace-padded default secret (' chitflow_secret ') rejected in strict mode
      const paddedDefaultGuard = makeGuard({
        NODE_ENV: 'production',
        METRICS_USER: 'admin',
        METRICS_PASSWORD: ' chitflow_secret ',
      });
      const paddedBasic = Buffer.from('admin: chitflow_secret ').toString('base64');
      expect(() => paddedDefaultGuard.canActivate(createMockContext(`Basic ${paddedBasic}`))).toThrow(
        /Production credentials required/i,
      );

      // XR-M7-MET-01: Even in development/test, configuring METRICS_BEARER_TOKEN disables admin:chitflow_secret Basic fallback
      const devWithBearerGuard = makeGuard({
        NODE_ENV: 'development',
        METRICS_BEARER_TOKEN: token,
      });
      expect(devWithBearerGuard.canActivate(createMockContext(`Bearer ${token}`))).toBe(true);
      expect(() => devWithBearerGuard.canActivate(createMockContext(`Basic ${defaultBasic}`))).toThrow(
        UnauthorizedException,
      );
    });

    it('DEF-M7-MET-01B: MetricsAuthGuard supports RFC 7617 Basic passwords containing colons and rejects malformed credentials', () => {
      const guard = makeGuard({
        NODE_ENV: 'production',
        METRICS_USER: 'scraper',
        METRICS_PASSWORD: 'p@ss:with:multiple:colons!',
      });

      const validBasic = Buffer.from('scraper:p@ss:with:multiple:colons!').toString('base64');
      expect(guard.canActivate(createMockContext(`Basic ${validBasic}`))).toBe(true);

      const noColonBasic = Buffer.from('scraperonly').toString('base64');
      expect(() => guard.canActivate(createMockContext(`Basic ${noColonBasic}`))).toThrow(UnauthorizedException);
    });

    it('DEF-M7-MET-02: HttpMetricsInterceptor normalizes UUIDs, domain codes, storage keys, collapses 404 scanners, and enforces fallback cardinality cap', () => {
      const interceptor = new HttpMetricsInterceptor(metricsService);

      // UUID + numeric IDs
      expect(
        interceptor.normalizeRoute(
          { originalUrl: '/api/v1/customers/550e8400-e29b-41d4-a716-446655440000/tickets/42' } as any,
          200,
        ),
      ).toBe('/api/v1/customers/:id/tickets/:id');

      // Receipt, voucher, customer, and chit group codes
      expect(
        interceptor.normalizeRoute(
          { originalUrl: '/api/v1/pdf/receipt/KC-REC-PRD-2026-00412?download=true' } as any,
          200,
        ),
      ).toBe('/api/v1/pdf/receipt/:receiptNo');

      expect(
        interceptor.normalizeRoute(
          { originalUrl: '/api/v1/pdf/voucher/KC-VOU-PRD-2026-KCA-1L-20M-01-00004' } as any,
          200,
        ),
      ).toBe('/api/v1/pdf/voucher/:voucherNo');

      expect(
        interceptor.normalizeRoute(
          { originalUrl: '/api/v1/customers/KC-CUST-00007' } as any,
          200,
        ),
      ).toBe('/api/v1/customers/:customerCode');

      expect(
        interceptor.normalizeRoute(
          { originalUrl: '/api/v1/chits/KCA-1L-20M-01/ledger/' } as any,
          200,
        ),
      ).toBe('/api/v1/chits/:groupCode/ledger');

      // Storage wildcard keys
      expect(
        interceptor.normalizeRoute(
          { originalUrl: '/api/v1/storage/file/kyc/cust-uuid/AADHAAR_FRONT-1234.jpg' } as any,
          200,
        ),
      ).toBe('/api/v1/storage/file/:key');

      // Unmatched 404 vulnerability scanner paths collapse to static __unmatched__
      expect(
        interceptor.normalizeRoute({ originalUrl: '/wp-admin/random-scan-xyz999' } as any, 404),
      ).toBe('__unmatched__');

      // Fallback cardinality cap (max 200 unique fallback routes -> overflow collapses to __other__)
      const capInterceptor = new HttpMetricsInterceptor(metricsService);
      for (let i = 0; i < 205; i++) {
        const label = capInterceptor.normalizeRoute({ originalUrl: `/fb/seg-${i}/act` } as any, 500);
        if (i >= 200) {
          expect(label).toBe('__other__');
        }
      }
    });

    it('DEF-M7-MET-02B: HttpMetricsInterceptor records accurate 4xx/5xx exception status codes and never disrupts HTTP requests if prom-client fails', async () => {
      const incSpy = jest.spyOn(metricsService.httpRequestsTotal, 'inc');
      const mockReq = {
        method: 'GET',
        url: '/api/v1/pdf/minutes/auc-1',
        originalUrl: '/api/v1/pdf/minutes/auc-1',
        route: { path: '/api/v1/pdf/minutes/:auctionId' },
      };
      // Express res.statusCode is still 200 before GlobalExceptionFilter runs!
      const mockRes = { statusCode: 200 };
      const ctx = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      } as unknown as ExecutionContext;

      await new Promise<void>((resolve) => {
        httpMetricsInterceptor
          .intercept(ctx, { handle: () => throwError(() => new ForbiddenException('Access denied')) })
          .subscribe({
            error: () => setTimeout(resolve, 10),
          });
      });

      expect(incSpy).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/v1/pdf/minutes/:auctionId',
        status_code: '403',
      });

      // Non-blocking isolation: throwing inside metricsService.httpRequestsTotal.inc MUST NOT crash response
      incSpy.mockImplementationOnce(() => {
        throw new Error('Prometheus registry write error');
      });

      let receivedValue: any;
      await new Promise<void>((resolve) => {
        httpMetricsInterceptor
          .intercept(ctx, { handle: () => of({ ok: true }) })
          .subscribe({
            next: (v) => {
              receivedValue = v;
            },
            complete: () => setTimeout(resolve, 10),
          });
      });

      expect(receivedValue).toEqual({ ok: true });
      incSpy.mockRestore();
    });

    it('DEF-M7-MET-03: DomainMetricsCollector enforces pure BigInt gauge safety, IST midnight boundary, and non-blocking failure isolation', async () => {
      // Pure BigInt conversion safety (0n, negative, MAX_SAFE_INTEGER overflow)
      expect(domainCollector.safeBigIntToGaugeValue(0n)).toBe(0);
      expect(domainCollector.safeBigIntToGaugeValue(75000n)).toBe(75000);
      expect(domainCollector.safeBigIntToGaugeValue(-500n)).toBe(0);
      expect(domainCollector.safeBigIntToGaugeValue(null)).toBe(0);
      expect(
        domainCollector.safeBigIntToGaugeValue(BigInt(Number.MAX_SAFE_INTEGER) + 999999n),
      ).toBe(Number.MAX_SAFE_INTEGER);

      // IST midnight boundary (UTC+05:30):
      // 2026-10-18T02:00:00Z is 07:30 IST on Oct 18 -> IST midnight is 2026-10-17T18:30:00.000Z
      expect(
        domainCollector.getStartOfIstDay(new Date('2026-10-18T02:00:00.000Z')).toISOString(),
      ).toBe('2026-10-17T18:30:00.000Z');
      // 2026-10-18T19:00:00Z is 00:30 IST on Oct 19 -> IST midnight is 2026-10-18T18:30:00.000Z
      expect(
        domainCollector.getStartOfIstDay(new Date('2026-10-18T19:00:00.000Z')).toISOString(),
      ).toBe('2026-10-18T18:30:00.000Z');

      // XR-M7-MET-02: Defaulter buckets count subscriberTicket by consecutiveUnpaidMonths (excluding REMOVED_DEF_3M),
      // and PRIZE_DISBURSEMENT counts finalized PENDING_VERIFICATION + finalized VERIFIED_BY_MAKER + Month N prepared settlements
      mockPrisma.auctionWinner.count
        .mockResolvedValueOnce(2) // finalized PENDING_VERIFICATION
        .mockResolvedValueOnce(3); // finalized VERIFIED_BY_MAKER
      mockPrisma.auctionWinner.findMany.mockResolvedValueOnce([
        { auction: { installmentMonth: 20, chitGroup: { durationMonths: 20 } } }, // Month N prepared (counted)
        { auction: { installmentMonth: 4, chitGroup: { durationMonths: 20 } } },  // non-Month-N SCHEDULED (excluded)
      ]);

      await domainCollector.collectAll();

      expect(mockPrisma.subscriberTicket.count).toHaveBeenCalledWith({
        where: { consecutiveUnpaidMonths: 1, status: { not: 'REMOVED_DEF_3M' } },
      });
      expect(mockPrisma.subscriberTicket.count).toHaveBeenCalledWith({
        where: { consecutiveUnpaidMonths: { gte: 3 }, status: { not: 'REMOVED_DEF_3M' } },
      });
      expect(mockPrisma.auctionWinner.count).toHaveBeenCalledWith({
        where: {
          disbursementStatus: 'PENDING_VERIFICATION',
          auction: { status: { in: ['COMPLETED', 'MINUTES_FILED'] } },
        },
      });
      expect(mockPrisma.auctionWinner.count).toHaveBeenCalledWith({
        where: {
          disbursementStatus: 'VERIFIED_BY_MAKER',
          auction: { status: { in: ['COMPLETED', 'MINUTES_FILED'] } },
        },
      });
      const kpiMetricsOutput = await metricsService.getMetrics();
      // 2 (PENDING_VERIFICATION) + 3 (finalized VERIFIED_BY_MAKER) + 1 (Month N prepared) = 6
      expect(kpiMetricsOutput).toMatch(
        /chitflow_maker_checker_pending_count\{[^}]*type="PRIZE_DISBURSEMENT"[^}]*\}\s+6/,
      );

      // DB outage sets chitflow_db_connected = 0 and never throws
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      mockQueueProvider.getDailyMaintenanceQueue.mockImplementationOnce(() => {
        throw new Error('Redis disconnected');
      });

      await expect(domainCollector.collectAll()).resolves.toBeUndefined();
      const output = await metricsService.getMetrics();
      expect(output).toMatch(/chitflow_db_connected\{.*\}\s+0/);

      // MetricsService.onModuleInit() is idempotent
      expect(() => metricsService.onModuleInit()).not.toThrow();
    });
  });
});
