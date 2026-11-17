import { DueStatus } from '@prisma/client';
import { CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS } from '../constants';

export interface ArrearsDueLike {
  id?: string;
  installmentMonth: number;
  status: DueStatus | string;
}

export interface ConsecutiveArrearsOptions {
  /** Due IDs that should be treated as PAID in this in-flight transaction */
  treatAsPaidIds?: string[];
  /** Due IDs that should be treated as UNPAID in this in-flight transaction */
  treatAsUnpaidIds?: string[];
}

/**
 * Computes the exact maximum contiguous streak of unpaid installment months
 * for a subscriber ticket (ADR-07: "3 continuous (consecutive) months").
 *
 * Why longest contiguous unpaid run (ordered by installmentMonth):
 * - Normal sequential arrears (M1 PAID, M2..M4 UNPAID) -> 3.
 * - Clearing oldest overdue month (M1..M2 PAID, M3..M4 UNPAID) -> 2.
 * - Older reversed month followed by paid month (M1..M3 UNPAID, M4 PAID) -> 3
 *   (cannot be masked to 0 by a paid newer month).
 * - Non-consecutive reversals (M1 UNPAID, M2 PAID, M3 UNPAID, M4 PAID, M5 UNPAID) -> 1
 *   (never falsely inflates to 3 via aggregate totalUnpaid count).
 */
export function computeMaxConsecutiveUnpaidMonths(
  dues: readonly ArrearsDueLike[] | null | undefined,
  options?: ConsecutiveArrearsOptions,
): number {
  if (!dues || dues.length === 0) {
    return 0;
  }

  const paidSet = new Set(options?.treatAsPaidIds ?? []);
  const unpaidSet = new Set(options?.treatAsUnpaidIds ?? []);

  // Sort ascending by installmentMonth without mutating caller array
  const sorted = [...dues].sort((a, b) => a.installmentMonth - b.installmentMonth);

  let maxStreak = 0;
  let currentStreak = 0;
  let prevUnpaidMonth: number | null = null;

  for (const d of sorted) {
    const isPaid =
      d.id && unpaidSet.has(d.id)
        ? false
        : (d.id && paidSet.has(d.id)) || d.status === DueStatus.PAID;

    if (!isPaid) {
      if (prevUnpaidMonth === null || d.installmentMonth === prevUnpaidMonth + 1) {
        currentStreak += 1;
      } else {
        // Non-adjacent month gap resets the consecutive streak
        currentStreak = 1;
      }
      prevUnpaidMonth = d.installmentMonth;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else {
      currentStreak = 0;
      prevUnpaidMonth = null;
    }
  }

  return maxStreak;
}

/**
 * Derives the authoritative SubscriberTicket status from the recalculated
 * consecutive unpaid month streak while respecting terminal/in-flight states:
 * - REMOVED_DEF_3M is never resurrected by arrears recalculation.
 * - PENDING_REMOVAL_APPROVAL is preserved while arrears remain >= threshold
 *   and reverts to ACTIVE if arrears are paid down below threshold.
 */
export function deriveTicketArrearsStatus(
  consecutiveUnpaidMonths: number,
  currentStatus?: string | null,
): string {
  if (currentStatus === 'REMOVED_DEF_3M') {
    return 'REMOVED_DEF_3M';
  }

  if (consecutiveUnpaidMonths >= CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS) {
    return currentStatus === 'PENDING_REMOVAL_APPROVAL'
      ? 'PENDING_REMOVAL_APPROVAL'
      : 'DEFAULT_3_MONTHS';
  }

  return 'ACTIVE';
}
