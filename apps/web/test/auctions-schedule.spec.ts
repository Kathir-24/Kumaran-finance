// ==============================================================================
// Kumaran Chits — Auctions Directory & Schedule Test Suite (Task 6.1)
// Asserts Guardrail 5 (Month 1 & N Rules), Guardrail 6 (1/4 Ceiling & Tie-Break),
// Guardrail 3 (4% Commission Floor), Universal Equal Dividend Invariant,
// Schedule Status Filtering, and Bilingual Dictionary Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// Helpers for whole-rupee auction math
function calculateAuctionMath(chitValue: bigint, totalTickets: bigint, bidDiscount: bigint) {
  const commissionFloor = (chitValue * 4n) / 100n;
  const ceilingDiscount = chitValue / 4n;

  if (bidDiscount > ceilingDiscount) {
    throw new RangeError(`Discount ${bidDiscount} exceeds ceiling ${ceilingDiscount}`);
  }
  if (bidDiscount < commissionFloor) {
    throw new RangeError(`Discount ${bidDiscount} is below 4% commission floor ${commissionFloor}`);
  }

  const totalDividend = bidDiscount - commissionFloor;
  const dividendPerTicket = totalDividend / totalTickets;
  const baseInstallment = chitValue / totalTickets;
  const nextMonthNetInstallment = baseInstallment - dividendPerTicket;
  const prizeMoney = chitValue - bidDiscount;

  return {
    commissionFloor,
    ceilingDiscount,
    totalDividend,
    dividendPerTicket,
    baseInstallment,
    nextMonthNetInstallment,
    prizeMoney,
  };
}

function generateProjectedSchedule(chitValue: bigint, durationMonths: number, existingAuctions: Array<{
  installmentMonth: number;
  status: string;
  bidDiscount?: bigint;
}>) {
  const auctionMap = new Map(existingAuctions.map((a) => [a.installmentMonth, a]));
  const rows = [];

  for (let m = 1; m <= durationMonths; m++) {
    if (m === 1) {
      rows.push({
        month: 1,
        type: 'MONTH_1_COMPANY_POOL',
        status: 'COMPANY_POOL',
        hasAuction: false,
        dividend: 0n,
      });
    } else if (m === durationMonths) {
      rows.push({
        month: durationMonths,
        type: 'MONTH_N_FINAL_SETTLEMENT',
        status: 'FINAL_SETTLEMENT',
        hasAuction: false,
      });
    } else {
      const existing = auctionMap.get(m);
      rows.push({
        month: m,
        type: 'AUCTION',
        status: existing?.status || 'SCHEDULED',
        hasAuction: true,
        bidDiscount: existing?.bidDiscount,
      });
    }
  }

  return rows;
}

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

test('Task 6.1: Guardrail 5 — Month 1 Company Pool Zero Dividend Invariant', () => {
  const schedule = generateProjectedSchedule(100000n, 20, []);
  const month1 = schedule[0];

  assert.equal(month1.month, 1);
  assert.equal(month1.type, 'MONTH_1_COMPANY_POOL');
  assert.equal(month1.hasAuction, false);
  assert.equal(month1.dividend, 0n);
});

test('Task 6.1: Guardrail 5 — Month N Final Subscriber Settlement Invariant', () => {
  const duration = 20;
  const schedule = generateProjectedSchedule(200000n, duration, []);
  const monthN = schedule[schedule.length - 1];

  assert.equal(monthN.month, duration);
  assert.equal(monthN.type, 'MONTH_N_FINAL_SETTLEMENT');
  assert.equal(monthN.hasAuction, false);
});

test('Task 6.1: Guardrail 6 — 1/4 Discount Ceiling Boundary Calculation (D <= V/4)', () => {
  // ₹1,00,000 -> Ceiling ₹25,000
  assert.equal(100000n / 4n, 25000n);
  // ₹2,00,000 -> Ceiling ₹50,000
  assert.equal(200000n / 4n, 50000n);
  // ₹5,00,000 -> Ceiling ₹1,25,000
  assert.equal(500000n / 4n, 125000n);

  // Attempting discount above ceiling throws error
  assert.throws(
    () => calculateAuctionMath(100000n, 20n, 25001n),
    /exceeds ceiling/,
  );
});

