// ==============================================================================
// Kumaran Chits — Sentry Error Monitoring & APM Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Indian DPDP Act 2023, BigInt Serialization Safety
// ==============================================================================

import { ArgumentsHost, HttpStatus, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { ErrorEvent } from '@sentry/nestjs';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import {
  beforeSend,
  buildSafeSentryUserContext,
  initSentry,
  isSentryActive,
  scrubPii,
  setCustomCaptureFn,
  setCustomWithScopeFn,
  setSentryActiveOverride,
} from '../../src/common/sentry/sentry.config';
import { SentryService } from '../../src/common/sentry/sentry.service';
import { HealthController } from '../../src/health/health.controller';

describe('Component 4: Sentry Error Monitoring & Crash Tracking Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    setSentryActiveOverride(null);
    setCustomCaptureFn(null);
    setCustomWithScopeFn(null);
  });

  afterAll(() => {
    process.env = originalEnv;
    setSentryActiveOverride(null);
    setCustomCaptureFn(null);
    setCustomWithScopeFn(null);
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
        type: undefined,
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
          roles: 'BRANCH_MANAGER,ACCOUNTANT',
          branchId: 'PRD',
          clientType: 'WEB',
          phone: '9876543210',
          email: 'sensitive@kumaranfinance.in',
          ip_address: '192.168.1.5',
        } as any,
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
      const requestData = processed?.request?.data as Record<string, unknown> | undefined;
      expect(requestData?.password).toBe('[FILTERED]');
      expect(requestData?.phone).toBe('+91******3210');
      expect(requestData?.amount).toBe('5000');

      // DEF-BE-03 (N3): Operational identifiers preserved; phone, email & IP stripped
      expect(processed?.user?.id).toBe('user-001');
      expect(processed?.user?.username).toBe('partner_erode');
      expect((processed?.user as any)?.roles).toBe('BRANCH_MANAGER,ACCOUNTANT');
      expect((processed?.user as any)?.branchId).toBe('PRD');
      expect((processed?.user as any)?.clientType).toBe('WEB');
      expect((processed?.user as any)?.phone).toBeUndefined();
      expect((processed?.user as any)?.email).toBeUndefined();
      expect((processed?.user as any)?.ip_address).toBeUndefined();

      // PII-only user object is completely removed rather than emitting empty {}
      const piiOnlyEvent = beforeSend({
        type: undefined,
        event_id: 'test-event-pii-only',
        user: { email: 'only-pii@example.com', ip_address: '10.0.0.1' },
      });
      expect(piiOnlyEvent?.user).toBeUndefined();

      // Breadcrumb scrubbed
      expect(processed?.breadcrumbs?.[0].data?.authkey).toBe('[FILTERED]');
      expect(processed?.breadcrumbs?.[0].data?.url).toBe('/api/v1/payments');
    });
  });

  describe('4. GlobalExceptionFilter Sentry Integration (DEF-BE-03 N1-N5)', () => {
    let filter: GlobalExceptionFilter;
    let mockResponse: any;
    let mockRequest: any;
    let mockArgumentsHost: ArgumentsHost;
    let mockCaptureFn: jest.Mock;
    let mockSetUser: jest.Mock;
    let mockSetTag: jest.Mock;

    beforeEach(() => {
      filter = new GlobalExceptionFilter();
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
      };

      // Mock real RFC 7519 JwtPayload produced by JwtStrategy.validate()
      mockRequest = {
        method: 'POST',
        originalUrl: '/api/v1/auctions/bid',
        user: {
          sub: 'usr-jwt-123',
          phone: '9876543210',
          roles: ['BRANCH_MANAGER', 'ACCOUNTANT'],
          branchId: 'PRD',
          clientType: 'WEB',
          tokenType: 'access',
        },
        headers: { 'x-request-id': 'req-abc-999' },
      };

      mockArgumentsHost = {
        switchToHttp: jest.fn().mockReturnValue({
          getResponse: () => mockResponse,
          getRequest: () => mockRequest,
        }),
      } as unknown as ArgumentsHost;

      // Enable Sentry and capture scope mutations synchronously
      setSentryActiveOverride(true);
      mockCaptureFn = jest.fn().mockReturnValue('mock-event-id-99');
      mockSetUser = jest.fn();
      mockSetTag = jest.fn();
      setCustomCaptureFn(mockCaptureFn);
      setCustomWithScopeFn((callback) => {
        callback({
          setTag: mockSetTag,
          setUser: mockSetUser,
          setExtra: jest.fn(),
        } as any);
      });
    });

    it('N1: forwards 500 Internal Server Errors with JWT sub mapped to Sentry user.id and non-PII context', () => {
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

      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'usr-jwt-123',
        roles: 'BRANCH_MANAGER,ACCOUNTANT',
        branchId: 'PRD',
        clientType: 'WEB',
      });
      // DPDP PII must never be attached to Sentry user scope
      expect((mockSetUser.mock.calls[0][0] as any).phone).toBeUndefined();
      expect(mockSetTag).toHaveBeenCalledWith('statusCode', '500');
      expect(mockSetTag).toHaveBeenCalledWith('errorCode', 'INTERNAL_SERVER_ERROR');
      expect(mockSetTag).toHaveBeenCalledWith('requestId', 'req-abc-999');
      expect(mockCaptureFn).toHaveBeenCalledWith(internalError);
    });

    it('N2: resolves fallback id/userId, skips setUser on empty user object, and uses req.requestId fallback', () => {
      mockRequest.headers = {};
      mockRequest.requestId = 'req-fallback-777';
      mockRequest.user = { id: 'usr-legacy-456', roles: ['AUDITOR'], branchId: null };

      filter.catch(new InternalServerErrorException('Fallback ID fault'), mockArgumentsHost);

      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'usr-legacy-456',
        roles: 'AUDITOR',
      });
      expect(mockSetTag).toHaveBeenCalledWith('requestId', 'req-fallback-777');

      jest.clearAllMocks();
      mockRequest.user = { userId: 'usr-alt-789' };
      filter.catch(new InternalServerErrorException('Alt ID fault'), mockArgumentsHost);
      expect(mockSetUser).toHaveBeenCalledWith({ id: 'usr-alt-789' });

      jest.clearAllMocks();
      mockRequest.user = { phone: '9876543210' }; // No sub/id/userId, no non-PII attrs
      filter.catch(new InternalServerErrorException('Empty user attr fault'), mockArgumentsHost);
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it('N4: fault tolerance guarantees HTTP 500 JSON response even if Sentry scope throws', () => {
      setCustomWithScopeFn(() => {
        throw new Error('Synthetic Sentry transport crash');
      });
      const logSpy = jest.spyOn((filter as any).logger, 'error').mockImplementation(() => {});

      const err = new Error('Underlying DB failure');
      filter.catch(err, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 500,
        }),
      );
      logSpy.mockRestore();
    });

    it('N5: forwards unauthenticated 500s without calling setUser and suppresses 4xx client errors', () => {
      delete mockRequest.user;
      const logSpy = jest.spyOn((filter as any).logger, 'error').mockImplementation(() => {});
      const typeError = new TypeError('Cannot read properties of undefined');

      filter.catch(typeError, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockSetUser).not.toHaveBeenCalled();
      expect(mockCaptureFn).toHaveBeenCalledWith(typeError);
      logSpy.mockRestore();

      jest.clearAllMocks();
      mockRequest.user = { sub: 'usr-jwt-123', roles: ['SUPER_ADMIN'] };
      const unauthorized = new UnauthorizedException('Invalid staff token');

      filter.catch(unauthorized, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockCaptureFn).not.toHaveBeenCalled();
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it('buildSafeSentryUserContext handles edge inputs safely', () => {
      expect(buildSafeSentryUserContext(null)).toBeNull();
      expect(buildSafeSentryUserContext(undefined)).toBeNull();
      expect(buildSafeSentryUserContext({ sub: '  usr-trim  ', roles: [], branchId: '   ' })).toEqual({
        id: 'usr-trim',
      });
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

    it('should capture exception and attach JWT sub / user context cleanly when Sentry is active', () => {
      setSentryActiveOverride(true);
      const mockCaptureFn = jest.fn().mockReturnValue('event-12345');
      const mockSetUser = jest.fn();
      setCustomCaptureFn(mockCaptureFn);
      setCustomWithScopeFn((cb) => {
        cb({
          setTag: jest.fn(),
          setUser: mockSetUser,
          setExtra: jest.fn(),
        } as any);
      });

      const err = new Error('Reconciliation mismatch');
      const eventId = service.captureException(err, {
        tags: { chitCode: 'KCA-1L' },
        user: { sub: 'usr-svc-1', roles: ['SUPER_ADMIN'], branchId: null },
        extra: { password: 'should-be-scrubbed', balance: 3750n },
      });

      expect(eventId).toBe('event-12345');
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'usr-svc-1',
        roles: 'SUPER_ADMIN',
      });
      expect(mockCaptureFn).toHaveBeenCalledWith(err);
    });
  });

  describe('6. HealthController Sentry Diagnostics', () => {
    let healthController: HealthController;

    beforeEach(() => {
      healthController = new HealthController();
    });

    it('should return sentryActive state in check()', async () => {
      const res = await healthController.check();
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
