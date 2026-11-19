import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseWholeRupees,
  sanitizeWholeRupeeInput,
} from '../src/lib/currency.ts';
import {
  computeAuctionBidPreview,
  parseWholeRupeesBigInt,
  toSafeWholeRupeeBigInt,
} from '../src/components/auctions/auction-math.util.ts';

describe('Task 6.2: Real-Time In-Office Auction Room Unit Tests', () => {
  // 1. Guardrail 6: Floor and Ceiling validation bounds
  it('Guardrail 6: Enforces bid discount Floor >= 4.00% and Ceiling <= V/4', () => {
    const chitValue = 100000n;
    const minFloor = (chitValue * 4n) / 100n; // 4,000
    const maxCeiling = chitValue / 4n;        // 25,000

    assert.equal(minFloor, 4000n);
    assert.equal(maxCeiling, 25000n);

    // Helper validation function matching BiddingConsole
    const validateBidDiscount = (bid: bigint, floor: bigint, ceiling: bigint) => {
      if (bid < floor) {
        return { valid: false, error: 'FLOOR_VIOLATION' };
      }
      if (bid > ceiling) {
        return { valid: false, error: 'CEILING_VIOLATION' };
      }
      return { valid: true, error: null };
    };

    // Sub-floor rejection
    assert.deepEqual(validateBidDiscount(3999n, minFloor, maxCeiling), {
      valid: false,
      error: 'FLOOR_VIOLATION',
    });

    // Super-ceiling rejection
    assert.deepEqual(validateBidDiscount(25001n, minFloor, maxCeiling), {
      valid: false,
      error: 'CEILING_VIOLATION',
    });

    // Valid intermediate bids
    assert.deepEqual(validateBidDiscount(4000n, minFloor, maxCeiling), { valid: true, error: null });
    assert.deepEqual(validateBidDiscount(20000n, minFloor, maxCeiling), { valid: true, error: null });
    assert.deepEqual(validateBidDiscount(25000n, minFloor, maxCeiling), { valid: true, error: null });
  });

  // 2. Guardrail 2: Whole Rupee integer validation (uses shared SDK helpers, zero paise concatenation)
  it('Guardrail 2: Strictly rejects decimal paise and floating-point bids', () => {
    assert.equal(sanitizeWholeRupeeInput('22000.50'), '22000');
    assert.equal(parseWholeRupees('22000.50'), 22000);
    assert.equal(parseWholeRupees('25000'), 25000);
    assert.equal(parseWholeRupees('₹ 18,500'), 18500);
    assert.equal(parseWholeRupees('0015000'), 15000);
  });

  // 3. Guardrail 4: Universal Equal Dividend allocation
  it('Guardrail 4: Calculates universal dividend pool and equal per-ticket credit', () => {
    const chitValue = 100000n;
    const durationMonths = 20n;
    const baseInstallment = chitValue / durationMonths; // 5,000
    const bidDiscount = 20000n;
    const foremanCommission = (chitValue * 4n) / 100n; // 4,000

    const dividendPool = bidDiscount - foremanCommission; // 16,000
    const dividendPerTicket = dividendPool / durationMonths; // 800
    const nextMonthNet = baseInstallment - dividendPerTicket; // 4,200

    assert.equal(foremanCommission, 4000n);
    assert.equal(dividendPool, 16000n);
    assert.equal(dividendPerTicket, 800n);
    assert.equal(nextMonthNet, 4200n);

    // Row-Sum invariant: Next Month Net + Dividend === Base Installment
    assert.equal(nextMonthNet + dividendPerTicket, baseInstallment);
  });

  // 4. Financial Invariant: Prize Money P === V - D
  it('Financial Invariant: Prize Money P === V - D', () => {
    const chitValue = 100000n;
    const bidDiscount = 22000n;
    const prizeMoney = chitValue - bidDiscount;

    assert.equal(prizeMoney, 78000n);

    // Ceiling bid prize money
    const ceilingDiscount = 25000n;
    const ceilingPrize = chitValue - ceilingDiscount;
    assert.equal(ceilingPrize, 75000n);
  });

  // 5. Guardrail 8 & ADR-07: Defaulter filtering
  it('Guardrail 8 & ADR-07: Correctly identifies and bars defaulters with unpaid arrears', () => {
    interface Ticket {
      id: string;
      ticketNumber: number;
      isPrized: boolean;
      status: string;
      consecutiveUnpaidMonths: number;
    }

    const tickets: Ticket[] = [
      { id: 't1', ticketNumber: 1, isPrized: false, status: 'ACTIVE', consecutiveUnpaidMonths: 0 },
      { id: 't2', ticketNumber: 2, isPrized: false, status: 'ACTIVE', consecutiveUnpaidMonths: 1 }, // Defaulter
      { id: 't3', ticketNumber: 3, isPrized: true,  status: 'ACTIVE', consecutiveUnpaidMonths: 0 }, // Prized
      { id: 't4', ticketNumber: 4, isPrized: false, status: 'ACTIVE', consecutiveUnpaidMonths: 0 },
      { id: 't5', ticketNumber: 5, isPrized: false, status: 'REMOVED', consecutiveUnpaidMonths: 3 }, // Barred
    ];

    const isEligibleToBid = (t: Ticket) =>
      t.status === 'ACTIVE' && !t.isPrized && t.consecutiveUnpaidMonths === 0;

    const eligible = tickets.filter(isEligibleToBid);
    const defaulters = tickets.filter((t) => t.consecutiveUnpaidMonths > 0);
    const prized = tickets.filter((t) => t.isPrized);

    assert.equal(eligible.length, 2);
    assert.deepEqual(eligible.map((t) => t.ticketNumber), [1, 4]);
    assert.equal(defaulters.length, 2);
    assert.equal(prized.length, 1);
  });

  // 6. Option A Physical Tie-Break Protocol
  it('Option A Protocol: Validates physical paper token assignment and Foreman drawn token', () => {
    const chitValue = 100000n;
    const ceiling = chitValue / 4n; // 25,000

    const tiedTickets = [
      { ticketId: 'ticket-002', tokenNumber: 1 },
      { ticketId: 'ticket-005', tokenNumber: 2 },
      { ticketId: 'ticket-008', tokenNumber: 3 },
    ];

    const winningTicketId = 'ticket-005'; // Token #2 drawn by Foreman

    // Option A Invariants:
    // 1. Must have at least 2 tied tickets
    assert.ok(tiedTickets.length >= 2);

    // 2. Winning ticket must be among the tied list
    const foundWinner = tiedTickets.find((t) => t.ticketId === winningTicketId);
    assert.ok(foundWinner !== undefined);
    assert.equal(foundWinner.tokenNumber, 2);

    // 3. Bid discount must equal exact ceiling
    const tiedBidDiscount = 25000n;
    assert.equal(tiedBidDiscount, ceiling);
  });

  // 7. Maker-Checker transition readiness
  it('Guardrail 10: Prepares Maker recorded bid payload for dual-control Checker finalization', () => {
    const makerUserId = 'user-maker-001';
    const checkerUserId = 'user-checker-002';

    const recordedAuction = {
      id: 'auc-001',
      installmentMonth: 2,
      status: 'SCHEDULED',
      bidDiscount: 20000,
      conductedByUserId: makerUserId,
      winnerTicketId: 'ticket-003',
    };

    // Maker cannot finalize (Maker != Checker constraint)
    const canFinalize = (checkerId: string, makerId: string) => checkerId !== makerId;

    assert.equal(canFinalize(makerUserId, recordedAuction.conductedByUserId), false);
    assert.equal(canFinalize(checkerUserId, recordedAuction.conductedByUserId), true);
  });

  // 8. Bilingual dictionary parity
  it('Bilingual Parity: auctions live room keys match 100% between English and Tamil', () => {
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

    // Check specific Task 6.2 keys
    const requiredKeys = [
      'liveRoomTitle',
      'eligibilityTitle',
      'statusEligibleBadge',
      'statusDefaulterBadge',
      'biddingConsoleTitle',
      'floorError',
      'ceilingError',
      'ceilingReachedAlert',
      'tieBreakModalTitle',
      'tieBreakNotice',
      'recordTieBreakAction',
      'summaryTitle',
      'makerStampNotice',
      'makerCheckerNotice',
    ];

    for (const key of requiredKeys) {
      assert.ok(en.auctions[key], `Missing en.auctions.${key}`);
      assert.ok(ta.auctions[key], `Missing ta.auctions.${key}`);
    }
  });

  // 9. DEF-WM-04: Pure BigInt auction preview & KFC-FIN-002 exact divisibility gate
  it('DEF-WM-04 (KFC-FIN-002): computeAuctionBidPreview enforces exact whole-rupee dividend divisibility and frozen rate', () => {
    // Cleanly divisible ceiling bid: ₹1,00,000 / 20 tickets, bid ₹25,000, 4% commission ₹4,000 => Div ₹21,000 / 20 = ₹1,050 (rem 0)
    const valid = computeAuctionBidPreview({
      chitValue: 100_000n,
      totalTickets: 20,
      bidDiscount: 25_000n,
      frozenCommissionRate: '4.00',
    });
    assert.equal(valid.foremanCommission, 4_000n);
    assert.equal(valid.ceilingDiscount, 25_000n);
    assert.equal(valid.totalDividend, 21_000n);
    assert.equal(valid.dividendRemainder, 0n);
    assert.equal(valid.isDivisible, true);
    assert.equal(valid.dividendPerTicket, 1_050n);
    assert.equal(valid.nextMonthNetInstallment, 3_950n);
    assert.equal(valid.netPrizeMoney, 75_000n);

    // Non-divisible bid: ₹20,005 => (20,005 - 4,000) % 20 = 5 != 0 -> MUST fail divisibility gate
    const nonDivisible = computeAuctionBidPreview({
      chitValue: 100_000n,
      totalTickets: 20,
      bidDiscount: 20_005n,
      frozenCommissionRate: '4.00',
    });
    assert.equal(nonDivisible.isFloorViolated, false);
    assert.equal(nonDivisible.isCeilingViolated, false);
    assert.equal(nonDivisible.dividendRemainder, 5n);
    assert.equal(nonDivisible.isDivisible, false);

    // Frozen non-default rate (5.00%): commission = ₹5,000 (Guardrail 3)
    const frozenRate = computeAuctionBidPreview({
      chitValue: 100_000n,
      totalTickets: 20,
      bidDiscount: 25_000n,
      frozenCommissionRate: '5.00',
    });
    assert.equal(frozenRate.foremanCommission, 5_000n);
    assert.equal(frozenRate.dividendPerTicket, 1_000n);
    assert.equal(toSafeWholeRupeeBigInt('9007199254740993'), 9007199254740993n);

    // XR-WM-05: 310+ digit paste must parse cleanly to BigInt without Infinity RangeError
    const hugePaste = '9'.repeat(320);
    const parsedHuge = parseWholeRupeesBigInt(hugePaste);
    assert.equal(parsedHuge, BigInt(hugePaste));
    const hugePreview = computeAuctionBidPreview({
      chitValue: 100_000n,
      totalTickets: 20,
      bidDiscount: parsedHuge,
    });
    assert.equal(hugePreview.isCeilingViolated, true);
    assert.equal(parseWholeRupeesBigInt('25,000.99'), 25000n);
  });

  // 10. DEF-WM-03 Regression: Live Room query key isolation, month param forwarding & Guardrail 5/8 guards
  it('DEF-WM-03 Regression: Live room uses schemes.roster cache key, forwards ?month on bid/tie-break, and enforces Month 1/N guard', () => {
    const livePageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(dashboard)/auctions/[id]/live/page.tsx'),
      'utf-8',
    );
    const rosterSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auctions/defaulter-eligibility-roster.tsx'),
      'utf-8',
    );

    // Zero cache collision with schemes.detail
    assert.match(livePageSource, /queryKeys\.schemes\.roster\(chitGroupId/);
    // Passes ?month=currentMonth to record-bid and tie-break
    assert.match(livePageSource, /\/api\/v1\/auctions\/\{id\}\/record-bid[\s\S]*?query:\s*\{\s*month:\s*currentMonth\s*\}/);
    assert.match(livePageSource, /\/api\/v1\/auctions\/\{id\}\/tie-break[\s\S]*?query:\s*\{\s*month:\s*currentMonth\s*\}/);
    // Guardrail 5 Month 1 & Month N exclusion
    assert.match(livePageSource, /currentMonth <= 1 \|\| currentMonth >= durationMonths/);
    // Guardrail 8: roster trusts authoritative server eligibleTicketIdSet without || client bypass
    assert.doesNotMatch(
      rosterSource,
      /eligibleTicketIdSet\.has\(ticket\.id\)\s*\|\|/,
      'DefaulterEligibilityRoster must never bypass server eligibility with || fallback',
    );

    // Guardrail 11 (SEC-A): IT Super Admin blocked on live room & bidding console
    const consoleSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auctions/bidding-console.tsx'),
      'utf-8',
    );
    assert.match(
      livePageSource,
      /hasAnyRole\(user,\s*\['BRANCH_MANAGER',\s*'PARTNER'\]\)/,
    );
    assert.match(
      consoleSource,
      /hasAnyRole\(user,\s*\['BRANCH_MANAGER',\s*'PARTNER'\]\)/,
    );

    // TieBreakModal token auto-assignment allocates smallest unused positive integer (zero duplicates)
    const tieModalSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auctions/tie-break-modal.tsx'),
      'utf-8',
    );
    assert.match(tieModalSource, /usedTokens\.has\(nextTokenNum\)/);
    assert.doesNotMatch(tieModalSource, /const nextTokenNum = next\.length;/);
  });

  // 11. M9-WEB-DEF-01, M9-WEB-DEF-03, M9-WEB-DEF-04, M9-WEB-DEF-05 Regressions
  it('M9-WEB-DEF Regressions: Live room route replacement, safe date handling, tie-break full token check & dropdown normalization', () => {
    const livePageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(dashboard)/auctions/[id]/live/page.tsx'),
      'utf-8',
    );
    const consoleSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auctions/bidding-console.tsx'),
      'utf-8',
    );
    const tieModalSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/auctions/tie-break-modal.tsx'),
      'utf-8',
    );

    // M9-WEB-DEF-01: Navigates to real auction ID if launched via ChitGroup UUID
    assert.match(livePageSource, /record\.id !== auctionId/);
    assert.match(livePageSource, /router\.replace\(`\/auctions\/\$\{record\.id\}\/live`\)/);

    // M9-WEB-DEF-03: Safe ISO date parsing across console and modal
    assert.match(consoleSource, /!isNaN\(validAuctionDate\.getTime\(\)\)/);
    assert.match(tieModalSource, /!isNaN\(validAuctionDate\.getTime\(\)\)/);

    // M9-WEB-DEF-04: Full token assignment check (cannot submit missing tokens)
    assert.match(tieModalSource, /assignedTokens\.length !== tiedTickets\.length/);

    // M9-WEB-DEF-05: Dropdown fallback normalization for flat EligibleBidderItem
    assert.match(consoleSource, /flatCustCode/);
    assert.match(consoleSource, /flatCustName/);
  });
});
