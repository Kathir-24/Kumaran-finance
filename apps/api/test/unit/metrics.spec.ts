// ==============================================================================
// Kumaran Chits — Prometheus Metrics Exporter & Interceptor Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3)
// ==============================================================================

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
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
    auctionWinner: { count: jest.fn().mockResolvedValue(0) },
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
});
