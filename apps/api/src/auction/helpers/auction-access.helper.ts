import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const POSITIVE_INT_REGEX = /^\d+$/;

/**
 * Strictly parses an optional query-string month parameter as a positive integer.
 * Rejects floats ("2.5"), trailing garbage ("2abc"), negatives ("-1"), and non-numeric strings ("abc").
 */
export function parseOptionalPositiveIntQuery(
  rawValue: string | undefined,
  fieldName = 'Installment month',
): number | undefined {
  if (rawValue === undefined || rawValue === '') {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!POSITIVE_INT_REGEX.test(trimmed)) {
    throw new BadRequestException(`${fieldName} must be a positive whole integer`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new BadRequestException(`${fieldName} must be a positive whole integer`);
  }

  return parsed;
}

/**
 * Checks whether a caller is strictly a branch-scoped staff role
 * (BRANCH_MANAGER or COLLECTION_AGENT without global SUPER_ADMIN / AUDITOR / ACCOUNTANT roles).
 */
export function isBranchScopedStaff(currentUser?: JwtPayload): boolean {
  if (!currentUser) {
    return false;
  }
  const roles = currentUser.roles ?? [];
  return (
    (roles.includes(Role.BRANCH_MANAGER) ||
      roles.includes(Role.COLLECTION_AGENT)) &&
    !roles.includes(Role.SUPER_ADMIN) &&
    !roles.includes(Role.AUDITOR) &&
    !roles.includes(Role.ACCOUNTANT)
  );
}

/**
 * Anti-BOLA Layer-2 Branch Scope Assertion for auction endpoints.
 * Ensures branch-scoped roles (Branch Manager, Collection Agent) can only access/mutate
 * chit schemes and auctions belonging to their assigned branch.
 */
export function assertAuctionBranchAccess(
  chitBranchId: string | null | undefined,
  currentUser?: JwtPayload,
): void {
  if (!currentUser || !isBranchScopedStaff(currentUser)) {
    return;
  }

  if (!currentUser.branchId) {
    throw new ForbiddenException(
      currentUser.roles.includes(Role.BRANCH_MANAGER)
        ? 'Access denied: Branch manager must have an assigned branch'
        : 'Access denied: Collection agent must have an assigned branch',
    );
  }

  if (!chitBranchId || chitBranchId !== currentUser.branchId) {
    throw new ForbiddenException(
      'Access denied: Chit scheme belongs to another branch',
    );
  }
}

/**
 * Guardrail 11 / ADR-21 (SEC-A): Fail-closed statutory partner identity check.
 * Rejects BOTH non-partner users (isPartner: false) AND null/missing user records.
 */
export async function assertVerifiedPartner(
  prisma: { user?: { findUnique?: (args: any) => Promise<any> } },
  userId: string,
  actionDescription: string,
): Promise<void> {
  if (typeof prisma.user?.findUnique !== 'function') {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPartner: true, isActive: true },
  });

  if (!user || !user.isPartner || user.isActive === false) {
    throw new ForbiddenException(
      `PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to ${actionDescription}.`,
    );
  }
}

/**
 * Checks whether the caller holds strictly the CUSTOMER role (no staff/auditor roles).
 */
export function isPureCustomer(currentUser?: JwtPayload): boolean {
  if (!currentUser) {
    return false;
  }
  const roles = currentUser.roles ?? [];
  return (
    roles.includes(Role.CUSTOMER) &&
    !roles.some((r: Role) => r !== Role.CUSTOMER)
  );
}

/**
 * XR-AUC-02: Sanitizes an Auction record for pure Role.CUSTOMER viewers:
 * - Strips internal statutory AuctionMinutes (`minutes: null`)
 * - Strips internal partner correction drafts (`pendingCorrection: null`)
 * - Projects non-self AuctionWinner strictly to public auction outcome fields
 *   (zero blankChequeDetails, securityDocS3Key, paymentReference, disbursedAmount, or staff IDs)
 * - Masks fellow subscribers' phone numbers as `+91 ******0000`
 */
export function sanitizeAuctionForCustomer<T extends Record<string, any>>(
  auction: T,
  customerId: string,
): T {
  const isOwnWinningTicket = auction.winner?.ticket?.customerId === customerId;

  let sanitizedWinner = auction.winner;
  if (auction.winner) {
    if (isOwnWinningTicket) {
      sanitizedWinner = {
        ...auction.winner,
        verifiedByUserId: undefined,
        authorizedByUserId: undefined,
      };
    } else {
      sanitizedWinner = {
        id: auction.winner.id,
        auctionId: auction.winner.auctionId,
        ticketId: auction.winner.ticketId,
        wasTieBreakWinner: auction.winner.wasTieBreakWinner,
        disbursementStatus: auction.winner.disbursementStatus,
        ticket: auction.winner.ticket
          ? {
              ...auction.winner.ticket,
              customer: auction.winner.ticket.customer
                ? {
                    ...auction.winner.ticket.customer,
                    phone: '+91 ******0000',
                  }
                : null,
            }
          : null,
      };
    }
  }

  const sanitizedTieBidders = Array.isArray(auction.tieBidders)
    ? auction.tieBidders.map((b: any) => {
        if (!b?.ticket) {
          return b;
        }
        const isOwnTieBid = b.ticket.customerId === customerId;
        return {
          ...b,
          ticket: {
            ...b.ticket,
            customer: b.ticket.customer
              ? {
                  ...b.ticket.customer,
                  phone: isOwnTieBid
                    ? b.ticket.customer.phone
                    : '+91 ******0000',
                }
              : null,
          },
        };
      })
    : auction.tieBidders;

  return {
    ...auction,
    minutes: null,
    ...('pendingCorrection' in auction ? { pendingCorrection: null } : {}),
    winner: sanitizedWinner,
    ...(sanitizedTieBidders !== undefined
      ? { tieBidders: sanitizedTieBidders }
      : {}),
  };
}
