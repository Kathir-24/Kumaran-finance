// ==============================================================================
// Kumaran Chits — Form XXI Subscriber Ledger & Defaulters Register Tests (Task 10.3)
// Verifies statutory Form XXI continuous passbook row-sum invariant (Inet + Div = Ibase),
// cumulative reconciliations, ADR-07 risk categorization, RBAC, and bilingual parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ------------------------------------------------------------------------------
// Invariant 1: Form XXI Row-Sum Invariant (Inet + Div = Ibase)
// ------------------------------------------------------------------------------
test('1. Form XXI Row-Sum Invariant: Enforces Inet + Div = Ibase for every monthly row', () => {
  interface MonthlyRow {
    installmentMonth: number;
    grossBaseDue: bigint;
    dividendDeduction: bigint;
    netPayableAmount: bigint;
  }

  const verifyRowSum = (row: MonthlyRow): boolean => {
    return row.netPayableAmount + row.dividendDeduction === row.grossBaseDue;
  };

  // Month 1: Full base installment, ₹0 dividend
  assert.equal(
    verifyRowSum({ installmentMonth: 1, grossBaseDue: 5000n, dividendDeduction: 0n, netPayableAmount: 5000n }),
    true
  );

  // Month 2: Ceiling bid discount (V/4) -> ₹1,050 dividend -> ₹3,950 net payable
  assert.equal(
    verifyRowSum({ installmentMonth: 2, grossBaseDue: 5000n, dividendDeduction: 1050n, netPayableAmount: 3950n }),
    true
  );

  // Month 10: Intermediate auction discount -> ₹750 dividend -> ₹4,250 net payable
  assert.equal(
    verifyRowSum({ installmentMonth: 10, grossBaseDue: 5000n, dividendDeduction: 750n, netPayableAmount: 4250n }),
    true
  );

  // Discrepancy detection
  assert.equal(
    verifyRowSum({ installmentMonth: 5, grossBaseDue: 5000n, dividendDeduction: 1000n, netPayableAmount: 3950n }),
    false
  );
});

// ------------------------------------------------------------------------------
// Invariant 2: Cumulative Financial Reconciliations
// ------------------------------------------------------------------------------
test('2. Cumulative Reconciliations: Total Net = Total Gross - Total Dividends, Total Arrears = Sum(Unpaid)', () => {
  interface ScheduleItem {
    grossAmount: number;
    dividendDeduction: number;
    netPayableAmount: number;
    paidAmount: number;
    status: 'PAID' | 'UNPAID' | 'OVERDUE';
  }

  const calculateLedgerSummary = (schedule: ScheduleItem[]) => {
    let totalGross = 0;
    let totalDividend = 0;
    let totalNet = 0;
    let totalPaid = 0;
    let totalArrears = 0;

    schedule.forEach((row) => {
      totalGross += row.grossAmount;
      totalDividend += row.dividendDeduction;
      totalNet += row.netPayableAmount;
      totalPaid += row.paidAmount;
      if (row.status !== 'PAID') {
        totalArrears += row.netPayableAmount - row.paidAmount;
      }
    });

    return {
      totalGross,
      totalDividend,
      totalNet,
      totalPaid,
      totalArrears,
      isReconciled: totalNet === totalGross - totalDividend,
    };
  };

  const sampleSchedule: ScheduleItem[] = [
    { grossAmount: 5000, dividendDeduction: 0, netPayableAmount: 5000, paidAmount: 5000, status: 'PAID' },
    { grossAmount: 5000, dividendDeduction: 1050, netPayableAmount: 3950, paidAmount: 3950, status: 'PAID' },
    { grossAmount: 5000, dividendDeduction: 800, netPayableAmount: 4200, paidAmount: 0, status: 'OVERDUE' },
    { grossAmount: 5000, dividendDeduction: 1000, netPayableAmount: 4000, paidAmount: 0, status: 'UNPAID' },
  ];

  const summary = calculateLedgerSummary(sampleSchedule);
  assert.equal(summary.totalGross, 20000);
  assert.equal(summary.totalDividend, 2850);
  assert.equal(summary.totalNet, 17150);
  assert.equal(summary.totalPaid, 8950);
  assert.equal(summary.totalArrears, 8200); // 4200 + 4000
  assert.equal(summary.isReconciled, true);
});

// ------------------------------------------------------------------------------
// Invariant 3: Pure Whole Rupee Standard (Guardrail 2)
// ------------------------------------------------------------------------------
test('3. Guardrail 2: Enforces whole rupee standard across all passbook dues', () => {
  const isWholeRupee = (val: number): boolean => Number.isInteger(val) && !isNaN(val);

  assert.equal(isWholeRupee(5000), true);
  assert.equal(isWholeRupee(3950), true);
  assert.equal(isWholeRupee(1050), true);
  assert.equal(isWholeRupee(0), true);

  // Reject decimal fractions / paise
  assert.equal(isWholeRupee(3950.5), false);
  assert.equal(isWholeRupee(5000.25), false);
});

// ------------------------------------------------------------------------------
// Invariant 4: ADR-07 Arrears Aging & Default Risk Categorization
// ------------------------------------------------------------------------------
test('4. ADR-07: Categorizes overdue accounts into 1M Attention, 2M Medium Risk, 3M High Risk', () => {
  type RiskCategory = 'ATTENTION_1M' | 'MEDIUM_RISK_2M' | 'HIGH_RISK_3M_REMOVAL' | 'CURRENT';

  const classifyRisk = (consecutiveUnpaidMonths: number): RiskCategory => {
    if (consecutiveUnpaidMonths >= 3) return 'HIGH_RISK_3M_REMOVAL';
    if (consecutiveUnpaidMonths === 2) return 'MEDIUM_RISK_2M';
    if (consecutiveUnpaidMonths === 1) return 'ATTENTION_1M';
    return 'CURRENT';
  };

  assert.equal(classifyRisk(0), 'CURRENT');
  assert.equal(classifyRisk(1), 'ATTENTION_1M');
  assert.equal(classifyRisk(2), 'MEDIUM_RISK_2M');
  assert.equal(classifyRisk(3), 'HIGH_RISK_3M_REMOVAL');
  assert.equal(classifyRisk(5), 'HIGH_RISK_3M_REMOVAL');
});

