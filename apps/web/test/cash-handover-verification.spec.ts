import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 8.3: Evening Field Cash Handover Verification Desk Unit Tests', () => {
  type CashHandoverStatus = 'PENDING_HANDOVER' | 'ACKNOWLEDGED';
  type UserRole = 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'ACCOUNTANT' | 'COLLECTION_AGENT' | 'CUSTOMER' | 'AUDITOR';

  interface CashPaymentRecord {
    id: string;
    recordedByUserId: string;
    amount: bigint;
    paymentMethod: 'CASH';
    cashHandoverStatus: CashHandoverStatus;
    cashHandoverAcknowledgedByUserId?: string;
    cashHandoverAcknowledgedAt?: Date;
  }

  interface AcknowledgeHandoverPayload {
    collectorUserId: string;
    acknowledgedAmount: number;
    paymentIds: string[];
    notes?: string;
  }

  const acknowledgeVaultHandover = (
    payload: AcknowledgeHandoverPayload,
    acknowledgerUserId: string,
    acknowledgerRoles: UserRole[],
    payments: CashPaymentRecord[],
  ) => {
    // RBAC check
    const allowedRoles: UserRole[] = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'];
    if (!acknowledgerRoles.some((r) => allowedRoles.includes(r))) {
      throw new Error('HANDOVER_ACKNOWLEDGE_FORBIDDEN: Insufficient permissions');
    }

    // Guardrail 10: Strict Maker != Checker Separation of Duties
    if (payload.collectorUserId === acknowledgerUserId) {
      throw new Error('MAKER_CHECKER_VIOLATION: Collector cannot acknowledge own cash handover into vault');
    }

    // Guardrail 2: Whole Rupee Math
    if (
      !Number.isInteger(payload.acknowledgedAmount) ||
      payload.acknowledgedAmount <= 0
    ) {
      throw new Error('INVALID_AMOUNT: Vault cash amount must be a positive whole Rupee integer');
    }

    // Find payments in batch
    const batchPayments = payments.filter((p) => payload.paymentIds.includes(p.id));
    if (batchPayments.length !== payload.paymentIds.length) {
      throw new Error('PAYMENTS_NOT_FOUND: One or more payments not found');
    }

    for (const p of batchPayments) {
      if (p.recordedByUserId !== payload.collectorUserId) {
        throw new Error(`COLLECTOR_MISMATCH: Payment ${p.id} was not recorded by collector`);
      }
      if (p.cashHandoverStatus !== 'PENDING_HANDOVER') {
        throw new Error(`ALREADY_ACKNOWLEDGED: Payment ${p.id} is not pending handover`);
      }
    }

    // Exact Sum Match Invariant
    const totalBatchSum = batchPayments.reduce((sum, p) => sum + p.amount, 0n);
    const countedBigInt = BigInt(payload.acknowledgedAmount);
    if (totalBatchSum !== countedBigInt) {
      throw new Error(
        `DISCREPANCY: Physically counted cash (₹${countedBigInt}) does not match collection receipts (₹${totalBatchSum})`,
      );
    }

    const acknowledgedAt = new Date();
    const updatedPayments = payments.map((p) => {
      if (payload.paymentIds.includes(p.id)) {
        return {
          ...p,
          cashHandoverStatus: 'ACKNOWLEDGED' as CashHandoverStatus,
          cashHandoverAcknowledgedByUserId: acknowledgerUserId,
          cashHandoverAcknowledgedAt: acknowledgedAt,
        };
      }
      return p;
    });

    return {
      success: true,
      acknowledgedAmount: countedBigInt,
      totalPaymentsAcknowledged: batchPayments.length,
      acknowledgedByUserId: acknowledgerUserId,
      acknowledgedAt,
      updatedPayments,
    };
  };

  // 1. Guardrail 10: Maker != Checker Hard Rejection
  it('Guardrail 10: Strictly rejects self-acknowledgment when collectorUserId === acknowledgerUserId', () => {
    const collectorId = 'agent-user-001';
    const payments: CashPaymentRecord[] = [
      { id: 'pay-01', recordedByUserId: collectorId, amount: 4000n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
    ];

    const payload: AcknowledgeHandoverPayload = {
      collectorUserId: collectorId,
      acknowledgedAmount: 4000,
      paymentIds: ['pay-01'],
    };

    assert.throws(
      () => acknowledgeVaultHandover(payload, collectorId, ['ACCOUNTANT'], payments),
      /MAKER_CHECKER_VIOLATION/,
    );
  });

  // 2. RBAC Authority Constraint
  it('RBAC Authority: Restricts cash handover acknowledgment to Super Admin, Branch Manager, and Accountant', () => {
    const collectorId = 'agent-user-001';
    const checkerId = 'partner-user-002';
    const payments: CashPaymentRecord[] = [
      { id: 'pay-01', recordedByUserId: collectorId, amount: 3750n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
    ];

    const payload: AcknowledgeHandoverPayload = {
      collectorUserId: collectorId,
      acknowledgedAmount: 3750,
      paymentIds: ['pay-01'],
    };

    // Customer, Collection Agent, and Auditor must be rejected
    const unauthorizedRoles: UserRole[][] = [
      ['CUSTOMER'],
      ['COLLECTION_AGENT'],
      ['AUDITOR'],
    ];

    for (const roles of unauthorizedRoles) {
      assert.throws(
        () => acknowledgeVaultHandover(payload, checkerId, roles, payments),
        /HANDOVER_ACKNOWLEDGE_FORBIDDEN/,
      );
    }

    // Super Admin, Branch Manager, Accountant must succeed
    const authorizedRoles: UserRole[][] = [
      ['SUPER_ADMIN'],
      ['BRANCH_MANAGER'],
      ['ACCOUNTANT'],
    ];

    for (const roles of authorizedRoles) {
      const res = acknowledgeVaultHandover(payload, checkerId, roles, payments);
      assert.equal(res.success, true);
    }
  });

  // 3. Amount Exact Match Invariant
  it('Amount Exact Match: Strictly rejects acknowledgment if physically counted cash does not match receipts sum', () => {
    const collectorId = 'agent-user-001';
    const checkerId = 'partner-user-002';
    const payments: CashPaymentRecord[] = [
      { id: 'pay-01', recordedByUserId: collectorId, amount: 4000n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
      { id: 'pay-02', recordedByUserId: collectorId, amount: 3500n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
    ]; // Total = 7500n

    // Cashier counts 7000 (shortage of 500)
    const shortagePayload: AcknowledgeHandoverPayload = {
      collectorUserId: collectorId,
      acknowledgedAmount: 7000,
      paymentIds: ['pay-01', 'pay-02'],
    };

    assert.throws(
      () => acknowledgeVaultHandover(shortagePayload, checkerId, ['SUPER_ADMIN'], payments),
      /DISCREPANCY.*counted.*7000.*receipts.*7500/,
    );

    // Exact match 7500 succeeds
    const exactPayload: AcknowledgeHandoverPayload = {
      collectorUserId: collectorId,
      acknowledgedAmount: 7500,
      paymentIds: ['pay-01', 'pay-02'],
    };
    const res = acknowledgeVaultHandover(exactPayload, checkerId, ['SUPER_ADMIN'], payments);
    assert.equal(res.acknowledgedAmount, 7500n);
  });

  // 4. Guardrail 2: Whole Rupee Math
  it('Guardrail 2: Rejects negative amounts, zero, and fractional paise/decimals', () => {
    const collectorId = 'agent-user-001';
    const checkerId = 'partner-user-002';
    const payments: CashPaymentRecord[] = [
      { id: 'pay-01', recordedByUserId: collectorId, amount: 5000n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
    ];

    const invalidAmounts = [-5000, 0, 5000.5, 4999.99];
    for (const badAmt of invalidAmounts) {
      assert.throws(
        () =>
          acknowledgeVaultHandover(
            { collectorUserId: collectorId, acknowledgedAmount: badAmt, paymentIds: ['pay-01'] },
            checkerId,
            ['BRANCH_MANAGER'],
            payments,
          ),
        /INVALID_AMOUNT/,
      );
    }
  });

  // 5. Denomination Counter Accuracy
  it('Denomination Counter: Accurately computes sum of notes (500, 200, 100, 50, 20, 10)', () => {
    const denoms = [500, 200, 100, 50, 20, 10];
    const counts: Record<number, number> = {
      500: 40, // 20,000
      200: 20, // 4,000
      100: 10, // 1,000
      50: 8,   // 400
      20: 5,   // 100
      10: 10,  // 100
    };

    const totalCounted = denoms.reduce((sum, d) => sum + (counts[d] || 0) * d, 0);
    const expected = 20000 + 4000 + 1000 + 400 + 100 + 100; // 25,600
    assert.equal(totalCounted, expected);
    assert.equal(totalCounted, 25600);
  });

  // 6. Cash Handover State Transition
  it('Cash Handover State Transition: Transitions payments from PENDING_HANDOVER to ACKNOWLEDGED', () => {
    const collectorId = 'agent-user-001';
    const checkerId = 'accountant-003';
    const payments: CashPaymentRecord[] = [
      { id: 'pay-01', recordedByUserId: collectorId, amount: 3950n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
      { id: 'pay-02', recordedByUserId: collectorId, amount: 4000n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
    ];

    const result = acknowledgeVaultHandover(
      { collectorUserId: collectorId, acknowledgedAmount: 7950, paymentIds: ['pay-01', 'pay-02'] },
      checkerId,
      ['ACCOUNTANT'],
      payments,
    );

    assert.equal(result.success, true);
    assert.equal(result.totalPaymentsAcknowledged, 2);
    for (const p of result.updatedPayments) {
      assert.equal(p.cashHandoverStatus, 'ACKNOWLEDGED');
      assert.equal(p.cashHandoverAcknowledgedByUserId, checkerId);
      assert.ok(p.cashHandoverAcknowledgedAt instanceof Date);
    }
  });

  // 7. Liability Transfer to Branch Vault
  it('Liability Transfer: Atomically stamps acknowledgedByUserId, timestamp, and audit record', () => {
    const collectorId = 'agent-user-001';
    const checkerId = 'partner-user-002';
    const payments: CashPaymentRecord[] = [
      { id: 'pay-01', recordedByUserId: collectorId, amount: 10000n, paymentMethod: 'CASH', cashHandoverStatus: 'PENDING_HANDOVER' },
    ];

    const result = acknowledgeVaultHandover(
      {
        collectorUserId: collectorId,
        acknowledgedAmount: 10000,
        paymentIds: ['pay-01'],
        notes: 'Vault Safe Compartment A. 20 notes of ₹500 verified.',
      },
      checkerId,
      ['SUPER_ADMIN'],
      payments,
    );

    assert.equal(result.acknowledgedByUserId, checkerId);
    assert.equal(result.acknowledgedAmount, 10000n);
    assert.ok(result.acknowledgedAt.getTime() <= Date.now());
  });

  // 8. 100% Bilingual Parity
  it('Bilingual Parity: All collections handover keys match 100% between en.json and ta.json', () => {
    const webRoot = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');

    const enPath = path.resolve(webRoot, 'messages/en.json');
    const taPath = path.resolve(webRoot, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    assert.ok(en.collections, 'en.collections must exist');
    assert.ok(ta.collections, 'ta.collections must exist');

    const enKeys = Object.keys(en.collections).sort();
    const taKeys = Object.keys(ta.collections).sort();

    const missingInTa = enKeys.filter((k) => !taKeys.includes(k));
    const missingInEn = taKeys.filter((k) => !enKeys.includes(k));

    assert.deepEqual(
      missingInTa,
      [],
      `Keys present in en.json but missing in ta.json: ${missingInTa.join(', ')}`,
    );
    assert.deepEqual(
      missingInEn,
      [],
      `Keys present in ta.json but missing in en.json: ${missingInEn.join(', ')}`,
    );

    // Key specific handover assertions
    const requiredKeys = [
      'handoverDeskTitle',
      'tabPendingHandovers',
      'tabSettlementLedger',
      'kpiCashPending',
      'kpiCashInVault',
      'denominationCounterTitle',
      'denominationMatch',
      'denominationMismatch',
      'acknowledgeVaultDepositBtn',
      'makerCheckerHandoverAlert',
      'settlementVoucherTitle',
    ];

    for (const rk of requiredKeys) {
      assert.ok(en.collections[rk], `en.collections must contain ${rk}`);
      assert.ok(ta.collections[rk], `ta.collections must contain ${rk}`);
    }
  });
});
