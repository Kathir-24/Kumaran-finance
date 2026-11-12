// ==============================================================================
// Kumaran Chits — Shared BFF Upstream Header Forwarding Helper (DEF-FE-06)
// Preserves real client IP, protocol, host, user-agent, and trace correlation
// across all Next.js BFF -> NestJS server-to-server calls.
// ==============================================================================

import * as crypto from 'node:crypto';

export interface ReadableHeaders {
  get(name: string): string | null | undefined;
}

export interface BffForwardHeadersOptions {
  /** Forward API content negotiation headers (Content-Type, Accept, Idempotency-Key, X-Branch-Id). */
  includeContentHeaders?: boolean;
  /** Optional explicit Content-Type override (e.g. 'application/json' for BFF auth JSON calls). */
  contentType?: string;
}

const CONTENT_HEADER_NAMES = [
  'content-type',
  'idempotency-key',
  'accept',
  'x-branch-id',
] as const;

function copyIfPresent(
  source: ReadableHeaders,
  target: Headers,
  headerName: string,
): string | null {
  const raw = source.get(headerName)?.trim();
  if (raw) {
    target.set(headerName, raw);
    return raw;
  }
  return null;
}

/**
 * Builds upstream headers from an incoming Next.js request so NestJS resolves
 * the real end-user IP (not the Next.js loopback/container peer) and inherits
 * a unified `X-Request-ID`, `X-Forwarded-Proto`, `X-Forwarded-Host`, and `User-Agent`.
 */
export function buildBffForwardHeaders(
  source: ReadableHeaders,
  options: BffForwardHeadersOptions = {},
): Headers {
  const target = new Headers();

  const xRealIp = copyIfPresent(source, target, 'x-real-ip');
  const xForwardedFor = copyIfPresent(source, target, 'x-forwarded-for');
  if (!xForwardedFor && xRealIp) {
    target.set('x-forwarded-for', xRealIp);
  }

  copyIfPresent(source, target, 'x-forwarded-proto');

  const xForwardedHost = copyIfPresent(source, target, 'x-forwarded-host');
  if (!xForwardedHost) {
    const inboundHost = source.get('host')?.trim();
    if (inboundHost) {
      target.set('x-forwarded-host', inboundHost);
    }
  }

  copyIfPresent(source, target, 'user-agent');

  const existingRequestId = source.get('x-request-id')?.trim();
  target.set('x-request-id', existingRequestId || crypto.randomUUID());

  if (options.includeContentHeaders) {
    for (const name of CONTENT_HEADER_NAMES) {
      copyIfPresent(source, target, name);
    }
  }

  if (options.contentType) {
    target.set('content-type', options.contentType);
  }

  return target;
}
