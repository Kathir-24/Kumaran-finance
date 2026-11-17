import { DueStatus } from '@prisma/client';
import {
  computeMaxConsecutiveUnpaidMonths,
  deriveTicketArrearsStatus,
} from '../../src/common/utils/arrears.util';

describe('ADR-07 Canonical Consecutive Arrears Utility (arrears.util)', () => {
  it('returns 0 when dues list is empty or all dues are PAID', () => {
    expect(computeMaxConsecutiveUnpaidMonths([])).toBe(0);
    expect(
      computeMaxConsecutiveUnpaidMonths([
        { id: 'd1', installmentMonth: 1, status: DueStatus.PAID },
        { id: 'd2', installmentMonth: 2, status: DueStatus.PAID },
      ]),
    ).toBe(0);
  });

  it('computes exact contiguous streak for sequential arrears (M1 PAID, M2..M4 UNPAID => 3)', () => {
    const dues = [
      { id: 'd4', installmentMonth: 4, status: DueStatus.OVERDUE },
      { id: 'd3', installmentMonth: 3, status: DueStatus.OVERDUE },
      { id: 'd2', installmentMonth: 2, status: DueStatus.OVERDUE },
      { id: 'd1', installmentMonth: 1, status: DueStatus.PAID },
    ];
    expect(computeMaxConsecutiveUnpaidMonths(dues)).toBe(3);
    // Settling oldest unpaid month (M2) reduces streak to 2
    expect(computeMaxConsecutiveUnpaidMonths(dues, { treatAsPaidIds: ['d2'] })).toBe(2);
  });

  it('does NOT inflate non-consecutive unpaid months into DEFAULT_3_MONTHS (M1, M3, M5 unpaid => 1, not 3)', () => {
    const dues = [
      { id: 'd1', installmentMonth: 1, status: DueStatus.UNPAID },
      { id: 'd2', installmentMonth: 2, status: DueStatus.PAID },
      { id: 'd3', installmentMonth: 3, status: DueStatus.UNPAID },
      { id: 'd4', installmentMonth: 4, status: DueStatus.PAID },
      { id: 'd5', installmentMonth: 5, status: DueStatus.UNPAID },
    ];
    expect(computeMaxConsecutiveUnpaidMonths(dues)).toBe(1);
    expect(deriveTicketArrearsStatus(1, 'ACTIVE')).toBe('ACTIVE');
  });

  it('detects 3 consecutive unpaid older months even when a newer month is PAID (cannot be masked to 0)', () => {
    const dues = [
      { id: 'd1', installmentMonth: 1, status: DueStatus.UNPAID },
      { id: 'd2', installmentMonth: 2, status: DueStatus.UNPAID },
      { id: 'd3', installmentMonth: 3, status: DueStatus.UNPAID },
      { id: 'd4', installmentMonth: 4, status: DueStatus.PAID },
    ];
    expect(computeMaxConsecutiveUnpaidMonths(dues)).toBe(3);
  });

  it('respects treatAsUnpaidIds during payment reversal recalculation', () => {
    const dues = [
      { id: 'd1', installmentMonth: 1, status: DueStatus.PAID },
      { id: 'd2', installmentMonth: 2, status: DueStatus.UNPAID },
      { id: 'd3', installmentMonth: 3, status: DueStatus.PAID },
      { id: 'd4', installmentMonth: 4, status: DueStatus.UNPAID },
    ];
    // Reversing M3 connects M2 + M3 + M4 into a true 3-month consecutive streak
    expect(computeMaxConsecutiveUnpaidMonths(dues, { treatAsUnpaidIds: ['d3'] })).toBe(3);
  });

  it('preserves terminal REMOVED_DEF_3M and in-flight PENDING_REMOVAL_APPROVAL states safely', () => {
    expect(deriveTicketArrearsStatus(0, 'REMOVED_DEF_3M')).toBe('REMOVED_DEF_3M');
    expect(deriveTicketArrearsStatus(3, 'REMOVED_DEF_3M')).toBe('REMOVED_DEF_3M');
    expect(deriveTicketArrearsStatus(3, 'PENDING_REMOVAL_APPROVAL')).toBe('PENDING_REMOVAL_APPROVAL');
    expect(deriveTicketArrearsStatus(2, 'PENDING_REMOVAL_APPROVAL')).toBe('ACTIVE');
    expect(deriveTicketArrearsStatus(3, 'ACTIVE')).toBe('DEFAULT_3_MONTHS');
    expect(deriveTicketArrearsStatus(2, 'DEFAULT_3_MONTHS')).toBe('ACTIVE');
  });
});
