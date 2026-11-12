import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { normalizeClientIp } from './proxy-ip.util';
import { RequestContext } from './request-context';

/**
 * Populates AsyncLocalStorage request metadata before NestJS Guards, Interceptors,
 * Controllers, and Prisma queries execute so throttling, logging, and AuditLog
 * writes observe the real Express `trust proxy`-resolved client IP and trace ID.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(
    req: Request & { requestId?: string },
    res: Response,
    next: NextFunction,
  ): void {
    const incomingId =
      req.headers?.['x-request-id'] ||
      req.headers?.['X-Request-ID'] ||
      req.headers?.['X-REQUEST-ID'];

    const requestId =
      typeof incomingId === 'string' && incomingId.trim().length > 0
        ? incomingId.trim()
        : randomUUID();

    if (req.headers) {
      req.headers['x-request-id'] = requestId;
    }
    req.requestId = requestId;

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-Request-ID', requestId);
    }

    const ipAddress = normalizeClientIp(
      req.ip || req.socket?.remoteAddress || undefined,
    );
    const rawUserAgent = req.headers?.['user-agent'];
    const userAgent =
      typeof rawUserAgent === 'string' && rawUserAgent.trim().length > 0
        ? rawUserAgent.trim()
        : undefined;

    RequestContext.run({ requestId, ipAddress, userAgent }, () => next());
  }
}
