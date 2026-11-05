import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 8.4: Payment Reversal Requests & Dual-Control Audit Desk Unit Tests', () => {
  type PaymentStatus = 'SUCCESS' | 'REVERSED' | 'INITIATED' | 'FAILED';
  type DueStatus = 'UNPAID' | 'PAID' | 'OVERDUE';
  type ReversalStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED';
  type UserRole = 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'ACCOUNTANT' | 'COLLECTION_AGENT' | 'CUSTOMER' | 'AUDITOR';

  interface ReversalRecord {
    id: string;
    paymentId: string;
    reason: string;
    status: ReversalStatus;
    notes?: string;
    initiatedByUserId: string; // Maker
    approvedByUserId?: string;  // Checker
    reversedAt?: Date;
  }

  interface PaymentState {
    id: string;
    amount: bigint;
    paymentStatus: PaymentStatus;
    receiptNumber: string;
    ticketId: string;
    dueId: string;
    reversal?: ReversalRecord;
  }

  interface InstallmentDueState {
    id: string;
    ticketId: string;
    installmentMonth: number;
    status: DueStatus;
    paidAmount: bigint;
  }

  interface TicketState {
    id: string;
    consecutiveUnpaidMonths: number;
    status: string;
  }

  // 1. Maker Request Reversal Function
  const requestPaymentReversal = (
    payment: PaymentState,
    makerUserId: string,
    reason: string,
    notes?: string,
  ) => {
    if (payment.paymentStatus === 'REVERSED') {
      throw new Error('ALREADY_REVERSED: Payment has already been reversed');
    }
    if (payment.paymentStatus !== 'SUCCESS') {
      throw new Error('INVALID_PAYMENT_STATUS: Only successful payments can be reversed');
    }
    if (payment.reversal && payment.reversal.status === 'REQUESTED') {
      throw new Error('REVERSAL_PENDING: A reversal request is already pending for this payment');
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('MANDATORY_JUSTIFICATION: Reason must be at least 5 characters');
    }

    const reversal: ReversalRecord = {
      id: `rev-${Date.now()}`,
      paymentId: payment.id,
      reason: reason.trim(),
      notes: notes?.trim(),
      status: 'REQUESTED',
      initiatedByUserId: makerUserId,
    };

    return {
      ...payment,
      reversal,
    };
  };

  // 2. Checker Approve Reversal Function
  const approvePaymentReversal = (
    payment: PaymentState,
    due: InstallmentDueState,
    ticket: TicketState,
    checkerUserId: string,
    checkerRoles: UserRole[],
    notes?: string,
  ) => {
    // 1. Super Admin exclusivity
    if (!checkerRoles.includes('SUPER_ADMIN')) {
      throw new Error('REVERSAL_PERMISSION_DENIED: Only Super Admin (Partners) can approve reversals');
    }

    if (!payment.reversal || payment.reversal.status !== 'REQUESTED') {
      throw new Error('NO_PENDING_REVERSAL: No pending reversal request found for this payment');
    }

    // 2. Guardrail 10: Maker != Checker Hard Guard
    if (payment.reversal.initiatedByUserId === checkerUserId) {
      throw new Error('MAKER_CHECKER_VIOLATION: User who requested reversal cannot approve it');
    }

    const reversedAt = new Date();
    const updatedReversal: ReversalRecord = {
      ...payment.reversal,
      status: 'APPROVED',
      approvedByUserId: checkerUserId,
      notes: notes ? `${payment.reversal.notes || ''} | Checker: ${notes}` : payment.reversal.notes,
      reversedAt,
    };

    const updatedPayment: PaymentState = {
      ...payment,
      paymentStatus: 'REVERSED',
      reversal: updatedReversal,
    };

    const updatedDue: InstallmentDueState = {
      ...due,
      status: 'UNPAID',
      paidAmount: 0n,
    };

    const newArrears = ticket.consecutiveUnpaidMonths + 1;
    const updatedTicket: TicketState = {
      ...ticket,
      consecutiveUnpaidMonths: newArrears,
      status: newArrears >= 3 ? 'DEFAULT_3_MONTHS' : ticket.status,
    };

    return {
      updatedPayment,
      updatedDue,
      updatedTicket,
    };
  };

  // 3. Checker Reject Reversal Function
  const rejectPaymentReversal = (
    payment: PaymentState,
    checkerUserId: string,
    checkerRoles: UserRole[],
    rejectionReason: string,
  ) => {
    if (!checkerRoles.includes('SUPER_ADMIN')) {
      throw new Error('REVERSAL_PERMISSION_DENIED: Only Super Admin can reject reversals');
    }
    if (!payment.reversal || payment.reversal.status !== 'REQUESTED') {
      throw new Error('NO_PENDING_REVERSAL: No pending reversal request found for this payment');
    }
    if (payment.reversal.initiatedByUserId === checkerUserId) {
      throw new Error('MAKER_CHECKER_VIOLATION: User who requested reversal cannot reject it');
    }
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new Error('MANDATORY_REJECTION_REASON: Rejection reason must be at least 5 characters');
    }

    const updatedReversal: ReversalRecord = {
      ...payment.reversal,
      status: 'REJECTED',
      approvedByUserId: checkerUserId,
      notes: `${payment.reversal.notes || ''} | Rejection: ${rejectionReason.trim()}`,
    };

    return {
      ...payment,
      reversal: updatedReversal,
    };
  };

  // 1. Guardrail 10 Maker != Checker Hard Rejection
  it('Guardrail 10: Strictly rejects self-approval when checkerUserId === initiatedByUserId', () => {
    const makerId = 'user-accountant-001';
    const payment: PaymentState = {
      id: 'pay-001',
      amount: 4000n,
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00001',
      ticketId: 't-07',
      dueId: 'due-01',
    };
    const due: InstallmentDueState = {
      id: 'due-01',
      ticketId: 't-07',
      installmentMonth: 1,
      status: 'PAID',
      paidAmount: 4000n,
    };
    const ticket: TicketState = { id: 't-07', consecutiveUnpaidMonths: 0, status: 'ACTIVE' };

    const withReversal = requestPaymentReversal(payment, makerId, 'WRONG_TICKET_ENTERED');

    assert.throws(
      () => approvePaymentReversal(withReversal, due, ticket, makerId, ['SUPER_ADMIN']),
      /MAKER_CHECKER_VIOLATION/,
    );
  });

  // 2. RBAC Authority Constraint
  it('RBAC Authority: Restricts approval and rejection authority strictly to Super Admin (Partners)', () => {
    const makerId = 'user-accountant-001';
    const checkerId = 'partner-user-002';
    const payment: PaymentState = {
      id: 'pay-001',
      amount: 3750n,
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00002',
      ticketId: 't-08',
      dueId: 'due-02',
    };
    const due: InstallmentDueState = { id: 'due-02', ticketId: 't-08', installmentMonth: 2, status: 'PAID', paidAmount: 3750n };
    const ticket: TicketState = { id: 't-08', consecutiveUnpaidMonths: 0, status: 'ACTIVE' };

    const withReversal = requestPaymentReversal(payment, makerId, 'CHEQUE_BOUNCED: Bank dishonored cheque');

    // Unauthorized roles must fail
    const unauthorizedRoles: UserRole[][] = [
      ['BRANCH_MANAGER'],
      ['ACCOUNTANT'],
      ['COLLECTION_AGENT'],
      ['AUDITOR'],
      ['CUSTOMER'],
    ];

    for (const roles of unauthorizedRoles) {
      assert.throws(
        () => approvePaymentReversal(withReversal, due, ticket, checkerId, roles),
        /REVERSAL_PERMISSION_DENIED/,
      );
    }

    // Super Admin must succeed
    const res = approvePaymentReversal(withReversal, due, ticket, checkerId, ['SUPER_ADMIN']);
    assert.equal(res.updatedPayment.paymentStatus, 'REVERSED');
  });

  // 3. Payment State Transition Invariant
  it('Payment State Transition: Transitions payment strictly from SUCCESS to REVERSED upon approval', () => {
    const makerId = 'user-staff-001';
    const checkerId = 'partner-user-002';
    const payment: PaymentState = {
      id: 'pay-003',
      amount: 4500n,
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00003',
      ticketId: 't-09',
      dueId: 'due-03',
    };
    const due: InstallmentDueState = { id: 'due-03', ticketId: 't-09', installmentMonth: 3, status: 'PAID', paidAmount: 4500n };
    const ticket: TicketState = { id: 't-09', consecutiveUnpaidMonths: 0, status: 'ACTIVE' };

    const withReversal = requestPaymentReversal(payment, makerId, 'DUPLICATE_ENTRY: Counter staff entered twice');
    const result = approvePaymentReversal(withReversal, due, ticket, checkerId, ['SUPER_ADMIN'], 'Verified duplicate receipt');

    assert.equal(result.updatedPayment.paymentStatus, 'REVERSED');
    assert.equal(result.updatedPayment.reversal?.status, 'APPROVED');
    assert.equal(result.updatedPayment.reversal?.approvedByUserId, checkerId);
  });

  // 4. Due Restoration Invariant
  it('Due Restoration: Restores installment due strictly to UNPAID with paidAmount = 0n', () => {
    const makerId = 'user-staff-001';
    const checkerId = 'partner-user-002';
    const payment: PaymentState = {
      id: 'pay-004',
      amount: 3750n,
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00004',
      ticketId: 't-10',
      dueId: 'due-04',
    };
    const due: InstallmentDueState = { id: 'due-04', ticketId: 't-10', installmentMonth: 4, status: 'PAID', paidAmount: 3750n };
    const ticket: TicketState = { id: 't-10', consecutiveUnpaidMonths: 0, status: 'ACTIVE' };

    const withReversal = requestPaymentReversal(payment, makerId, 'CUSTOMER_DISPUTE: Member paid via UPI not cash');
    const result = approvePaymentReversal(withReversal, due, ticket, checkerId, ['SUPER_ADMIN']);

    assert.equal(result.updatedDue.status, 'UNPAID');
    assert.equal(result.updatedDue.paidAmount, 0n);
  });

  // 5. Arrears Recalculation & Company Removal Rights
  it('Arrears Recalculation: Correctly increments unpaid arrears and flags DEFAULT_3_MONTHS if unpaid >= 3', () => {
    const makerId = 'user-staff-001';
    const checkerId = 'partner-user-002';
    const payment: PaymentState = {
      id: 'pay-005',
      amount: 4000n,
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00005',
      ticketId: 't-11',
      dueId: 'due-05',
    };
    const due: InstallmentDueState = { id: 'due-05', ticketId: 't-11', installmentMonth: 5, status: 'PAID', paidAmount: 4000n };
    // Ticket previously had 2 unpaid months; reversing this payment makes it 3!
    const ticket: TicketState = { id: 't-11', consecutiveUnpaidMonths: 2, status: 'ACTIVE' };

    const withReversal = requestPaymentReversal(payment, makerId, 'CHEQUE_BOUNCED: Dishonored due to insufficient funds');
    const result = approvePaymentReversal(withReversal, due, ticket, checkerId, ['SUPER_ADMIN']);

    assert.equal(result.updatedTicket.consecutiveUnpaidMonths, 3);
    assert.equal(result.updatedTicket.status, 'DEFAULT_3_MONTHS');
  });

  // 6. Rejection State Preservation
  it('Rejection State Preservation: Rejected reversal preserves payment as SUCCESS and due as PAID', () => {
    const makerId = 'user-staff-001';
    const checkerId = 'partner-user-002';
    const payment: PaymentState = {
      id: 'pay-006',
      amount: 4000n,
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00006',
      ticketId: 't-12',
      dueId: 'due-06',
    };

    const withReversal = requestPaymentReversal(payment, makerId, 'CUSTOMER_DISPUTE: Mistaken entry alleged');
    const rejected = rejectPaymentReversal(
      withReversal,
      checkerId,
      ['SUPER_ADMIN'],
      'Bank statement confirmed customer funds received',
    );

    assert.equal(rejected.paymentStatus, 'SUCCESS');
    assert.equal(rejected.reversal?.status, 'REJECTED');
    assert.equal(rejected.reversal?.approvedByUserId, checkerId);
    assert.ok(rejected.reversal?.notes?.includes('Bank statement confirmed'));
  });

  // 7. Mandatory Justification Invariant
  it('Mandatory Justification: Strictly rejects reversal requests without a valid reason (min 5 chars)', () => {
    const payment: PaymentState = {
      id: 'pay-007',
      amount: 4000n,
      paymentStatus: 'SUCCESS',
      receiptNumber: 'KC-REC-PRD-2026-00007',
      ticketId: 't-13',
      dueId: 'due-07',
    };

    assert.throws(
      () => requestPaymentReversal(payment, 'maker-1', ''),
      /MANDATORY_JUSTIFICATION/,
    );
    assert.throws(
      () => requestPaymentReversal(payment, 'maker-1', 'err'),
      /MANDATORY_JUSTIFICATION/,
    );
  });

  // 8. 100% Bilingual Parity
  it('Bilingual Parity: All reversals keys match 100% between en.json and ta.json', () => {
    const webRoot = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');

    const enPath = path.resolve(webRoot, 'messages/en.json');
    const taPath = path.resolve(webRoot, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    assert.ok(en.reversals, 'en.reversals must exist');
    assert.ok(ta.reversals, 'ta.reversals must exist');

    const enKeys = Object.keys(en.reversals).sort();
    const taKeys = Object.keys(ta.reversals).sort();

    const missingInTa = enKeys.filter((k) => !taKeys.includes(k));
    const missingInEn = taKeys.filter((k) => !enKeys.includes(k));

    assert.deepEqual(missingInTa, [], `Missing in ta.json: ${missingInTa.join(', ')}`);
    assert.deepEqual(missingInEn, [], `Missing in en.json: ${missingInEn.join(', ')}`);

    const requiredKeys = [
      'reversalsDeskTitle',
      'tabPendingReversals',
      'tabReversalsLedger',
      'kpiPendingRequests',
      'kpiTotalReversed',
      'requestReversalBtn',
      'approveReversalDialogTitle',
      'rejectReversalDialogTitle',
      'selfApprovalBlocked',
      'makerGuardBadge',
    ];

    for (const rk of requiredKeys) {
      assert.ok(en.reversals[rk], `en.reversals must contain ${rk}`);
      assert.ok(ta.reversals[rk], `ta.reversals must contain ${rk}`);
    }
  });
});
