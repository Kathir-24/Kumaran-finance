import {
  ExecutionContext,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { IdempotencyHeaderInterceptor } from '../src/common/interceptors/idempotency-header.interceptor';
import { TimeoutInterceptor } from '../src/common/interceptors/timeout.interceptor';
import { NotificationService, SentNotificationRecord } from '../src/jobs/services/notification.service';

describe('API Architecture Resilience & High-Load Hardening (Gate #4)', () => {
  describe('1. In-Memory Ring Buffer & Memory Leak Guard (Phase 1)', () => {
    let notificationService: NotificationService;

    beforeEach(() => {
      notificationService = new NotificationService();
    });

    it('should strictly cap sentLog at 200 entries and discard oldest records', () => {
      // Push 250 items through the private pushLog method
      for (let i = 1; i <= 250; i++) {
        const record: SentNotificationRecord = {
          id: `notif-${i}`,
          recipientPhone: `98421000${i.toString().padStart(3, '0')}`,
          channel: 'SMS_DLT',
          templateType: 'RECEIPT',
          messageText: `Receipt #${i}`,
          variables: { receiptNumber: `REC-${i}` },
          sentAt: new Date(),
          status: 'DELIVERED',
        };
        (notificationService as any).pushLog(record);
      }

      // Query full log with a high limit
      const logs = notificationService.getSentNotificationLog(500);

      // Verify strict size constraint
      expect(logs).toHaveLength(200);

      // Verify newest record is first (reversed view)
      expect(logs[0].messageText).toBe('Receipt #250');

      // Verify oldest retained record is #51 (1 through 50 shifted out)
      expect(logs[logs.length - 1].messageText).toBe('Receipt #51');
    });
  });

  describe('2. HTTP Idempotency-Key Header Binding (Phase 2)', () => {
    let interceptor: IdempotencyHeaderInterceptor;

    beforeEach(() => {
      interceptor = new IdempotencyHeaderInterceptor();
    });

    it('should bind idempotency-key header to request body when body has none', (done) => {
      const mockRequest = {
        headers: {
          'idempotency-key': 'uuid-client-12345',
        },
        body: {
          amount: 5000,
        } as { amount: number; idempotencyKey?: string },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      const next = {
        handle: () => of({ success: true }),
      };

      interceptor.intercept(mockContext, next).subscribe(() => {
        expect(mockRequest.body.idempotencyKey).toBe('uuid-client-12345');
        done();
      });
    });

    it('should preserve existing body.idempotencyKey if already supplied', (done) => {
      const mockRequest = {
        headers: {
          'idempotency-key': 'uuid-header-999',
        },
        body: {
          amount: 5000,
          idempotencyKey: 'uuid-body-existing',
        },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      const next = {
        handle: () => of({ success: true }),
      };

      interceptor.intercept(mockContext, next).subscribe(() => {
        expect(mockRequest.body.idempotencyKey).toBe('uuid-body-existing');
        done();
      });
    });

    it('should safely handle requests without idempotency header', (done) => {
      const mockRequest = {
        headers: {},
        body: { amount: 2000 } as { amount: number; idempotencyKey?: string },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      const next = {
        handle: () => of({ success: true }),
      };

      interceptor.intercept(mockContext, next).subscribe(() => {
        expect(mockRequest.body.idempotencyKey).toBeUndefined();
        done();
      });
    });
  });

  describe('3. Rate Limit HTTP 429 Retry-After Header (Phase 3)', () => {
    let filter: GlobalExceptionFilter;
    let mockResponse: any;
    let mockHost: any;

    beforeEach(() => {
      filter = new GlobalExceptionFilter();
      mockResponse = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: '/api/v1/auth/mobile/request-otp', method: 'POST' }),
        }),
      };
    });

    it('should attach Retry-After header with 60s default on HTTP 429 exception', () => {
      const rateLimitException = new HttpException(
        'ThrottlerException: Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );

      filter.catch(rateLimitException, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 429,
          error: expect.objectContaining({
            message: 'ThrottlerException: Too Many Requests',
          }),
        }),
      );
    });

    it('should respect custom retryAfter seconds if supplied in exception payload', () => {
      const custom429 = new HttpException(
        { message: 'Too Many Requests', retryAfter: 45 },
        HttpStatus.TOO_MANY_REQUESTS,
      );

      filter.catch(custom429, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '45');
    });
  });

  describe('4. Global Request Timeout & Exemption (Phase 4)', () => {
    let reflector: Reflector;
    let interceptor: TimeoutInterceptor;

    beforeEach(() => {
      reflector = new Reflector();
      interceptor = new TimeoutInterceptor(reflector);
    });

    it('should abort hung requests and throw GatewayTimeoutException (504)', (done) => {
      // Mock reflector to return 50ms custom timeout for fast test execution
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(50);

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      // Hung call taking 150ms
      const hungNext = {
        handle: () =>
          new Observable((subscriber) => {
            const timer = setTimeout(() => {
              subscriber.next('completed');
              subscriber.complete();
            }, 150);
            return () => clearTimeout(timer);
          }),
      };

      interceptor.intercept(mockContext, hungNext).subscribe({
        next: () => done(new Error('Should have timed out')),
        error: (err) => {
          expect(err).toBeInstanceOf(GatewayTimeoutException);
          expect(err.getStatus()).toBe(504);
          expect(err.getResponse()).toEqual(
            expect.objectContaining({
              statusCode: 504,
              error: 'GATEWAY_TIMEOUT',
            }),
          );
          done();
        },
      });
    });

    it('should bypass timeout completely when @SetTimeout(0) is configured (e.g. SSE stream)', (done) => {
      // Mock reflector returning 0 (exempt from timeout)
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(0);

      const mockContext = {
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const slowNext = {
        handle: () =>
          new Observable((subscriber) => {
            const timer = setTimeout(() => {
              subscriber.next('stream_event_ok');
              subscriber.complete();
            }, 60);
            return () => clearTimeout(timer);
          }),
      };

      interceptor.intercept(mockContext, slowNext).subscribe({
        next: (val) => {
          expect(val).toBe('stream_event_ok');
          done();
        },
        error: (err) => done(err),
      });
    });
  });
});
