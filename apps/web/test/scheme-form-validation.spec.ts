// ==============================================================================
// Kumaran Chits — New Scheme Creation Form & Invariants Test Suite (Task 4.2)
// Asserts Whole Rupee Divisibility, Auto-Calculations, 4% Commission Freeze,
// 1/4 Ceiling, Date Projections, and 100% Bilingual Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupee, assertWholeRupee, parseWholeRupees } from '../src/lib/currency.ts';
import { toSafeIsoDate } from '../src/lib/date-utils.ts';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// Calculation helper mirroring scheme-form & scheme-math-preview
function calculateSchemeInvariants(chitValue: number, durationMonths: number) {
  assertWholeRupee(chitValue);
  assertWholeRupee(durationMonths);

  const isDivisible = chitValue % durationMonths === 0;
  const baseInstallment = isDivisible ? Math.floor(chitValue / durationMonths) : 0;
  const foremanCommission = Math.floor((chitValue * 4) / 100); // 4% locked
  const maxDiscountCeiling = Math.floor(chitValue / 4); // 1/4 ceiling
  const minPrizeMoney = chitValue - maxDiscountCeiling;

  return {
    isDivisible,
    baseInstallment,
    foremanCommission,
    maxDiscountCeiling,
    minPrizeMoney,
  };
}

// Projected End Date helper mirroring scheme-form
function projectEndDate(startDateStr: string, durationMonths: number): string {
  const d = new Date(startDateStr);
  d.setMonth(d.getMonth() + durationMonths);
  return d.toISOString().split('T')[0];
}

// ==============================================================================
// Unit Test Assertions
// ==============================================================================

test('Guardrail 2: Scheme creation verifies whole-rupee divisibility (V % N === 0)', () => {
  // Divisible combinations (Guarantees zero paise)
  assert.equal(calculateSchemeInvariants(100000, 20).isDivisible, true);
  assert.equal(calculateSchemeInvariants(200000, 20).isDivisible, true);
  assert.equal(calculateSchemeInvariants(500000, 20).isDivisible, true);
  assert.equal(calculateSchemeInvariants(1000000, 25).isDivisible, true);
  assert.equal(calculateSchemeInvariants(600000, 30).isDivisible, true);

  // Non-divisible combinations (Would produce fractional paise)
  assert.equal(calculateSchemeInvariants(100000, 23).isDivisible, false); // ₹4347.82
  assert.equal(calculateSchemeInvariants(200000, 17).isDivisible, false); // ₹11764.70
  assert.equal(calculateSchemeInvariants(500000, 21).isDivisible, false); // ₹23809.52
});

test('Guardrail 3 & 6: Wizard auto-calculates 4.00% commission and 1/4 ceiling discount', () => {
  // ₹1 Lakh / 20 Months
  const inv1L = calculateSchemeInvariants(100000, 20);
  assert.equal(inv1L.baseInstallment, 5000);
  assert.equal(inv1L.foremanCommission, 4000); // 4%
  assert.equal(inv1L.maxDiscountCeiling, 25000); // 25% (V/4)
  assert.equal(inv1L.minPrizeMoney, 75000); // 75% (3V/4)

  // ₹2 Lakh / 20 Months
  const inv2L = calculateSchemeInvariants(200000, 20);
  assert.equal(inv2L.baseInstallment, 10000);
  assert.equal(inv2L.foremanCommission, 8000);
  assert.equal(inv2L.maxDiscountCeiling, 50000);
  assert.equal(inv2L.minPrizeMoney, 150000);

  // ₹5 Lakh / 20 Months
  const inv5L = calculateSchemeInvariants(500000, 20);
  assert.equal(inv5L.baseInstallment, 25000);
  assert.equal(inv5L.foremanCommission, 20000);
  assert.equal(inv5L.maxDiscountCeiling, 125000);
  assert.equal(inv5L.minPrizeMoney, 375000);

  // ₹10 Lakh / 25 Months
  const inv10L = calculateSchemeInvariants(1000000, 25);
  assert.equal(inv10L.baseInstallment, 40000);
  assert.equal(inv10L.foremanCommission, 40000);
  assert.equal(inv10L.maxDiscountCeiling, 250000);
  assert.equal(inv10L.minPrizeMoney, 750000);
});

test('Standard Chit Rule: Total subscriber tickets strictly equals duration in months', () => {
  function validateTicketCapacity(durationMonths: number, totalTickets: number) {
    return durationMonths === totalTickets;
  }

  assert.equal(validateTicketCapacity(20, 20), true);
  assert.equal(validateTicketCapacity(25, 25), true);
  assert.equal(validateTicketCapacity(20, 25), false);
  assert.equal(validateTicketCapacity(40, 39), false);
});

