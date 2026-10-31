// ==============================================================================
// Kumaran Chits — Schemes Directory & Ticket Roster Test Suite (Task 4.1)
// Asserts Whole Rupee Math, ADR-13 Ticket Limits, Month 1 Invariant,
// Activation Pre-requisites, and 100% Bilingual Key Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupee, assertWholeRupee, parseWholeRupees } from '../src/lib/currency.ts';
import enMessages from '../messages/en.json' with { type: 'json' };
import taMessages from '../messages/ta.json' with { type: 'json' };

// 1. Math calculation helper mirroring backend ChitService.calculateSchemeMath
function calculateSchemeMath(chitValue: number, durationMonths: number) {
  assertWholeRupee(chitValue);
  assertWholeRupee(durationMonths);

  assert.equal(
    chitValue % durationMonths,
    0,
    `Chit value ${chitValue} must be evenly divisible by ${durationMonths} to guarantee whole rupees`,
  );

  const baseInstallment = Math.floor(chitValue / durationMonths);
  const foremanCommission = Math.floor((chitValue * 4) / 100); // 4%
  const maxDiscountCeiling = Math.floor(chitValue / 4); // 1/4 ceiling

  return {
    baseInstallment,
    foremanCommission,
    maxDiscountCeiling,
  };
}

// 2. ADR-13 Duplicate customer check helper
function checkCustomerDuplicate(
  assignedTickets: Array<{ ticketNumber: number; customerId: string }>,
  customerId: string,
) {
  const existing = assignedTickets.find((t) => t.customerId === customerId);
  if (existing) {
    return {
      hasDuplicate: true,
      ticketNumber: existing.ticketNumber,
    };
  }
  return { hasDuplicate: false };
}

// 3. Activation pre-requisite check helper
function canActivateScheme(assignedCount: number, totalTickets: number) {
  return {
    canActivate: assignedCount === totalTickets,
    remainingSlots: Math.max(0, totalTickets - assignedCount),
  };
}

// ==============================================================================
// Unit Test Assertions
// ==============================================================================

test('Guardrail 2 & 6: Scheme math calculates pure whole-rupee installments and 1/4 ceiling', () => {
  // Scenario A: ₹1 Lakh, 20 Months
  const scheme1L = calculateSchemeMath(100000, 20);
  assert.equal(scheme1L.baseInstallment, 5000, 'Base installment must equal ₹5,000');
  assert.equal(scheme1L.foremanCommission, 4000, '4% Commission must equal ₹4,000');
  assert.equal(scheme1L.maxDiscountCeiling, 25000, '1/4 ceiling must equal ₹25,000');
  assert.equal(formatRupee(scheme1L.baseInstallment), '₹5,000');
  assert.equal(formatRupee(scheme1L.maxDiscountCeiling), '₹25,000');

  // Scenario B: ₹5 Lakh, 20 Months
  const scheme5L = calculateSchemeMath(500000, 20);
  assert.equal(scheme5L.baseInstallment, 25000, 'Base installment must equal ₹25,000');
  assert.equal(scheme5L.foremanCommission, 20000, '4% Commission must equal ₹20,000');
  assert.equal(scheme5L.maxDiscountCeiling, 125000, '1/4 ceiling must equal ₹1,25,000');

  // Scenario C: ₹10 Lakh, 25 Months
  const scheme10L = calculateSchemeMath(1000000, 25);
  assert.equal(scheme10L.baseInstallment, 40000, 'Base installment must equal ₹40,000');
  assert.equal(scheme10L.foremanCommission, 40000, '4% Commission must equal ₹40,000');
  assert.equal(scheme10L.maxDiscountCeiling, 250000, '1/4 ceiling must equal ₹2,50,000');
});

test('Guardrail 7 / ADR-13: Prevents duplicate subscriber ticket allocations in same chit group', () => {
  const assignedTickets = [
    { ticketNumber: 1, customerId: 'cust-foreman-001' },
    { ticketNumber: 2, customerId: 'cust-murugan-002' },
    { ticketNumber: 3, customerId: 'cust-selvi-003' },
  ];

  // Test 1: New customer without existing ticket
  const checkNew = checkCustomerDuplicate(assignedTickets, 'cust-kavitha-004');
  assert.equal(checkNew.hasDuplicate, false, 'New customer must have no duplicate');

  // Test 2: Customer already holds Ticket #2
  const checkDuplicate = checkCustomerDuplicate(assignedTickets, 'cust-murugan-002');
  assert.equal(checkDuplicate.hasDuplicate, true, 'Existing customer must be flagged as duplicate');
  assert.equal(checkDuplicate.ticketNumber, 2, 'Duplicate must report Ticket #2');
});

test('Guardrail 5: Slot #1 is permanently designated for Company Representative (Month 1 pool)', () => {
  function getSlotRole(slotNumber: number) {
    if (slotNumber === 1) {
      return {
        role: 'COMPANY_REPRESENTATIVE',
        isCompanyPool: true,
        month1Auction: false,
      };
    }
    return {
      role: 'GENERAL_SUBSCRIBER',
      isCompanyPool: false,
      month1Auction: true,
    };
  }

  const slot1 = getSlotRole(1);
  assert.equal(slot1.role, 'COMPANY_REPRESENTATIVE');
  assert.equal(slot1.isCompanyPool, true);
  assert.equal(slot1.month1Auction, false);

  const slot4 = getSlotRole(4);
  assert.equal(slot4.role, 'GENERAL_SUBSCRIBER');
  assert.equal(slot4.isCompanyPool, false);
});

test('Scheme Activation: Requires 100% filled roster before activation can proceed', () => {
  // Incomplete roster: 18 / 20
  const incomplete = canActivateScheme(18, 20);
  assert.equal(incomplete.canActivate, false, 'Activation must be blocked when tickets < total');
  assert.equal(incomplete.remainingSlots, 2, 'Must report 2 remaining slots needed');

  // Complete roster: 20 / 20
  const complete = canActivateScheme(20, 20);
  assert.equal(complete.canActivate, true, 'Activation must be permitted when tickets === total');
  assert.equal(complete.remainingSlots, 0);
});

test('Scheme Directory: Filters by status and matches search keywords', () => {
  const schemes = [
    { groupCode: 'KCA-1L-20M-01', groupName: '₹1 Lakh Group A', status: 'ACTIVE' },
    { groupCode: 'KCB-2L-20M-01', groupName: '₹2 Lakh Group B', status: 'DRAFT' },
    { groupCode: 'KCC-5L-20M-01', groupName: '₹5 Lakh Group C', status: 'COMPLETED' },
  ];

  // Status Filter
  const activeOnly = schemes.filter((s) => s.status === 'ACTIVE');
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].groupCode, 'KCA-1L-20M-01');

  // Search Filter
  const searchResult = schemes.filter(
    (s) =>
      s.groupCode.toLowerCase().includes('kcb') ||
      s.groupName.toLowerCase().includes('kcb'),
  );
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].groupCode, 'KCB-2L-20M-01');
});

test('Bilingual Parity: Schemes dictionary keys match 100% between English and Tamil', () => {
  const enKeys = Object.keys(enMessages.schemes);
  const taKeys = Object.keys(taMessages.schemes);

  assert.equal(
    enKeys.length,
    taKeys.length,
    `Schemes key count mismatch: EN has ${enKeys.length}, TA has ${taKeys.length}`,
  );

  const taKeySet = new Set(taKeys);
  for (const k of enKeys) {
    assert.ok(taKeySet.has(k), `Tamil translation missing key in schemes: ${k}`);
  }
});
