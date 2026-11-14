// ==============================================================================
// Kumaran Chits — Transaction Retry & Deadlock Recovery Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: PostgreSQL 17 ACID & Concurrency Standards
// ==============================================================================

import {
  isTransientTransactionError,
  withTransactionRetry,
} from '../../src/common/utils/transaction-retry.util';

describe('TransactionRetryUtil (Deadlock & Transient Conflict Recovery)', () => {
  describe('isTransientTransactionError Classification', () => {
    it('RETRY-01: identifies PostgreSQL 40P01 deadlock_detected as transient', () => {
      const err = { code: '40P01', message: 'deadlock detected' };
      expect(isTransientTransactionError(err)).toBe(true);
    });

    it('RETRY-02: identifies PostgreSQL 40001 serialization_failure as transient', () => {
      const err = { code: '40001', message: 'could not serialize access due to concurrent update' };
      expect(isTransientTransactionError(err)).toBe(true);
    });

    it('RETRY-03: identifies Prisma P2034 transaction conflict as transient', () => {
      const err = { code: 'P2034', message: 'Transaction failed due to a write conflict' };
      expect(isTransientTransactionError(err)).toBe(true);
    });

    it('RETRY-04: identifies P2002 on receiptNumber as transient retry candidate', () => {
      const err = {
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`receiptNumber`)',
      };
      expect(isTransientTransactionError(err)).toBe(true);
    });

    it('RETRY-04B: identifies P2002 via Prisma meta.target containing receiptNumber', () => {
      const err = {
        code: 'P2002',
        meta: { target: ['receiptNumber'] },
        message: 'Unique constraint failed',
      };
      expect(isTransientTransactionError(err)).toBe(true);
    });

    it('RETRY-04C: identifies P2002 on customerCode as transient retry candidate', () => {
      const err = {
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`customerCode`)',
      };
      expect(isTransientTransactionError(err)).toBe(true);
    });

    it('RETRY-04D: identifies P2002 via Prisma meta.target containing customerCode', () => {
      const err = {
        code: 'P2002',
        meta: { target: ['customerCode'] },
        message: 'Unique constraint failed',
      };
      expect(isTransientTransactionError(err)).toBe(true);
    });

    it('RETRY-05: rejects P2002 on idempotencyKey or transactionRef from retry', () => {
      const err1 = {
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`idempotencyKey`)',
      };
      const err2 = {
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`transactionRef`)',
      };
      expect(isTransientTransactionError(err1)).toBe(false);
      expect(isTransientTransactionError(err2)).toBe(false);
    });

    it('RETRY-06: rejects non-transient errors (P2025, BadRequest, null)', () => {
      expect(isTransientTransactionError(null)).toBe(false);
      expect(isTransientTransactionError(new Error('Invalid input'))).toBe(false);
      expect(isTransientTransactionError({ code: 'P2025', message: 'Record not found' })).toBe(false);
    });
  });

  describe('withTransactionRetry Execution', () => {
    it('RETRY-07: successfully executes on first attempt without retry', async () => {
      const mockPrisma = {
        $transaction: jest.fn().mockImplementation(async (fn) => fn({ mockTx: true })),
      };

      const result = await withTransactionRetry(mockPrisma as any, async (tx) => {
        return { success: true, txReceived: tx.mockTx };
      });

      expect(result).toEqual({ success: true, txReceived: true });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('RETRY-08: transparently retries and recovers from transient 40P01 deadlock', async () => {
      let callCount = 0;
      const mockPrisma = {
        $transaction: jest.fn().mockImplementation(async (fn) => {
          callCount++;
          if (callCount === 1) {
            const deadlockErr: any = new Error('deadlock detected');
            deadlockErr.code = '40P01';
            throw deadlockErr;
          }
          return fn({ attempt: callCount });
        }),
      };

      const result = await withTransactionRetry(
        mockPrisma as any,
        async (tx) => `Recovered on attempt ${tx.attempt}`,
        { maxRetries: 3, baseDelayMs: 5, maxDelayMs: 20 },
      );

      expect(result).toBe('Recovered on attempt 2');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('RETRY-09: throws immediately on non-transient error without unnecessary retries', async () => {
      const mockPrisma = {
        $transaction: jest.fn().mockImplementation(async () => {
          const validationErr: any = new Error('Invalid payment amount');
          validationErr.status = 400;
          throw validationErr;
        }),
      };

      await expect(
        withTransactionRetry(mockPrisma as any, async () => true, {
          maxRetries: 3,
          baseDelayMs: 5,
        }),
      ).rejects.toThrow('Invalid payment amount');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('RETRY-10: rethrows last transient error if maxRetries is exhausted', async () => {
      const mockPrisma = {
        $transaction: jest.fn().mockImplementation(async () => {
          const deadlockErr: any = new Error('deadlock detected');
          deadlockErr.code = '40P01';
          throw deadlockErr;
        }),
      };

      await expect(
        withTransactionRetry(mockPrisma as any, async () => true, {
          maxRetries: 2,
          baseDelayMs: 2,
          maxDelayMs: 10,
        }),
      ).rejects.toThrow('deadlock detected');

      // Initial attempt (1) + 2 retries = 3 calls total
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });
  });
});
