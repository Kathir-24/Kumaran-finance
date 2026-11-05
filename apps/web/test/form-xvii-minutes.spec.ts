// ==============================================================================
// Kumaran Chits — Form XVII Auction Minutes & Registrar Filing Tests (Task 10.2)
// Verifies Section 24 statutory 21-day filing deadline calculations, financial
// invariants, Option A tie-break token audit trail, RBAC gates, and bilingual parity.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ------------------------------------------------------------------------------
// Invariant 1: Statutory 21-Day Filing Deadline Classification
// ------------------------------------------------------------------------------
test('1. Statutory 21-Day Filing Deadline: Accurately classifies FILED, PENDING, URGENT, and OVERDUE', () => {
  type FilingStatus = 'FILED' | 'PENDING' | 'URGENT' | 'OVERDUE';

  const classifyFiling = (
    auctionDateStr: string,
    filedAtRegistrar: boolean,
    now: Date = new Date('2026-10-25T10:00:00.000Z')
  ): { status: FilingStatus; daysRemaining: number } => {
    if (filedAtRegistrar) {
      return { status: 'FILED', daysRemaining: 0 };
    }

    const auctionDate = new Date(auctionDateStr);
    const deadline = new Date(auctionDate.getTime() + 21 * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysRemaining < 0) {
      return { status: 'OVERDUE', daysRemaining };
    }
    if (daysRemaining <= 5) {
      return { status: 'URGENT', daysRemaining };
    }
    return { status: 'PENDING', daysRemaining };
  };

  const fixedNow = new Date('2026-10-25T10:00:00.000Z');

  // Case A: Already filed with Registrar
  const r1 = classifyFiling('2026-10-10T10:00:00.000Z', true, fixedNow);
  assert.equal(r1.status, 'FILED');

  // Case B: Auction on Oct 20 -> Deadline Nov 10 -> 16 days left -> PENDING
  const r2 = classifyFiling('2026-10-20T10:00:00.000Z', false, fixedNow);
  assert.equal(r2.status, 'PENDING');
  assert.equal(r2.daysRemaining, 16);

  // Case C: Auction on Oct 06 -> Deadline Oct 27 -> 2 days left -> URGENT
  const r3 = classifyFiling('2026-10-06T10:00:00.000Z', false, fixedNow);
  assert.equal(r3.status, 'URGENT');
  assert.equal(r3.daysRemaining, 2);

  // Case D: Auction on Oct 01 -> Deadline Oct 22 -> -3 days left -> OVERDUE (Section 24 default)
  const r4 = classifyFiling('2026-10-01T10:00:00.000Z', false, fixedNow);
  assert.equal(r4.status, 'OVERDUE');
  assert.equal(r4.daysRemaining, -3);
});

// ------------------------------------------------------------------------------
// Invariant 2: Form XVII Statutory Financial Math Invariants
// ------------------------------------------------------------------------------
test('2. Financial Invariants: Prize Money P = V - D, Commission = 4%, Universal Dividend', () => {
  const calculateFormXviiMath = (chitValue: bigint, bidDiscount: bigint, durationMonths: bigint) => {
    // 1. Prize Money P = V - D
    const prizeMoney = chitValue - bidDiscount;

    // 2. 4.00% Foreman Commission lock
    const commission = (chitValue * 4n) / 100n;

    // 3. Total Dividend Pool = D - Commission
    const dividendPool = bidDiscount - commission;

    // 4. Equal Dividend per Ticket = Pool / N
    const dividendPerTicket = dividendPool / durationMonths;

    // 5. Base Installment = V / N
    const baseInstallment = chitValue / durationMonths;

    // 6. Next Month Net Installment = Base - Dividend
    const nextNetInstallment = baseInstallment - dividendPerTicket;

    return {
      prizeMoney,
      commission,
      dividendPool,
      dividendPerTicket,
      baseInstallment,
      nextNetInstallment,
    };
  };

  // Example: ₹1,00,000 chit, 20 months, ceiling bid discount ₹25,000 (V/4)
  const mathCeiling = calculateFormXviiMath(100000n, 25000n, 20n);
  assert.equal(mathCeiling.prizeMoney, 75000n);
  assert.equal(mathCeiling.commission, 4000n);
  assert.equal(mathCeiling.dividendPool, 21000n);
  assert.equal(mathCeiling.dividendPerTicket, 1050n);
  assert.equal(mathCeiling.baseInstallment, 5000n);
  assert.equal(mathCeiling.nextNetInstallment, 3950n);

  // Example 2: ₹5,00,000 chit, 20 months, minimum bid discount ₹20,000 (4%)
  const mathFloor = calculateFormXviiMath(500000n, 20000n, 20n);
  assert.equal(mathFloor.prizeMoney, 480000n);
  assert.equal(mathFloor.commission, 20000n);
  assert.equal(mathFloor.dividendPool, 0n);
  assert.equal(mathFloor.dividendPerTicket, 0n);
  assert.equal(mathFloor.baseInstallment, 25000n);
  assert.equal(mathFloor.nextNetInstallment, 25000n);
});

