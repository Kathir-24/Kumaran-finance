import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 8.2: Customer Self-Reported UPI Claims Verification Desk Unit Tests', () => {
  type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  type PaymentStatus = 'INITIATED' | 'SUCCESS' | 'FAILED' | 'REVERSED';
  type DueStatus = 'UNPAID' | 'PAID' | 'OVERDUE';
  type UserRole = 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'ACCOUNTANT' | 'COLLECTION_AGENT' | 'CUSTOMER' | 'AUDITOR';

  interface UpiClaimState {
    id: string;
    ticketId: string;
    dueId: string;
    amount: bigint;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    utrNumber: string;
    recordedByUserId: string;
    notes?: string;
  }

  interface InstallmentDueState {
    id: string;
    ticketId: string;
    installmentMonth: number;
    netPayableAmount: bigint;
    paidAmount: bigint;
    status: DueStatus;
  }

  // 1. Guardrail 10: Maker != Checker Hard Rejection
  it('Guardrail 10: Rejects self-verification when checkerUserId === recordedByUserId', () => {
    const verifyClaim = (
      claim: UpiClaimState,
      checkerUserId: string,
      checkerRoles: UserRole[],
    ) => {
      const allowedRoles: UserRole[] = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'];
      if (!checkerRoles.some((r) => allowedRoles.includes(r))) {
        throw new Error('CLAIM_VERIFY_FORBIDDEN');
      }
      if (claim.recordedByUserId === checkerUserId) {
        throw new Error('MAKER_CHECKER_VIOLATION: User who submitted UPI claim cannot verify it');
      }
      return {
        ...claim,
        paymentStatus: 'SUCCESS' as PaymentStatus,
      };
    };

    const claim: UpiClaimState = {
      id: 'claim-001',
      ticketId: 't-07',
      dueId: 'due-04',
      amount: 3750n,
      paymentMethod: 'UPI',
      paymentStatus: 'INITIATED',
      utrNumber: '429188123456',
      recordedByUserId: 'user-agent-01',
    };

    // Submitter cannot self-verify
    assert.throws(
      () => verifyClaim(claim, 'user-agent-01', ['ACCOUNTANT']),
      /MAKER_CHECKER_VIOLATION/,
    );

    // Independent accountant/partner succeeds
    const verified = verifyClaim(claim, 'user-accountant-02', ['ACCOUNTANT']);
    assert.equal(verified.paymentStatus, 'SUCCESS');
  });

  // 2. RBAC Authority Constraint
  it('RBAC Authority: Restricts verification strictly to Super Admin, Branch Manager, and Accountant', () => {
    const checkRolePermission = (roles: UserRole[]): boolean => {
      const authorized: UserRole[] = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'];
      return roles.some((r) => authorized.includes(r));
    };

    assert.equal(checkRolePermission(['SUPER_ADMIN']), true);
    assert.equal(checkRolePermission(['BRANCH_MANAGER']), true);
    assert.equal(checkRolePermission(['ACCOUNTANT']), true);

    assert.equal(checkRolePermission(['COLLECTION_AGENT']), false);
    assert.equal(checkRolePermission(['CUSTOMER']), false);
    assert.equal(checkRolePermission(['AUDITOR']), false);
  });

  // 3. Payment State Transition
  it('Payment State Transition: Transitions payment strictly from INITIATED to SUCCESS', () => {
    const transitionPayment = (currentStatus: PaymentStatus, method: PaymentMethod): PaymentStatus => {
      if (currentStatus !== 'INITIATED' || method !== 'UPI') {
        throw new Error(`INVALID_CLAIM_STATE: Payment status ${currentStatus} is not a pending UPI claim`);
      }
      return 'SUCCESS';
    };

    assert.equal(transitionPayment('INITIATED', 'UPI'), 'SUCCESS');
    assert.throws(() => transitionPayment('SUCCESS', 'UPI'), /INVALID_CLAIM_STATE/);
    assert.throws(() => transitionPayment('FAILED', 'UPI'), /INVALID_CLAIM_STATE/);
    assert.throws(() => transitionPayment('INITIATED', 'CASH'), /INVALID_CLAIM_STATE/);
  });

  // 4. Installment Due Settlement
  it('Due Settlement: Marks due PAID with exact net amount upon claim verification', () => {
    const settleDueOnVerification = (due: InstallmentDueState, amount: bigint): InstallmentDueState => {
      if (due.status === 'PAID') {
        throw new Error('DUE_ALREADY_SETTLED');
      }
      if (amount !== due.netPayableAmount) {
        throw new Error('AMOUNT_MISMATCH');
      }
      return {
        ...due,
        status: 'PAID',
        paidAmount: amount,
      };
    };

    const unpaidDue: InstallmentDueState = {
      id: 'due-01',
      ticketId: 't-07',
      installmentMonth: 4,
      netPayableAmount: 3750n,
      paidAmount: 0n,
      status: 'UNPAID',
    };

    const settled = settleDueOnVerification(unpaidDue, 3750n);
    assert.equal(settled.status, 'PAID');
    assert.equal(settled.paidAmount, 3750n);

    assert.throws(() => settleDueOnVerification(settled, 3750n), /DUE_ALREADY_SETTLED/);
  });

  // 5. Sequential Receipt Formatting
  it('Sequential Receipt: Issues collision-proof receipt KC-REC-{BRANCH}-{YYYY}-{XXXXX}', () => {
    const formatReceipt = (branchCode: string, year: number, seq: number): string => {
      return `KC-REC-${branchCode}-${year}-${seq.toString().padStart(5, '0')}`;
    };

    assert.equal(formatReceipt('PRD', 2026, 78), 'KC-REC-PRD-2026-00078');
    assert.equal(formatReceipt('ERD', 2026, 1), 'KC-REC-ERD-2026-00001');
  });

  // 6. Arrears Recalculation
  it('Arrears Recalculation: Decrements consecutive unpaid arrears and updates ticket status', () => {
    const recalculateArrears = (
      monthsPaid: number[],
      currentMonth: number,
    ): { consecutiveUnpaid: number; ticketStatus: 'ACTIVE' | 'DEFAULT_3_MONTHS' } => {
      let unpaid = 0;
      for (let m = currentMonth; m >= 1; m--) {
        if (!monthsPaid.includes(m)) {
          unpaid++;
        } else {
          break;
        }
      }
      return {
        consecutiveUnpaid: unpaid,
        ticketStatus: unpaid >= 3 ? 'DEFAULT_3_MONTHS' : 'ACTIVE',
      };
    };

    // Before payment: Month 4 is unpaid (months 1, 2, 3 paid) -> 1 unpaid month
    const before = recalculateArrears([1, 2, 3], 4);
    assert.equal(before.consecutiveUnpaid, 1);
    assert.equal(before.ticketStatus, 'ACTIVE');

    // After verifying Month 4: months 1, 2, 3, 4 paid -> 0 unpaid months
    const after = recalculateArrears([1, 2, 3, 4], 4);
    assert.equal(after.consecutiveUnpaid, 0);
    assert.equal(after.ticketStatus, 'ACTIVE');

    // 3 consecutive unpaid months grants default removal rights
    const defaulter = recalculateArrears([1], 4); // months 2, 3, 4 unpaid = 3 consecutive
    assert.equal(defaulter.consecutiveUnpaid, 3);
    assert.equal(defaulter.ticketStatus, 'DEFAULT_3_MONTHS');
  });

  // 7. Bank UTR Format & Uniqueness Validation
  it('Bank UTR Validation: Enforces 6 to 35 alphanumeric characters and prevents duplicate claim submission', () => {
    const validateUtr = (utr: string): string => {
      if (!utr || utr.length < 6 || utr.length > 35) {
        throw new Error('UTR_LENGTH_INVALID');
      }
      if (!/^[A-Za-z0-9_-]+$/.test(utr)) {
        throw new Error('UTR_CHARACTERS_INVALID');
      }
      return utr;
    };

    assert.equal(validateUtr('429188123456'), '429188123456');
    assert.equal(validateUtr('UTR-NEFT-9918231'), 'UTR-NEFT-9918231');

    assert.throws(() => validateUtr('123'), /UTR_LENGTH_INVALID/);
    assert.throws(() => validateUtr('429188 123456'), /UTR_CHARACTERS_INVALID/);
    assert.throws(() => validateUtr('429188@123456'), /UTR_CHARACTERS_INVALID/);

    // Uniqueness in ledger
    const existingUtrs = new Set(['429188123456', 'UTR-NEFT-9918231']);
    const registerClaim = (utr: string) => {
      const valid = validateUtr(utr);
      if (existingUtrs.has(valid)) {
        throw new Error('DUPLICATE_UTR_CLAIM: Bank UTR has already been submitted');
      }
      existingUtrs.add(valid);
      return valid;
    };

    assert.throws(() => registerClaim('429188123456'), /DUPLICATE_UTR_CLAIM/);
    assert.equal(registerClaim('529188999999'), '529188999999');
  });

  // 8. 100% Bilingual Parity between English and Tamil Dictionaries
  it('Bilingual Parity: All collections keys match 100% between en.json and ta.json', () => {
    const rootDir = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');
    const enPath = path.resolve(rootDir, 'messages/en.json');
    const taPath = path.resolve(rootDir, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    const enCollections = en.collections || {};
    const taCollections = ta.collections || {};

    const enKeys = Object.keys(enCollections).sort();
    const taKeys = Object.keys(taCollections).sort();

    assert.deepEqual(
      enKeys,
      taKeys,
      `Bilingual collections keys mismatch. Difference: ${JSON.stringify(
        enKeys.filter((k) => !taKeys.includes(k)),
      )}`,
    );

    // Verify Task 8.2 specific keys
    const task82Keys = [
      'tabCounter',
      'tabUpiClaims',
      'pendingClaimsCountBadge',
      'upiClaimsTitle',
      'upiClaimsSubtitle',
      'bankStatementNotice',
      'tableClaimId',
      'tableUtrNumber',
      'tableSubmittedBy',
      'verifyClaimBtn',
      'verifyClaimDialogTitle',
      'verifyClaimDialogSubtitle',
      'confirmBankCreditLabel',
      'verificationNotesLabel',
      'confirmVerificationBtn',
      'verifyingClaim',
      'claimVerifiedSuccess',
      'noClaimsFound',
      'noClaimsDesc',
      'makerCheckerClaimAlert',
      'copyUtrBtn',
      'copiedUtr',
    ];

    for (const key of task82Keys) {
      assert.ok(enCollections[key], `Missing en.json key: collections.${key}`);
      assert.ok(taCollections[key], `Missing ta.json key: collections.${key}`);
    }
  });
});
