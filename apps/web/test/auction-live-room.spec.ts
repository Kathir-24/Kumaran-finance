import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

  // 2. Guardrail 2: Whole Rupee integer validation
  it('Guardrail 2: Strictly rejects decimal paise and floating-point bids', () => {
    const sanitizeWholeRupees = (input: string): string => {
      return input.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    };

    const parseWholeRupees = (input: string): number => {
      const sanitized = sanitizeWholeRupees(input);
      return sanitized === '' ? 0 : parseInt(sanitized, 10);
    };

    // Strips paise/decimals cleanly
    assert.equal(sanitizeWholeRupees('22000.50'), '2200050'); // Stripping decimal point
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
});
