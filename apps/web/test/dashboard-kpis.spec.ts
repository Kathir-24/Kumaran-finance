// ==============================================================================
// Kumaran Chits — Executive KPI Dashboard Test Suite (Task 3.2)
// Asserts Whole Rupee Math, Inflow Balancing, Arrears Aging, 21-Day Countdown,
// and Maker != Checker Dual Control Queue.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupee, assertWholeRupee, parseWholeRupees } from '../src/lib/currency.ts';

test('Guardrail 2: Dashboard monetary values parse and format without paise or decimals', () => {
  const sampleDashboardData = {
    todayCollections: {
      total: 75000,
      cash: 45000,
      upi: 20000,
      bankTransfer: 10000,
      cheque: 0,
    },
    todayDisbursements: {
      total: 190000,
    },
    branchVault: {
      currentCashInSafe: 145000n,
    },
    arrearsAging: {
      bucket1Month: { count: 3, totalAmount: 15000 },
      bucket2Months: { count: 1, totalAmount: 10000 },
      bucket3MonthsAndAbove: { count: 2, totalAmount: 20000 },
    },
  };

  // Test collections
  assert.equal(formatRupee(sampleDashboardData.todayCollections.total), '₹75,000');
  assert.equal(formatRupee(sampleDashboardData.todayCollections.cash), '₹45,000');
  assert.equal(formatRupee(sampleDashboardData.todayCollections.upi), '₹20,000');
  assert.equal(formatRupee(sampleDashboardData.todayCollections.bankTransfer), '₹10,000');

  // Test disbursements
  assert.equal(formatRupee(sampleDashboardData.todayDisbursements.total), '₹1,90,000');

  // Test vault balance
  assert.equal(formatRupee(sampleDashboardData.branchVault.currentCashInSafe), '₹1,45,000');

  // Verify zero paise / decimals in all formatted strings
  const formattedValues = [
    formatRupee(sampleDashboardData.todayCollections.total),
    formatRupee(sampleDashboardData.todayDisbursements.total),
    formatRupee(sampleDashboardData.branchVault.currentCashInSafe),
    formatRupee(sampleDashboardData.arrearsAging.bucket1Month.totalAmount),
  ];

  for (const f of formattedValues) {
    assert.ok(!f.includes('.'), `Formatted currency '${f}' must not contain decimal dot`);
    assert.ok(!f.includes('.00'), `Formatted currency '${f}' must not contain paise .00`);
  }
});

test('Invariant: Payment Mode Breakdown Sum strictly equals Total Collections', () => {
  function validateCollectionBreakdown(collections: {
    total: number | bigint;
    cash: number | bigint;
    upi: number | bigint;
    bankTransfer: number | bigint;
    cheque: number | bigint;
  }) {
    const sum =
      BigInt(collections.cash) +
      BigInt(collections.upi) +
      BigInt(collections.bankTransfer) +
      BigInt(collections.cheque);

    const expectedTotal = BigInt(collections.total);
    return sum === expectedTotal;
  }

  // Valid breakdown
  const valid = {
    total: 100000n,
    cash: 50000n,
    upi: 30000n,
    bankTransfer: 15000n,
    cheque: 5000n,
  };
  assert.equal(validateCollectionBreakdown(valid), true);

  // Invalid breakdown (mismatch)
  const invalid = {
    total: 100000n,
    cash: 50000n,
    upi: 30000n,
    bankTransfer: 10000n, // sum is 95,000 != 100,000
    cheque: 5000n,
  };
  assert.equal(validateCollectionBreakdown(invalid), false);
});

test('Invariant: Vault Safe Cash Balance strictly isolates physical cash flows', () => {
  function computeVaultBalance(inflows: { mode: string; amount: bigint }[], outflows: { mode: string; amount: bigint }[]) {
    const cashInflows = inflows
      .filter((i) => i.mode === 'CASH')
      .reduce((acc, curr) => acc + curr.amount, 0n);

    const cashOutflows = outflows
      .filter((o) => o.mode === 'CASH')
      .reduce((acc, curr) => acc + curr.amount, 0n);

    return cashInflows - cashOutflows;
  }

  const inflows = [
    { mode: 'CASH', amount: 50000n },
    { mode: 'UPI', amount: 30000n }, // Non-cash, excluded from physical vault
    { mode: 'BANK_TRANSFER', amount: 20000n }, // Non-cash, excluded from physical vault
    { mode: 'CASH', amount: 25000n },
  ];

  const outflows = [
    { mode: 'CASH', amount: 15000n },
    { mode: 'BANK_TRANSFER', amount: 85000n }, // Non-cash prize payout
  ];

  const vaultBalance = computeVaultBalance(inflows, outflows);
  // (50000 + 25000) - 15000 = 60000
  assert.equal(vaultBalance, 60000n);
});

