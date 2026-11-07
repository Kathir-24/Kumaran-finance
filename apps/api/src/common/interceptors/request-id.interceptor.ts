// ==============================================================================
// Kumaran Chits — HTTP Request ID Trace Correlation Interceptor
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/observability-and-monitoring-architecture.md
// ==============================================================================

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

/**
 * Ensures every incoming HTTP request carries a unique X-Request-ID.
 * Preserves upstream NGINX or client-provided X-Request-ID, or generates a UUID v4.
 * Attaches the ID to response headers and request context for Winston logging and Sentry error tracing.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();

    if (req) {
      const incomingId =
        req.headers?.['x-request-id'] ||
        req.headers?.['X-Request-ID'] ||
        req.headers?.['X-REQUEST-ID'];

      const requestId =
        typeof incomingId === 'string' && incomingId.trim().length > 0
          ? incomingId.trim()
          : randomUUID();

      // Normalize headers and request object
      if (req.headers) {
        req.headers['x-request-id'] = requestId;
      }
      req.requestId = requestId;

      // Echo header in HTTP response
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('X-Request-ID', requestId);
      }
    }

    return next.handle();
  }
}
