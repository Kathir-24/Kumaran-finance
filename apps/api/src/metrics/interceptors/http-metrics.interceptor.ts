// ==============================================================================
// Kumaran Chits — HTTP Metrics Interceptor (Latency & Request Counting)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3)
// ==============================================================================

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from '../services/metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const rawUrl = req.originalUrl || req.url;

    // Exclude internal telemetry and doc paths to avoid metric noise & self-pollution
    if (
      rawUrl.startsWith('/metrics') ||
      rawUrl.startsWith('/health') ||
      rawUrl.startsWith('/api/docs') ||
      rawUrl.startsWith('/admin/queues')
    ) {
      return next.handle();
    }

    const start = performance.now();

    return next.handle().pipe(
      finalize(() => {
        const durationSeconds = (performance.now() - start) / 1000;
        const statusCode = res.statusCode ? res.statusCode.toString() : '500';
        const method = req.method;

        // Normalize route to avoid high-cardinality UUID label explosion
        const route = this.normalizeRoute(req);

        this.metricsService.httpRequestsTotal.inc({
          method,
          route,
          status_code: statusCode,
        });

        this.metricsService.httpRequestDurationSeconds.observe(
          {
            method,
            route,
            status_code: statusCode,
          },
          durationSeconds,
        );
      }),
    );
  }

  /**
   * Normalizes URLs by replacing dynamic UUIDs and numeric IDs with placeholders.
   */
  private normalizeRoute(req: Request): string {
    const routePath = (req as any).route?.path;
    if (routePath && typeof routePath === 'string') {
      const baseUrl = req.baseUrl || '';
      return `${baseUrl}${routePath}`;
    }

    // Fallback: Mask UUIDs and 20-digit timestamps in path
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
    return pathOnly
      .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ':id')
      .replace(/\/\d+/g, '/:id');
  }
}
