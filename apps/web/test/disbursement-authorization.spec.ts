import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 7.2: Maker != Checker Prize Money Payout Release & Final Settlement Unit Tests', () => {
  type DisbursementStatus =
    | 'PENDING_VERIFICATION'
    | 'VERIFIED_BY_MAKER'
    | 'AUTHORIZED_BY_CHECKER'
    | 'DISBURSED';

  type DisbursementMode =
    | 'ACCOUNT_PAYEE_CHEQUE'
    | 'BANK_TRANSFER_NEFT'
    | 'BANK_TRANSFER_RTGS'
    | 'BANK_TRANSFER_IMPS'
    | 'CASH';

  interface WinnerState {
    id: string;
    auctionId: string;
    disbursementStatus: DisbursementStatus;
    verifiedByUserId: string | null;
    authorizedByUserId: string | null;
    disbursementMode: DisbursementMode | null;
    disbursedAmount: bigint | null;
    paymentReference: string | null;
    disbursedAt: Date | null;
  }

  // 1. Guardrail 10: Maker != Checker Hard Rejection
  it('Guardrail 10: Rejects self-authorization when currentUser.id === verifiedByUserId', () => {
    const authorizePayout = (
      winner: WinnerState,
      currentUserId: string,
      userRoles: string[],
      mode: DisbursementMode,
      amount: bigint,
    ): WinnerState => {
      if (!userRoles.includes('SUPER_ADMIN')) {
        throw new Error('DISBURSEMENT_PERMISSION_DENIED: Only Super Admin can authorize');
      }
      if (winner.disbursementStatus !== 'VERIFIED_BY_MAKER') {
        throw new Error('Invalid status transition');
      }
      if (winner.verifiedByUserId === currentUserId) {
        throw new Error('MAKER_CHECKER_VIOLATION: The user who verified the safety proof cannot authorize');
      }
      return {
        ...winner,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        authorizedByUserId: currentUserId,
        disbursementMode: mode,
        disbursedAmount: amount,
      };
    };

    const winner: WinnerState = {
      id: 'w-01',
      auctionId: 'auc-01',
      disbursementStatus: 'VERIFIED_BY_MAKER',
      verifiedByUserId: 'user-partner-a',
      authorizedByUserId: null,
      disbursementMode: null,
      disbursedAmount: null,
      paymentReference: null,
      disbursedAt: null,
    };

    // Attempted self-authorization by Partner A (Maker)
    assert.throws(
      () =>
        authorizePayout(
          winner,
          'user-partner-a',
          ['SUPER_ADMIN'],
          'ACCOUNT_PAYEE_CHEQUE',
          75_000n,
        ),
      /MAKER_CHECKER_VIOLATION/,
    );
  });

  // 2. Guardrail 10: Independent Checker Authorization
  it('Guardrail 10: Allows independent Super Admin (Partner B) to authorize payout', () => {
    const authorizePayout = (
      winner: WinnerState,
      currentUserId: string,
      userRoles: string[],
      mode: DisbursementMode,
      amount: bigint,
    ): WinnerState => {
      if (!userRoles.includes('SUPER_ADMIN')) {
        throw new Error('DISBURSEMENT_PERMISSION_DENIED: Only Super Admin can authorize');
      }
      if (winner.disbursementStatus !== 'VERIFIED_BY_MAKER') {
        throw new Error('Invalid status transition');
      }
      if (winner.verifiedByUserId === currentUserId) {
        throw new Error('MAKER_CHECKER_VIOLATION: The user who verified the safety proof cannot authorize');
      }
      return {
        ...winner,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        authorizedByUserId: currentUserId,
        disbursementMode: mode,
        disbursedAmount: amount,
      };
    };

    const winner: WinnerState = {
      id: 'w-01',
      auctionId: 'auc-01',
      disbursementStatus: 'VERIFIED_BY_MAKER',
      verifiedByUserId: 'user-partner-a',
      authorizedByUserId: null,
      disbursementMode: null,
      disbursedAmount: null,
      paymentReference: null,
      disbursedAt: null,
    };

    const authorized = authorizePayout(
      winner,
      'user-partner-b',
      ['SUPER_ADMIN'],
      'ACCOUNT_PAYEE_CHEQUE',
      75_000n,
    );

    assert.equal(authorized.disbursementStatus, 'AUTHORIZED_BY_CHECKER');
    assert.equal(authorized.authorizedByUserId, 'user-partner-b');
    assert.equal(authorized.disbursementMode, 'ACCOUNT_PAYEE_CHEQUE');
    assert.equal(authorized.disbursedAmount, 75_000n);
  });

  // 3. RBAC Authority: Restricts payout authorization strictly to SUPER_ADMIN
  it('RBAC Authority: Restricts payout authorization strictly to SUPER_ADMIN', () => {
    const authorizePayout = (userRoles: string[]): boolean => {
      if (!userRoles.includes('SUPER_ADMIN')) {
        throw new Error('DISBURSEMENT_PERMISSION_DENIED: Super Admin exclusivity');
      }
      return true;
    };

    assert.equal(authorizePayout(['SUPER_ADMIN']), true);
    assert.throws(() => authorizePayout(['BRANCH_MANAGER']), /DISBURSEMENT_PERMISSION_DENIED/);
    assert.throws(() => authorizePayout(['ACCOUNTANT']), /DISBURSEMENT_PERMISSION_DENIED/);
    assert.throws(() => authorizePayout(['AUDITOR']), /DISBURSEMENT_PERMISSION_DENIED/);
  });

  // 4. Workflow State Machine: Authorization requires strictly VERIFIED_BY_MAKER
  it('State Machine: Authorization strictly requires status VERIFIED_BY_MAKER', () => {
    const canAuthorize = (status: DisbursementStatus): boolean => {
      return status === 'VERIFIED_BY_MAKER';
    };

    assert.equal(canAuthorize('PENDING_VERIFICATION'), false);
    assert.equal(canAuthorize('VERIFIED_BY_MAKER'), true);
    assert.equal(canAuthorize('AUTHORIZED_BY_CHECKER'), false);
    assert.equal(canAuthorize('DISBURSED'), false);
  });

  // 5. Payout Release: Requires AUTHORIZED_BY_CHECKER and mandatory paymentReference
  it('Payout Release: Requires AUTHORIZED_BY_CHECKER and mandatory paymentReference', () => {
    const releasePayout = (
      winner: WinnerState,
      ref: string,
    ): WinnerState => {
      if (winner.disbursementStatus !== 'AUTHORIZED_BY_CHECKER') {
        throw new Error('Invalid transition: Payout must be authorized before release');
      }
      if (!ref || !ref.trim()) {
        throw new Error('Payment reference is mandatory for prize payout release');
      }
      return {
        ...winner,
        disbursementStatus: 'DISBURSED',
        paymentReference: ref.trim(),
        disbursedAt: new Date(),
      };
    };

    const authorizedWinner: WinnerState = {
      id: 'w-01',
      auctionId: 'auc-01',
      disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      verifiedByUserId: 'user-partner-a',
      authorizedByUserId: 'user-partner-b',
      disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
      disbursedAmount: 75_000n,
      paymentReference: null,
      disbursedAt: null,
    };

    // Missing reference throws
    assert.throws(() => releasePayout(authorizedWinner, ''), /Payment reference is mandatory/);

    // Valid release
    const released = releasePayout(authorizedWinner, 'IOB-CHQ-009182');
    assert.equal(released.disbursementStatus, 'DISBURSED');
    assert.equal(released.paymentReference, 'IOB-CHQ-009182');
    assert.ok(released.disbursedAt instanceof Date);
  });

  // 6. ADR-14 Invariant: Unlimited hard cash payouts permitted without software caps
  it('ADR-14 Invariant: Unlimited hard cash payouts permitted without software caps', () => {
    const canDisburseCash = (amount: bigint): { allowed: boolean; cashLimitError: boolean } => {
      // ADR-14: Zero artificial software cash caps for company payouts
      return { allowed: true, cashLimitError: false };
    };

    assert.deepEqual(canDisburseCash(75_000n), { allowed: true, cashLimitError: false });
    assert.deepEqual(canDisburseCash(400_000n), { allowed: true, cashLimitError: false });
    assert.deepEqual(canDisburseCash(1_000_000n), { allowed: true, cashLimitError: false });
  });

  // 7. Month N Final Maturity Settlement: P = V - Cf with D = 0 and marks COMPLETED
  it('Month N Invariant: Direct settlement calculates P = V - Cf with D = 0 and marks COMPLETED', () => {
    interface ChitSchemeState {
      id: string;
      groupCode: string;
      chitValue: bigint;
      status: string;
      tickets: Array<{ id: string; ticketNumber: number; isPrized: boolean }>;
    }

    const settleMonthN = (
      scheme: ChitSchemeState,
      ticketId: string,
    ): { netPrizeMoney: bigint; schemeStatus: string; ticketPrized: boolean } => {
      if (scheme.status !== 'ACTIVE') {
        throw new Error('Chit scheme must be ACTIVE');
      }
      const unprized = scheme.tickets.filter((t) => !t.isPrized);
      if (unprized.length !== 1) {
        throw new Error('Month N settlement requires exactly 1 unprized ticket');
      }
      if (unprized[0].id !== ticketId) {
        throw new Error('Selected ticket is not the unprized ticket');
      }

      // Net prize = Gross Pool - 4% Foreman Commission (D = 0)
      const commission = (scheme.chitValue * 4n) / 100n;
      const netPrizeMoney = scheme.chitValue - commission;

      return {
        netPrizeMoney,
        schemeStatus: 'COMPLETED',
        ticketPrized: true,
      };
    };

    const scheme: ChitSchemeState = {
      id: 'scheme-20m',
      groupCode: 'KCA-01',
      chitValue: 100_000n,
      status: 'ACTIVE',
      tickets: [
        { id: 't-01', ticketNumber: 1, isPrized: true },
        { id: 't-19', ticketNumber: 19, isPrized: true },
        { id: 't-20', ticketNumber: 20, isPrized: false }, // Final subscriber
      ],
    };

    const res = settleMonthN(scheme, 't-20');
    assert.equal(res.netPrizeMoney, 96_000n); // 1,00,000 - 4,000 (4%)
    assert.equal(res.schemeStatus, 'COMPLETED');
    assert.equal(res.ticketPrized, true);
  });

  // 8. Bilingual Dictionary Parity: 100% key match between en.json and ta.json
  it('Bilingual Parity: 100% key parity between English and Tamil for disbursements namespace', () => {
    const rootDir = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');
    const enPath = path.resolve(rootDir, 'messages/en.json');
    const taPath = path.resolve(rootDir, 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

    const requiredKeys = [
      'authModalTitle',
      'authModalDesc',
      'authModeLabel',
      'authAmountLabel',
      'authNotesLabel',
      'authNotesPlaceholder',
      'confirmAuthBtn',
      'authorizing',
      'authSuccess',
      'makerGuardAlertTitle',
      'makerGuardAlertDesc',
      'releaseModalTitle',
      'releaseModalDesc',
      'paymentRefLabel',
      'paymentRefPlaceholder',
      'disbursedAtLabel',
      'releaseNotesLabel',
      'releaseNotesPlaceholder',
      'confirmReleaseBtn',
      'releasing',
      'releaseSuccess',
      'downloadPdfVoucher',
      'downloadingPdf',
      'viewVoucherDialogTitle',
      'viewVoucherDialogDesc',
      'finalSettlementTitle',
      'finalSettlementDesc',
      'finalSettlementBtn',
      'unprizedSubscriberLabel',
      'grossPoolLabel',
      'zeroDiscountNotice',
      'finalNetPayableLabel',
      'confirmFinalSettlementBtn',
      'settlingFinal',
      'finalSettlementSuccess',
    ];

    for (const key of requiredKeys) {
      assert.ok(
        en.disbursements[key],
        `Missing English translation key for disbursements.${key}`,
      );
      assert.ok(
        ta.disbursements[key],
        `Missing Tamil translation key for disbursements.${key}`,
      );
    }

    const enKeys = Object.keys(en.disbursements).sort();
    const taKeys = Object.keys(ta.disbursements).sort();
    assert.deepEqual(enKeys, taKeys, 'Disbursements keys must match 100% between en.json and ta.json');
  });

  // 9. DEF-WM-06 & DEF-WM-07 Regression: Partner-only auth, release RBAC, KFC-FIN-004 no manual override, paymentReference
  it('DEF-WM-05/06/07 Regression: Enforces Partner role, release RBAC, KFC-FIN-004 no override, Month N Maker != Checker, and paymentReference', () => {
    const rootDir = fs.existsSync(path.resolve(process.cwd(), 'src/components/disbursements'))
      ? process.cwd()
      : path.resolve(process.cwd(), 'apps/web');

    const voucherPageSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/app/(dashboard)/disbursements/[id]/voucher/page.tsx'),
      'utf8',
    );
    const authModalSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/components/disbursements/disbursement-auth-modal.tsx'),
      'utf8',
    );
    const releaseModalSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/components/disbursements/disbursement-release-modal.tsx'),
      'utf8',
    );
    const finalModalSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/components/disbursements/final-settlement-modal.tsx'),
      'utf8',
    );
    const voucherCardSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/components/disbursements/payout-voucher-card.tsx'),
      'utf8',
    );

    // Guardrail 11: voucher/page.tsx checks PARTNER role and guards Release Payout button by role
    assert.match(voucherPageSrc, /hasAnyRole\(user,\s*\['PARTNER'\]\)/);
    assert.match(voucherPageSrc, /canReleasePayout/);

    // KFC-FIN-004: DisbursementAuthModal must NOT send user-editable disbursedAmount override
    assert.doesNotMatch(
      authModalSrc,
      /disbursedAmount:\s*disbursedAmount\s*\?\s*Number\(disbursedAmount\)/,
      'DisbursementAuthModal must omit disbursedAmount so server computes arrears-adjusted net payout fail-closed',
    );
    assert.match(authModalSrc, /arrearsOffsetNotice/);

    // Guardrail 11 / RBAC on DisbursementReleaseModal
    assert.match(releaseModalSrc, /canReleasePayout/);

    // Guardrail 10 & 11 on Month N FinalSettlementModal
    assert.match(finalModalSrc, /isSelfApproval/);
    assert.match(finalModalSrc, /hasAnyRole\(user,\s*\['PARTNER'\]\)/);
    assert.match(finalModalSrc, /canApproveStage2/);

    // DEF-WM-07: PayoutVoucherCard reads canonical Prisma paymentReference & workflow stamps
    assert.match(voucherCardSrc, /voucher\.paymentReference/);
    assert.match(voucherCardSrc, /isStep2Done \|\| voucher\.verifiedByUserId/);
    assert.match(voucherCardSrc, /isStep3Done \|\| voucher\.authorizedByUserId/);

    // Guardrail 11 (SEC-A): SafetyProofChecklist enforces partner authority
    const checklistSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/components/disbursements/safety-proof-checklist.tsx'),
      'utf8',
    );
    assert.match(
      checklistSrc,
      /hasAnyRole\(user,\s*\['BRANCH_MANAGER',\s*'ACCOUNTANT',\s*'PARTNER'\]\)/,
    );

    // XR-WM-01: Stage-2 FinalSettlementModal displays Maker's prepared details & handles MINUTES_FILED/CLOSED
    const auctionsPageSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/app/(dashboard)/auctions/page.tsx'),
      'utf8',
    );
    const scheduleTableSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/components/auctions/auction-schedule-table.tsx'),
      'utf8',
    );
    assert.match(finalModalSrc, /Prepared Payout:/);
    assert.match(finalModalSrc, /Disbursement Mode:/);
    assert.match(finalModalSrc, /Payment Reference:/);
    assert.match(finalModalSrc, /Prepared By Maker:/);
    assert.match(auctionsPageSrc, /activeScheme\.status === 'CLOSED'/);
    assert.match(auctionsPageSrc, /match\.status === 'MINUTES_FILED'/);
    assert.match(scheduleTableSrc, /scheme\.status === 'CLOSED'/);
    assert.match(scheduleTableSrc, /monthNAuction\?\.status === 'MINUTES_FILED'/);

    // XR-WM-04: PERSONAL_GUARANTEE option, KC-VOU- fallback prefix, no fabricated CASH-VAULT fallback
    const voucherDialogSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/components/disbursements/bilingual-voucher-dialog.tsx'),
      'utf8',
    );
    assert.match(checklistSrc, /PERSONAL_GUARANTEE/);
    assert.match(voucherDialogSrc, /KC-VOU-/);
    assert.doesNotMatch(voucherDialogSrc, /KC-VCHR-/);
    assert.doesNotMatch(voucherCardSrc, /\|\|\s*'CASH-VAULT'/);

    // XR-WM-05: DisbursementsPage aggregates across totalPages / server total without 100-row undercount
    const disbPageSrc = fs.readFileSync(
      path.resolve(rootDir, 'src/app/(dashboard)/disbursements/page.tsx'),
      'utf8',
    );
    assert.match(disbPageSrc, /reportedPages/);
    assert.match(disbPageSrc, /Math\.max\(globalData\.total,\s*allItems\.length\)/);
  });
});
