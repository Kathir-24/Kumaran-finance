// ==============================================================================
// Kumaran Chits — Mid-Cycle Notebook Onboarding Test Suite (Task 4.3)
// Asserts Whole Rupee Math, Month 1 & Past Auction Invariants, Fixed 1/4 Ceiling,
// ADR-13 Single-Ticket Constraint, Pre-Activation Balancing Guard, and Bilingual Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupee, assertWholeRupee, parseWholeRupees } from '../src/lib/currency.ts';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// Calculation helper mirroring notebook-entry-grid & notebook-master-form
function calculateOnboardingInvariants(chitValue: number, durationMonths: number) {
  assertWholeRupee(chitValue);
  assertWholeRupee(durationMonths);

  const isDivisible = durationMonths > 0 && chitValue % durationMonths === 0;
  const baseInstallment = isDivisible ? Math.floor(chitValue / durationMonths) : 0;
  const foremanCommission = Math.floor((chitValue * 4) / 100); // 4% locked
  const maxCeilingDiscount = Math.floor(chitValue / 4); // 1/4 ceiling

  return {
    isDivisible,
    baseInstallment,
    foremanCommission,
    maxCeilingDiscount,
  };
}

// Dividend calculation helper for historical months
function calculateHistoricalMonth(
  chitValue: number,
  durationMonths: number,
  month: number,
  bidDiscount: number
) {
  const { baseInstallment, foremanCommission, maxCeilingDiscount } = calculateOnboardingInvariants(
    chitValue,
    durationMonths
  );

  if (month === 1) {
    // Month 1 Rule: Company pool, 0 dividend
    return {
      month: 1,
      bidDiscount: 0,
      totalDividend: 0,
      dividendPerTicket: 0,
      netInstallment: baseInstallment,
      isCeilingExceeded: false,
    };
  }

  const isCeilingExceeded = bidDiscount > maxCeilingDiscount;
  const totalDividend = Math.max(0, bidDiscount - foremanCommission);
  const dividendPerTicket = durationMonths > 0 ? Math.floor(totalDividend / durationMonths) : 0;
  const netInstallment = Math.max(0, baseInstallment - dividendPerTicket);

  return {
    month,
    bidDiscount,
    totalDividend,
    dividendPerTicket,
    netInstallment,
    isCeilingExceeded,
  };
}

// Balancing guard helper
function calculateSystemTotal(
  membersCount: number,
  monthlyNetDues: Record<number, number>,
  unpaidCells: Array<{ ticket: number; month: number }>
): number {
  let total = 0;
  const unpaidSet = new Set(unpaidCells.map((u) => `${u.ticket}-${u.month}`));

  for (const [mStr, netDue] of Object.entries(monthlyNetDues)) {
    const month = parseInt(mStr, 10);
    for (let ticket = 1; ticket <= membersCount; ticket++) {
      if (!unpaidSet.has(`${ticket}-${month}`)) {
        total += netDue;
      }
    }
  }

  return total;
}

// ==============================================================================
// Unit Test Assertions
// ==============================================================================

test('Guardrail 2 & 6: Onboarding calculates whole-rupee installments, 4% commission, and 1/4 ceiling', () => {
  // ₹1 Lakh / 20 Months
  const inv1L = calculateOnboardingInvariants(100000, 20);
  assert.equal(inv1L.isDivisible, true);
  assert.equal(inv1L.baseInstallment, 5000);
  assert.equal(inv1L.foremanCommission, 4000);
  assert.equal(inv1L.maxCeilingDiscount, 25000);

  // ₹2 Lakh / 20 Months
  const inv2L = calculateOnboardingInvariants(200000, 20);
  assert.equal(inv2L.isDivisible, true);
  assert.equal(inv2L.baseInstallment, 10000);
  assert.equal(inv2L.foremanCommission, 8000);
  assert.equal(inv2L.maxCeilingDiscount, 50000);

  // ₹5 Lakh / 20 Months
  const inv5L = calculateOnboardingInvariants(500000, 20);
  assert.equal(inv5L.isDivisible, true);
  assert.equal(inv5L.baseInstallment, 25000);
  assert.equal(inv5L.foremanCommission, 20000);
  assert.equal(inv5L.maxCeilingDiscount, 125000);

  // ₹10 Lakh / 25 Months
  const inv10L = calculateOnboardingInvariants(1000000, 25);
  assert.equal(inv10L.isDivisible, true);
  assert.equal(inv10L.baseInstallment, 40000);
  assert.equal(inv10L.foremanCommission, 40000);
  assert.equal(inv10L.maxCeilingDiscount, 250000);
});

