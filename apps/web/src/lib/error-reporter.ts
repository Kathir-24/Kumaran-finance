// ==============================================================================
// Kumaran Chits — Client-Side Error Telemetry & Incident Reporter
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/observability-and-monitoring-architecture.md
// ==============================================================================

export interface IncidentReport {
  incidentId: string;
  timestamp: string;
  message: string;
  digest?: string;
  url: string;
  userAgent: string;
  stack?: string;
  copyText: string;
}

/**
 * Generates a human-readable, deterministic or unique incident reference code.
 * Example: 'ERR-KUM-A8F29D'
 */
export function generateIncidentCode(seed?: string): string {
  if (seed && seed.trim().length > 0) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(6, '0').slice(0, 6);
    return `ERR-KUM-${hex}`;
  }
  const randomHex = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .toUpperCase()
    .padStart(6, '0');
  return `ERR-KUM-${randomHex}`;
}

/**
 * Safely captures client-side errors, dispatches to Sentry (if enabled),
 * produces a structured incident report, and returns human-readable summary.
 */
export function reportClientError(
  error: (Error & { digest?: string }) | unknown,
  extraContext?: Record<string, unknown>,
): IncidentReport {
  const errObj = error instanceof Error ? error : new Error(String(error));
  const digest = (errObj as Error & { digest?: string }).digest;
  const incidentId = generateIncidentCode(digest || `${errObj.message}-${errObj.name}`);
  const timestamp = new Date().toISOString();
  const url = typeof window !== 'undefined' ? window.location.href : 'SSR';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Server';

  const copyText = [
    `Kumaran Chits Error Incident Report`,
    `Incident ID: ${incidentId}`,
    `Time: ${timestamp}`,
    `URL: ${url}`,
    `Message: ${errObj.message}`,
    digest ? `Digest: ${digest}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const report: IncidentReport = {
    incidentId,
    timestamp,
    message: errObj.message || 'Unknown error occurred',
    digest,
    url,
    userAgent,
    stack: errObj.stack,
    copyText,
  };

  // 1. Structured console log
  if (typeof console !== 'undefined' && console.error) {
    console.error(`[Kumaran Chits Incident ${incidentId}]`, {
      ...report,
      ...(extraContext || {}),
    });
  }

  // 2. Safe Sentry dispatch (if configured or loaded globally)
  try {
    const globalWindow =
      typeof window !== 'undefined'
        ? (window as Window & {
            Sentry?: {
              captureException?: (err: Error, ctx: Record<string, unknown>) => void;
            };
          })
        : null;
    if (globalWindow?.Sentry && typeof globalWindow.Sentry.captureException === 'function') {
      globalWindow.Sentry.captureException(errObj, {
        tags: {
          incidentId,
          digest: digest || 'none',
        },
        extra: {
          report,
          ...(extraContext || {}),
        },
      });
    }
  } catch {
    // Non-blocking: Telemetry dispatch failures must never crash the UI
  }

  return report;
}