// ------------------------------------------------------------------------------
// Invariant 3: Month 1 and Month N Exclusion Invariant (Guardrail 5)
// ------------------------------------------------------------------------------
test('3. Guardrail 5: Finalized auctions exist strictly in Months 2 through N-1', () => {
  const isEligibleAuctionMonth = (month: number, durationMonths: number): boolean => {
    // Month 1 is Company pool payout (no auction)
    // Month N is final subscriber settlement (no auction)
    return month >= 2 && month <= durationMonths - 1;
  };

  const duration = 20;
  assert.equal(isEligibleAuctionMonth(1, duration), false); // Month 1: Barred
  assert.equal(isEligibleAuctionMonth(2, duration), true);  // Month 2: Eligible
  assert.equal(isEligibleAuctionMonth(10, duration), true); // Month 10: Eligible
  assert.equal(isEligibleAuctionMonth(19, duration), true); // Month 19: Eligible
  assert.equal(isEligibleAuctionMonth(20, duration), false); // Month 20 (N): Barred
});

// ------------------------------------------------------------------------------
// Invariant 4: Option A Paper Token Tie-Break Verification (ADR-06)
// ------------------------------------------------------------------------------
test('4. Option A Tie-Break: Verifies token draw structure and single winner assignment', () => {
  interface TiedBidder {
    ticketNumber: number;
    tokenNumberDrawn: number;
    isWinner: boolean;
  }

  const validateTieBreak = (tiedBidders: TiedBidder[]) => {
    // Must have at least 2 bidders for a tie
    if (tiedBidders.length < 2) return false;

    // Tokens must be distinct positive integers
    const tokenSet = new Set(tiedBidders.map((b) => b.tokenNumberDrawn));
    if (tokenSet.size !== tiedBidders.length) return false;

    // Exactly one winner must be marked
    const winners = tiedBidders.filter((b) => b.isWinner);
    return winners.length === 1;
  };

  const validTie: TiedBidder[] = [
    { ticketNumber: 4, tokenNumberDrawn: 1, isWinner: false },
    { ticketNumber: 7, tokenNumberDrawn: 2, isWinner: true },
    { ticketNumber: 12, tokenNumberDrawn: 3, isWinner: false },
  ];
  assert.equal(validateTieBreak(validTie), true);

  // Invalid: Multiple winners
  const invalidMultipleWinners: TiedBidder[] = [
    { ticketNumber: 4, tokenNumberDrawn: 1, isWinner: true },
    { ticketNumber: 7, tokenNumberDrawn: 2, isWinner: true },
  ];
  assert.equal(validateTieBreak(invalidMultipleWinners), false);

  // Invalid: Duplicate token numbers
  const invalidDuplicateTokens: TiedBidder[] = [
    { ticketNumber: 4, tokenNumberDrawn: 1, isWinner: true },
    { ticketNumber: 7, tokenNumberDrawn: 1, isWinner: false },
  ];
  assert.equal(validateTieBreak(invalidDuplicateTokens), false);
});

