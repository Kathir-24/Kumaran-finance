// ==============================================================================
// Kumaran Chits — Shared Pessimistic Row-Lock & Receipt Sequence Utility
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: PostgreSQL 17 Global Lock Order DAG (Zero 40P01 Deadlocks)
// ==============================================================================

import { DueStatus, PaymentStatus } from '@prisma/client';

export interface LockedDueRow {
  id: string;
  status: DueStatus;
  netPayableAmount: bigint;
}

export interface LockedPaymentRow {
  id: string;
  paymentStatus: PaymentStatus;
}

export interface PaymentLockTargets {
  branchId?: string | null;
  ticketIds?: string[];
  dueIds?: string[];
  paymentIds?: string[];
}

export interface AcquiredPaymentLocks {
  lockedDues: LockedDueRow[];
  lockedPayments: LockedPaymentRow[];
}

/**
 * Interactive transaction budget for Branch-serialized payment and receipt transactions.
 * Allows brief serialization queueing across concurrent staff/agents without false 5s expiry.
 */
export const PAYMENT_TRANSACTION_OPTIONS = {
  maxWait: 10000,
  timeout: 15000,
};

function normalizeSortedIds(ids?: string[]): string[] {
  if (!ids || ids.length === 0) return [];
  return [...new Set(ids.filter(Boolean))].sort();
}

/**
 * Acquires pessimistic row locks (`SELECT ... FOR UPDATE`) in strict global DAG order:
 * Tier 1: Branch -> Tier 2: SubscriberTicket -> Tier 3: InstallmentDue -> Tier 4: Payment.
 * Multi-row tiers are deduplicated and sorted lexicographically to prevent cyclic deadlocks (`40P01`).
 */
export async function acquirePaymentConcurrencyLocks(
  tx: any,
  targets: PaymentLockTargets,
): Promise<AcquiredPaymentLocks> {
  if (typeof tx?.$queryRaw !== 'function') {
    return { lockedDues: [], lockedPayments: [] };
  }

  // Tier 1: Lock owning Branch row to serialize per-branch sequential receipt issuance
  if (targets.branchId) {
    await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${targets.branchId} FOR UPDATE`;
  }

  // Tier 2: Lock SubscriberTicket row(s) in deterministic ID order to serialize arrears updates
  const sortedTicketIds = normalizeSortedIds(targets.ticketIds);
  if (sortedTicketIds.length === 1) {
    await tx.$queryRaw`SELECT id FROM "SubscriberTicket" WHERE id = ${sortedTicketIds[0]} FOR UPDATE`;
  } else if (sortedTicketIds.length > 1) {
    await tx.$queryRaw`
      SELECT id FROM "SubscriberTicket"
      WHERE id = ANY(${sortedTicketIds}::text[])
      ORDER BY id FOR UPDATE
    `;
  }

  // Tier 3: Lock InstallmentDue row(s) in deterministic ID order to prevent duplicate payments
  let lockedDues: LockedDueRow[] = [];
  const sortedDueIds = normalizeSortedIds(targets.dueIds);
  if (sortedDueIds.length === 1) {
    const rows = await tx.$queryRaw<LockedDueRow[]>`
      SELECT id, status, "netPayableAmount" FROM "InstallmentDue" WHERE id = ${sortedDueIds[0]} FOR UPDATE
    `;
    lockedDues = Array.isArray(rows) ? rows : [];
  } else if (sortedDueIds.length > 1) {
    const rows = await tx.$queryRaw<LockedDueRow[]>`
      SELECT id, status, "netPayableAmount" FROM "InstallmentDue"
      WHERE id = ANY(${sortedDueIds}::text[])
      ORDER BY id FOR UPDATE
    `;
    lockedDues = Array.isArray(rows) ? rows : [];
  }

  // Tier 4: Lock existing Payment row(s) when transitioning claim/settlement states
  let lockedPayments: LockedPaymentRow[] = [];
  const sortedPaymentIds = normalizeSortedIds(targets.paymentIds);
  if (sortedPaymentIds.length === 1) {
    const rows = await tx.$queryRaw<LockedPaymentRow[]>`
      SELECT id, "paymentStatus" FROM "Payment" WHERE id = ${sortedPaymentIds[0]} FOR UPDATE
    `;
    lockedPayments = Array.isArray(rows) ? rows : [];
  } else if (sortedPaymentIds.length > 1) {
    const rows = await tx.$queryRaw<LockedPaymentRow[]>`
      SELECT id, "paymentStatus" FROM "Payment"
      WHERE id = ANY(${sortedPaymentIds}::text[])
      ORDER BY id FOR UPDATE
    `;
    lockedPayments = Array.isArray(rows) ? rows : [];
  }

  return { lockedDues, lockedPayments };
}

/**
 * Generates the next sequential bilingual receipt number (`KC-REC-{BRANCH}-{YYYY}-{XXXXX}`).
 * Must execute strictly inside a locked database transaction (`tx`) after acquiring the Tier 1 Branch lock.
 *
 * Uses numeric PostgreSQL suffix extraction (`^[0-9]{1,18}$`) when `$queryRaw` returns a scalar row so
 * legacy non-numeric receipt patterns (e.g. `KC-REC-PRD-2026-REV-00012`) never poison ASCII sort order
 * or trigger hundreds of sequential `findUnique` probes while holding the Branch lock.
 */
export async function generateNextReceiptNumber(
  tx: any,
  prefix: string,
): Promise<string> {
  if (typeof tx?.$queryRaw === 'function') {
    const startPos = prefix.length + 1;
    const rows = await tx.$queryRaw<Array<{ maxSeq: bigint | number | string | null }>>`
      SELECT COALESCE(
        MAX(
          CASE
            WHEN substr("receiptNumber", CAST(${startPos} AS INTEGER)) ~ '^[0-9]{1,18}$'
            THEN CAST(substr("receiptNumber", CAST(${startPos} AS INTEGER)) AS BIGINT)
            ELSE NULL
          END
        ),
        0
      ) AS "maxSeq"
      FROM "Receipt"
      WHERE starts_with("receiptNumber", ${prefix})
        AND substr("receiptNumber", CAST(${startPos} AS INTEGER)) ~ '^[0-9]{1,18}$'
    `;

    if (
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows[0] &&
      rows[0].maxSeq !== undefined &&
      rows[0].maxSeq !== null
    ) {
      const nextBigSeq = BigInt(rows[0].maxSeq) + 1n;
      return `${prefix}${nextBigSeq.toString().padStart(5, '0')}`;
    }
  }

  let nextSeq = 1;

  if (typeof tx?.receipt?.findFirst === 'function') {
    const txLastReceipt = await tx.receipt.findFirst({
      where: { receiptNumber: { startsWith: prefix } },
      orderBy: { receiptNumber: 'desc' },
      select: { receiptNumber: true },
    });

    if (txLastReceipt?.receiptNumber) {
      const parts = String(txLastReceipt.receiptNumber).split('-');
      const lastNum = parseInt(parts[parts.length - 1] || '', 10);
      if (!Number.isNaN(lastNum) && lastNum >= nextSeq) {
        nextSeq = lastNum + 1;
      }
    }
  }

  let candidate = `${prefix}${String(nextSeq).padStart(5, '0')}`;
  if (typeof tx?.receipt?.findUnique === 'function') {
    while (await tx.receipt.findUnique({ where: { receiptNumber: candidate } })) {
      nextSeq++;
      candidate = `${prefix}${String(nextSeq).padStart(5, '0')}`;
    }
  }

  return candidate;
}
