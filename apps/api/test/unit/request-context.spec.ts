import type { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_TRUST_PROXY,
  normalizeClientIp,
  parseTrustProxySetting,
} from '../../src/common/context/proxy-ip.util';
import { RequestContext } from '../../src/common/context/request-context';
import { RequestContextMiddleware } from '../../src/common/context/request-context.middleware';

describe('RequestContext, IP Normalization & TRUST_PROXY Parsing (DEF-FE-06)', () => {
  describe('parseTrustProxySetting', () => {
    it('defaults to safe reverse-proxy subnet classes when unset or empty', () => {
      expect(parseTrustProxySetting(undefined)).toEqual([...DEFAULT_TRUST_PROXY]);
      expect(parseTrustProxySetting('   ')).toEqual([...DEFAULT_TRUST_PROXY]);
    });

    it('parses boolean flags, non-negative hop counts, and CIDR lists', () => {
      expect(parseTrustProxySetting('true')).toBe(true);
      expect(parseTrustProxySetting('FALSE')).toBe(false);
      expect(parseTrustProxySetting('0')).toBe(0);
      expect(parseTrustProxySetting('2')).toBe(2);
      expect(parseTrustProxySetting('loopback, 172.18.0.0/16')).toEqual([
        'loopback',
        '172.18.0.0/16',
      ]);
    });

    it('rejects negative hop counts and malformed empty CIDR entries', () => {
      expect(() => parseTrustProxySetting('-2')).toThrow(/Invalid TRUST_PROXY/i);
      expect(() => parseTrustProxySetting('loopback,,172.18.0.1')).toThrow(
        /Invalid TRUST_PROXY/i,
      );
    });
  });

  describe('normalizeClientIp', () => {
    it('strips IPv4-mapped ::ffff: prefix and IPv6 brackets cleanly', () => {
      expect(normalizeClientIp('::ffff:106.51.10.22')).toBe('106.51.10.22');
      expect(normalizeClientIp('::FFFF:103.21.45.9')).toBe('103.21.45.9');
      expect(normalizeClientIp('[2001:db8::1]')).toBe('2001:db8::1');
      expect(normalizeClientIp('  127.0.0.1  ')).toBe('127.0.0.1');
      expect(normalizeClientIp('::1')).toBe('::1');
      expect(normalizeClientIp('')).toBeUndefined();
      expect(normalizeClientIp(undefined)).toBeUndefined();
    });
  });

  describe('RequestContext & RequestContextMiddleware', () => {
    it('isolates concurrent async requests without cross-request leakage', async () => {
      const results = await Promise.all([
        new Promise<string | undefined>((resolve) => {
          RequestContext.run(
            { requestId: 'req-a', ipAddress: '106.51.10.22', userAgent: 'AgentA' },
            () => setTimeout(() => resolve(`${RequestContext.getIpAddress()}:${RequestContext.getRequestId()}`), 15),
          );
        }),
        new Promise<string | undefined>((resolve) => {
          RequestContext.run(
            { requestId: 'req-b', ipAddress: '103.21.45.9', userAgent: 'AgentB' },
            () => setTimeout(() => resolve(`${RequestContext.getIpAddress()}:${RequestContext.getRequestId()}`), 5),
          );
        }),
      ]);

      expect(results).toEqual(['106.51.10.22:req-a', '103.21.45.9:req-b']);
      expect(RequestContext.getStore()).toBeUndefined();
    });

    it('populates AsyncLocalStorage context, normalizes IP, and sets X-Request-ID header', () => {
      const middleware = new RequestContextMiddleware();
      const setHeaderMock = jest.fn();
      const req = {
        headers: {
          'x-request-id': 'trace-from-bff-01',
          'user-agent': 'KumaranWeb/1.0',
        },
        ip: '::ffff:106.51.10.22',
        socket: { remoteAddress: '::ffff:172.18.0.6' },
      } as unknown as Request & { requestId?: string };

      const res = { setHeader: setHeaderMock } as unknown as Response;

      let observedIp: string | undefined;
      let observedTrace: string | undefined;
      let observedUa: string | undefined;

      const next: NextFunction = () => {
        observedIp = RequestContext.getIpAddress();
        observedTrace = RequestContext.getRequestId();
        observedUa = RequestContext.getUserAgent();
      };

      middleware.use(req, res, next);

      expect(req.requestId).toBe('trace-from-bff-01');
      expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', 'trace-from-bff-01');
      expect(observedIp).toBe('106.51.10.22');
      expect(observedTrace).toBe('trace-from-bff-01');
      expect(observedUa).toBe('KumaranWeb/1.0');
    });
  });
});