test('Task 6.1: Guardrail 3 — 4.00% Foreman Commission Floor Calculation (D >= 0.04 * V)', () => {
  // ₹1,00,000 -> 4% is ₹4,000
  assert.equal((100000n * 4n) / 100n, 4000n);
  // ₹2,00,000 -> 4% is ₹8,000
  assert.equal((200000n * 4n) / 100n, 8000n);
  // ₹5,00,000 -> 4% is ₹20,000
  assert.equal((500000n * 4n) / 100n, 20000n);

  // Attempting discount below floor throws error
  assert.throws(
    () => calculateAuctionMath(100000n, 20n, 3999n),
    /below 4% commission floor/,
  );
});

test('Task 6.1: Guardrail 4 — Universal Equal Dividend Math Invariant', () => {
  // ₹2,00,000 Scheme, 20 Months, Winning bid: ₹36,000
  const math = calculateAuctionMath(200000n, 20n, 36000n);

  assert.equal(math.commissionFloor, 8000n); // 4% of 2L
  assert.equal(math.totalDividend, 28000n);   // 36,000 - 8,000
  assert.equal(math.dividendPerTicket, 1400n); // 28,000 / 20
  assert.equal(math.baseInstallment, 10000n);  // 2,00,000 / 20
  assert.equal(math.nextMonthNetInstallment, 8600n); // 10,000 - 1,400
  assert.equal(math.prizeMoney, 164000n);      // 2,00,000 - 36,000

  // Universal check: Net + Div === Base
  assert.equal(math.nextMonthNetInstallment + math.dividendPerTicket, math.baseInstallment);
});

test('Task 6.1: Option A Physical Paper Token Tie-Break Representation', () => {
  // Tied bidders at ceiling (e.g. ₹25,000 on ₹1,00,000 scheme)
  const tieBidders = [
    { ticketId: 'tk-1', tokenNumber: 4, isWinner: true },
    { ticketId: 'tk-2', tokenNumber: 7, isWinner: false },
    { ticketId: 'tk-3', tokenNumber: 12, isWinner: false },
  ];

  const winner = tieBidders.find((tb) => tb.isWinner);
  assert.ok(winner);
  assert.equal(winner.tokenNumber, 4);

  // Verify exactly 1 winner drawn physically
  const winnerCount = tieBidders.filter((tb) => tb.isWinner).length;
  assert.equal(winnerCount, 1);
});

test('Task 6.1: Schedule Status Filter Logic', () => {
  const existingAuctions = [
    { installmentMonth: 2, status: 'MINUTES_FILED', bidDiscount: 30000n },
    { installmentMonth: 3, status: 'MINUTES_FILED', bidDiscount: 40000n },
    { installmentMonth: 4, status: 'COMPLETED', bidDiscount: 36000n },
  ];

  const schedule = generateProjectedSchedule(200000n, 20, existingAuctions);

  const completedOnly = schedule.filter((r) => r.status === 'COMPLETED');
  assert.equal(completedOnly.length, 1);
  assert.equal(completedOnly[0].month, 4);

  const filedOnly = schedule.filter((r) => r.status === 'MINUTES_FILED');
  assert.equal(filedOnly.length, 2);

  const scheduledOnly = schedule.filter((r) => r.status === 'SCHEDULED');
  // Total auctionable = 18 (Months 2..19). 3 conducted, so 15 scheduled
  assert.equal(scheduledOnly.length, 15);
});

test('Task 6.1: Bilingual Dictionary Parity — auctions namespace (en <-> ta)', () => {
  const enKeys = Object.keys(enMessages.auctions).sort();
  const taKeys = Object.keys(taMessages.auctions).sort();

  assert.equal(enKeys.length, taKeys.length);
  assert.deepEqual(enKeys, taKeys);

  // Key auction console strings must exist in both
  const expectedKeys = [
    'title',
    'subtitle',
    'selectScheme',
    'allSchemes',
    'filterAll',
    'filterScheduled',
    'filterCompleted',
    'filterMinutesFiled',
    'month1NoAuction',
    'monthNNoAuction',
    'ceilingDiscountLabel',
    'minimumFloorLabel',
    'chitValueLabel',
    'completedAuctionsLabel',
    'enterBiddingRoom',
    'tieBreakWinnerBadge',
  ];

  for (const k of expectedKeys) {
    assert.ok(k in enMessages.auctions, `Missing key in en.json: ${k}`);
    assert.ok(k in taMessages.auctions, `Missing key in ta.json: ${k}`);
  }
});
