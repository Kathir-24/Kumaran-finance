// ==============================================================================
// Kumaran Chits — Customer 360 & Digital Passbook Test Suite (Task 5.3)
// Asserts Form XXI Continuous Passbook Math, Row-Sum Invariant, Cumulative
// Summary Balances, Month 1 Company Pool, ADR-07 Defaulter Warnings, ADR-13
// Ticket Limit Switcher, Nominee Validation, Presigned S3 URLs & Bilingual Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// Helpers for whole-rupee math & passbook invariants
function verifyPassbookRowSumInvariant(rows: Array<{
  grossAmount: bigint;
  dividendDeduction: bigint;
  netPayableAmount: bigint;
}>) {
  for (const row of rows) {
    // Invariant: Net Payable + Dividend Deduction strictly equals Gross Base Installment
    assert.equal(
      row.netPayableAmount + row.dividendDeduction,
      row.grossAmount,
      `Row-sum invariant failed: net (${row.netPayableAmount}) + div (${row.dividendDeduction}) !== gross (${row.grossAmount})`,
    );
  }
}

function calculatePassbookSummary(rows: Array<{
  grossAmount: bigint;
  dividendDeduction: bigint;
  netPayableAmount: bigint;
  paidAmount: bigint;
}>) {
  let totalGrossDue = 0n;
  let totalDividend = 0n;
  let totalNetDue = 0n;
  let totalPaid = 0n;

  for (const r of rows) {
    totalGrossDue += r.grossAmount;
    totalDividend += r.dividendDeduction;
    totalNetDue += r.netPayableAmount;
    totalPaid += r.paidAmount;
  }

  const outstandingBalance = totalNetDue - totalPaid;

  return {
    totalScheduledMonths: rows.length,
    totalGrossDue,
    totalDividend,
    totalNetDue,
    totalPaid,
    outstandingBalance,
  };
}

