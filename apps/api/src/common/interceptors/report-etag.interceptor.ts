// ==============================================================================
// Kumaran Chits — Statutory Reports HTTP ETag & 304 Conditional Interceptor
// Bandwidth & CPU optimization for historical Day Books, Cash Books & Minutes.
// Scopes every ETag by caller identity (userId/roles/branchId/partnerStatus) +
// canonicalized query filters and emits `Vary: Authorization, Cookie` to prevent
// cross-branch cache poisoning. Returns RxJS `EMPTY` on 304 so global response
// wrappers never emit a body after `res.end()`.
// ==============================================================================

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { EMPTY, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { stringifyBigIntSafe } from '../utils/bigint-json.util';

interface RequestUserScope {
  sub?: string;
  roles?: string[];
  branchId?: string | null;
}

function canonicalizeRequestTarget(rawTarget: string): string {
  if (!rawTarget) {
    return '';
  }

  const queryIndex = rawTarget.indexOf('?');
  if (queryIndex === -1) {
    return rawTarget;
  }

  const pathname = rawTarget.slice(0, queryIndex);
  const queryString = rawTarget.slice(queryIndex + 1);
  if (!queryString) {
    return pathname;
  }

  const entries = Array.from(new URLSearchParams(queryString).entries());
  entries.sort(([ka, va], [kb, vb]) => ka.localeCompare(kb) || va.localeCompare(vb));
  const sorted = new URLSearchParams();
  for (const [k, v] of entries) {
    sorted.append(k, v);
  }
  const serializedQuery = sorted.toString();
  return serializedQuery ? `${pathname}?${serializedQuery}` : pathname;
}

function buildCanonicalScopeKey(req: Request): string {
  const user = (req as Request & { user?: RequestUserScope }).user;
  const userId = user?.sub ?? '';
  const roles = Array.isArray(user?.roles)
    ? [...user.roles].sort().join(',')
    : '';
  const branchId = user?.branchId ?? '';
  const isPartner = Boolean(
    Array.isArray(user?.roles) && user.roles.includes(Role.PARTNER),
  );
  const requestTarget = canonicalizeRequestTarget(req.originalUrl ?? req.url ?? '');

  return JSON.stringify({
    u: userId,
    r: roles,
    b: branchId,
    p: isPartner,
    t: requestTarget,
  });
}

function matchesIfNoneMatch(
  headerValue: string | string[] | undefined,
  weakEtag: string,
  rawHash: string,
): boolean {
  if (!headerValue) {
    return false;
  }

  const rawHeader = Array.isArray(headerValue)
    ? headerValue.join(',')
    : headerValue;

  const strongEtag = `"${rawHash}"`;
  const candidates = rawHeader
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (const tag of candidates) {
    if (tag === '*') {
      return true;
    }
    if (tag === weakEtag || tag === strongEtag || tag === rawHash) {
      return true;
    }
  }

  return false;
}

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

        // Compute deterministic SHA-256 weak ETag scoped by caller identity, canonical filters, and payload
        const scopeKey = buildCanonicalScopeKey(req);
        const serialized = stringifyBigIntSafe(data);
        const hash = crypto
          .createHash('sha256')
          .update(scopeKey)
          .update('\n')
          .update(serialized)
          .digest('hex')
          .substring(0, 32);
        const etag = `W/"${hash}"`;

        const ifNoneMatch = req.headers['if-none-match'];

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
        res.setHeader('Vary', 'Authorization, Cookie');

        if (matchesIfNoneMatch(ifNoneMatch, etag, hash)) {
          res.status(304);
          res.end();
          // XR-M7-RPT-03: Complete with EMPTY so outer TransformResponseInterceptor never writes a body after res.end()
          return EMPTY;
        }

        return of(data);
      }),
    );
  }
}