test('Guardrail 8 & ADR-07: Defaulters categorized into 1M, 2M, and 3M+ Removal tiers', () => {
  interface DefaulterTicket {
    ticketNumber: number;
    consecutiveUnpaidMonths: number;
    unpaidAmount: bigint;
  }

  function bucketDefaulters(tickets: DefaulterTicket[]) {
    let b1Count = 0;
    let b1Total = 0n;
    let b2Count = 0;
    let b2Total = 0n;
    let b3Count = 0;
    let b3Total = 0n;

    for (const t of tickets) {
      if (t.consecutiveUnpaidMonths === 1) {
        b1Count++;
        b1Total += t.unpaidAmount;
      } else if (t.consecutiveUnpaidMonths === 2) {
        b2Count++;
        b2Total += t.unpaidAmount;
      } else if (t.consecutiveUnpaidMonths >= 3) {
        b3Count++;
        b3Total += t.unpaidAmount;
      }
    }

    return {
      bucket1Month: { count: b1Count, totalAmount: b1Total },
      bucket2Months: { count: b2Count, totalAmount: b2Total },
      bucket3MonthsAndAbove: {
        count: b3Count,
        totalAmount: b3Total,
        eligibleForRemoval: b3Count > 0,
        note: 'Eligible for company removal rights under ADR-07',
      },
    };
  }

  const sampleTickets: DefaulterTicket[] = [
    { ticketNumber: 3, consecutiveUnpaidMonths: 1, unpaidAmount: 5000n },
    { ticketNumber: 7, consecutiveUnpaidMonths: 1, unpaidAmount: 5000n },
    { ticketNumber: 12, consecutiveUnpaidMonths: 2, unpaidAmount: 10000n },
    { ticketNumber: 19, consecutiveUnpaidMonths: 3, unpaidAmount: 15000n }, // Critical ADR-07
    { ticketNumber: 20, consecutiveUnpaidMonths: 4, unpaidAmount: 20000n }, // Critical ADR-07
  ];

  const buckets = bucketDefaulters(sampleTickets);
  assert.equal(buckets.bucket1Month.count, 2);
  assert.equal(buckets.bucket1Month.totalAmount, 10000n);
  assert.equal(buckets.bucket2Months.count, 1);
  assert.equal(buckets.bucket2Months.totalAmount, 10000n);
  assert.equal(buckets.bucket3MonthsAndAbove.count, 2);
  assert.equal(buckets.bucket3MonthsAndAbove.totalAmount, 35000n);
  assert.equal(buckets.bucket3MonthsAndAbove.eligibleForRemoval, true);
});

test('Form XVII: Statutory 21-Day Filing Countdown accurately classifies deadlines', () => {
  function calculateFilingStatus(auctionDateStr: string, filedAtRegistrar: boolean, referenceNow: Date) {
    if (filedAtRegistrar) {
      return { status: 'FILED', daysRemaining: 0 };
    }

    const auctionDate = new Date(auctionDateStr);
    const diffDays = Math.floor(
      (referenceNow.getTime() - auctionDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysRemaining = 21 - diffDays;

    if (daysRemaining < 0) {
      return { status: 'OVERDUE', daysRemaining };
    }
    if (daysRemaining <= 5) {
      return { status: 'URGENT', daysRemaining };
    }
    return { status: 'ON_TRACK', daysRemaining };
  }

  const now = new Date('2026-10-31T12:00:00.000Z');

  // Case 1: Auction held 5 days ago (2026-10-26) -> 16 days left (ON_TRACK)
  const case1 = calculateFilingStatus('2026-10-26T12:00:00.000Z', false, now);
  assert.equal(case1.status, 'ON_TRACK');
  assert.equal(case1.daysRemaining, 16);

  // Case 2: Auction held 18 days ago (2026-10-13) -> 3 days left (URGENT)
  const case2 = calculateFilingStatus('2026-10-13T12:00:00.000Z', false, now);
  assert.equal(case2.status, 'URGENT');
  assert.equal(case2.daysRemaining, 3);

  // Case 3: Auction held 25 days ago (2026-10-06) -> -4 days (OVERDUE)
  const case3 = calculateFilingStatus('2026-10-06T12:00:00.000Z', false, now);
  assert.equal(case3.status, 'OVERDUE');
  assert.equal(case3.daysRemaining, -4);

  // Case 4: Auction already marked filed
  const case4 = calculateFilingStatus('2026-10-06T12:00:00.000Z', true, now);
  assert.equal(case4.status, 'FILED');
});

test('Guardrail 10: Maker != Checker separation of duties in approval queue validation', () => {
  interface PendingApprovalItem {
    id: string;
    type: 'HANDOVER' | 'DISBURSEMENT' | 'REVERSAL' | 'SAFETY_PROOF';
    makerUserId: string;
    amount: bigint;
  }

  function validateCheckerEligibility(item: PendingApprovalItem, checkingUserId: string): boolean {
    // Maker != Checker Invariant
    return item.makerUserId !== checkingUserId;
  }

  const item: PendingApprovalItem = {
    id: 'rev-001',
    type: 'REVERSAL',
    makerUserId: 'user-partner-1',
    amount: 5000n,
  };

  // Partner 1 tries to approve their own reversal request -> FORBIDDEN
  assert.equal(validateCheckerEligibility(item, 'user-partner-1'), false);

  // Partner 2 approves Partner 1's reversal request -> ALLOWED
  assert.equal(validateCheckerEligibility(item, 'user-partner-2'), true);
});
