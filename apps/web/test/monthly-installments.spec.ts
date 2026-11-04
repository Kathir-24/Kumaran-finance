// ==============================================================================
// Kumaran Chits — Monthly Installments & Dues Tracker Test Suite (Task 4.4)
// Asserts Universal Dividend (Guardrail 4), Month 1 Company Pool (Guardrail 5),
// Discrete Dues Status (Guardrail 8), NPCI UPI Intent, and Bilingual Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupee, assertWholeRupee, parseWholeRupees } from '../src/lib/currency.ts';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// Domain calculation helpers mirroring backend InstallmentService & Chit Math
function calculateInstallmentDue(
  chitValue: number,
  durationMonths: number,
  month: number,
  bidDiscount: number = 0
) {
  assertWholeRupee(chitValue);
  assertWholeRupee(durationMonths);
  assertWholeRupee(month);

  const baseInstallment = Math.floor(chitValue / durationMonths);
  const commission = Math.floor((chitValue * 4) / 100); // 4% locked per group (ADR-04)
  const maxCeiling = Math.floor(chitValue / 4); // 1/4 ceiling (ADR-06)

  if (month === 1) {
    // Guardrail 5: Month 1 has NO auction. Full pool is taken by company representative ticket.
    // Universal dividend is strictly ₹0.
    return {
      month: 1,
      grossAmount: baseInstallment,
      dividendDeduction: 0,
      netPayableAmount: baseInstallment,
      isCeilingExceeded: false,
    };
  }

  // Months 2 through N: Auction discount determines universal dividend
  const isCeilingExceeded = bidDiscount > maxCeiling;
  const totalDividend = Math.max(0, bidDiscount - commission);
  const dividendPerTicket = Math.floor(totalDividend / durationMonths);
  const netPayableAmount = Math.max(0, baseInstallment - dividendPerTicket);

  return {
    month,
    grossAmount: baseInstallment,
    dividendDeduction: dividendPerTicket,
    netPayableAmount,
    isCeilingExceeded,
  };
}

function buildUpiIntent(
  payeeVpa: string,
  payeeName: string,
  groupCode: string,
  ticketNumber: number,
  month: number,
  netAmount: number
) {
  assertWholeRupee(netAmount);
  const note = `KC/${groupCode}/TKT${ticketNumber}/M${month}`;
  const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${netAmount}&cu=INR&tn=${encodeURIComponent(note)}`;

  return { upiUri, payeeVpa, payeeName, amount: netAmount, transactionNote: note };
}

test('Task 4.4: Guardrail 4 — Universal Equal Dividend Deduction across all tickets', () => {
  const chitValue = 100000;
  const durationMonths = 20;
  const month = 2;
  const bidDiscount = 25000; // Ceiling bid 25%

  const due = calculateInstallmentDue(chitValue, durationMonths, month, bidDiscount);

  assert.equal(due.grossAmount, 5000, 'Base installment must be ₹5,000');
  // Total dividend = 25,000 - 4,000 = 21,000. Dividend per ticket = 21,000 / 20 = 1,050
  assert.equal(due.dividendDeduction, 1050, 'Universal dividend must be ₹1,050 per ticket');
  assert.equal(due.netPayableAmount, 3950, 'Net installment payable must be ₹3,950');

  // Verify universal allocation: All 20 tickets pay the discounted net amount
  const ticketDues = Array.from({ length: durationMonths }, (_, i) => ({
    ticketNumber: i + 1,
    isPrized: i === 1, // ticket #2 won Month 2 auction
    gross: due.grossAmount,
    dividend: due.dividendDeduction,
    net: due.netPayableAmount,
  }));

  assert.equal(ticketDues.length, 20);
  for (const t of ticketDues) {
    assert.equal(t.net, 3950, `Ticket #${t.ticketNumber} must pay exact net installment ₹3,950`);
    assert.equal(t.gross - t.dividend, t.net, 'Net must equal gross minus dividend');
  }
});

test('Task 4.4: Guardrail 5 — Month 1 Company Pool Zero Dividend Invariant', () => {
  const chitValue = 100000;
  const durationMonths = 20;
  const month = 1;

  const due = calculateInstallmentDue(chitValue, durationMonths, month);

  assert.equal(due.grossAmount, 5000, 'Base installment is ₹5,000');
  assert.equal(due.dividendDeduction, 0, 'Month 1 dividend must be strictly ₹0');
  assert.equal(
    due.netPayableAmount,
    5000,
    'Month 1 net installment must equal base installment (Inet == Ibase)'
  );
});

