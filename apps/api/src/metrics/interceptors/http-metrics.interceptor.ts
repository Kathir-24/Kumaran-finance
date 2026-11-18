// ==============================================================================
// Kumaran Chits — HTTP Metrics Interceptor (Latency, Status & Cardinality Guard)
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
import { finalize, tap } from 'rxjs/operators';
import { MetricsService } from '../services/metrics.service';

const MAX_FALLBACK_ROUTES = 200;
const MAX_ROUTE_LABEL_LENGTH = 120;

const EXCLUDED_PREFIXES = ['/metrics', '/health', '/api/docs', '/admin/queues'];

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly observedFallbackRoutes = new Set<string>();

  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const rawUrl = req?.originalUrl || req?.url || '';
    const pathOnly = rawUrl.split('?')[0];

    // Exclude internal telemetry and doc paths (exact segment boundary) to avoid self-pollution
    if (this.isExcludedPath(pathOnly)) {
      return next.handle();
    }

    const start = performance.now();
    let errorStatusCode: number | undefined;

    return next.handle().pipe(
      tap({
        error: (err: any) => {
          if (err && typeof err.getStatus === 'function') {
            errorStatusCode = Number(err.getStatus());
          } else if (typeof err?.status === 'number') {
            errorStatusCode = err.status;
          } else {
            errorStatusCode = 500;
          }
        },
      }),
      finalize(() => {
        // Strict non-blocking isolation: telemetry errors must NEVER crash or disrupt HTTP responses
        try {
          const durationSeconds = Math.max(0, (performance.now() - start) / 1000);
          const numericStatus =
            errorStatusCode ?? (typeof res?.statusCode === 'number' ? res.statusCode : 500);
          const statusCode = String(numericStatus);
          const method = (req?.method || 'UNKNOWN').toUpperCase();

          // Normalize route to guarantee bounded Prometheus label cardinality (anti-DoS)
          const route = this.normalizeRoute(req, numericStatus);

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
        } catch {
          // Intentionally swallowed to protect financial request path
        }
      }),
    );
  }

  private isExcludedPath(pathOnly: string): boolean {
    return EXCLUDED_PREFIXES.some(
      (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
    );
  }

  /**
   * Normalizes URLs by preferring Express route templates and aggressively collapsing
   * dynamic UUIDs, numeric IDs, receipt/voucher/customer/group codes, storage keys,
   * and unmatched 404 scanner paths so Prometheus memory cannot be exhausted.
   */
  public normalizeRoute(req: Request, statusCode?: number): string {
    const rawRoutePath = (req as any)?.route?.path;
    const routePath = Array.isArray(rawRoutePath) ? rawRoutePath[0] : rawRoutePath;
    if (routePath && typeof routePath === 'string') {
      const baseUrl = this.sanitizePathSegments(req.baseUrl || '');
      const combined = `${baseUrl}${routePath}`.replace(/\/{2,}/g, '/');
      return this.stripTrailingSlash(combined).slice(0, MAX_ROUTE_LABEL_LENGTH);
    }

    // Unmatched 404 requests (e.g. vulnerability scanners) collapse into a single static label
    if (statusCode === 404) {
      return '__unmatched__';
    }

    const pathOnly = (req?.originalUrl || req?.url || '/').split('?')[0];
    const normalized = this.stripTrailingSlash(
      this.sanitizePathSegments(pathOnly),
    ).slice(0, MAX_ROUTE_LABEL_LENGTH);

    // Hard cardinality fuse for fallback routes
    if (this.observedFallbackRoutes.has(normalized)) {
      return normalized;
    }
    if (this.observedFallbackRoutes.size < MAX_FALLBACK_ROUTES) {
      this.observedFallbackRoutes.add(normalized);
      return normalized;
    }
    return '__other__';
  }

  private sanitizePathSegments(rawPath: string): string {
    if (!rawPath) return '';
    return rawPath
      .replace(/\/{2,}/g, '/')
      // Collapse arbitrary storage wildcard keys
      .replace(/(\/storage\/(?:file|upload))\/.+$/i, '$1/:key')
      // Normalize domain-specific receipt, voucher, customer, and chit group codes
      .replace(/\bKC-REC-[A-Za-z0-9_-]+(?:\.pdf)?\b/gi, ':receiptNo')
      .replace(/\bKC-VOU-[A-Za-z0-9_-]+(?:\.pdf)?\b/gi, ':voucherNo')
      .replace(/\bKC-CUST-[A-Za-z0-9_-]+\b/gi, ':customerCode')
      .replace(/\bKC[A-Z0-9]*-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+\b/gi, ':groupCode')
      // Normalize RFC 4122 UUIDs
      .replace(
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
        ':id',
      )
      // Normalize long hex/opaque identifiers (16+ hex chars or 20+ alnum/dash tokens)
      .replace(/\/[0-9a-fA-F]{16,}(?=\/|$)/g, '/:id')
      .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, '/:id')
      // Normalize pure numeric segments
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }

  private stripTrailingSlash(route: string): string {
    if (route.length > 1 && route.endsWith('/')) {
      return route.slice(0, -1);
    }
    return route || '/';
  }
}
