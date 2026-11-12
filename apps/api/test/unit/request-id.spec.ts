// ==============================================================================
// Kumaran Chits — Request ID Trace Correlation Interceptor Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/observability-and-monitoring-architecture.md
// ==============================================================================

import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { RequestIdInterceptor } from '../../src/common/interceptors/request-id.interceptor';

describe('RequestIdInterceptor (Trace Correlation)', () => {
  let interceptor: RequestIdInterceptor;

  beforeEach(() => {
    interceptor = new RequestIdInterceptor();
  });

  const createMockContext = (headers: Record<string, string> = {}) => {
    const responseHeaders: Record<string, string> = {};
    const req: any = {
      headers: { ...headers },
    };
    const res: any = {
      setHeader: jest.fn((name: string, value: string) => {
        responseHeaders[name] = value;
      }),
      getHeader: jest.fn((name: string) => responseHeaders[name]),
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    return { context, req, res, responseHeaders };
  };

  it('should generate a fresh UUID v4 when incoming request has no X-Request-ID header', (done) => {
    const { context, req, res } = createMockContext({});
    const callHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(req.headers['x-request-id']).toBeDefined();
      expect(typeof req.headers['x-request-id']).toBe('string');
      // UUID format regex: 8-4-4-4-12 hex digits
      expect(req.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(req.requestId).toBe(req.headers['x-request-id']);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
      done();
    });
  });

  it('should preserve upstream X-Request-ID when provided by NGINX or client', (done) => {
    const upstreamTraceId = 'upstream-trace-id-abc-12345';
    const { context, req, res } = createMockContext({
      'x-request-id': upstreamTraceId,
    });
    const callHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(req.headers['x-request-id']).toBe(upstreamTraceId);
      expect(req.requestId).toBe(upstreamTraceId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', upstreamTraceId);
      done();
    });
  });

  it('should support uppercase X-Request-ID header variations', (done) => {
    const upstreamTraceId = 'variant-header-778899';
    const { context, req, res } = createMockContext({
      'X-Request-ID': upstreamTraceId,
    });
    const callHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(req.headers['x-request-id']).toBe(upstreamTraceId);
      expect(req.requestId).toBe(upstreamTraceId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', upstreamTraceId);
      done();
    });
  });

  it('should generate a fresh UUID when incoming X-Request-ID is blank or whitespace', (done) => {
    const { context, req, res } = createMockContext({
      'x-request-id': '   ',
    });
    const callHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(req.headers['x-request-id']).not.toBe('   ');
      expect(req.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
      done();
    });
  });
});