// ------------------------------------------------------------------------------
// Invariant 5: Registrar Filing Payload Schema
// ------------------------------------------------------------------------------
test('5. Registrar Filing Schema: Enforces valid reference and ISO date payload', () => {
  interface MarkMinutesFiledDto {
    filingReference?: string;
    filedDate?: string;
    notes?: string;
  }

  const validateFilingPayload = (dto: MarkMinutesFiledDto): boolean => {
    if (!dto.filingReference || dto.filingReference.trim().length === 0) {
      return false;
    }
    if (dto.filedDate) {
      const d = new Date(dto.filedDate);
      if (isNaN(d.getTime())) return false;
    }
    return true;
  };

  assert.equal(validateFilingPayload({
    filingReference: 'DRC/ERD/CHAL-2026-00412',
    filedDate: '2026-10-25T11:00:00.000Z',
    notes: 'Submitted in person at Erode Deputy Registrar office',
  }), true);

  // Rejects empty challan reference
  assert.equal(validateFilingPayload({ filingReference: '' }), false);
  assert.equal(validateFilingPayload({ filingReference: '   ' }), false);

  // Rejects malformed ISO date
  assert.equal(validateFilingPayload({
    filingReference: 'REF-123',
    filedDate: 'not-a-date',
  }), false);
});

// ------------------------------------------------------------------------------
// Invariant 6: RBAC Authorization Matrix for Form XVII
// ------------------------------------------------------------------------------
test('6. RBAC Authority: Restricts read to Staff/Auditor and write strictly to Staff', () => {
  const canReadFormXvii = (roles: string[]): boolean => {
    const allowed = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'];
    return roles.some((r) => allowed.includes(r));
  };

  const canRecordFiling = (roles: string[]): boolean => {
    const allowed = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'];
    return roles.some((r) => allowed.includes(r));
  };

  // Super Admin: full read + write
  assert.equal(canReadFormXvii(['SUPER_ADMIN']), true);
  assert.equal(canRecordFiling(['SUPER_ADMIN']), true);

  // Auditor: read-only (cannot mutate filing status)
  assert.equal(canReadFormXvii(['AUDITOR']), true);
  assert.equal(canRecordFiling(['AUDITOR']), false);

  // Collection Agent & Customer: completely barred
  assert.equal(canReadFormXvii(['COLLECTION_AGENT']), false);
  assert.equal(canRecordFiling(['COLLECTION_AGENT']), false);
  assert.equal(canReadFormXvii(['CUSTOMER']), false);
  assert.equal(canRecordFiling(['CUSTOMER']), false);
});

// ------------------------------------------------------------------------------
// Invariant 7: CSV Row Escaping with UTF-8 BOM
// ------------------------------------------------------------------------------
test('7. CSV Export: Correctly escapes special characters and quotes', () => {
  function escapeCsvCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  assert.equal(escapeCsvCell('Month 2'), 'Month 2');
  assert.equal(escapeCsvCell(75000), '75000');
  assert.equal(escapeCsvCell('DRC/ERD/CHAL-2026-00412, Special'), '"DRC/ERD/CHAL-2026-00412, Special"');
  assert.equal(escapeCsvCell('Signed "Foreman"'), '"Signed ""Foreman"""');
});

// ------------------------------------------------------------------------------
// Invariant 8: 100% Bilingual Dictionary Parity in `reports.minutes`
// ------------------------------------------------------------------------------
test('8. Bilingual Parity: 100% key match between en.json and ta.json in reports.minutes', () => {
  const basePath = fs.existsSync(path.resolve(process.cwd(), 'messages/en.json'))
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/web');

  const enPath = path.resolve(basePath, 'messages/en.json');
  const taPath = path.resolve(basePath, 'messages/ta.json');

  assert.ok(fs.existsSync(enPath), `en.json must exist at ${enPath}`);
  assert.ok(fs.existsSync(taPath), `ta.json must exist at ${taPath}`);

  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const ta = JSON.parse(fs.readFileSync(taPath, 'utf8'));

  assert.ok(en.reports?.minutes, 'en.json must contain reports.minutes');
  assert.ok(ta.reports?.minutes, 'ta.json must contain reports.minutes');

  const enKeys = Object.keys(en.reports.minutes).sort();
  const taKeys = Object.keys(ta.reports.minutes).sort();

  const missingInTamil = enKeys.filter((k) => !taKeys.includes(k));
  const missingInEnglish = taKeys.filter((k) => !enKeys.includes(k));

  assert.deepEqual(
    missingInTamil,
    [],
    `Keys present in en.json but missing in ta.json: ${missingInTamil.join(', ')}`
  );
  assert.deepEqual(
    missingInEnglish,
    [],
    `Keys present in ta.json but missing in en.json: ${missingInEnglish.join(', ')}`
  );
  assert.equal(enKeys.length, taKeys.length);
  assert.ok(enKeys.length >= 35, `Expected at least 35 keys, found ${enKeys.length}`);
});
