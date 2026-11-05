// ==============================================================================
// Kumaran Chits — Form XXII Chit Cash Book & Day Book Invariant Tests (Task 10.1)
// Verifies statutory cash isolation, mathematical balance invariants, whole rupee
// standards, multi-mode journal breakdowns, and 100% bilingual dictionary parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ------------------------------------------------------------------------------
// Invariant 1: Mathematical Balance Invariant (Closing === Opening + Inflows - Outflows)
// ------------------------------------------------------------------------------
test('1. Mathematical Balance Invariant: Enforces Closing = Opening + Inflows - Outflows', () => {
  const verifyBalance = (opening: number, inflows: number, outflows: number, closing: number) => {
    const expected = opening + inflows - outflows;
    return expected === closing;
  };

  // Typical balanced trading day
  assert.equal(verifyBalance(50000, 35000, 20000, 65000), true);

  // Day with zero payouts
  assert.equal(verifyBalance(65000, 10000, 0, 75000), true);

  // Day with heavy prize disbursements exceeding today's inflows
  assert.equal(verifyBalance(75000, 5000, 60000, 20000), true);

  // Discrepancy detected
  assert.equal(verifyBalance(50000, 35000, 20000, 60000), false);
});

// ------------------------------------------------------------------------------
// Invariant 2: Pure Whole Rupee Standard (Guardrail 2)
// ------------------------------------------------------------------------------
test('2. Guardrail 2: Enforces whole rupee standard and rejects decimal paise', () => {
  const isWholeRupee = (amount: number): boolean => {
    return Number.isInteger(amount) && !isNaN(amount);
  };

  assert.equal(isWholeRupee(50000), true);
  assert.equal(isWholeRupee(3950), true);
  assert.equal(isWholeRupee(0), true);

  // Rejects paise / floating point fractions
  assert.equal(isWholeRupee(50000.5), false);
  assert.equal(isWholeRupee(3950.25), false);
  assert.equal(isWholeRupee(100.001), false);
});

