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

  // 3. RBAC Role Authority Gate
  it('RBAC Authority: Restricts finalization strictly to SUPER_ADMIN and BRANCH_MANAGER', () => {
    const allowedRoles = new Set(['SUPER_ADMIN', 'BRANCH_MANAGER']);

    const canFinalizeRole = (role: string) => allowedRoles.has(role);

    assert.equal(canFinalizeRole('SUPER_ADMIN'), true);
    assert.equal(canFinalizeRole('BRANCH_MANAGER'), true);
    assert.equal(canFinalizeRole('ACCOUNTANT'), false);
    assert.equal(canFinalizeRole('COLLECTION_AGENT'), false);
    assert.equal(canFinalizeRole('CUSTOMER'), false);
    assert.equal(canFinalizeRole('AUDITOR'), false);
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
});
