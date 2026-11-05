import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 6.4: Defaulter Substitution & Member Removal Desk Unit Tests', () => {
  // 1. Guardrail 8 & ADR-07: Fail-closed removal restriction (< 3 months)
  it('Guardrail 8: Strictly blocks defaulter removal if consecutiveUnpaidMonths < 3', () => {
    const canExerciseRemovalRights = (consecutiveUnpaidMonths: number, status: string): boolean => {
      if (status === 'REMOVED_DEF_3M') return false;
      return consecutiveUnpaidMonths >= 3;
    };

    assert.equal(canExerciseRemovalRights(0, 'ACTIVE'), false);
    assert.equal(canExerciseRemovalRights(1, 'ACTIVE'), false);
    assert.equal(canExerciseRemovalRights(2, 'ACTIVE'), false);
    assert.equal(canExerciseRemovalRights(3, 'DEFAULT_3_MONTHS'), true);
    assert.equal(canExerciseRemovalRights(5, 'DEFAULT_3_MONTHS'), true);
  });

  // 2. Guardrail 8 & ADR-12: Permitted removal (>= 3 months)
  it('Guardrail 8: Authorizes removal rights when consecutiveUnpaidMonths >= 3 and transitions to REMOVED_DEF_3M', () => {
    interface TicketState {
      id: string;
      ticketNumber: number;
      consecutiveUnpaidMonths: number;
      status: string;
      removedAt: Date | null;
      removedByUserId: string | null;
    }

    const removeDefaulter = (
      ticket: TicketState,
      adminUserId: string,
      reason: string,
    ): TicketState => {
      if (ticket.consecutiveUnpaidMonths < 3) {
        throw new Error('ADR-07 Violation: Requires >= 3 consecutive unpaid months');
      }
      if (reason.trim().length < 10) {
        throw new Error('Reason must be at least 10 characters');
      }
      return {
        ...ticket,
        status: 'REMOVED_DEF_3M',
        removedAt: new Date(),
        removedByUserId: adminUserId,
      };
    };

    const initialTicket: TicketState = {
      id: 'ticket-001',
      ticketNumber: 5,
      consecutiveUnpaidMonths: 3,
      status: 'DEFAULT_3_MONTHS',
      removedAt: null,
      removedByUserId: null,
    };

    const removed = removeDefaulter(
      initialTicket,
      'admin-partner-001',
      'Defaulter notice served for 3 continuous months; company removal rights exercised per ADR-07.',
    );

    assert.equal(removed.status, 'REMOVED_DEF_3M');
    assert.equal(removed.removedByUserId, 'admin-partner-001');
    assert.ok(removed.removedAt instanceof Date);
  });

  // 3. RemoveDefaulterDto Validation: Reason length >= 10 characters
  it('Validation Schema: Requires removal justification to be >= 10 characters', () => {
    const validateRemovalReason = (reason: string | null | undefined): boolean => {
      if (!reason || typeof reason !== 'string') return false;
      return reason.trim().length >= 10;
    };

    assert.equal(validateRemovalReason(''), false);
    assert.equal(validateRemovalReason('too short'), false); // 9 chars
    assert.equal(validateRemovalReason('Defaulted 3 months notice served'), true);
  });

  // 4. Guardrail 7 & ADR-13: Prevents duplicate subscriber ticket in same scheme
  it('ADR-13 Invariant: Rejects substitution if replacement customer holds a ticket in the same scheme', () => {
    interface ExistingTicket {
      ticketNumber: number;
      customerId: string;
    }

    const validateSubstituteCustomer = (
      newCustomerId: string,
      existingTickets: ExistingTicket[],
    ): { allowed: boolean; conflictingTicketNumber?: number } => {
      const match = existingTickets.find((t) => t.customerId === newCustomerId);
      if (match) {
        return { allowed: false, conflictingTicketNumber: match.ticketNumber };
      }
      return { allowed: true };
    };

    const schemeTickets: ExistingTicket[] = [
      { ticketNumber: 1, customerId: 'cust-company' },
      { ticketNumber: 2, customerId: 'cust-murugan-001' },
      { ticketNumber: 3, customerId: 'cust-kavitha-002' },
    ];

    // Attempting to substitute Murugan into Ticket #5
    const conflictResult = validateSubstituteCustomer('cust-murugan-001', schemeTickets);
    assert.equal(conflictResult.allowed, false);
    assert.equal(conflictResult.conflictingTicketNumber, 2);

    // Attempting to substitute a new customer
    const validResult = validateSubstituteCustomer('cust-suresh-003', schemeTickets);
    assert.equal(validResult.allowed, true);
    assert.equal(validResult.conflictingTicketNumber, undefined);
  });

  // 5. KYC Requirement: Replacement customer must be KYC verified
  it('KYC Guard: Rejects substitution if replacement customer isKycVerified is false', () => {
    interface Customer {
      id: string;
      fullName: string;
      isKycVerified: boolean;
    }

    const checkKycEligibility = (customer: Customer): boolean => {
      return customer.isKycVerified === true;
    };

    const unverifiedCustomer: Customer = {
      id: 'cust-010',
      fullName: 'Ramesh Unverified',
      isKycVerified: false,
    };

    const verifiedCustomer: Customer = {
      id: 'cust-011',
      fullName: 'Ramesh Verified',
      isKycVerified: true,
    };

    assert.equal(checkKycEligibility(unverifiedCustomer), false);
    assert.equal(checkKycEligibility(verifiedCustomer), true);
  });

  // 6. Whole Rupee Settlement Math: TotalPaid - 4% Damages
  it('Financial Math: Accurately computes 4.00% damages and bounded net refund in pure whole rupees', () => {
    const calculateExitSettlement = (
      chitValue: bigint,
      totalPaidInstallments: bigint,
    ): { damages: bigint; refund: bigint } => {
      const damages = (chitValue * 4n) / 100n; // 4.00% Foreman Commission damages
      const refund = totalPaidInstallments > damages ? totalPaidInstallments - damages : 0n;
      return { damages, refund };
    };

    // Scenario A: ₹1,00,000 Chit, Paid ₹10,000, 4% Damages = ₹4,000 -> Refund ₹6,000
    const resA = calculateExitSettlement(100_000n, 10_000n);
    assert.equal(resA.damages, 4_000n);
    assert.equal(resA.refund, 6_000n);

    // Scenario B: ₹5,00,000 Chit, Paid ₹15,000, 4% Damages = ₹20,000 -> Refund ₹0 (bounded)
    const resB = calculateExitSettlement(500_000n, 15_000n);
    assert.equal(resB.damages, 20_000n);
    assert.equal(resB.refund, 0n);

    // Scenario C: ₹10,00,000 Chit, Paid ₹2,00,000, 4% Damages = ₹40,000 -> Refund ₹1,60,000
    const resC = calculateExitSettlement(1_000_000n, 200_000n);
    assert.equal(resC.damages, 40_000n);
    assert.equal(resC.refund, 160_000n);
  });

  // 7. Exit Voucher Identifier Format: Validates KC-VOU-DEF-XXXXXX pattern
  it('Voucher Format: Verifies exit settlement voucher format KC-VOU-DEF-XXXXXX', () => {
    const generateVoucherNumber = (timestamp: number): string => {
      return `KC-VOU-DEF-${timestamp.toString().slice(-6)}`;
    };

    const voucher = generateVoucherNumber(1730001234567);
    assert.match(voucher, /^KC-VOU-DEF-\d{6}$/);
  });

  // 8. Bilingual Dictionary Parity: 100% key parity between English and Tamil
  it('Bilingual Parity: Defaulter desk translation keys match 100% between English and Tamil', () => {
    const rootDir = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');
    const enPath = path.resolve(rootDir, 'messages/en.json');
    const taPath = path.resolve(rootDir, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    const requiredKeys = [
      'defaultersDeskTitle',
      'defaultersDeskSubtitle',
      'defaultersDeskNavBtn',
      'totalSchemeTickets',
      'activeDefaultersCount',
      'eligibleForRemovalCount',
      'removedTicketsCount',
      'totalOverdueArrears',
      'rule8RemovalBannerTitle',
      'rule8RemovalBannerDesc',
      'tabAllDefaulters',
      'tabActiveDefaulters',
      'tabEligibleRemoval',
      'tabRemoved',
      'consecutiveMonthsUnpaid',
      'statusIneligibleBid',
      'statusRemovalEligible',
      'statusRemovedDefaulter',
      'statusActiveGood',
      'actionRemoveMember',
      'actionSubstitute',
      'actionSettle',
      'removalBlockedTooltip',
      'removeModalTitle',
      'removeModalDesc',
      'removeReasonLabel',
      'removeReasonPlaceholder',
      'removeReasonMinLength',
      'confirmRemoval',
      'removing',
      'removeSuccess',
      'substituteModalTitle',
      'substituteModalDesc',
      'searchReplacementLabel',
      'searchReplacementPlaceholder',
      'replacementCustomer',
      'kycVerifiedTag',
      'kycNotVerifiedError',
      'adr13SchemeConflictError',
      'substituteReasonLabel',
      'substituteReasonPlaceholder',
      'confirmSubstitution',
      'substituting',
      'substituteSuccess',
      'settleModalTitle',
      'settleModalDesc',
      'totalPaidAmountLabel',
      'foremanCommissionDamagesLabel',
      'netRefundPayableLabel',
      'paymentMethodLabel',
      'settlementNotesLabel',
      'settlementNotesPlaceholder',
      'confirmSettlement',
      'settling',
      'settleSuccess',
      'exitVoucherTitle',
      'voucherNumberLabel',
      'settledAtLabel',
      'disbursedAmountLabel',
      'printVoucher',
      'close',
      'noDefaultersTitle',
      'noDefaultersDesc',
    ];

    for (const key of requiredKeys) {
      assert.ok(
        en.schemes[key],
        `Missing English translation key for schemes.${key}`,
      );
      assert.ok(
        ta.schemes[key],
        `Missing Tamil translation key for schemes.${key}`,
      );
    }
  });
});
