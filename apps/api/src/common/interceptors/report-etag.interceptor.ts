// ==============================================================================
// Kumaran Chits — Statutory Reports HTTP ETag & 304 Conditional Interceptor
// Bandwidth & CPU optimization for historical Day Books, Cash Books & Minutes.
// ==============================================================================

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable()
export class ReportEtagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (req.method !== 'GET') {
      return next.handle();
    }

    return next.handle().pipe(
      switchMap((data) => {
        if (!data) {
          return of(data);
        }

        // Generate deterministic SHA-256 weak ETag from the serialized report data
        const serialized = JSON.stringify(data);
        const hash = crypto
          .createHash('sha256')
          .update(serialized)
          .digest('hex')
          .substring(0, 32);
        const etag = `W/"${hash}"`;

        const ifNoneMatch = req.headers['if-none-match'];

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

        // Check for client cache match (supports W/"<hash>" or "<hash>")
        if (
          ifNoneMatch &&
          (ifNoneMatch === etag ||
            ifNoneMatch === `"${hash}"` ||
            ifNoneMatch === hash)
        ) {
          res.status(304);
          res.end();
          return of(null);
        }

        return of(data);
      }),
    );
  }
}