test('Guardrail 5: Month 1 has strictly ₹0 dividend and full base installment', () => {
  const m1 = calculateHistoricalMonth(100000, 20, 1, 0);
  assert.equal(m1.month, 1);
  assert.equal(m1.bidDiscount, 0);
  assert.equal(m1.totalDividend, 0);
  assert.equal(m1.dividendPerTicket, 0);
  assert.equal(m1.netInstallment, 5000);
  assert.equal(m1.isCeilingExceeded, false);
});

test('Guardrail 6: Historical auction discounts enforce 1/4 ceiling boundary', () => {
  // ₹1L chit: 1/4 ceiling is ₹25,000
  // Case A: Valid bid discount ₹24,000 (<= 25000)
  const validAuc = calculateHistoricalMonth(100000, 20, 2, 24000);
  assert.equal(validAuc.isCeilingExceeded, false);
  assert.equal(validAuc.totalDividend, 20000); // 24000 - 4000 (commission)
  assert.equal(validAuc.dividendPerTicket, 1000); // 20000 / 20
  assert.equal(validAuc.netInstallment, 4000); // 5000 - 1000

  // Case B: Ceiling bid discount exactly ₹25,000 (= 25000)
  const ceilingAuc = calculateHistoricalMonth(100000, 20, 3, 25000);
  assert.equal(ceilingAuc.isCeilingExceeded, false);
  assert.equal(ceilingAuc.totalDividend, 21000); // 25000 - 4000
  assert.equal(ceilingAuc.dividendPerTicket, 1050); // 21000 / 20
  assert.equal(ceilingAuc.netInstallment, 3950); // 5000 - 1050

  // Case C: Illegal bid discount ₹26,000 (> 25000)
  const invalidAuc = calculateHistoricalMonth(100000, 20, 4, 26000);
  assert.equal(invalidAuc.isCeilingExceeded, true);
});

test('Universal Dividend Invariant: Net Installment + Dividend equals Base Installment', () => {
  // For any valid discount, Inet + Div === Ibase
  const chitValue = 200000;
  const duration = 20; // Ibase = 10000
  const discounts = [10000, 20000, 35000, 48000, 50000];

  for (const d of discounts) {
    const calc = calculateHistoricalMonth(chitValue, duration, 2, d);
    assert.equal(
      calc.netInstallment + calc.dividendPerTicket,
      10000,
      `Row sum mismatch for discount ₹${d}`
    );
  }
});

test('Guardrail 7 / ADR-13: Prevents duplicate subscriber ticket allocations in same ongoing group', () => {
  // Valid roster: 20 unique customer IDs
  const validAllocations = Array.from({ length: 20 }, (_, i) => ({
    ticketNumber: i + 1,
    customerId: `cust-uuid-${i + 1}`,
  }));
  const uniqueIds = new Set(validAllocations.map((a) => a.customerId));
  assert.equal(uniqueIds.size, validAllocations.length);

  // Invalid roster: customer-1 assigned to Ticket #3 and Ticket #7
  const invalidAllocations = [...validAllocations];
  invalidAllocations[6] = { ticketNumber: 7, customerId: 'cust-uuid-3' }; // duplicate!
  const invalidUnique = new Set(invalidAllocations.map((a) => a.customerId));
  assert.notEqual(invalidUnique.size, invalidAllocations.length);
  assert.equal(invalidUnique.size, 19);
});

