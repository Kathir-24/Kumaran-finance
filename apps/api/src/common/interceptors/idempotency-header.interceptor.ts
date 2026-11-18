// ==============================================================================
// Kumaran Chits — HTTP Idempotency-Key Header Interceptor
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/api-resilience-and-traffic-hardening.md
// ==============================================================================

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Binds standard HTTP 'Idempotency-Key' / 'idempotency-key' header to request body
 * to ensure that frontend SDKs (packages/api-client, Flutter mobile app) injecting
 * idempotency keys via HTTP headers are respected by backend controllers.
 */
@Injectable()
export class IdempotencyHeaderInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();

    if (req && req.headers) {
      const headerKey =
        req.headers['idempotency-key'] ||
        req.headers['Idempotency-Key'] ||
        req.headers['IDEMPOTENCY-KEY'] ||
        req.headers['x-idempotency-key'] ||
        req.headers['X-Idempotency-Key'] ||
        req.headers['X-IDEMPOTENCY-KEY'];

      if (
        headerKey &&
        req.body &&
        typeof req.body === 'object' &&
        !req.body.idempotencyKey
      ) {
        req.body.idempotencyKey = String(headerKey).trim();
      }
    }

    return next.handle();
  }
}