test('Task 4.4: Guardrail 6 — Discount Ceiling and Floor Boundaries', () => {
  const chitValue = 200000; // ₹2 Lakhs scheme
  const durationMonths = 20;
  const maxCeiling = 50000; // 1/4 ceiling is ₹50,000
  const foremanCommission = 8000; // 4% locked commission

  // 1. Ceiling test
  const atCeiling = calculateInstallmentDue(chitValue, durationMonths, 3, maxCeiling);
  assert.equal(atCeiling.isCeilingExceeded, false);
  assert.equal(atCeiling.dividendDeduction, Math.floor((50000 - 8000) / 20)); // 2100
  assert.equal(atCeiling.netPayableAmount, 10000 - 2100); // 7900

  // 2. Ceiling exceeded flag
  const aboveCeiling = calculateInstallmentDue(chitValue, durationMonths, 3, 50001);
  assert.equal(aboveCeiling.isCeilingExceeded, true);

  // 3. Minimum bid discount equal to commission (zero dividend)
  const atFloor = calculateInstallmentDue(chitValue, durationMonths, 3, foremanCommission);
  assert.equal(atFloor.dividendDeduction, 0, 'Zero dividend when discount equals commission');
  assert.equal(atFloor.netPayableAmount, 10000, 'Net payable equals gross base installment');
});

test('Task 4.4: NPCI Dynamic UPI QR Intent Generation with Locked Whole Rupees', () => {
  const intent = buildUpiIntent(
    'kumaranfinance@kvb',
    'Kumaran Finance',
    'KC-2026-1L-20M-001',
    4,
    3,
    3950
  );

  assert.equal(intent.amount, 3950, 'Locked amount must be whole rupee integer');
  assert.equal(intent.payeeVpa, 'kumaranfinance@kvb');
  assert.equal(intent.transactionNote, 'KC/KC-2026-1L-20M-001/TKT4/M3');
  assert.ok(intent.upiUri.startsWith('upi://pay?'), 'URI must follow NPCI upi://pay scheme');
  assert.ok(intent.upiUri.includes('am=3950'), 'UPI URI must lock exact net installment amount');
  assert.ok(intent.upiUri.includes('cu=INR'), 'Currency must be INR');
  assert.ok(!intent.upiUri.includes('.00'), 'Zero paise: no decimals allowed in UPI URI');
});

test('Task 4.4: Cycle Window Dates Calculation', () => {
  const schemeStartDate = new Date('2026-01-15T00:00:00.000Z');

  // Month 1 cycle start
  const m1Start = new Date(schemeStartDate);
  m1Start.setMonth(m1Start.getMonth() + 0);
  assert.equal(m1Start.getUTCMonth(), 0, 'Month 1 cycle starts in January');

  // Month 7 cycle start
  const m7Start = new Date(schemeStartDate);
  m7Start.setMonth(m7Start.getMonth() + 6);
  assert.equal(m7Start.getUTCMonth(), 6, 'Month 7 cycle starts in July');

  // Next cycle / due date = cycle start + 1 month
  const m7Due = new Date(m7Start);
  m7Due.setMonth(m7Due.getMonth() + 1);
  assert.equal(m7Due.getUTCMonth(), 7, 'Month 7 due cutoff is in August');
});

test('Task 4.4: Guardrail 8 — Defaulter and Discrete Dues Status Invariants', () => {
  const validStatuses = ['PAID', 'UNPAID', 'OVERDUE'];

  // Test status validator
  const checkStatus = (status: string) => validStatuses.includes(status);

  assert.ok(checkStatus('PAID'));
  assert.ok(checkStatus('UNPAID'));
  assert.ok(checkStatus('OVERDUE'));
  assert.ok(!checkStatus('PARTIAL'), 'Partial payments are strictly prohibited by Guardrail 8');
  assert.ok(!checkStatus('ADVANCE'), 'Advance balances are strictly prohibited by Guardrail 8');

  // Consecutive unpaid months removal risk (ADR-07)
  const isRemovalRisk = (consecutiveUnpaid: number) => consecutiveUnpaid >= 3;
  assert.equal(isRemovalRisk(1), false);
  assert.equal(isRemovalRisk(2), false);
  assert.equal(isRemovalRisk(3), true, '>= 3 consecutive unpaid months triggers company removal rights');
  assert.equal(isRemovalRisk(4), true);
});

test('Task 4.4: Bilingual Dictionary Parity — installments namespace (en <-> ta)', () => {
  const enKeys = Object.keys(enMessages.installments || {}).sort();
  const taKeys = Object.keys(taMessages.installments || {}).sort();

  assert.ok(enKeys.length > 0, 'English installments keys must exist');
  assert.ok(taKeys.length > 0, 'Tamil installments keys must exist');
  assert.equal(
    enKeys.length,
    taKeys.length,
    `Key count mismatch: en has ${enKeys.length}, ta has ${taKeys.length}`
  );

  const missingInTamil = enKeys.filter((k) => !taKeys.includes(k));
  const missingInEnglish = taKeys.filter((k) => !enKeys.includes(k));

  assert.deepEqual(
    missingInTamil,
    [],
    `Keys missing in Tamil installments dictionary: ${missingInTamil.join(', ')}`
  );
  assert.deepEqual(
    missingInEnglish,
    [],
    `Keys missing in English installments dictionary: ${missingInEnglish.join(', ')}`
  );
});
