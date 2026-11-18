// ==============================================================================
// Kumaran Chits — Statutory Reports ETag & HTTP 304 Conditional Interceptor Tests
// ==============================================================================

import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { ReportEtagInterceptor } from '../../src/common/interceptors/report-etag.interceptor';

describe('ReportEtagInterceptor (HTTP 304 Conditional Caching)', () => {
  let interceptor: ReportEtagInterceptor;
  let mockRequest: any;
  let mockResponse: any;
  let mockExecutionContext: ExecutionContext;

  const mockReportPayload = {
    date: '2026-10-15',
    totalCollections: 500000,
    totalDisbursements: 200000,
    closingCashBalance: 300000,
    entries: [
      { receiptNumber: 'KC-REC-PRD-2026-00001', amount: 50000, mode: 'CASH' },
    ],
  };

  beforeEach(() => {
    interceptor = new ReportEtagInterceptor();

    mockRequest = {
      method: 'GET',
      headers: {},
    };

    mockResponse = {
      headers: {} as Record<string, string>,
      statusCode: 200,
      setHeader: jest.fn((k: string, v: string) => {
        mockResponse.headers[k.toLowerCase()] = v;
      }),
      status: jest.fn((code: number) => {
        mockResponse.statusCode = code;
        return mockResponse;
      }),
      end: jest.fn(),
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  });

  it('1. First Request: Generates weak SHA-256 ETag and returns full payload with HTTP 200 headers', (done) => {
    const nextMock = {
      handle: () => of(mockReportPayload),
    };

    interceptor.intercept(mockExecutionContext, nextMock).subscribe((result) => {
      expect(result).toEqual(mockReportPayload);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'ETag',
        expect.stringMatching(/^W\/"[a-f0-9]{32}"$/),
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, no-cache, must-revalidate',
      );
      expect(mockResponse.status).not.toHaveBeenCalledWith(304);
      expect(mockResponse.end).not.toHaveBeenCalled();
      done();
    });
  });

  it('2. Repeat Request with Matching If-None-Match: Responds with HTTP 304 Not Modified & empty body', (done) => {
    // First run to get the deterministic ETag
    const nextMock = {
      handle: () => of(mockReportPayload),
    };

    interceptor.intercept(mockExecutionContext, nextMock).subscribe(() => {
      const generatedEtag = mockResponse.headers['etag'];

      // Simulate client sending back If-None-Match
      mockRequest.headers['if-none-match'] = generatedEtag;
      const secondResponse: any = {
        headers: {},
        statusCode: 200,
        setHeader: jest.fn((k: string, v: string) => {
          secondResponse.headers[k.toLowerCase()] = v;
        }),
        status: jest.fn((code: number) => {
          secondResponse.statusCode = code;
          return secondResponse;
        }),
        end: jest.fn(),
      };

      const secondContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => secondResponse,
        }),
      } as unknown as ExecutionContext;

      let emitted = false;
      interceptor.intercept(secondContext, nextMock).subscribe({
        next: () => {
          emitted = true;
        },
        complete: () => {
          expect(emitted).toBe(false);
          expect(secondResponse.status).toHaveBeenCalledWith(304);
          expect(secondResponse.end).toHaveBeenCalledTimes(1);
          expect(secondResponse.setHeader).toHaveBeenCalledWith('ETag', generatedEtag);
          done();
        },
      });
    });
  });

  it('3. Modified Payload: Generates different ETag and returns 200 when content changes', (done) => {
    const modifiedPayload = {
      ...mockReportPayload,
      closingCashBalance: 999999, // changed
    };

    mockRequest.headers['if-none-match'] = 'W/"stalehash123456789012345678901234"';

    const nextMock = {
      handle: () => of(modifiedPayload),
    };

    interceptor.intercept(mockExecutionContext, nextMock).subscribe((result) => {
      expect(result).toEqual(modifiedPayload);
      expect(mockResponse.status).not.toHaveBeenCalledWith(304);
      expect(mockResponse.headers['etag']).not.toBe('W/"stalehash123456789012345678901234"');
      done();
    });
  });

  it('4. Non-GET Methods: Bypasses ETag processing completely', (done) => {
    mockRequest.method = 'POST';
    const nextMock = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(mockExecutionContext, nextMock).subscribe((result) => {
      expect(result).toEqual({ success: true });
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('5. BigInt Report Payloads: Computes deterministic ETag and handles 304 without BigInt.prototype.toJSON', (done) => {
    const bigIntReportPayload = {
      date: '2026-10-15',
      totalCollections: 500000n,
      totalDisbursements: 200000n,
      closingCashBalance: 300000n,
    };
    const nextMock = {
      handle: () => of(bigIntReportPayload),
    };

    interceptor.intercept(mockExecutionContext, nextMock).subscribe((result) => {
      expect(result).toEqual(bigIntReportPayload);
      const generatedEtag = mockResponse.headers['etag'];
      expect(generatedEtag).toMatch(/^W\/"[a-f0-9]{32}"$/);

      mockRequest.headers['if-none-match'] = generatedEtag;
      const secondResponse: any = {
        headers: {},
        statusCode: 200,
        setHeader: jest.fn((k: string, v: string) => {
          secondResponse.headers[k.toLowerCase()] = v;
        }),
        status: jest.fn((code: number) => {
          secondResponse.statusCode = code;
          return secondResponse;
        }),
        end: jest.fn(),
      };
      const secondContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => secondResponse,
        }),
      } as unknown as ExecutionContext;

      let emitted = false;
      interceptor.intercept(secondContext, nextMock).subscribe({
        next: () => {
          emitted = true;
        },
        complete: () => {
          expect(emitted).toBe(false);
          expect(secondResponse.status).toHaveBeenCalledWith(304);
          done();
        },
      });
    });
  });

  it('6. Emits Vary: Authorization, Cookie header on both 200 and 304 responses', (done) => {
    const nextMock = { handle: () => of(mockReportPayload) };

    interceptor.intercept(mockExecutionContext, nextMock).subscribe(() => {
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Vary',
        'Authorization, Cookie',
      );
      done();
    });
  });

  it('7. Prevents cross-branch & cross-role ETag cache poisoning when identical payloads are returned', (done) => {
    const emptyDayBook = { date: '2026-10-15', inflows: [], outflows: [] };
    const nextMock = { handle: () => of(emptyDayBook) };

    const makeCtx = (user: any, url: string) => {
      const headers: Record<string, string> = {};
      const res: any = {
        headers,
        statusCode: 200,
        setHeader: jest.fn((k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        }),
        status: jest.fn(() => res),
        end: jest.fn(),
      };
      const req: any = { method: 'GET', headers: {}, user, originalUrl: url };
      return {
        res,
        ctx: {
          switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
        } as unknown as ExecutionContext,
      };
    };

    const branchA = makeCtx(
      { sub: 'bm-1', roles: ['BRANCH_MANAGER'], branchId: 'branch-A' },
      '/api/v1/reports/day-book?date=2026-10-15',
    );
    const branchB = makeCtx(
      { sub: 'bm-2', roles: ['BRANCH_MANAGER'], branchId: 'branch-B' },
      '/api/v1/reports/day-book?date=2026-10-15',
    );
    const differentFilter = makeCtx(
      { sub: 'bm-1', roles: ['BRANCH_MANAGER'], branchId: 'branch-A' },
      '/api/v1/reports/day-book?date=2026-10-16',
    );

    interceptor.intercept(branchA.ctx, nextMock).subscribe(() => {
      interceptor.intercept(branchB.ctx, nextMock).subscribe(() => {
        interceptor.intercept(differentFilter.ctx, nextMock).subscribe(() => {
          expect(branchA.res.headers['etag']).toBeDefined();
          expect(branchB.res.headers['etag']).toBeDefined();
          expect(differentFilter.res.headers['etag']).toBeDefined();
          expect(branchA.res.headers['etag']).not.toBe(branchB.res.headers['etag']);
          expect(branchA.res.headers['etag']).not.toBe(
            differentFilter.res.headers['etag'],
          );
          done();
        });
      });
    });
  });

  it('8. Supports RFC 9110 comma-separated If-None-Match lists and wildcard *', (done) => {
    const nextMock = { handle: () => of(mockReportPayload) };

    interceptor.intercept(mockExecutionContext, nextMock).subscribe(() => {
      const generatedEtag = mockResponse.headers['etag'];

      // 8a. Comma-separated ETag list containing our tag
      const reqList: any = {
        method: 'GET',
        headers: {
          'if-none-match': `W/"00000000000000000000000000000000", ${generatedEtag}, W/"ffffffffffffffffffffffffffffffff"`,
        },
      };
      const resList: any = {
        headers: {},
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };
      const ctxList = {
        switchToHttp: () => ({ getRequest: () => reqList, getResponse: () => resList }),
      } as unknown as ExecutionContext;

      let listEmitted = false;
      interceptor.intercept(ctxList, nextMock).subscribe({
        next: () => {
          listEmitted = true;
        },
        complete: () => {
          expect(listEmitted).toBe(false);
          expect(resList.status).toHaveBeenCalledWith(304);
          expect(resList.end).toHaveBeenCalledTimes(1);

          // 8b. Wildcard If-None-Match: *
          const reqWild: any = {
            method: 'GET',
            headers: { 'if-none-match': '*' },
          };
          const resWild: any = {
            headers: {},
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            end: jest.fn(),
          };
          const ctxWild = {
            switchToHttp: () => ({ getRequest: () => reqWild, getResponse: () => resWild }),
          } as unknown as ExecutionContext;

          let wildEmitted = false;
          interceptor.intercept(ctxWild, nextMock).subscribe({
            next: () => {
              wildEmitted = true;
            },
            complete: () => {
              expect(wildEmitted).toBe(false);
              expect(resWild.status).toHaveBeenCalledWith(304);
              expect(resWild.end).toHaveBeenCalledTimes(1);
              done();
            },
          });
        },
      });
    });
  });

  it('9. XR-M7-RPT-06: Canonicalizes query parameter ordering so reordered params produce identical ETags and 304 hits', (done) => {
    const nextMock = { handle: () => of(mockReportPayload) };
    const caller = { sub: 'sa-1', roles: ['SUPER_ADMIN'], branchId: null, isPartner: true };

    const makeCtx = (url: string, ifNoneMatch?: string) => {
      const headers: Record<string, string> = {};
      const res: any = {
        headers,
        statusCode: 200,
        setHeader: jest.fn((k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        }),
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };
      const req: any = {
        method: 'GET',
        headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {},
        user: caller,
        originalUrl: url,
      };
      return {
        res,
        ctx: {
          switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
        } as unknown as ExecutionContext,
      };
    };

    const reqA = makeCtx('/api/v1/reports/day-book?date=2026-10-18&branchId=branch-A');
    interceptor.intercept(reqA.ctx, nextMock).subscribe(() => {
      const etagA = reqA.res.headers['etag'];
      const reqB = makeCtx(
        '/api/v1/reports/day-book?branchId=branch-A&date=2026-10-18',
        etagA,
      );
      let emitted = false;
      interceptor.intercept(reqB.ctx, nextMock).subscribe({
        next: () => {
          emitted = true;
        },
        complete: () => {
          expect(reqB.res.headers['etag']).toBe(etagA);
          expect(emitted).toBe(false);
          expect(reqB.res.status).toHaveBeenCalledWith(304);
          expect(reqB.res.end).toHaveBeenCalledTimes(1);
          done();
        },
      });
    });
  });
});
