// ==============================================================================
// Kumaran Chits — Shared Pessimistic Row-Lock Helpers for Critical State Machines
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: PostgreSQL 17 Acyclic Lock DAG (Zero 40P01 / Split-Brain Races)
// ==============================================================================

import { AuctionStatus, ChitStatus, PaymentStatus } from '@prisma/client';

export interface LockedChitGroupRow {
  id: string;
  status: ChitStatus | string;
}

export interface LockedAuctionRow {
  id: string;
  status: AuctionStatus;
}

export interface LockedAuctionMinutesRow {
  id: string;
  filedAtRegistrar: boolean;
}

export interface LockedAuctionWinnerRow {
  id: string;
  disbursementStatus: string;
}

export interface LockedTicketRow {
  id: string;
  status: string;
  isPrized: boolean;
  consecutiveUnpaidMonths?: number;
  removalRequestedByUserId?: string | null;
}

export interface LockedPaymentAndReversal {
  lockedPayment: { id: string; paymentStatus: PaymentStatus } | null;
  lockedReversal: { id: string; status: string } | null;
}

export async function lockChitGroupRow(
  tx: any,
  chitGroupId: string,
): Promise<LockedChitGroupRow | null> {
  if (typeof tx?.$queryRaw !== 'function') return null;
  const rows = await tx.$queryRaw<LockedChitGroupRow[]>`
    SELECT id, status FROM "ChitGroup" WHERE id = ${chitGroupId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function lockAuctionRow(
  tx: any,
  auctionId: string,
): Promise<LockedAuctionRow | null> {
  if (typeof tx?.$queryRaw !== 'function') return null;
  const rows = await tx.$queryRaw<LockedAuctionRow[]>`
    SELECT id, status FROM "Auction" WHERE id = ${auctionId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function lockAuctionMinutesRow(
  tx: any,
  auctionId: string,
): Promise<LockedAuctionMinutesRow | null> {
  if (typeof tx?.$queryRaw !== 'function') return null;
  const rows = await tx.$queryRaw<LockedAuctionMinutesRow[]>`
    SELECT id, "filedAtRegistrar" FROM "AuctionMinutes" WHERE "auctionId" = ${auctionId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function lockAuctionWinnerRow(
  tx: any,
  winnerId: string,
): Promise<LockedAuctionWinnerRow | null> {
  if (typeof tx?.$queryRaw !== 'function') return null;
  const rows = await tx.$queryRaw<LockedAuctionWinnerRow[]>`
    SELECT id, "disbursementStatus" FROM "AuctionWinner" WHERE id = ${winnerId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function lockSubscriberTicketRow(
  tx: any,
  ticketId: string,
): Promise<LockedTicketRow | null> {
  if (typeof tx?.$queryRaw !== 'function') return null;
  const rows = await tx.$queryRaw<LockedTicketRow[]>`
    SELECT id, status, "isPrized", "consecutiveUnpaidMonths", "removalRequestedByUserId" FROM "SubscriberTicket" WHERE id = ${ticketId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Locks Payment (Tier 4) then PaymentReversal (Tier 5) strictly in monotonic DAG order
 * to eliminate concurrent approveReversal vs rejectReversal split-brain and duplicate requests.
 */
export async function lockPaymentAndReversalRows(
  tx: any,
  paymentId: string,
): Promise<LockedPaymentAndReversal> {
  if (typeof tx?.$queryRaw !== 'function') {
    return { lockedPayment: null, lockedReversal: null };
  }

  const paymentRows = await tx.$queryRaw<Array<{ id: string; paymentStatus: PaymentStatus }>>`
    SELECT id, "paymentStatus" FROM "Payment" WHERE id = ${paymentId} FOR UPDATE
  `;
  const reversalRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM "PaymentReversal" WHERE "paymentId" = ${paymentId} FOR UPDATE
  `;

  return {
    lockedPayment: Array.isArray(paymentRows) && paymentRows[0] ? paymentRows[0] : null,
    lockedReversal: Array.isArray(reversalRows) && reversalRows[0] ? reversalRows[0] : null,
  };
}
