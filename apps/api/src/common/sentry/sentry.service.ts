// ==============================================================================
// Kumaran Chits — Sentry Domain Helper Service
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Indian DPDP Act 2023, Safe Non-Blocking Logging
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import {
  buildSafeSentryUserContext,
  captureSentryException,
  isSentryActive,
  scrubPii,
  SentryUserInput,
  withSentryScope,
} from './sentry.config';

@Injectable()
export class SentryService {
  private readonly logger = new Logger(SentryService.name);

  /**
   * Captures an unhandled error or exception to Sentry with attached metadata tags.
   * Safe non-blocking guarantee: Never throws or interrupts application execution.
   */
  captureException(
    exception: unknown,
    context?: {
      tags?: Record<string, string | number | boolean>;
      extra?: Record<string, any>;
      user?: SentryUserInput;
    },
  ): string | undefined {
    if (!isSentryActive()) {
      return undefined;
    }

    try {
      let eventId: string | undefined;

      withSentryScope((scope) => {
        if (context?.tags) {
          for (const [k, v] of Object.entries(context.tags)) {
            scope.setTag(k, String(v));
          }
        }

        const safeUser = buildSafeSentryUserContext(context?.user);
        if (safeUser) {
          scope.setUser(safeUser);
        }

        if (context?.extra) {
          scope.setExtra('diagnostics', scrubPii(context.extra));
        }

        eventId = captureSentryException(exception);
      });

      return eventId;
    } catch (err: any) {
      this.logger.warn(`Failed to capture exception to Sentry: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Adds an operational breadcrumb for debugging leading up to a crash.
   */
  addBreadcrumb(breadcrumb: {
    category: string;
    message: string;
    level?: 'info' | 'warning' | 'error';
    data?: Record<string, any>;
  }): void {
    if (!isSentryActive()) {
      return;
    }

    try {
      Sentry.addBreadcrumb({
        category: breadcrumb.category,
        message: breadcrumb.message,
        level: breadcrumb.level || 'info',
        data: breadcrumb.data ? scrubPii(breadcrumb.data) : undefined,
      });
    } catch {
      // safe no-op
    }
  }
}