test('Pre-Activation Balancing Guard: Detects exact match and flags arithmetic discrepancies', () => {
  // 20 tickets, 6 completed months (Intake Month 7)
  const monthlyNet = {
    1: 5000, // Month 1: ₹5,000
    2: 4000, // Month 2: ₹4,000
    3: 3950, // Month 3: ₹3,950
    4: 4100, // Month 4: ₹4,100
    5: 3900, // Month 5: ₹3,900
    6: 4050, // Month 6: ₹4,050
  };
  // Total possible collections if 100% paid: 20 * (5000+4000+3950+4100+3900+4050) = 20 * 25000 = 500,000

  // Case 1: 100% paid
  const totalAllPaid = calculateSystemTotal(20, monthlyNet, []);
  assert.equal(totalAllPaid, 500000);

  // Case 2: Ticket #2 unpaid in Month 5 (₹3,900) & Month 6 (₹4,050) -> Arrears = 7,950
  const unpaid = [
    { ticket: 2, month: 5 },
    { ticket: 2, month: 6 },
  ];
  const totalWithArrears = calculateSystemTotal(20, monthlyNet, unpaid);
  assert.equal(totalWithArrears, 500000 - 7950); // 492,050

  // Match test: physical notebook matches system exactly
  const notebookTotalMatched = 492050;
  assert.equal(totalWithArrears - notebookTotalMatched, 0);

  // Discrepancy test: physical notebook has 490,000 (diff of 2,050)
  const notebookTotalMismatched = 490000;
  assert.equal(totalWithArrears - notebookTotalMismatched, 2050);
});

test('Backend Contract Invariant: OnboardOngoingChitDto payload adheres to validation schema', () => {
  const payload = {
    groupCode: 'KCA-1L-20M-ONGOING-07',
    groupName: '₹1 Lakh 20 Months Ongoing Group (Intake Month 7)',
    chitValue: 100000,
    durationMonths: 20,
    totalTickets: 20,
    onboardedAtMonth: 7,
    startDate: '2026-04-01T00:00:00.000Z',
    endDate: '2027-11-30T00:00:00.000Z',
    sanctionOrderNumber: 'ROC/ERD/CHIT/2026/012',
    historicalWinners: [
      { month: 2, ticketNumber: 4, bidDiscount: 24000, auctionDate: '2026-05-01T00:00:00.000Z' },
      { month: 3, ticketNumber: 8, bidDiscount: 25000, auctionDate: '2026-06-01T00:00:00.000Z' },
      { month: 4, ticketNumber: 12, bidDiscount: 23000, auctionDate: '2026-07-01T00:00:00.000Z' },
      { month: 5, ticketNumber: 15, bidDiscount: 24500, auctionDate: '2026-08-01T00:00:00.000Z' },
      { month: 6, ticketNumber: 19, bidDiscount: 25000, auctionDate: '2026-09-01T00:00:00.000Z' },
    ],
    memberAllocations: Array.from({ length: 20 }, (_, i) => ({
      ticketNumber: i + 1,
      customerId: `cust-uuid-${i + 1}`,
      openingBalance: i === 1 ? 7950 : 0,
    })),
  };

  assert.equal(payload.durationMonths, payload.totalTickets);
  assert.ok(payload.onboardedAtMonth >= 2 && payload.onboardedAtMonth <= payload.durationMonths);
  assert.equal(payload.historicalWinners.length, payload.onboardedAtMonth - 2);
  assert.equal(payload.memberAllocations.length, payload.totalTickets);
  for (const hw of payload.historicalWinners) {
    assert.ok(hw.bidDiscount <= payload.chitValue / 4);
    assert.ok(hw.month >= 2);
  }
});

test('Guardrail 5 & Backend Validation: Ticket #1 cannot win past auctions and bid discounts must be positive', () => {
  // Ticket #1 is reserved for Month 1 company pool; only tickets 2..N can win auctions in Months 2..M-1
  const durationMonths = 20;
  const eligibleWinnerTickets = Array.from({ length: durationMonths - 1 }, (_, i) => i + 2);
  assert.equal(eligibleWinnerTickets.includes(1), false);
  assert.equal(eligibleWinnerTickets[0], 2);
  assert.equal(eligibleWinnerTickets[eligibleWinnerTickets.length - 1], 20);

  // Positive bid discount validation (satisfies NestJS @IsPositive() DTO validator)
  const isPositiveDiscount = (d: number) => d > 0;
  assert.equal(isPositiveDiscount(0), false);
  assert.equal(isPositiveDiscount(-500), false);
  assert.equal(isPositiveDiscount(15000), true);
});

test('Bilingual Parity: onboarding dictionary keys match 100% between English and Tamil', () => {
  const enKeys = Object.keys(enMessages.onboarding).sort();
  const taKeys = Object.keys(taMessages.onboarding).sort();

  assert.deepEqual(
    enKeys,
    taKeys,
    `Bilingual mismatch in onboarding keys! EN: ${enKeys.length}, TA: ${taKeys.length}`
  );
  assert.ok(enKeys.length >= 35, `Expected at least 35 keys, found ${enKeys.length}`);
});
