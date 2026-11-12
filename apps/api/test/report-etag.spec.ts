// ==============================================================================
// Kumaran Chits — Statutory Reports ETag & HTTP 304 Conditional Interceptor Tests
// ==============================================================================

import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { ReportEtagInterceptor } from '../src/common/interceptors/report-etag.interceptor';

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

      interceptor.intercept(secondContext, nextMock).subscribe((secondResult) => {
        expect(secondResult).toBeNull();
        expect(secondResponse.status).toHaveBeenCalledWith(304);
        expect(secondResponse.end).toHaveBeenCalledTimes(1);
        expect(secondResponse.setHeader).toHaveBeenCalledWith('ETag', generatedEtag);
        done();
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

      interceptor.intercept(secondContext, nextMock).subscribe((secondResult) => {
        expect(secondResult).toBeNull();
        expect(secondResponse.status).toHaveBeenCalledWith(304);
        done();
      });
    });
  });
});
