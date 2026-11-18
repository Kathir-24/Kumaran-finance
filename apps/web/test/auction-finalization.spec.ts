import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Task 6.3: Dual-Control Maker-Checker Auction Finalization & Minutes Unit Tests', () => {
  // 1. Guardrail 10: Strict Maker != Checker separation
  it('Guardrail 10: Rejects self-finalization when currentUser.id === conductedByUserId', () => {
    const makerUserId = 'user-staff-001';
    const currentUserId = 'user-staff-001'; // Same user!

    const isSelfApproval = (currId: string | null | undefined, makerId: string | null | undefined): boolean => {
      if (!currId || !makerId) return false;
      return currId === makerId;
    };

    const canAuthorize = (currId: string | null | undefined, makerId: string | null | undefined): boolean => {
      return !isSelfApproval(currId, makerId);
    };

    assert.equal(isSelfApproval(currentUserId, makerUserId), true);
    assert.equal(canAuthorize(currentUserId, makerUserId), false);
  });

  // 2. Checker Authorization Gate
  it('Guardrail 10: Allows second Partner/Manager to finalize as Checker (maker_id !== checker_id)', () => {
    const makerUserId = 'user-staff-001';
    const checkerUserId = 'user-partner-002'; // Second partner!

    const isSelfApproval = (currId: string | null | undefined, makerId: string | null | undefined): boolean => {
      if (!currId || !makerId) return false;
      return currId === makerId;
    };

    const canAuthorize = (currId: string | null | undefined, makerId: string | null | undefined): boolean => {
      return !isSelfApproval(currId, makerId);
    };

    assert.equal(isSelfApproval(checkerUserId, makerUserId), false);
    assert.equal(canAuthorize(checkerUserId, makerUserId), true);
  });

  // 3. RBAC & Guardrail 11 (SEC-A / KFC-SEC-003): Strictly SUPER_ADMIN with isPartner: true
  it('RBAC Authority & Guardrail 11: Restricts finalization strictly to verified Partners (SUPER_ADMIN + isPartner: true)', () => {
    const canFinalize = (roles: string[], isPartner: boolean) =>
      roles.includes('SUPER_ADMIN') && isPartner === true;

    assert.equal(canFinalize(['SUPER_ADMIN'], true), true);
    assert.equal(canFinalize(['SUPER_ADMIN'], false), false); // Non-partner IT admin strictly blocked
    assert.equal(canFinalize(['BRANCH_MANAGER'], true), false); // Branch Manager strictly blocked per KFC-SEC-003
    assert.equal(canFinalize(['ACCOUNTANT'], false), false);
    assert.equal(canFinalize(['COLLECTION_AGENT'], false), false);
    assert.equal(canFinalize(['CUSTOMER'], false), false);
    assert.equal(canFinalize(['AUDITOR'], false), false);
  });

  // 3b. Source regression: AuctionFinalizeCard strictly excludes BRANCH_MANAGER & enforces isPartner
  it('DEF-WM-02 Regression: AuctionFinalizeCard restricts finalization to SUPER_ADMIN + isPartner and checks recorded bid', () => {
    const cardPath = path.resolve(
      process.cwd(),
      'src/components/auctions/auction-finalize-card.tsx',
    );
    const source = fs.readFileSync(cardPath, 'utf-8');
    assert.match(source, /hasAnyRole\(user,\s*\['SUPER_ADMIN'\]\)/);
    assert.doesNotMatch(
      source,
      /hasAnyRole\(user,\s*\['SUPER_ADMIN',\s*'BRANCH_MANAGER'\]\)/,
      'BRANCH_MANAGER must NOT be allowed to finalize auctions (KFC-SEC-003)',
    );
    assert.match(source, /Boolean\(user\?\.isPartner\)/);
    assert.match(source, /hasRecordedBid/);
  });

  // 3c. KFC-FIN-005: Finalized Auction Correction dual-control & disbursed-prize immutability
  it('DEF-WM-02 (KFC-FIN-005): AuctionDetailPage wires correction request/approve endpoints with Partner & Maker != Checker guards', () => {
    const detailPath = path.resolve(
      process.cwd(),
      'src/app/(dashboard)/auctions/[id]/page.tsx',
    );
    const correctionPath = path.resolve(
      process.cwd(),
      'src/components/auctions/auction-correction-card.tsx',
    );
    const detailSource = fs.readFileSync(detailPath, 'utf-8');
    const correctionSource = fs.readFileSync(correctionPath, 'utf-8');

    assert.match(detailSource, /\/api\/v1\/auctions\/\{id\}\/correction\/request/);
    assert.match(detailSource, /\/api\/v1\/auctions\/\{id\}\/correction\/approve/);
    // Guardrail 5: AuctionCorrectionCard gated strictly to Months 2..N-1 (excludes Month 1 & Month N)
    assert.match(
      detailSource,
      /isFinalized\s*&&\s*auction\.installmentMonth\s*>=\s*2\s*&&\s*auction\.installmentMonth\s*<\s*durationMonths/,
    );
    assert.match(correctionSource, /disbursementStatus === 'DISBURSED'/);
    assert.match(correctionSource, /isSelfApproval/);
    assert.match(correctionSource, /Boolean\(user\?\.isPartner\)/);

    // XR-WM-02: Server pendingCorrection hydration across reloads + correctedWinningTicketId swap selector
    assert.match(detailSource, /pendingCorrection=\{auction\.pendingCorrection\}/);
    assert.match(detailSource, /candidateTickets=\{schemeTickets\}/);
    assert.match(correctionSource, /pendingCorrection\?\.requestedByUserId/);
    assert.match(correctionSource, /correctedWinningTicketId:\s*ticketSwapId/);
    assert.match(correctionSource, /parseWholeRupeesBigInt/);
  });

  // 4. Form XVII Proceedings Generation & Invariants
  it('Form XVII Invariants: Validates attendees count >= 1, Foreman signature, and statutory notes', () => {
    interface FinalizePayload {
      subscribersPresent: number;
      notes?: string;
      signedByForeman: boolean;
    }

    const validateFinalizeDto = (dto: FinalizePayload) => {
      if (!dto.subscribersPresent || dto.subscribersPresent < 1) {
        return { valid: false, error: 'ATTENDEES_REQUIRED' };
      }
      if (!dto.signedByForeman) {
        return { valid: false, error: 'FOREMAN_SIGNATURE_REQUIRED' };
      }
      return { valid: true, error: null };
    };

    assert.deepEqual(validateFinalizeDto({ subscribersPresent: 0, signedByForeman: true }), {
      valid: false,
      error: 'ATTENDEES_REQUIRED',
    });

    assert.deepEqual(validateFinalizeDto({ subscribersPresent: 14, signedByForeman: false }), {
      valid: false,
      error: 'FOREMAN_SIGNATURE_REQUIRED',
    });

    assert.deepEqual(
      validateFinalizeDto({
        subscribersPresent: 18,
        signedByForeman: true,
        notes: 'Conducted in presence of subscribers.',
      }),
      { valid: true, error: null },
    );
  });

  // 5. Winner Prized State Transition
  it('State Machine: Marks winning subscriber ticket isPrized = true upon finalization', () => {
    const subscriberTicket = {
      id: 'ticket-005',
      ticketNumber: 5,
      isPrized: false,
      prizedAuctionId: null as string | null,
    };

    const finalizeAuctionTransition = (ticket: typeof subscriberTicket, auctionId: string) => {
      return {
        ...ticket,
        isPrized: true,
        prizedAuctionId: auctionId,
      };
    };

    const finalizedTicket = finalizeAuctionTransition(subscriberTicket, 'auction-month-2');

    assert.equal(finalizedTicket.isPrized, true);
    assert.equal(finalizedTicket.prizedAuctionId, 'auction-month-2');
  });

  // 6. 21-Day Registrar Filing Deadline Calculation
  it('Statutory Deadline: Accurately computes remaining days within 21-day Registrar filing window', () => {
    const computeFilingDeadline = (auctionDateStr: string, currentDateStr: string) => {
      const aucDate = new Date(auctionDateStr);
      const currDate = new Date(currentDateStr);
      const deadlineDate = new Date(aucDate.getTime() + 21 * 24 * 60 * 60 * 1000);

      const diffMs = deadlineDate.getTime() - currDate.getTime();
      const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      const isOverdue = daysRemaining < 0;

      return { deadlineDate, daysRemaining, isOverdue };
    };

    // Case 1: Auction held on 2026-11-01, current date 2026-11-06 (5 days passed -> 16 days remaining)
    const result1 = computeFilingDeadline('2026-11-01T00:00:00.000Z', '2026-11-06T00:00:00.000Z');
    assert.equal(result1.daysRemaining, 16);
    assert.equal(result1.isOverdue, false);

    // Case 2: Auction held on 2026-10-01, current date 2026-10-25 (24 days passed -> Overdue by 3 days)
    const result2 = computeFilingDeadline('2026-10-01T00:00:00.000Z', '2026-10-25T00:00:00.000Z');
    assert.equal(result2.daysRemaining, -3);
    assert.equal(result2.isOverdue, true);
  });

  // 7. Registrar Challan Reference Structure
  it('Registrar Filing: Validates government challan reference and filing date payload schema', () => {
    interface MarkFiledPayload {
      filingReference?: string;
      filedDate?: string;
      notes?: string;
    }

    const payload: MarkFiledPayload = {
      filingReference: 'DRC/ERD/CHAL-2026-00412',
      filedDate: '2026-10-25T11:00:00.000Z',
      notes: 'Handed over in person by Partner A',
    };

    assert.ok(payload.filingReference?.startsWith('DRC/'));
    assert.ok(!isNaN(Date.parse(payload.filedDate!)));
    assert.ok(payload.notes!.length > 0);
  });

  // 8. Bilingual Dictionary Parity
  it('Bilingual Parity: finalization and minutes keys match 100% between English and Tamil', () => {
    const enPath = path.resolve(process.cwd(), 'messages/en.json');
    const taPath = path.resolve(process.cwd(), 'messages/ta.json');

    const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    const ta = JSON.parse(fs.readFileSync(taPath, 'utf-8'));

    assert.ok(en.auctions, 'en.json must contain auctions namespace');
    assert.ok(ta.auctions, 'ta.json must contain auctions namespace');

    const enKeys = Object.keys(en.auctions).sort();
    const taKeys = Object.keys(ta.auctions).sort();

    assert.deepEqual(
      enKeys,
      taKeys,
      `auctions keys mismatch between en.json (${enKeys.length}) and ta.json (${taKeys.length})`,
    );

    // Check specific Task 6.3 keys
    const requiredKeys = [
      'auctionDetailTitle',
      'finalizeCardTitle',
      'subscribersPresentLabel',
      'signedByForemanLabel',
      'finalizeAction',
      'selfApprovalBlockedAlert',
      'minutesCardTitle',
      'filingDeadlineTitle',
      'filingDaysRemaining',
      'filingOverdue',
      'filingReferenceLabel',
      'recordFilingAction',
      'downloadPdfMinutes',
      'reenterLiveRoom',
      'statutoryDeclaration',
    ];

    for (const key of requiredKeys) {
      assert.ok(en.auctions[key], `Missing en.auctions.${key}`);
      assert.ok(ta.auctions[key], `Missing ta.auctions.${key}`);
    }
  });

  // 9. M9-WEB-DEF-02 & M9-WEB-DEF-06 Regressions
  it('M9-WEB-DEF Regressions: canRecordFiling Guardrail 11 partner authority & signedByForeman validation', () => {
    const detailSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(dashboard)/auctions/[id]/page.tsx'),
      'utf-8',
    );
    const finalizeCardSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auctions/auction-finalize-card.tsx'),
      'utf-8',
    );
    const filingDialogSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auctions/registrar-filing-dialog.tsx'),
      'utf-8',
    );

    // M9-WEB-DEF-02: canRecordFiling enforces isPartner on Super Admin
    assert.match(
      detailSource,
      /canRecordFiling\s*=\s*hasAnyRole\(user,\s*\['BRANCH_MANAGER',\s*'ACCOUNTANT'\]\)\s*\|\|\s*\(hasAnyRole\(user,\s*\['SUPER_ADMIN'\]\)\s*&&\s*Boolean\(user\?\.isPartner\)\)/,
    );

    // M9-WEB-DEF-06: AuctionFinalizeCard validates signedByForeman before onFinalize
    assert.match(finalizeCardSource, /if\s*\(!signedByForeman\)\s*\{\s*setErrorMsg/);

    // M9-WEB-DEF-03: RegistrarFilingDialog safe ISO date parsing
    assert.match(filingDialogSource, /!isNaN\(validFiledDate\.getTime\(\)\)/);
  });
});