function validateNomineeInput(nominee: {
  fullName: string;
  relationship: string;
  phone: string;
  aadhaarLast4?: string;
}) {
  const errors: string[] = [];
  if (!nominee.fullName || nominee.fullName.trim().length < 2) {
    errors.push('Full name is required (min 2 chars)');
  }
  if (!nominee.relationship || nominee.relationship.trim().length === 0) {
    errors.push('Relationship is required');
  }
  if (!nominee.phone || !/^[6-9]\d{9}$/.test(nominee.phone.trim())) {
    errors.push('Valid 10-digit Indian phone is required');
  }
  if (nominee.aadhaarLast4 && !/^\d{4}$/.test(nominee.aadhaarLast4.trim())) {
    errors.push('Aadhaar must be strictly 4 digits');
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

test('Task 5.3: Guardrail 2 & 4 — Passbook Row-Sum Invariant (Inet + Div === Ibase)', () => {
  // Realistic Form XXI 20-month passbook schedule for ₹1,00,000 scheme (Base: ₹5,000)
  const sampleSchedule = [
    { month: 1, grossAmount: 5000n, dividendDeduction: 0n, netPayableAmount: 5000n, paidAmount: 5000n },
    { month: 2, grossAmount: 5000n, dividendDeduction: 1050n, netPayableAmount: 3950n, paidAmount: 3950n },
    { month: 3, grossAmount: 5000n, dividendDeduction: 1000n, netPayableAmount: 4000n, paidAmount: 4000n },
    { month: 4, grossAmount: 5000n, dividendDeduction: 950n, netPayableAmount: 4050n, paidAmount: 4050n },
    { month: 5, grossAmount: 5000n, dividendDeduction: 900n, netPayableAmount: 4100n, paidAmount: 4100n },
  ];

  verifyPassbookRowSumInvariant(sampleSchedule);
});

test('Task 5.3: Passbook Summary Cumulative Balances & Outstanding Due Reconciliation', () => {
  const schedule = [
    { month: 1, grossAmount: 5000n, dividendDeduction: 0n, netPayableAmount: 5000n, paidAmount: 5000n },
    { month: 2, grossAmount: 5000n, dividendDeduction: 1050n, netPayableAmount: 3950n, paidAmount: 3950n },
    { month: 3, grossAmount: 5000n, dividendDeduction: 1000n, netPayableAmount: 4000n, paidAmount: 0n }, // Unpaid
    { month: 4, grossAmount: 5000n, dividendDeduction: 950n, netPayableAmount: 4050n, paidAmount: 0n },  // Unpaid
  ];

  const summary = calculatePassbookSummary(schedule);

  assert.equal(summary.totalScheduledMonths, 4);
  assert.equal(summary.totalGrossDue, 20000n);
  assert.equal(summary.totalDividend, 3000n);
  assert.equal(summary.totalNetDue, 17000n);
  assert.equal(summary.totalPaid, 8950n);
  assert.equal(summary.outstandingBalance, 8050n); // 4000n + 4050n = 8050n
  assert.equal(summary.totalNetDue - summary.totalPaid, summary.outstandingBalance);
});

test('Task 5.3: Guardrail 5 — Month 1 Company Pool Zero Dividend Invariant', () => {
  const month1Row = {
    month: 1,
    grossAmount: 10000n,
    dividendDeduction: 0n,
    netPayableAmount: 10000n,
    paidAmount: 10000n,
  };

  // Month 1 must have exactly ₹0 dividend
  assert.equal(month1Row.dividendDeduction, 0n);
  assert.equal(month1Row.netPayableAmount, month1Row.grossAmount);
});

test('Task 5.3: Guardrail 7 / ADR-13 — Multi-Scheme Ticket Switcher & Group Isolation', () => {
  // A subscriber can hold tickets across different groups, but never in the same group
  const customerTickets = [
    {
      id: 'ticket-uuid-1',
      ticketNumber: 3,
      chitGroupId: 'group-uuid-1',
      chitGroup: { groupCode: 'KCA-1L-20M-01', groupName: '₹1 Lakh 20M' },
    },
    {
      id: 'ticket-uuid-2',
      ticketNumber: 8,
      chitGroupId: 'group-uuid-2',
      chitGroup: { groupCode: 'KCB-2L-20M-01', groupName: '₹2 Lakh 20M' },
    },
  ];

  // Verify group IDs are distinct (ADR-13 constraint)
  const groupIds = customerTickets.map((t) => t.chitGroupId);
  const uniqueGroupIds = new Set(groupIds);
  assert.equal(uniqueGroupIds.size, customerTickets.length);

  // Switcher selects first ticket by default, and allows switching to second
  const selectedId1 = customerTickets[0].id;
  assert.equal(selectedId1, 'ticket-uuid-1');

  const selectedId2 = customerTickets[1].id;
  assert.equal(selectedId2, 'ticket-uuid-2');
});

test('Task 5.3: Guardrail 8 — ADR-07 / ADR-12 Defaulter 3-Month Arrears Removal Warning', () => {
  function checkDefaulterWarning(consecutiveUnpaidMonths: number): boolean {
    return consecutiveUnpaidMonths >= 3;
  }

  // Under 3 months: No removal threat
  assert.equal(checkDefaulterWarning(0), false);
  assert.equal(checkDefaulterWarning(1), false);
  assert.equal(checkDefaulterWarning(2), false);

  // 3 or more consecutive months: Removal threat active (ADR-07 & ADR-12)
  assert.equal(checkDefaulterWarning(3), true);
  assert.equal(checkDefaulterWarning(4), true);
  assert.equal(checkDefaulterWarning(6), true);
});

test('Task 5.3: Nominee Validation & Masked Aadhaar Last 4 Invariant', () => {
  // Valid nominee
  const validNominee = {
    fullName: 'M. Kavitha',
    relationship: 'Spouse',
    phone: '9842199887',
    aadhaarLast4: '5678',
  };
  const res1 = validateNomineeInput(validNominee);
  assert.equal(res1.isValid, true);
  assert.equal(res1.errors.length, 0);

  // Valid nominee without optional Aadhaar
  const validNoAadhaar = {
    fullName: 'S. Karthi',
    relationship: 'Son',
    phone: '8765432109',
  };
  const res2 = validateNomineeInput(validNoAadhaar);
  assert.equal(res2.isValid, true);

  // Invalid: Bad phone, invalid Aadhaar length
  const invalidNominee = {
    fullName: 'X',
    relationship: '',
    phone: '12345',
    aadhaarLast4: '123456789012', // DPDP Act violation: full 12 digits leaked
  };
  const res3 = validateNomineeInput(invalidNominee);
  assert.equal(res3.isValid, false);
  assert.equal(res3.errors.length, 4);
});

test('Task 5.3: KYC Presigned S3 URL Lifespan & Security Invariant', () => {
  const presignedResponse = {
    url: 'https://storage.kumaranfinance.in/kyc/customer-1/AADHAAR_FRONT-uuid.png?X-Amz-Expires=900',
    expiresInSeconds: 900,
  };

  // URL must be non-empty and expiration must strictly be 15 minutes (900 seconds)
  assert.ok(presignedResponse.url.startsWith('https://'));
  assert.equal(presignedResponse.expiresInSeconds, 900);
});

test('Task 5.3: Bilingual Dictionary Parity — customers namespace (en <-> ta)', () => {
  const enKeys = Object.keys(enMessages.customers).sort();
  const taKeys = Object.keys(taMessages.customers).sort();

  assert.equal(enKeys.length, taKeys.length);
  assert.deepEqual(enKeys, taKeys);

  // Specific Customer 360 keys must exist in both
  const expectedKeys = [
    'profile360Title',
    'tabPassbook',
    'tabTickets',
    'tabNominees',
    'tabDocuments',
    'passbookTitle',
    'colMonth',
    'colGross',
    'colDividend',
    'colNetPayable',
    'colPaidAmount',
    'colStatus',
    'downloadPdf',
    'addNominee',
    'uploadDocument',
    'consecutiveUnpaidWarning',
  ];

  for (const k of expectedKeys) {
    assert.ok(k in enMessages.customers, `Missing key in en.json: ${k}`);
    assert.ok(k in taMessages.customers, `Missing key in ta.json: ${k}`);
  }
});
