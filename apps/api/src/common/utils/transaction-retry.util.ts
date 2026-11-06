// ==============================================================================
// Kumaran Chits — Transaction Retry Utility (Deadlock & Serialization Recovery)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: PostgreSQL 17 ACID & Concurrency Standards
// ==============================================================================

import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('TransactionRetryUtil');

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Checks whether the error is a transient PostgreSQL deadlock or serialization failure
 */
export function isTransientTransactionError(err: any): boolean {
  if (!err) return false;

  const message = String(err.message || '');
  const code = String(err.code || '');

  return (
    code === 'P2034' || // Prisma transaction conflict / deadlock
    code === '40P01' || // PostgreSQL deadlock_detected
    code === '40001' || // PostgreSQL serialization_failure
    message.includes('deadlock detected') ||
    message.includes('could not serialize access') ||
    message.includes('Transaction failed due to a write conflict')
  );
}

/**
 * Executes a Prisma transaction with automated exponential backoff and jitter upon transient deadlocks.
 */
export async function withTransactionRetry<T>(
  prisma: PrismaClient,
  action: (tx: any) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 50;
  const maxDelayMs = options?.maxDelayMs ?? 1000;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(action);
    } catch (err: any) {
      lastError = err;

      if (!isTransientTransactionError(err) || attempt >= maxRetries) {
        throw err;
      }

      // Exponential backoff with random jitter: (base * 2^attempt) + random(0, 50ms)
      const jitter = Math.floor(Math.random() * 50);
      const calculatedDelay = baseDelayMs * 2 ** attempt + jitter;
      const delay = Math.min(calculatedDelay, maxDelayMs);

      logger.warn(
        `[TransactionRetry] Transient conflict detected (${err.code || err.message}). Retrying transaction (Attempt ${attempt + 1}/${maxRetries}) after ${delay}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