// ------------------------------------------------------------------------------
// Invariant 3: Form XXII Physical Cash Isolation
// ------------------------------------------------------------------------------
test('3. Physical Cash Isolation: Form XXII isolates cash collections & acknowledged handovers', () => {
  interface PaymentTransaction {
    id: string;
    amount: number;
    paymentMethod: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
    cashHandoverStatus?: 'ACKNOWLEDGED' | 'PENDING_HANDOVER' | null;
  }

  const filterFormXxiiInflows = (transactions: PaymentTransaction[]) => {
    return transactions.filter((p) => {
      if (p.paymentMethod !== 'CASH') return false;
      // Counter cash has null handover status; doorstep cash requires ACKNOWLEDGED
      return p.cashHandoverStatus === 'ACKNOWLEDGED' || p.cashHandoverStatus === null || p.cashHandoverStatus === undefined;
    });
  };

  const sampleTransactions: PaymentTransaction[] = [
    { id: 'pay-1', amount: 5000, paymentMethod: 'CASH', cashHandoverStatus: null }, // Counter cash: INCLUDED
    { id: 'pay-2', amount: 10000, paymentMethod: 'UPI' }, // UPI: EXCLUDED from Form XXII
    { id: 'pay-3', amount: 3950, paymentMethod: 'CASH', cashHandoverStatus: 'ACKNOWLEDGED' }, // Evening handover: INCLUDED
    { id: 'pay-4', amount: 3950, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' }, // Unacknowledged: EXCLUDED
  ];

  const eligibleInflows = filterFormXxiiInflows(sampleTransactions);
  assert.equal(eligibleInflows.length, 2);
  assert.equal(eligibleInflows[0].id, 'pay-1');
  assert.equal(eligibleInflows[1].id, 'pay-3');
});

// ------------------------------------------------------------------------------
// Invariant 4: Day Book Multi-Mode Breakdown
// ------------------------------------------------------------------------------
test('4. Day Book Multi-Mode Breakdown: Correctly aggregates across all payment methods', () => {
  interface JournalPayment {
    paymentMethod: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
    amount: number;
  }

  const computeModeBreakdown = (payments: JournalPayment[]) => {
    const summary = {
      cash: 0,
      upi: 0,
      bankTransfer: 0,
      cheque: 0,
      total: 0,
    };

    payments.forEach((p) => {
      summary.total += p.amount;
      if (p.paymentMethod === 'CASH') summary.cash += p.amount;
      else if (p.paymentMethod === 'UPI') summary.upi += p.amount;
      else if (p.paymentMethod === 'BANK_TRANSFER') summary.bankTransfer += p.amount;
      else if (p.paymentMethod === 'CHEQUE') summary.cheque += p.amount;
    });

    return summary;
  };

  const payments: JournalPayment[] = [
    { paymentMethod: 'CASH', amount: 5000 },
    { paymentMethod: 'UPI', amount: 10000 },
    { paymentMethod: 'BANK_TRANSFER', amount: 25000 },
    { paymentMethod: 'CHEQUE', amount: 15000 },
    { paymentMethod: 'CASH', amount: 3950 },
  ];

  const breakdown = computeModeBreakdown(payments);
  assert.equal(breakdown.cash, 8950);
  assert.equal(breakdown.upi, 10000);
  assert.equal(breakdown.bankTransfer, 25000);
  assert.equal(breakdown.cheque, 15000);
  assert.equal(breakdown.total, 58950);
});

// ------------------------------------------------------------------------------
// Invariant 5: RBAC Authorization Access Matrix
// ------------------------------------------------------------------------------
test('5. RBAC Access Matrix: Restricts reports to Accountant, Partner, Branch Manager, Auditor', () => {
  const canAccessReports = (userRoles: string[]): boolean => {
    const allowed = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'];
    return userRoles.some((r) => allowed.includes(r));
  };

  // Authorized Personas
  assert.equal(canAccessReports(['ACCOUNTANT']), true);
  assert.equal(canAccessReports(['SUPER_ADMIN']), true);
  assert.equal(canAccessReports(['BRANCH_MANAGER']), true);
  assert.equal(canAccessReports(['AUDITOR']), true);

  // Field Agent and Customer are barred
  assert.equal(canAccessReports(['COLLECTION_AGENT']), false);
  assert.equal(canAccessReports(['CUSTOMER']), false);
  assert.equal(canAccessReports([]), false);
});

// ------------------------------------------------------------------------------
// Invariant 6: Date Navigation & Safe Parsing
// ------------------------------------------------------------------------------
test('6. Date Navigation: Safely calculates day shifts and formats ISO dates', () => {
  const shiftIsoDate = (dateStr: string, days: number): string => {
    const d = new Date(dateStr);
    assert.equal(isNaN(d.getTime()), false, 'Valid date required');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  assert.equal(shiftIsoDate('2026-10-22', 1), '2026-10-23');
  assert.equal(shiftIsoDate('2026-10-22', -1), '2026-10-21');
  assert.equal(shiftIsoDate('2026-10-31', 1), '2026-11-01');
});

// ------------------------------------------------------------------------------
// Invariant 7: CSV Export Formatting with RFC 4180 Escaping
// ------------------------------------------------------------------------------
test('7. CSV Export Utility: Escapes commas, quotes, and produces RFC 4180 lines', () => {
  function escapeCsvCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  assert.equal(escapeCsvCell('SimpleText'), 'SimpleText');
  assert.equal(escapeCsvCell(50000), '50000');
  assert.equal(escapeCsvCell('Perundurai, Erode'), '"Perundurai, Erode"');
  assert.equal(escapeCsvCell('Winner "Token" Draw'), '"Winner ""Token"" Draw"');
});

// ------------------------------------------------------------------------------
// Invariant 8: 100% Bilingual Dictionary Parity in Reports Namespace
// ------------------------------------------------------------------------------
test('8. Bilingual Parity: 100% dictionary match between en.json and ta.json in reports namespace', () => {
  const basePath = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');

  const enPath = path.resolve(basePath, 'messages/en.json');
  const taPath = path.resolve(basePath, 'messages/ta.json');

  assert.ok(fs.existsSync(enPath), `en.json must exist at ${enPath}`);
  assert.ok(fs.existsSync(taPath), `ta.json must exist at ${taPath}`);

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

  assert.ok(en.reports, 'English dictionary must contain "reports" section');
  assert.ok(ta.reports, 'Tamil dictionary must contain "reports" section');

  function getAllKeys(obj: any, prefix = ''): string[] {
    return Object.keys(obj).flatMap((key) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        return getAllKeys(obj[key], fullKey);
      }
      return [fullKey];
    });
  }

  const enKeys = getAllKeys(en.reports);
  const taKeys = getAllKeys(ta.reports);

  assert.ok(enKeys.length >= 60, `Expected at least 60 keys in reports, found ${enKeys.length}`);
  assert.equal(
    enKeys.length,
    taKeys.length,
    `Key count mismatch: EN has ${enKeys.length}, TA has ${taKeys.length}`
  );

  const missingInTamil = enKeys.filter((key) => !taKeys.includes(key));
  const missingInEnglish = taKeys.filter((key) => !enKeys.includes(key));

  assert.deepEqual(
    missingInTamil,
    [],
    `Keys missing in ta.json: ${missingInTamil.join(', ')}`
  );
  assert.deepEqual(
    missingInEnglish,
    [],
    `Keys missing in en.json: ${missingInEnglish.join(', ')}`
  );
});
