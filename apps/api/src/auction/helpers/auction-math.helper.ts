import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DISCOUNT_CEILING_DIVISOR,
  FOREMAN_COMMISSION_PERCENT,
} from '../../common/constants';
import { formatIstDate } from '../../report/helpers/report-scope.helper';

const COMMISSION_RATE_REGEX = /^(\d+)(?:\.(\d{1,2}))?$/;
const BASIS_POINTS_DENOMINATOR = 10000n;

export interface AuctionMathResult {
  commissionRate: Prisma.Decimal;
  commissionRatePercentLabel: string;
  commissionAmount: bigint;
  totalDividend: bigint;
  dividendPerTicket: bigint;
  prizeMoney: bigint;
}

/**
 * Parses a Prisma Decimal / numeric / string foreman commission percentage (e.g. "4.00", 4, 3.5)
 * into exact BigInt basis points (over 10,000) with ZERO floating-point arithmetic.
 * Guardrails 2 & 3 (Whole Rupee BigInt + Frozen Per-Group Commission Rate).
 */
export function parseCommissionRateToBps(
  rawRate: Prisma.Decimal | number | string | null | undefined,
): { rateBps: bigint; normalizedRate: string } {
  const rateStr =
    rawRate === null || rawRate === undefined
      ? FOREMAN_COMMISSION_PERCENT.toFixed(2)
      : String(rawRate).trim();

  const match = COMMISSION_RATE_REGEX.exec(rateStr);
  if (!match) {
    throw new BadRequestException(
      `INVALID_COMMISSION_RATE: Frozen foreman commission rate "${rateStr}" is not a valid percentage with up to 2 decimal places.`,
    );
  }

  const wholePart = BigInt(match[1]);
  const fracPart = (match[2] ?? '').padEnd(2, '0');
  const rateBps = wholePart * 100n + BigInt(fracPart);

  if (rateBps <= 0n || rateBps > 2500n) {
    throw new BadRequestException(
      `INVALID_COMMISSION_RATE: Frozen foreman commission rate (${rateStr}%) must be > 0.00% and <= 25.00%.`,
    );
  }

  const normalizedRate = `${wholePart.toString()}.${fracPart}`;
  return { rateBps, normalizedRate };
}

/**
 * Computes exact whole-rupee Foreman Commission from the chit group's frozen rate (ADR-04).
 * Fails closed if the commission does not evaluate to a whole Rupee integer.
 */
export function calculateFrozenForemanCommission(
  chitValue: bigint,
  rawRate: Prisma.Decimal | number | string | null | undefined,
): {
  commissionAmount: bigint;
  commissionRate: Prisma.Decimal;
  commissionRatePercentLabel: string;
} {
  const { rateBps, normalizedRate } = parseCommissionRateToBps(rawRate);
  const numerator = chitValue * rateBps;

  if (numerator % BASIS_POINTS_DENOMINATOR !== 0n) {
    throw new BadRequestException(
      `NON_INTEGER_COMMISSION: Chit value ₹${chitValue.toString()} at frozen commission rate ${normalizedRate}% does not produce a whole Rupee commission.`,
    );
  }

  return {
    commissionAmount: numerator / BASIS_POINTS_DENOMINATOR,
    commissionRate: new Prisma.Decimal(normalizedRate),
    commissionRatePercentLabel: `${normalizedRate}%`,
  };
}

/**
 * Calculates and validates all whole-rupee auction financial invariants (Guardrails 2, 3, 4, 6):
 * - Uses the chit group's frozen foreman commission rate (ADR-04)
 * - Enforces minimum floor: bidDiscount >= commissionAmount (zero negative dividends)
 * - Enforces fixed 1/4 ceiling: bidDiscount <= min(maxDiscountCeiling, chitValue / 4) (ADR-06)
 * - Enforces exact dividend divisibility: (bidDiscount - commissionAmount) % totalTickets === 0n (KFC-FIN-002)
 */