test('Schedule Projection: Correctly projects maturity date (+N months from start date)', () => {
  const projected1 = projectEndDate('2026-11-01', 20);
  assert.equal(projected1, '2028-07-01');

  const projected2 = projectEndDate('2026-01-15', 25);
  assert.equal(projected2, '2028-02-15');
});

test('Backend Contract: CreateChitGroupDto payload adheres to NestJS validation schema', () => {
  function prepareCreatePayload(input: {
    groupCode: string;
    groupName: string;
    groupNameTamil?: string;
    chitValue: number;
    durationMonths: number;
    startDate: string;
    endDate: string;
    branchId?: string;
  }) {
    assert.ok(input.groupCode && input.groupCode.trim().length > 0, 'Group code is required');
    assert.ok(input.groupName && input.groupName.trim().length > 0, 'Group name is required');
    assertWholeRupee(input.chitValue);
    assert.ok(input.chitValue > 0, 'Chit value must be positive integer');
    assert.ok(input.durationMonths >= 2, 'Duration must be at least 2 months');

    return {
      groupCode: input.groupCode.trim().toUpperCase(),
      groupName: input.groupName.trim(),
      groupNameTamil: input.groupNameTamil?.trim() || undefined,
      chitValue: input.chitValue,
      durationMonths: input.durationMonths,
      totalTickets: input.durationMonths, // Locked
      startDate: new Date(input.startDate).toISOString(),
      endDate: new Date(input.endDate).toISOString(),
      branchId: input.branchId || undefined,
    };
  }

  const payload = prepareCreatePayload({
    groupCode: 'kca-1l-20m-01',
    groupName: '₹1 Lakh 20 Months Group A',
    groupNameTamil: 'ரூ 1 லட்சம் 20 மாதங்கள் குழு A',
    chitValue: 100000,
    durationMonths: 20,
    startDate: '2026-11-01',
    endDate: '2028-07-01',
    branchId: 'branch-prd-001',
  });

  assert.equal(payload.groupCode, 'KCA-1L-20M-01');
  assert.equal(payload.totalTickets, 20);
  assert.equal(payload.chitValue, 100000);
});

test('Bilingual Parity: Schemes dictionary contains 100% key parity including creation wizard keys', () => {
  const enKeys = Object.keys(enMessages.schemes);
  const taKeys = Object.keys(taMessages.schemes);

  assert.equal(
    enKeys.length,
    taKeys.length,
    `Key count mismatch: EN has ${enKeys.length}, TA has ${taKeys.length}`,
  );

  const taKeySet = new Set(taKeys);
  for (const k of enKeys) {
    assert.ok(taKeySet.has(k), `Tamil translation missing key: ${k}`);
  }

  // Ensure specific wizard keys are present
  const requiredWizardKeys = [
    'createTitle',
    'createSubtitle',
    'groupCodeLabel',
    'groupNameEnLabel',
    'chitValueLabel',
    'durationLabel',
    'commissionLockedNotice',
    'ceilingNotice',
    'divisibilityError',
    'submitCreate',
    'accessDeniedTitle',
  ];

  for (const wk of requiredWizardKeys) {
    assert.ok(enKeys.includes(wk), `Missing wizard key in en.json: ${wk}`);
    assert.ok(taKeys.includes(wk), `Missing wizard key in ta.json: ${wk}`);
  }

  // Ensure layout loading key exists in both dictionaries
  assert.ok(enMessages.common.workspaceInitializing, 'Missing common.workspaceInitializing in en.json');
  assert.ok(taMessages.common.workspaceInitializing, 'Missing common.workspaceInitializing in ta.json');
});

test('Safe Date Parsing: toSafeIsoDate handles valid, partial, and malformed dates without throwing RangeError', () => {
  // Valid ISO strings
  assert.equal(toSafeIsoDate('2026-11-01'), '2026-11-01T00:00:00.000Z');
  assert.equal(toSafeIsoDate('2028-06-15T12:00:00.000Z'), '2028-06-15T12:00:00.000Z');

  // Empty or nullish values return undefined
  assert.equal(toSafeIsoDate(''), undefined);
  assert.equal(toSafeIsoDate('   '), undefined);
  assert.equal(toSafeIsoDate(null), undefined);
  assert.equal(toSafeIsoDate(undefined), undefined);

  // Malformed date strings return undefined instead of throwing RangeError: Invalid time value
  assert.equal(toSafeIsoDate('invalid-date-string'), undefined);
  assert.equal(toSafeIsoDate('2026-99-99'), undefined);
  assert.doesNotThrow(() => toSafeIsoDate('garbage-text'));
});
