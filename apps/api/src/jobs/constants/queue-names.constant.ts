import type { DefaultJobOptions } from 'bullmq';

export const DAILY_MAINTENANCE_QUEUE = 'daily-maintenance-queue';
export const NOTIFICATION_QUEUE = 'notification-queue';
export const RECONCILIATION_QUEUE = 'reconciliation-queue';

export const JOB_PROCESS_DAILY_ARREARS = 'process-daily-arrears';
export const JOB_DISPATCH_PAYMENT_RECEIPT = 'dispatch-payment-receipt';
export const JOB_DISPATCH_AUCTION_REMINDER = 'dispatch-auction-reminder';
export const JOB_DISPATCH_AUCTION_RESULT = 'dispatch-auction-result';
export const JOB_DISPATCH_DEFAULT_WARNING = 'dispatch-default-warning';
export const JOB_DISPATCH_APPROVAL_ALERT = 'dispatch-approval-alert';
export const JOB_RUN_DAILY_RECONCILIATION = 'run-daily-reconciliation';

/**
 * Bounded Redis retention caps for failed BullMQ jobs (DEF-DB-06).
 * Preserves up to 500 failed jobs or 7 days of history for Bull Board inspection
 * while preventing unbounded Redis memory growth.
 */
export const BULLMQ_FAILED_JOB_MAX_COUNT = 500;
export const BULLMQ_FAILED_JOB_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 604800 (7 days)

/**
 * Factory returning a fresh DefaultJobOptions object per queue so BullMQ internal
 * option mutations cannot leak across queue instances.
 */
export function createDefaultBullMqJobOptions(): DefaultJobOptions {
  return {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: {
      count: BULLMQ_FAILED_JOB_MAX_COUNT,
      age: BULLMQ_FAILED_JOB_MAX_AGE_SECONDS,
    },
  };
}
