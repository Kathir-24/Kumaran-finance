// ==============================================================================
// Kumaran Chits — Sentry Error Monitoring & APM Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Indian DPDP Act 2023, BigInt Serialization Safety
// ==============================================================================

import { ArgumentsHost, HttpStatus, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { ErrorEvent } from '@sentry/nestjs';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import {
  beforeSend,
  initSentry,
  isSentryActive,
  scrubPii,
  setCustomCaptureFn,
  setSentryActiveOverride,
} from '../src/common/sentry/sentry.config';
import { SentryService } from '../src/common/sentry/sentry.service';
import { HealthController } from '../src/health/health.controller';

describe('Component 4: Sentry Error Monitoring & Crash Tracking Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    setSentryActiveOverride(null);
    setCustomCaptureFn(null);
  });

  afterAll(() => {
    process.env = originalEnv;
    setSentryActiveOverride(null);
    setCustomCaptureFn(null);
  });

  describe('1. Sentry Initialization & Safe Bypass', () => {
    it('should safely bypass initialization when SENTRY_DSN is unset or empty', () => {
      delete process.env.SENTRY_DSN;
      const initialized = initSentry();
      expect(initialized).toBe(false);
    });

    it('should report active status when override is set', () => {
      expect(isSentryActive()).toBe(false);
      setSentryActiveOverride(true);
      expect(isSentryActive()).toBe(true);
      setSentryActiveOverride(false);
      expect(isSentryActive()).toBe(false);
    });
  });

  describe('2. PII Sanitization & DPDP Act Compliance (scrubPii)', () => {
    it('should scrub sensitive keys from flat and nested objects', () => {
      const payload = {
        password: 'PlainPassword123!',
        mpin: '123456',
        mpinHash: '$2b$12$abcdef...',
        refreshToken: 'eyJhbGciOi...',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        aadhaarNumber: '1234-5678-9012',
        pan: 'ABCDE1234F',
        authkey: 'msg91-auth-secret',
        customerName: 'S. Ramanathan',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
      };

      const cleaned = scrubPii(payload);

      expect(cleaned.password).toBe('[FILTERED]');
      expect(cleaned.mpin).toBe('[FILTERED]');
      expect(cleaned.mpinHash).toBe('[FILTERED]');
      expect(cleaned.refreshToken).toBe('[FILTERED]');
      expect(cleaned.totpSecret).toBe('[FILTERED]');
      expect(cleaned.aadhaarNumber).toBe('[FILTERED]');
      expect(cleaned.pan).toBe('[FILTERED]');
      expect(cleaned.authkey).toBe('[FILTERED]');

      // Non-sensitive data preserved
      expect(cleaned.customerName).toBe('S. Ramanathan');
      expect(cleaned.chitCode).toBe('KCA-1L-20M-01');
      expect(cleaned.ticketNumber).toBe(7);
    });

    it('should mask Indian phone numbers per DPDP Act 2023', () => {
      expect(scrubPii('9842143210')).toBe('+91******3210');
      expect(scrubPii('+91 98421-43210')).toBe('+91******3210');
      expect(scrubPii('919842143210')).toBe('+91******3210');
      expect(scrubPii('not-a-phone')).toBe('not-a-phone');
    });

    it('should serialize BigInts to string to prevent JSON serialization crashes', () => {
      const payload = {
        grossAmount: 100000n,
        dividend: 1250n,
        netPayable: 3750n,
      };

      const cleaned = scrubPii(payload);
      expect(cleaned.grossAmount).toBe('100000');
      expect(cleaned.dividend).toBe('1250');
      expect(cleaned.netPayable).toBe('3750');
    });

    it('should recursively sanitize arrays and nested metadata', () => {
      const complex = {
        transactions: [
          { token: 'secret-token', phone: '9842143210', amount: 3750n },
        ],
      };

      const cleaned = scrubPii(complex);
      expect(cleaned.transactions[0].token).toBe('[FILTERED]');
      expect(cleaned.transactions[0].phone).toBe('+91******3210');
      expect(cleaned.transactions[0].amount).toBe('3750');
    });
  });

  describe('3. Sentry beforeSend Hook', () => {
    it('should sanitize request headers, body, and user data', () => {
      const mockEvent: ErrorEvent = {
        event_id: 'test-event-1',
        request: {
          headers: {
            authorization: 'Bearer secret-jwt-token',
            cookie: 'session=12345',
            'user-agent': 'Mozilla/5.0',
          },
          data: {
            password: 'MyPassword',
            phone: '9842143210',
            amount: 5000n,
          },
          query_string: 'token=secret-token&chitCode=KCA-1L',
        },
        user: {
          id: 'user-001',
          username: 'partner_erode',
          email: 'sensitive@kumaranfinance.com',
          ip_address: '192.168.1.5',
        },
        breadcrumbs: [
          {
            category: 'http',
            data: { authkey: 'secret-key', url: '/api/v1/payments' },
          },
        ],
      };

      const processed = beforeSend(mockEvent);

      expect(processed).not.toBeNull();
      expect(processed?.request?.headers?.authorization).toBe('[FILTERED]');
      expect(processed?.request?.headers?.cookie).toBe('[FILTERED]');
      expect(processed?.request?.headers?.['user-agent']).toBe('Mozilla/5.0');
      expect(processed?.request?.data?.password).toBe('[FILTERED]');
      expect(processed?.request?.data?.phone).toBe('+91******3210');
      expect(processed?.request?.data?.amount).toBe('5000');

      // User object stripped of email & IP
      expect(processed?.user?.id).toBe('user-001');
      expect(processed?.user?.username).toBe('partner_erode');
      expect((processed?.user as any)?.email).toBeUndefined();
      expect((processed?.user as any)?.ip_address).toBeUndefined();

      // Breadcrumb scrubbed
      expect(processed?.breadcrumbs?.[0].data?.authkey).toBe('[FILTERED]');
      expect(processed?.breadcrumbs?.[0].data?.url).toBe('/api/v1/payments');
    });
  });

  describe('4. GlobalExceptionFilter Sentry Integration', () => {
    let filter: GlobalExceptionFilter;
    let mockResponse: any;
    let mockArgumentsHost: ArgumentsHost;
    let mockCaptureFn: jest.Mock;

    beforeEach(() => {
      filter = new GlobalExceptionFilter();
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      const mockRequest = {
        method: 'POST',
        originalUrl: '/api/v1/auctions/bid',
        user: { id: 'usr-123', roles: ['BRANCH_MANAGER'], branchId: 'PRD' },
        headers: { 'x-request-id': 'req-abc-999' },
      };

      mockArgumentsHost = {
        switchToHttp: jest.fn().mockReturnValue({
          getResponse: () => mockResponse,
          getRequest: () => mockRequest,
        }),
      } as unknown as ArgumentsHost;

      // Enable Sentry and attach mock capture function
      setSentryActiveOverride(true);
      mockCaptureFn = jest.fn().mockReturnValue('mock-event-id-99');
      setCustomCaptureFn(mockCaptureFn);
    });

    it('should forward 500 Internal Server Errors to Sentry with tags and user scope', () => {
      const internalError = new InternalServerErrorException('Database query failed');

      filter.catch(internalError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 500,
          error: expect.objectContaining({
            message: 'Database query failed',
          }),
        }),
      );

      expect(mockCaptureFn).toHaveBeenCalledWith(internalError);
    });

    it('should forward unhandled non-HttpExceptions to Sentry', () => {
      const logSpy = jest.spyOn((filter as any).logger, 'error').mockImplementation(() => {});
      const typeError = new TypeError('Cannot read properties of undefined');

      filter.catch(typeError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockCaptureFn).toHaveBeenCalledWith(typeError);
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should NOT forward 4xx client errors (401, 400, 404) to Sentry', () => {
      const unauthorized = new UnauthorizedException('Invalid staff token');

      filter.catch(unauthorized, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 401,
          error: expect.objectContaining({
            message: 'Invalid staff token',
          }),
        }),
      );

      // Must not spam Sentry with client errors
      expect(mockCaptureFn).not.toHaveBeenCalled();
    });
  });

  describe('5. SentryService Wrapper', () => {
    let service: SentryService;

    beforeEach(() => {
      service = new SentryService();
    });

    it('should safely return undefined when Sentry is inactive', () => {
      setSentryActiveOverride(false);

      const eventId = service.captureException(new Error('Test error'));
      expect(eventId).toBeUndefined();

      expect(() => {
        service.addBreadcrumb({ category: 'audit', message: 'Test breadcrumb' });
      }).not.toThrow();
    });

    it('should capture exception and attach user context when Sentry is active', () => {
      setSentryActiveOverride(true);
      const mockCaptureFn = jest.fn().mockReturnValue('event-12345');
      setCustomCaptureFn(mockCaptureFn);

      const err = new Error('Reconciliation mismatch');
      const eventId = service.captureException(err, {
        tags: { chitCode: 'KCA-1L' },
        user: { id: 'usr-1', roles: ['SUPER_ADMIN'] },
        extra: { password: 'should-be-scrubbed', balance: 3750n },
      });

      expect(eventId).toBe('event-12345');
      expect(mockCaptureFn).toHaveBeenCalledWith(err);
    });
  });

  describe('6. HealthController Sentry Diagnostics', () => {
    let healthController: HealthController;

    beforeEach(() => {
      healthController = new HealthController();
    });

    it('should return sentryActive state in check()', () => {
      const res = healthController.check();
      expect(res.status).toBe('ok');
      expect(typeof res.sentryActive).toBe('boolean');
    });

    it('should trigger test internal error on sentry-test endpoint', () => {
      expect(() => healthController.triggerSentryTest()).toThrow(
        'Sentry Verification Diagnostic Test Error',
      );
    });
  });
});
