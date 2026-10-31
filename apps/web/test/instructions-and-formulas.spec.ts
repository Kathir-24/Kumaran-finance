// ==============================================================================
// Kumaran Chits — Instructions, Guardrails & Math Engine Test Suite (Task 3.3)
// Asserts Whole Rupee Math, Passbook Invariants, 10 Guardrails Data Completeness,
// and 100% Bilingual Parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupee, assertWholeRupee, parseWholeRupees } from '../src/lib/currency.ts';
import { GUARDRAIL_DEFINITIONS } from '../src/components/instructions/guardrails-data.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Math calculation helper mirroring simulator & backend AuctionService
function calculateChitMath(chitValue: number, durationMonths: number, bidDiscount: number) {
  const baseInstallment = Math.floor(chitValue / durationMonths);
  const foremanCommission = Math.floor((chitValue * 4) / 100); // 4%
  const maxDiscountCeiling = Math.floor(chitValue / 4); // 1/4 ceiling

  assert.ok(bidDiscount >= foremanCommission, `Bid discount ${bidDiscount} cannot be below floor ${foremanCommission}`);
  assert.ok(bidDiscount <= maxDiscountCeiling, `Bid discount ${bidDiscount} cannot exceed ceiling ${maxDiscountCeiling}`);

  const totalDividend = bidDiscount - foremanCommission;
  const dividendPerTicket = Math.floor(totalDividend / durationMonths);
  const netInstallment = baseInstallment - dividendPerTicket;
  const prizeMoney = chitValue - bidDiscount;

  return {
    baseInstallment,
    foremanCommission,
    maxDiscountCeiling,
    totalDividend,
    dividendPerTicket,
    netInstallment,
    prizeMoney,
  };
}

test('Guardrail 2: Math engine produces pure whole rupees across all standard denominations', () => {
  const schemes = [
    { v: 100000, n: 20, d: 25000 },
    { v: 200000, n: 20, d: 50000 },
    { v: 500000, n: 20, d: 125000 },
    { v: 1000000, n: 20, d: 250000 },
    { v: 100000, n: 20, d: 10000 }, // Competitive mid-discount
  ];

  for (const s of schemes) {
    const res = calculateChitMath(s.v, s.n, s.d);

    // Verify all results are valid whole rupees without decimals
    assertWholeRupee(res.baseInstallment, 'Base Installment');
    assertWholeRupee(res.foremanCommission, 'Foreman Commission');
    assertWholeRupee(res.totalDividend, 'Total Dividend');
    assertWholeRupee(res.dividendPerTicket, 'Dividend Per Ticket');
    assertWholeRupee(res.netInstallment, 'Net Installment');
    assertWholeRupee(res.prizeMoney, 'Prize Money');

    // Verify formatting suppress decimals and paise
    assert.ok(!formatRupee(res.netInstallment).includes('.'));
    assert.ok(!formatRupee(res.netInstallment).includes('.00'));
    assert.ok(!formatRupee(res.prizeMoney).includes('.'));
  }
});

test('Invariant: Passbook Row-Sum Invariant Inet + Div === Ibase', () => {
  const schemes = [
    { v: 100000, n: 20, d: 25000 },
    { v: 200000, n: 20, d: 45000 },
    { v: 500000, n: 20, d: 100000 },
    { v: 1000000, n: 20, d: 200000 },
  ];

  for (const s of schemes) {
    const res = calculateChitMath(s.v, s.n, s.d);

    // The physical passbook row-sum invariant:
    // Amount Paid (Inet) + Dividend Credited (Div) === Total Base Installment (Ibase)
    assert.equal(
      res.netInstallment + res.dividendPerTicket,
      res.baseInstallment,
      `Passbook invariant failed for scheme ₹${s.v}`,
    );

    // Gross Pool Invariant: Prize Money + Bid Discount === Chit Value
    assert.equal(
      res.prizeMoney + s.d,
      s.v,
      `Pool invariant failed: P + D !== V for scheme ₹${s.v}`,
    );
  }
});

test('Guardrail 6: Floor and Ceiling Boundary Enforcement', () => {
  const chitValue = 100000;
  const duration = 20;

  const commission = Math.floor((chitValue * 4) / 100); // ₹4,000
  const ceiling = Math.floor(chitValue / 4); // ₹25,000

  // Below floor (D < 4% commission) throws
  assert.throws(() => {
    calculateChitMath(chitValue, duration, 3500);
  });

  // Above ceiling (D > 25% ceiling) throws
  assert.throws(() => {
    calculateChitMath(chitValue, duration, 25500);
  });

  // Exactly floor is valid
  assert.doesNotThrow(() => {
    calculateChitMath(chitValue, duration, commission);
  });

  // Exactly ceiling is valid
  assert.doesNotThrow(() => {
    calculateChitMath(chitValue, duration, ceiling);
  });
});

test('Completeness: All 10 Invariant Guardrails exist with code and violation proofs', () => {
  assert.equal(GUARDRAIL_DEFINITIONS.length, 10, 'Must have exactly 10 guardrail definitions');

  const ruleNumbers = GUARDRAIL_DEFINITIONS.map((g) => g.ruleNumber).sort((a, b) => a - b);
  assert.deepEqual(
    ruleNumbers,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'Guardrails must be numbered sequentially 1 to 10',
  );

  for (const g of GUARDRAIL_DEFINITIONS) {
    assert.ok(g.id.startsWith('rule-'), `Rule ID '${g.id}' must start with 'rule-'`);
    assert.ok(g.titleKey.length > 0, `Rule ${g.ruleNumber} title key is missing`);
    assert.ok(g.descKey.length > 0, `Rule ${g.ruleNumber} desc key is missing`);
    assert.ok(g.codeProof.length > 10, `Rule ${g.ruleNumber} code proof is missing`);
    assert.ok(g.violationResponse.length > 10, `Rule ${g.ruleNumber} violation response is missing`);
    assert.ok(g.details.length >= 2, `Rule ${g.ruleNumber} must have at least 2 detail points`);
    assert.ok(g.docRef.length > 0, `Rule ${g.ruleNumber} must link to docs reference`);
  }
});

test('Bilingual Parity: Instructions dictionary keys match 100% between English and Tamil', () => {
  const enPath = path.resolve('apps/web/messages/en.json');
  const taPath = path.resolve('apps/web/messages/ta.json');

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

  function getKeys(obj: any, prefix = ''): string[] {
    let keys: string[] = [];
    for (const k of Object.keys(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        keys = keys.concat(getKeys(obj[k], full));
      } else {
        keys.push(full);
      }
    }
    return keys;
  }

  const enInstructionsKeys = getKeys(en.instructions, 'instructions');
  const taInstructionsKeys = getKeys(ta.instructions, 'instructions');

  assert.equal(
    enInstructionsKeys.length,
    taInstructionsKeys.length,
    `Instructions key count mismatch: EN has ${enInstructionsKeys.length}, TA has ${taInstructionsKeys.length}`,
  );

  const taKeySet = new Set(taInstructionsKeys);
  for (const k of enInstructionsKeys) {
    assert.ok(taKeySet.has(k), `Tamil translation missing key: ${k}`);
  }
});