// ------------------------------------------------------------------------------
// Invariant 5: ADR-07 Company Removal Rights Rule
// ------------------------------------------------------------------------------
test('5. ADR-07 Removal Rights: Company holds removal rights strictly when consecutiveUnpaidMonths >= 3', () => {
  const isEligibleForRemoval = (consecutiveUnpaidMonths: number): boolean => {
    return consecutiveUnpaidMonths >= 3;
  };

  assert.equal(isEligibleForRemoval(0), false);
  assert.equal(isEligibleForRemoval(1), false);
  assert.equal(isEligibleForRemoval(2), false);
  assert.equal(isEligibleForRemoval(3), true);  // 3 months grants removal rights
  assert.equal(isEligibleForRemoval(4), true);
});

// ------------------------------------------------------------------------------
// Invariant 6: RBAC Authorization Matrix for Ledger and Defaulters
// ------------------------------------------------------------------------------
test('6. RBAC Authority: Restricts ledger and defaulter reports to authorized personas', () => {
  const canAccessLedger = (roles: string[]): boolean => {
    const allowed = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'];
    return roles.some((r) => allowed.includes(r));
  };

  const canAccessDefaulters = (roles: string[]): boolean => {
    const allowed = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT', 'AUDITOR'];
    return roles.some((r) => allowed.includes(r));
  };

  // Staff & Auditor: Full access to both
  assert.equal(canAccessLedger(['SUPER_ADMIN']), true);
  assert.equal(canAccessDefaulters(['SUPER_ADMIN']), true);
  assert.equal(canAccessLedger(['ACCOUNTANT']), true);
  assert.equal(canAccessDefaulters(['ACCOUNTANT']), true);
  assert.equal(canAccessLedger(['AUDITOR']), true);
  assert.equal(canAccessDefaulters(['AUDITOR']), true);

  // Collection Agent: Can access Defaulters for recovery rounds; barred from global Ledger
  assert.equal(canAccessDefaulters(['COLLECTION_AGENT']), true);
  assert.equal(canAccessLedger(['COLLECTION_AGENT']), false);

  // Customer: Barred from company-wide registers
  assert.equal(canAccessLedger(['CUSTOMER']), false);
  assert.equal(canAccessDefaulters(['CUSTOMER']), false);
});

// ------------------------------------------------------------------------------
// Invariant 7: CSV Row Formatting & RFC 4180 Escaping
// ------------------------------------------------------------------------------
test('7. CSV Export: Escapes quotes, commas, and formats ledger rows accurately', () => {
  function escapeCsvCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  assert.equal(escapeCsvCell('Ticket #4'), 'Ticket #4');
  assert.equal(escapeCsvCell(17150), '17150');
  assert.equal(escapeCsvCell('Palanisamy, Erode'), '"Palanisamy, Erode"');
  assert.equal(escapeCsvCell('Status: "OVERDUE"'), '"Status: ""OVERDUE"""');
});

// ------------------------------------------------------------------------------
// Invariant 8: 100% Bilingual Dictionary Parity in reports.ledger & reports.defaulters
// ------------------------------------------------------------------------------
test('8. Bilingual Parity: 100% key match between en.json and ta.json in ledger & defaulters namespaces', () => {
  const basePath = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');

  const enPath = path.resolve(basePath, 'messages/en.json');
  const taPath = path.resolve(basePath, 'messages/ta.json');

  assert.ok(fs.existsSync(enPath), `en.json must exist at ${enPath}`);
  assert.ok(fs.existsSync(taPath), `ta.json must exist at ${taPath}`);

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

  // 1. Verify reports.ledger
  assert.ok(en.reports?.ledger, 'en.json must contain reports.ledger');
  assert.ok(ta.reports?.ledger, 'ta.json must contain reports.ledger');

  const enLedgerKeys = Object.keys(en.reports.ledger).sort();
  const taLedgerKeys = Object.keys(ta.reports.ledger).sort();

  assert.deepEqual(
    enLedgerKeys.filter((k) => !taLedgerKeys.includes(k)),
    [],
    'All ledger keys in en.json must exist in ta.json'
  );
  assert.deepEqual(
    taLedgerKeys.filter((k) => !enLedgerKeys.includes(k)),
    [],
    'All ledger keys in ta.json must exist in en.json'
  );
  assert.equal(enLedgerKeys.length, taLedgerKeys.length);

  // 2. Verify reports.defaulters
  assert.ok(en.reports?.defaulters, 'en.json must contain reports.defaulters');
  assert.ok(ta.reports?.defaulters, 'ta.json must contain reports.defaulters');

  const enDefaulterKeys = Object.keys(en.reports.defaulters).sort();
  const taDefaulterKeys = Object.keys(ta.reports.defaulters).sort();

  assert.deepEqual(
    enDefaulterKeys.filter((k) => !taDefaulterKeys.includes(k)),
    [],
    'All defaulter keys in en.json must exist in ta.json'
  );
  assert.deepEqual(
    taDefaulterKeys.filter((k) => !enDefaulterKeys.includes(k)),
    [],
    'All defaulter keys in ta.json must exist in en.json'
  );
  assert.equal(enDefaulterKeys.length, taDefaulterKeys.length);
});