export function calculateAuctionMath(
  chitValue: bigint,
  totalTickets: bigint,
  bidDiscount: bigint,
  frozenCommissionRate?: Prisma.Decimal | number | string | null,
  maxDiscountCeiling?: bigint,
): AuctionMathResult {
  if (totalTickets <= 0n) {
    throw new BadRequestException('Chit scheme must have at least 1 ticket');
  }

  const {
    commissionAmount,
    commissionRate,
    commissionRatePercentLabel,
  } = calculateFrozenForemanCommission(chitValue, frozenCommissionRate);

  const statutoryCeiling = chitValue / DISCOUNT_CEILING_DIVISOR;
  const effectiveCeiling =
    maxDiscountCeiling !== undefined && maxDiscountCeiling < statutoryCeiling
      ? maxDiscountCeiling
      : statutoryCeiling;

  // Guardrail 6 / ADR-06: Fixed 1/4 (25%) Ceiling Enforcement
  if (bidDiscount > effectiveCeiling) {
    throw new BadRequestException(
      `Bid discount ₹${bidDiscount.toString()} exceeds maximum allowable 1/4 ceiling of ₹${effectiveCeiling.toString()}`,
    );
  }

  // Minimum Floor: Bid discount >= Frozen Foreman Commission (prevents negative dividends)
  if (bidDiscount < commissionAmount) {
    throw new BadRequestException(
      `Bid discount ₹${bidDiscount.toString()} must be at least the ${commissionRatePercentLabel} Foreman Commission of ₹${commissionAmount.toString()}`,
    );
  }

  const totalDividend = bidDiscount - commissionAmount;

  // KFC-FIN-002: Whole-Rupee Divisibility Invariant (Zero Remainder Truncation)
  if (totalDividend % totalTickets !== 0n) {
    const remainder = totalDividend % totalTickets;
    throw new BadRequestException(
      `NON_DIVISIBLE_DIVIDEND: Bid discount ₹${bidDiscount.toString()} produces a total dividend of ₹${totalDividend.toString()}, which is not evenly divisible across ${totalTickets.toString()} members (remainder: ₹${remainder.toString()}). Only bids producing exact whole-rupee dividends are permitted.`,
    );
  }

  const dividendPerTicket = totalDividend / totalTickets;
  const prizeMoney = chitValue - bidDiscount;

  return {
    commissionRate,
    commissionRatePercentLabel,
    commissionAmount,
    totalDividend,
    dividendPerTicket,
    prizeMoney,
  };
}

/**
 * Formats Form XVII Statutory Auction Minutes proceedings text consistently for
 * initial finalization and post-finalization dual-control corrections.
 */
export function formatStatutoryAuctionMinutesText(params: {
  installmentMonth: number;
  groupName: string;
  groupCode: string;
  auctionDate: Date;
  subscribersPresent: number;
  winningTicketNumber: number;
  winnerName: string;
  bidDiscount: bigint;
  commissionRatePercentLabel: string;
  commissionAmount: bigint;
  dividendPerTicket: bigint;
  prizeMoney: bigint;
  notes?: string | null;
}): string {
  const auctionDateStr = formatIstDate(params.auctionDate);
  return (
    `KUMARAN FINANCE — STATUTORY AUCTION PROCEEDINGS (MONTH ${params.installmentMonth})\n` +
    `Group: ${params.groupName} (${params.groupCode})\n` +
    `Auction Date: ${auctionDateStr}\n` +
    `Subscribers Present: ${params.subscribersPresent}\n` +
    `Winning Ticket: #${params.winningTicketNumber} (${params.winnerName})\n` +
    `Winning Bid Discount: ₹${params.bidDiscount.toString()}\n` +
    `Foreman Commission (${params.commissionRatePercentLabel}): ₹${params.commissionAmount.toString()}\n` +
    `Universal Dividend Per Member: ₹${params.dividendPerTicket.toString()}\n` +
    `Prize Money Payable: ₹${params.prizeMoney.toString()}\n` +
    `Observations: ${params.notes || 'Auction conducted in accordance with Tamil Nadu Chit Funds Rules.'}`
  );
}
