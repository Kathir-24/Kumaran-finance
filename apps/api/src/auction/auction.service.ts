import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  AuctionStatus,
  ChitStatus,
  DueStatus,
  Prisma,
  Role,
} from '@prisma/client';
import {
  lockAuctionMinutesRow,
  lockAuctionRow,
  lockAuctionWinnerRow,
  lockChitGroupRow,
  lockSubscriberTicketRow,
} from '../common/utils/state-transition-lock.util';
import { withTransactionRetry } from '../common/utils/transaction-retry.util';
import { toWholeRupeeBigInt } from '../common/utils/whole-rupee.util';
import { PrismaService } from '../prisma/prisma.service';
import { BullMqQueueProvider } from '../jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import {
  JOB_DISPATCH_AUCTION_RESULT,
  NOTIFICATION_QUEUE,
} from '../jobs/constants/queue-names.constant';
import type { AuctionResultNotificationJobPayload } from '../jobs/dto/job-payloads.dto';
import {
  DISCOUNT_CEILING_DIVISOR,
  FIRST_AUCTION_MONTH,
  FOREMAN_COMMISSION_PERCENT,
} from '../common/constants';
import { FinalizeAuctionDto } from './dto/finalize-auction.dto';
import { MarkMinutesFiledDto } from './dto/mark-minutes-filed.dto';
import { RecordBidDto } from './dto/record-bid.dto';
import { RecordTieBreakDto } from './dto/record-tie-break.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ApproveAuctionCorrectionDto,
  RejectAuctionCorrectionDto,
  RequestAuctionCorrectionDto,
} from './dto/auction-correction.dto';
import {
  calculateAuctionMath,
  formatStatutoryAuctionMinutesText,
  parseCommissionRateToBps,
} from './helpers/auction-math.helper';
import {
  assertAuctionBranchAccess,
  assertVerifiedPartner,
  isPureCustomer,
  sanitizeAuctionForCustomer,
} from './helpers/auction-access.helper';
import { computeRegistrarFilingCompliance } from '../report/helpers/report-scope.helper';

/**
 * XR-AUC-01: Complete collateral & disbursement reset applied whenever AuctionWinner.ticketId changes,
 * preventing cross-subscriber leakage of blank cheques, S3 scans, signatures, or payout references.
 */
const CLEARED_WINNER_SAFETY_AND_PAYOUT_FIELDS = {
  isSecurityRequired: false,
  securityType: null,
  blankChequeDetails: null,
  agreementSigned: false,
  nomineeSigned: false,
  securityDocS3Key: null,
  paymentReference: null,
  disbursedAt: null,
  disbursedAmount: null,
  disbursementMode: null,
  verifiedByUserId: null,
  authorizedByUserId: null,
  disbursementStatus: 'PENDING_VERIFICATION',
} as const;

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueProvider?: BullMqQueueProvider,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Parses and validates an auction/filing ISO date string.
   */
  private parseValidDate(rawDate: string, fieldName: string): Date {
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid ISO date string`);
    }
    return parsed;
  }

  /**
   * Guardrail 11 / ADR-21: When a SUPER_ADMIN (without BRANCH_MANAGER role) acts as
   * auction Maker (recordBid / recordTieBreak), enforce verified partner identity (isPartner: true).
   */
  private async assertMakerPartnerIfSuperAdminOnly(
    makerUserId: string,
    actionDescription: string,
    currentUser?: JwtPayload,
  ): Promise<void> {
    if (!currentUser) {
      return;
    }
    const roles = currentUser.roles ?? [];
    if (roles.includes(Role.SUPER_ADMIN) && !roles.includes(Role.BRANCH_MANAGER)) {
      await assertVerifiedPartner(this.prisma, makerUserId, actionDescription);
    }
  }

  /**
   * Guardrail 8 / ADR-07: Verifies a subscriber ticket is active, unprized (except optionally
   * for the auction being corrected), has zero consecutive unpaid months, and has zero
   * UNPAID/OVERDUE InstallmentDue rows up to and including the target auction month.
   */
  private async assertTicketEligibleForAuction(
    db: any,
    ticket: {
      id: string;
      chitGroupId: string;
      ticketNumber: number;
      isPrized?: boolean;
      prizedAuctionId?: string | null;
      status?: string;
      consecutiveUnpaidMonths?: number;
      removalRequestedByUserId?: string | null;
      customer?: { fullName?: string | null } | null;
    } | null,
    chitGroupId: string,
    month: number,
    options?: {
      allowExistingWinnerTicketId?: string | null;
      notFoundAsBadRequest?: boolean;
    },
  ): Promise<void> {
    if (!ticket || ticket.chitGroupId !== chitGroupId) {
      if (options?.notFoundAsBadRequest) {
        throw new BadRequestException(
          'INVALID_TICKET: Selected ticket does not belong to this chit scheme',
        );
      }
      throw new NotFoundException(
        'Selected winning ticket does not belong to this chit scheme',
      );
    }

    const isSameExistingWinner =
      Boolean(options?.allowExistingWinnerTicketId) &&
      ticket.id === options?.allowExistingWinnerTicketId;

    if (ticket.isPrized && !isSameExistingWinner) {
      throw new BadRequestException(
        `TICKET_ALREADY_PRIZED: Ticket #${ticket.ticketNumber} has already won a prior auction and cannot bid again`,
      );
    }

    const holderLabel = ticket.customer?.fullName
      ? ` (${ticket.customer.fullName})`
      : '';

    if (ticket.status && ticket.status !== 'ACTIVE') {
      throw new BadRequestException(
        `ADR-07 Violation: Ticket #${ticket.ticketNumber}${holderLabel} has status ${ticket.status} and is strictly ineligible for the auction`,
      );
    }

    if ((ticket.consecutiveUnpaidMonths ?? 0) > 0) {
      throw new BadRequestException(
        `ADR-07 Violation: Ticket #${ticket.ticketNumber}${holderLabel} has unpaid arrears and is strictly ineligible to win the auction`,
      );
    }

    if (ticket.removalRequestedByUserId) {
      throw new BadRequestException(
        `ADR-12 Violation: Ticket #${ticket.ticketNumber}${holderLabel} is pending removal and is strictly ineligible to participate in auctions`,
      );
    }

    if (typeof db.installmentDue?.findFirst === 'function') {
      const unpaidDue = await db.installmentDue.findFirst({
        where: {
          ticketId: ticket.id,
          installmentMonth: { lte: month },
          status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
        },
        select: { id: true, installmentMonth: true, status: true },
      });

      if (unpaidDue) {
        throw new BadRequestException(
          `ADR-07 Violation: Ticket #${ticket.ticketNumber}${holderLabel} has an unpaid Month ${unpaidDue.installmentMonth} installment (${unpaidDue.status}) and is strictly ineligible to participate in Month ${month} auction`,
        );
      }
    }
  }

  /**
   * Non-blocking proactive invalidation of executive dashboard and daybook caches in Redis.
   */
  private async invalidateReportCaches(branchId?: string | null): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (!redis || !this.redisProvider?.getIsConnected()) {
      return;
    }

    try {
      const targetDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
      }).format(new Date());
      const keys = [
        `report:daybook:ALL:${targetDate}`,
        `report:daybook:ALL_BRANCHES:${targetDate}`,
        'report:dashboard:ALL',
        'report:approvals:ALL',
      ];
      if (branchId) {
        keys.push(`report:daybook:${branchId}:${targetDate}`);
        keys.push(`report:dashboard:${branchId}`);
        keys.push(`report:approvals:${branchId}`);
      }
      await redis.del(...keys);
    } catch (err: any) {
      this.logger.warn(
        `Failed to proactively invalidate report cache: ${err.message}`,
      );
    }
  }

  /**
   * Pre-Auction Defaulter Guard: returns only active, non-prized subscribers with zero arrears
   * and zero UNPAID/OVERDUE installments up to the auction month (Guardrail 8 / ADR-07).
   */
  async getEligibleBidders(
    chitGroupId: string,
    month: number,
    currentUser?: JwtPayload,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    assertAuctionBranchAccess(chit.branchId, currentUser);

    if (month < FIRST_AUCTION_MONTH || month >= chit.durationMonths) {
      throw new BadRequestException(
        `Auctions take place exclusively in Months 2 through ${chit.durationMonths - 1} (Month 1 and Month ${chit.durationMonths} have no auctions)`,
      );
    }

    // ADR-07: Subscribers with any unpaid/overdue dues (<= month), arrears, or prized tickets are ineligible
    return this.prisma.subscriberTicket.findMany({
      where: {
        chitGroupId,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        removalRequestedByUserId: null,
        dues: {
          none: {
            installmentMonth: { lte: month },
            status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          },
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            customerCode: true,
            fullName: true,
            fullNameTamil: true,
            phone: true,
          },
        },
      },
      orderBy: { ticketNumber: 'asc' },
    });
  }

  /**
   * Maker: records in-branch winning auction bid discount (Cf <= D <= V / 4).
   * Enforces Guardrails 2, 3, 5, 6, 8, 11 and pessimistic ChitGroup -> SubscriberTicket locking.
   */
  async recordBid(
    chitGroupId: string,
    month: number,
    dto: RecordBidDto,
    makerUserId: string,
    currentUser?: JwtPayload,
  ) {
    await this.assertMakerPartnerIfSuperAdminOnly(
      makerUserId,
      'record auction bids',
      currentUser,
    );

    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    assertAuctionBranchAccess(chit.branchId, currentUser);

    if (chit.status && chit.status !== ChitStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot record bid: Chit scheme must be ACTIVE (current status: ${chit.status})`,
      );
    }

    if (month < FIRST_AUCTION_MONTH || month >= chit.durationMonths) {
      throw new BadRequestException(
        `Auctions occur exclusively in Months 2 through ${chit.durationMonths - 1}`,
      );
    }

    const parsedAuctionDate = this.parseValidDate(dto.auctionDate, 'Auction date');
    const bidDiscount = toWholeRupeeBigInt(dto.bidDiscount, 'Bid discount', {
      min: 1n,
    });

    // Guardrails 2, 3, 4, 6: Frozen commission floor, 1/4 ceiling, exact whole-rupee dividend divisibility
    const math = calculateAuctionMath(
      chit.chitValue,
      BigInt(chit.totalTickets),
      bidDiscount,
      chit.foremanCommissionRate,
      chit.maxDiscountCeiling,
    );

    // Pre-flight ticket eligibility validation (fast fail before lock acquisition)
    const preflightTicket = await this.prisma.subscriberTicket.findUnique({
      where: { id: dto.ticketId },
      include: { customer: true },
    });
    await this.assertTicketEligibleForAuction(
      this.prisma,
      preflightTicket,
      chitGroupId,
      month,
    );

    return withTransactionRetry(this.prisma, async (tx) => {
      const lockedChit = await lockChitGroupRow(tx, chitGroupId);
      if (lockedChit?.status && lockedChit.status !== ChitStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot record bid: Chit scheme must be ACTIVE (current status: ${lockedChit.status})`,
        );
      }

      // Lock winning ticket row in DAG order (ChitGroup -> SubscriberTicket) & re-verify TOCTOU eligibility
      const lockedTicket = await lockSubscriberTicketRow(tx, dto.ticketId);
      const txTicket =
        (await tx.subscriberTicket.findUnique({
          where: { id: dto.ticketId },
          include: { customer: true },
        })) ?? preflightTicket;

      const mergedTicket = txTicket
        ? {
            ...txTicket,
            ...(lockedTicket
              ? {
                  status: lockedTicket.status,
                  isPrized: lockedTicket.isPrized,
                  consecutiveUnpaidMonths: lockedTicket.consecutiveUnpaidMonths,
                  removalRequestedByUserId:
                    lockedTicket.removalRequestedByUserId,
                }
              : {}),
          }
        : null;

      await this.assertTicketEligibleForAuction(
        tx,
        mergedTicket,
        chitGroupId,
        month,
      );

      // 0. State Guard: Verify existing auction is not already completed or filed
      const existingAuction = await tx.auction.findUnique({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
        include: { winner: true },
      });

      if (existingAuction) {
        await lockAuctionRow(tx, existingAuction.id);
        if (
          existingAuction.status === AuctionStatus.COMPLETED ||
          existingAuction.status === AuctionStatus.MINUTES_FILED
        ) {
          throw new BadRequestException(
            `Cannot record bid: Auction for Month ${month} is already finalized (status: ${existingAuction.status})`,
          );
        }
      }

      // 1. Upsert auction record
      const auction = await tx.auction.upsert({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
        update: {
          auctionDate: parsedAuctionDate,
          status: AuctionStatus.SCHEDULED,
          bidDiscount,
          foremanCommissionRate: math.commissionRate,
          foremanCommissionAmount: math.commissionAmount,
          totalDividend: math.totalDividend,
          dividendPerTicket: math.dividendPerTicket,
          prizeMoney: math.prizeMoney,
          conductedByUserId: makerUserId,
        },
        create: {
          chitGroupId,
          installmentMonth: month,
          auctionDate: parsedAuctionDate,
          status: AuctionStatus.SCHEDULED,
          bidDiscount,
          foremanCommissionRate: math.commissionRate,
          foremanCommissionAmount: math.commissionAmount,
          totalDividend: math.totalDividend,
          dividendPerTicket: math.dividendPerTicket,
          prizeMoney: math.prizeMoney,
          conductedByUserId: makerUserId,
        },
      });

      // 2. Clear any stale tie-break bidders if switching from tie-break to single bid on open auction
      if (
        existingAuction &&
        typeof tx.auctionTieBidder?.deleteMany === 'function'
      ) {
        await tx.auctionTieBidder.deleteMany({
          where: { auctionId: auction.id },
        });
      }

      // 3. Upsert winner record; clear all prior safety proof & payout fields if tentative winner changed (XR-AUC-01)
      const winnerChanged =
        Boolean(existingAuction?.winner) &&
        existingAuction!.winner!.ticketId !== mergedTicket!.id;
      await tx.auctionWinner.upsert({
        where: { auctionId: auction.id },
        update: {
          ticketId: mergedTicket!.id,
          wasTieBreakWinner: false,
          verifiedByUserId: null,
          ...(winnerChanged ? CLEARED_WINNER_SAFETY_AND_PAYOUT_FIELDS : {}),
        },
        create: {
          auctionId: auction.id,
          ticketId: mergedTicket!.id,
          wasTieBreakWinner: false,
          verifiedByUserId: null,
        },
      });

      // 4. Immutable Audit Trail for Bid Recording
      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            userId: makerUserId,
            action: 'AUCTION_BID_RECORDED',
            entityType: 'Auction',
            entityId: auction.id,
            newValue: {
              installmentMonth: month,
              ticketId: mergedTicket!.id,
              ticketNumber: mergedTicket!.ticketNumber,
              bidDiscount: bidDiscount.toString(),
              foremanCommissionRate: math.commissionRatePercentLabel,
              foremanCommissionAmount: math.commissionAmount.toString(),
              dividendPerTicket: math.dividendPerTicket.toString(),
              prizeMoney: math.prizeMoney.toString(),
              conductedByUserId: makerUserId,
            },
          },
        });
      }

      return tx.auction.findUnique({
        where: { id: auction.id },
        include: {
          winner: {
            include: {
              ticket: {
                include: {
                  customer: { select: { fullName: true, customerCode: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Option A (Physical Draw): Records in-branch paper token draw when multiple members bid exact 1/4 ceiling.
   * Zero autonomous RNG/software lottery; enforces Guardrails 2, 3, 5, 6, 8, 11 across ALL tied tickets.
   */
  async recordTieBreak(
    chitGroupId: string,
    month: number,
    dto: RecordTieBreakDto,
    makerUserId: string,
    currentUser?: JwtPayload,
  ) {
    await this.assertMakerPartnerIfSuperAdminOnly(
      makerUserId,
      'record auction tie-break results',
      currentUser,
    );

    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    assertAuctionBranchAccess(chit.branchId, currentUser);

    if (chit.status && chit.status !== ChitStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot conduct tie-break draw: Chit scheme must be ACTIVE (current status: ${chit.status})`,
      );
    }

    // Guardrail 5: Auctions & tie-breaks occur exclusively in Months 2 through N-1
    if (month < FIRST_AUCTION_MONTH || month >= chit.durationMonths) {
      throw new BadRequestException(
        `Auctions occur exclusively in Months 2 through ${chit.durationMonths - 1}`,
      );
    }

    const parsedAuctionDate = this.parseValidDate(dto.auctionDate, 'Auction date');

    if (dto.tiedTickets.length < 2) {
      throw new BadRequestException(
        'At least 2 tied tickets are required to conduct a tie-break draw',
      );
    }

    const uniqueTicketIds = new Set(dto.tiedTickets.map((t) => t.ticketId));
    if (uniqueTicketIds.size !== dto.tiedTickets.length) {
      throw new BadRequestException(
        'Duplicate ticket entries are not permitted in a tie-break draw',
      );
    }

    // XR-AUC-04: Enforce unique positive integer physical paper token numbers across all tied bidders
    const seenTokenNumbers = new Set<number>();
    for (const entry of dto.tiedTickets) {
      if (entry.tokenNumber !== undefined && entry.tokenNumber !== null) {
        if (!Number.isInteger(entry.tokenNumber) || entry.tokenNumber < 1) {
          throw new BadRequestException(
            'INVALID_TOKEN_NUMBER: Physical paper token numbers must be positive whole integers',
          );
        }
        if (seenTokenNumbers.has(entry.tokenNumber)) {
          throw new BadRequestException(
            `DUPLICATE_TOKEN_NUMBER: Physical paper token #${entry.tokenNumber} is assigned to more than one tied bidder`,
          );
        }
        seenTokenNumbers.add(entry.tokenNumber);
      }
    }

    const bidDiscount = toWholeRupeeBigInt(dto.bidDiscount, 'Bid discount', {
      min: 1n,
    });

    const statutoryCeiling = chit.chitValue / DISCOUNT_CEILING_DIVISOR;
    const effectiveCeiling =
      chit.maxDiscountCeiling < statutoryCeiling
        ? chit.maxDiscountCeiling
        : statutoryCeiling;

    // In Option A, tie-break happens exclusively when members bid the maximum 1/4 ceiling
    if (bidDiscount !== effectiveCeiling) {
      throw new BadRequestException(
        `Tie-break occurs when members bid the exact 1/4 ceiling discount of ₹${effectiveCeiling.toString()}`,
      );
    }

    // Verify winning ticket is among the tied list
    const winningEntry = dto.tiedTickets.find(
      (t) => t.ticketId === dto.winningTicketId,
    );
    if (!winningEntry) {
      throw new BadRequestException(
        'Winning ticket must be one of the participating tied tickets',
      );
    }

    const math = calculateAuctionMath(
      chit.chitValue,
      BigInt(chit.totalTickets),
      bidDiscount,
      chit.foremanCommissionRate,
      chit.maxDiscountCeiling,
    );

    const sortedTicketIds = Array.from(uniqueTicketIds).sort();

    return withTransactionRetry(this.prisma, async (tx) => {
      const lockedChit = await lockChitGroupRow(tx, chitGroupId);
      if (lockedChit?.status && lockedChit.status !== ChitStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot conduct tie-break draw: Chit scheme must be ACTIVE (current status: ${lockedChit.status})`,
        );
      }

      // Deterministic sorted row locks on all tied tickets to prevent deadlocks & TOCTOU eligibility bypass
      const lockedTicketMap = new Map<
        string,
        {
          status: string;
          isPrized: boolean;
          consecutiveUnpaidMonths?: number;
          removalRequestedByUserId?: string | null;
        }
      >();
      for (const tid of sortedTicketIds) {
        const locked = await lockSubscriberTicketRow(tx, tid);
        if (locked) {
          lockedTicketMap.set(tid, locked);
        }
      }

      // 0. State Guard: Verify existing auction is not already completed or filed
      const existingAuction = await tx.auction.findUnique({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
        include: { winner: true },
      });

      if (existingAuction) {
        await lockAuctionRow(tx, existingAuction.id);
        if (
          existingAuction.status === AuctionStatus.COMPLETED ||
          existingAuction.status === AuctionStatus.MINUTES_FILED
        ) {
          throw new BadRequestException(
            `Cannot conduct tie-break draw: Auction for Month ${month} is already finalized (status: ${existingAuction.status})`,
          );
        }
      }

      // 0.1 Guardrail 8 / ADR-07: Validate EVERY participating tied ticket belongs to this group,
      //     is ACTIVE, non-prized, and has zero unpaid/overdue dues up to this month
      const tiedTicketRows = await tx.subscriberTicket.findMany({
        where: { id: { in: sortedTicketIds } },
        include: { customer: true },
      });

      const ticketById = new Map<string, any>(
        (tiedTicketRows ?? []).map((t: any) => [t.id, t]),
      );

      for (const tid of sortedTicketIds) {
        const row = ticketById.get(tid) ?? null;
        const locked = lockedTicketMap.get(tid);
        const merged = row
          ? {
              ...row,
              ...(locked
                ? {
                    status: locked.status,
                    isPrized: locked.isPrized,
                    consecutiveUnpaidMonths: locked.consecutiveUnpaidMonths,
                    removalRequestedByUserId: locked.removalRequestedByUserId,
                  }
                : {}),
            }
          : null;
        await this.assertTicketEligibleForAuction(
          tx,
          merged,
          chitGroupId,
          month,
          { notFoundAsBadRequest: true },
        );
      }

      // 1. Upsert Auction
      const auction = await tx.auction.upsert({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
        update: {
          auctionDate: parsedAuctionDate,
          status: AuctionStatus.SCHEDULED,
          bidDiscount,
          foremanCommissionRate: math.commissionRate,
          foremanCommissionAmount: math.commissionAmount,
          totalDividend: math.totalDividend,
          dividendPerTicket: math.dividendPerTicket,
          prizeMoney: math.prizeMoney,
          conductedByUserId: makerUserId,
        },
        create: {
          chitGroupId,
          installmentMonth: month,
          auctionDate: parsedAuctionDate,
          status: AuctionStatus.SCHEDULED,
          bidDiscount,
          foremanCommissionRate: math.commissionRate,
          foremanCommissionAmount: math.commissionAmount,
          totalDividend: math.totalDividend,
          dividendPerTicket: math.dividendPerTicket,
          prizeMoney: math.prizeMoney,
          conductedByUserId: makerUserId,
        },
      });

      // 2. Clear old tie-bids and record new physical paper token draws
      await tx.auctionTieBidder.deleteMany({ where: { auctionId: auction.id } });

      for (const t of dto.tiedTickets) {
        await tx.auctionTieBidder.create({
          data: {
            auctionId: auction.id,
            ticketId: t.ticketId,
            bidDiscount,
            tokenNumber: t.tokenNumber ?? null,
            isWinner: t.ticketId === dto.winningTicketId,
          },
        });
      }

      // 3. Upsert Winner marked as tie-break winner; clear prior safety proof & payout fields if winner changed (XR-AUC-01)
      const tieWinnerChanged =
        Boolean(existingAuction?.winner) &&
        existingAuction!.winner!.ticketId !== dto.winningTicketId;
      await tx.auctionWinner.upsert({
        where: { auctionId: auction.id },
        update: {
          ticketId: dto.winningTicketId,
          wasTieBreakWinner: true,
          verifiedByUserId: null,
          ...(tieWinnerChanged ? CLEARED_WINNER_SAFETY_AND_PAYOUT_FIELDS : {}),
        },
        create: {
          auctionId: auction.id,
          ticketId: dto.winningTicketId,
          wasTieBreakWinner: true,
          verifiedByUserId: null,
        },
      });

      // 4. Immutable Audit Trail for Physical Paper Token Draw
      await tx.auditLog.create({
        data: {
          userId: makerUserId,
          action: 'AUCTION_TIE_BREAK_DRAWN',
          entityType: 'Auction',
          entityId: auction.id,
          newValue: {
            installmentMonth: month,
            winningTicketId: dto.winningTicketId,
            tiedTicketCount: dto.tiedTickets.length,
            bidDiscount: bidDiscount.toString(),
            witnessNames: dto.witnessNames ?? [],
            conductedByUserId: makerUserId,
          },
        },
      });

      return tx.auction.findUnique({
        where: { id: auction.id },
        include: {
          winner: {
            include: {
              ticket: {
                include: {
                  customer: { select: { fullName: true, customerCode: true } },
                },
              },
            },
          },
          tieBidders: {
            include: {
              ticket: {
                include: {
                  customer: { select: { fullName: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Checker: commits official auction result, freezes dividends, marks ticket prized,
   * and enforces Maker != Checker + Verified Partner Identity (Guardrails 5, 8, 10, 11).
   */
  async finalizeAuction(
    auctionId: string,
    checkerUserId: string,
    dto?: FinalizeAuctionDto,
    userRoles?: string[],
  ) {
    if (userRoles && !userRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'SUPER_ADMIN_REQUIRED: Only Partners (Super Admin) are authorized to finalize and commit auctions.',
      );
    }

    await assertVerifiedPartner(
      this.prisma,
      checkerUserId,
      'finalize and commit auctions',
    );

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: true,
        winner: { include: { ticket: { include: { customer: true } } } },
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (
      auction.status === AuctionStatus.COMPLETED ||
      auction.status === AuctionStatus.MINUTES_FILED
    ) {
      throw new BadRequestException('Auction is already completed and finalized');
    }

    if (!auction.winner) {
      throw new BadRequestException(
        'Cannot finalize auction: winning ticket has not been recorded',
      );
    }

    // Guardrail 5 (XR-AUC-06): Month 1 (Company Pool) and Month >= N (Direct Maturity Settlement) have NO auctions
    if (
      auction.installmentMonth < FIRST_AUCTION_MONTH ||
      (typeof auction.chitGroup?.durationMonths === 'number' &&
        auction.installmentMonth >= auction.chitGroup.durationMonths)
    ) {
      throw new BadRequestException(
        `Guardrail 5 Violation: Month ${auction.installmentMonth} does not undergo auction finalization (Month 1 is company pool; Month N is direct final settlement).`,
      );
    }

    if (
      auction.chitGroup?.status &&
      auction.chitGroup.status !== ChitStatus.ACTIVE
    ) {
      throw new BadRequestException(
        `Cannot finalize auction: Chit scheme must be ACTIVE (current status: ${auction.chitGroup.status})`,
      );
    }

    if (!auction.conductedByUserId) {
      throw new BadRequestException(
        'Cannot finalize auction: Maker (conductedByUserId) has not been recorded for this auction',
      );
    }

    // Strict Maker != Checker Dual Control Enforcement
    if (auction.conductedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'Maker-Checker Separation of Duties Violated: The staff who recorded the auction bids cannot finalize and commit the auction result',
      );
    }

    let committedAuction = auction;

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Pessimistic Acyclic Row Locks ("ChitGroup" -> "Auction" -> "SubscriberTicket")
      if (auction.chitGroupId) {
        const lockedChit = await lockChitGroupRow(tx, auction.chitGroupId);
        if (lockedChit?.status && lockedChit.status !== ChitStatus.ACTIVE) {
          throw new BadRequestException(
            `Cannot finalize auction: Chit scheme must be ACTIVE (current status: ${lockedChit.status})`,
          );
        }
      }

      const lockedAuction = await lockAuctionRow(tx, auctionId);
      if (
        lockedAuction &&
        (lockedAuction.status === AuctionStatus.COMPLETED ||
          lockedAuction.status === AuctionStatus.MINUTES_FILED)
      ) {
        throw new BadRequestException(
          'AUCTION_ALREADY_FINALIZED: Auction has already been finalized and committed',
        );
      }

      const currentAuction =
        typeof tx.$queryRaw === 'function' &&
        typeof tx.auction?.findUnique === 'function'
          ? (await tx.auction.findUnique({
              where: { id: auctionId },
              include: {
                chitGroup: true,
                winner: { include: { ticket: { include: { customer: true } } } },
              },
            })) || auction
          : auction;

      if (
        currentAuction.status === AuctionStatus.COMPLETED ||
        currentAuction.status === AuctionStatus.MINUTES_FILED
      ) {
        throw new BadRequestException(
          'AUCTION_ALREADY_FINALIZED: Auction has already been finalized and committed',
        );
      }
      if (!currentAuction.winner) {
        throw new BadRequestException(
          'Cannot finalize auction: winning ticket has not been recorded',
        );
      }
      if (!currentAuction.conductedByUserId) {
        throw new BadRequestException(
          'Cannot finalize auction: Maker (conductedByUserId) has not been recorded for this auction',
        );
      }
      if (currentAuction.conductedByUserId === checkerUserId) {
        throw new ForbiddenException(
          'Maker-Checker Separation of Duties Violated: The staff who recorded the auction bids cannot finalize and commit the auction result',
        );
      }

      // XR-AUC-06: Re-verify Month 2..N-1 & non-null whole-rupee financial invariants inside TX lock
      if (
        currentAuction.installmentMonth < FIRST_AUCTION_MONTH ||
        (typeof currentAuction.chitGroup?.durationMonths === 'number' &&
          currentAuction.installmentMonth >= currentAuction.chitGroup.durationMonths)
      ) {
        throw new BadRequestException(
          `Guardrail 5 Violation: Month ${currentAuction.installmentMonth} does not undergo auction finalization (Month 1 is company pool; Month N is direct final settlement).`,
        );
      }

      if (
        currentAuction.bidDiscount === null ||
        currentAuction.prizeMoney === null ||
        (currentAuction.prizeMoney !== undefined && currentAuction.prizeMoney <= 0n)
      ) {
        throw new BadRequestException(
          'INVALID_AUCTION_FINANCIALS: Auction bid discount and positive prize money must be recorded before finalization.',
        );
      }

      if (
        currentAuction.bidDiscount !== undefined &&
        currentAuction.chitGroup?.chitValue !== undefined &&
        typeof currentAuction.chitGroup?.totalTickets === 'number'
      ) {
        const verifiedMath = calculateAuctionMath(
          currentAuction.chitGroup.chitValue,
          BigInt(currentAuction.chitGroup.totalTickets),
          currentAuction.bidDiscount,
          currentAuction.foremanCommissionRate ??
            currentAuction.chitGroup.foremanCommissionRate,
          currentAuction.chitGroup.maxDiscountCeiling,
        );
        if (
          currentAuction.prizeMoney !== undefined &&
          currentAuction.prizeMoney !== verifiedMath.prizeMoney
        ) {
          throw new BadRequestException(
            'INVALID_AUCTION_FINANCIALS: Recorded prize money does not match verified whole-rupee auction math.',
          );
        }
      }

      // Lock winning ticket and re-verify Guardrail 8 eligibility inside tx (TOCTOU guard)
      const lockedTicket = await lockSubscriberTicketRow(
        tx,
        currentAuction.winner.ticketId,
      );
      const winnerTicket = currentAuction.winner.ticket
        ? {
            ...currentAuction.winner.ticket,
            id: currentAuction.winner.ticketId,
            chitGroupId:
              currentAuction.winner.ticket.chitGroupId ??
              currentAuction.chitGroupId,
            ...(lockedTicket
              ? {
                  status: lockedTicket.status,
                  isPrized: lockedTicket.isPrized,
                }
              : {}),
          }
        : null;

      if (winnerTicket) {
        await this.assertTicketEligibleForAuction(
          tx,
          winnerTicket,
          currentAuction.chitGroupId,
          currentAuction.installmentMonth,
        );
      }

      committedAuction = currentAuction;

      // 1. Validate statutory attendee count BEFORE mutating rows
      const subscribersPresent = dto?.subscribersPresent;
      if (
        typeof subscribersPresent !== 'number' ||
        subscribersPresent < 1 ||
        !Number.isInteger(subscribersPresent)
      ) {
        throw new BadRequestException(
          'Statutory Invariant: Number of attending subscribers physically present must be explicitly recorded (minimum 1 subscriber)',
        );
      }

      // 2. Commit Auction
      const finalized = await tx.auction.update({
        where: { id: auctionId },
        data: {
          status: AuctionStatus.COMPLETED,
          finalizedByUserId: checkerUserId,
        },
      });

      // 3. Mark Winner Ticket as Prized
      await tx.subscriberTicket.update({
        where: { id: currentAuction.winner.ticketId },
        data: {
          isPrized: true,
          prizedAuctionId: auction.id,
        },
      });

      // 4. Generate Statutory Auction Minutes (Section 17 Tamil Nadu Chit Funds Rules)
      const winnerName = currentAuction.winner.ticket.customer.fullName;
      const ticketNo = currentAuction.winner.ticket.ticketNumber;
      const discountBigInt = currentAuction.bidDiscount ?? 0n;
      const commissionBigInt = currentAuction.foremanCommissionAmount ?? 0n;
      const dividendBigInt = currentAuction.dividendPerTicket ?? 0n;
      const prizeBigInt = currentAuction.prizeMoney ?? 0n;

      const { normalizedRate } = parseCommissionRateToBps(
        currentAuction.foremanCommissionRate ??
          currentAuction.chitGroup?.foremanCommissionRate ??
          FOREMAN_COMMISSION_PERCENT,
      );

      const minutesText = formatStatutoryAuctionMinutesText({
        installmentMonth: currentAuction.installmentMonth,
        groupName: currentAuction.chitGroup.groupName,
        groupCode: currentAuction.chitGroup.groupCode,
        auctionDate: currentAuction.auctionDate,
        subscribersPresent,
        winningTicketNumber: ticketNo,
        winnerName,
        bidDiscount: discountBigInt,
        commissionRatePercentLabel: `${normalizedRate}%`,
        commissionAmount: commissionBigInt,
        dividendPerTicket: dividendBigInt,
        prizeMoney: prizeBigInt,
        notes: dto?.notes,
      });

      await tx.auctionMinutes.upsert({
        where: { auctionId },
        update: {
          subscribersPresent,
          minutesText,
          signedByForeman: Boolean(dto?.signedByForeman),
        },
        create: {
          auctionId,
          subscribersPresent,
          minutesText,
          signedByForeman: Boolean(dto?.signedByForeman),
        },
      });

      // 5. Immutable Audit Trail
      await tx.auditLog.create({
        data: {
          userId: checkerUserId,
          action: 'AUCTION_FINALIZED',
          entityType: 'Auction',
          entityId: auctionId,
          newValue: {
            installmentMonth: currentAuction.installmentMonth,
            winnerTicketId: currentAuction.winner.ticketId,
            winnerTicketNumber: ticketNo,
            bidDiscount: discountBigInt.toString(),
            foremanCommissionRate: `${normalizedRate}%`,
            dividendPerTicket: dividendBigInt.toString(),
            prizeMoney: prizeBigInt.toString(),
            finalizedByUserId: checkerUserId,
          },
        },
      });

      return tx.auction.findUnique({
        where: { id: finalized.id },
        include: {
          winner: {
            include: {
              ticket: {
                include: {
                  customer: { select: { fullName: true, customerCode: true } },
                },
              },
            },
          },
          minutes: true,
        },
      });
    });

    // Post-commit: Broadcast auction results to chit group subscribers (Non-blocking)
    const queue = this.queueProvider;
    if (queue && committedAuction && committedAuction.chitGroup) {
      try {
        const tickets = await this.prisma.subscriberTicket.findMany({
          where: {
            chitGroupId: committedAuction.chitGroupId,
            status: 'ACTIVE',
          },
          include: {
            customer: {
              select: {
                fullName: true,
                phone: true,
                fcmToken: true,
              },
            },
          },
        });

        const dividendPerTicket = committedAuction.dividendPerTicket ?? 0n;
        const nextMonthNetPayable = (
          committedAuction.chitGroup.baseInstallment - dividendPerTicket
        ).toString();

        const payload: AuctionResultNotificationJobPayload = {
          chitGroupId: committedAuction.chitGroupId,
          chitCode: committedAuction.chitGroup.groupCode,
          installmentMonth: committedAuction.installmentMonth,
          winningTicketNumber: committedAuction.winner!.ticket.ticketNumber,
          winningDiscountAmount: (
            committedAuction.bidDiscount ?? 0n
          ).toString(),
          dividendPerTicket: dividendPerTicket.toString(),
          nextMonthNetPayable,
          subscribers: tickets.map((t) => ({
            name: t.customer.fullName,
            phone: t.customer.phone,
            fcmToken: t.customer.fcmToken || undefined,
          })),
        };

        await queue.addJob(
          NOTIFICATION_QUEUE,
          JOB_DISPATCH_AUCTION_RESULT,
          payload,
          {
            jobId: `auction-result-${committedAuction.id}-m${committedAuction.installmentMonth}`,
            priority: 5,
          },
        );
        this.logger.log(
          `Enqueued auction result notification for group ${committedAuction.chitGroup.groupCode} Month ${committedAuction.installmentMonth} (${tickets.length} subscribers)`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to enqueue auction result notification: ${err.message}`,
        );
      }
    }

    // Post-commit: Proactively invalidate executive dashboard and daybook report caches in Redis
    await this.invalidateReportCaches(committedAuction.chitGroup?.branchId);

    return result;
  }

  /**
   * Retrieves statutory auction minutes text for printing and filing (Branch-scoped Anti-BOLA)
   */
  async getAuctionMinutes(auctionId: string, currentUser?: JwtPayload) {
    const minutes = await this.prisma.auctionMinutes.findUnique({
      where: { auctionId },
      include: { auction: { include: { chitGroup: true } } },
    });

    if (!minutes) {
      throw new NotFoundException('Auction minutes not found for this auction');
    }

    assertAuctionBranchAccess(minutes.auction?.chitGroup?.branchId, currentUser);

    return minutes;
  }

  /**
   * Lists all past and scheduled auctions for a chit group.
   * Enforces group membership scoping and fellow subscriber PII masking (F08).
   */
  async getGroupAuctions(chitGroupId: string, currentUser?: JwtPayload) {
    if (currentUser) {
      if (
        currentUser.roles.includes(Role.CUSTOMER) &&
        !currentUser.roles.some((r: Role) => r !== Role.CUSTOMER)
      ) {
        const ownTicket = await this.prisma.subscriberTicket.findFirst({
          where: { chitGroupId, customerId: currentUser.sub },
          select: { id: true },
        });
        if (!ownTicket) {
          throw new ForbiddenException(
            'Access denied: You do not belong to this chit scheme',
          );
        }
      } else {
        const isBranchScoped =
          (currentUser.roles.includes(Role.BRANCH_MANAGER) ||
            currentUser.roles.includes(Role.COLLECTION_AGENT)) &&
          !currentUser.roles.includes(Role.SUPER_ADMIN) &&
          !currentUser.roles.includes(Role.AUDITOR) &&
          !currentUser.roles.includes(Role.ACCOUNTANT);

        if (isBranchScoped) {
          if (!currentUser.branchId) {
            assertAuctionBranchAccess(null, currentUser);
          }
          const chit = await this.prisma.chitGroup.findUnique({
            where: { id: chitGroupId },
            select: { branchId: true },
          });
          assertAuctionBranchAccess(chit?.branchId, currentUser);
        }
      }
    }

    const auctions = await this.prisma.auction.findMany({
      where: { chitGroupId },
      orderBy: { installmentMonth: 'asc' },
      include: {
        winner: {
          include: {
            ticket: {
              include: {
                customer: {
                  select: { customerCode: true, fullName: true, phone: true },
                },
              },
            },
          },
        },
        tieBidders: true,
        minutes: true,
      },
    });

    if (isPureCustomer(currentUser)) {
      return auctions.map((a) => sanitizeAuctionForCustomer(a, currentUser!.sub));
    }

    return auctions;
  }

  /**
   * Resolves any unapproved AUCTION_CORRECTION_REQUESTED audit record for staff/auditor review (XR-WM-02).
   */
  private async resolvePendingCorrection(auctionId: string) {
    if (typeof this.prisma.auditLog?.findFirst !== 'function') {
      return null;
    }

    const latestRequest = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'Auction',
        entityId: auctionId,
        action: 'AUCTION_CORRECTION_REQUESTED',
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!latestRequest || !latestRequest.newValue) {
      return null;
    }

    const latestApproval = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'Auction',
        entityId: auctionId,
        action: 'AUCTION_CORRECTION_APPROVED',
      },
      orderBy: { timestamp: 'desc' },
    });

    const latestRejection = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'Auction',
        entityId: auctionId,
        action: 'AUCTION_CORRECTION_REJECTED',
      },
      orderBy: { timestamp: 'desc' },
    });

    const alreadyApproved =
      latestApproval &&
      latestApproval.id !== latestRequest.id &&
      ((latestApproval.newValue as any)?.correctionRequestId === latestRequest.id ||
        (latestApproval.timestamp instanceof Date &&
          latestRequest.timestamp instanceof Date &&
          latestApproval.timestamp.getTime() >= latestRequest.timestamp.getTime()));

    const alreadyRejected =
      latestRejection &&
      latestRejection.id !== latestRequest.id &&
      ((latestRejection.newValue as any)?.correctionRequestId === latestRequest.id ||
        (latestRejection.timestamp instanceof Date &&
          latestRequest.timestamp instanceof Date &&
          latestRejection.timestamp.getTime() >= latestRequest.timestamp.getTime()));

    if (alreadyApproved || alreadyRejected) {
      return null;
    }

    const reqVal = latestRequest.newValue as any;
    const parsedDiscount = Number(reqVal.correctedBidDiscount);
    if (!Number.isFinite(parsedDiscount)) {
      return null;
    }

    return {
      requestId: latestRequest.id,
      requestedByUserId: latestRequest.userId ?? reqVal.requestedByUserId ?? '',
      correctedBidDiscount: parsedDiscount,
      correctedWinningTicketId: reqVal.correctedWinningTicketId ?? null,
      correctedTicketNumber: reqVal.correctedTicketNumber ?? null,
      reason: reqVal.reason ?? '',
      notes: reqVal.notes ?? null,
      requestedAt:
        latestRequest.timestamp instanceof Date
          ? latestRequest.timestamp.toISOString()
          : String(latestRequest.timestamp ?? ''),
    };
  }

  /**
   * Retrieves single auction with full details (Group membership & Branch Anti-BOLA + PII/Minutes sanitization)
   */
  async findOne(id: string, currentUser?: JwtPayload) {
    const auction = await this.prisma.auction.findUnique({
      where: { id },
      include: {
        chitGroup: {
          select: {
            id: true,
            groupCode: true,
            groupName: true,
            chitValue: true,
            durationMonths: true,
            maxDiscountCeiling: true,
            branchId: true,
          },
        },
        winner: {
          include: {
            ticket: {
              include: {
                customer: {
                  select: {
                    id: true,
                    customerCode: true,
                    fullName: true,
                    fullNameTamil: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        tieBidders: {
          include: {
            ticket: {
              include: {
                customer: {
                  select: {
                    id: true,
                    customerCode: true,
                    fullName: true,
                    fullNameTamil: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        minutes: true,
      },
    });

    if (!auction) {
      throw new NotFoundException(`Auction with ID ${id} not found`);
    }

    if (currentUser) {
      if (isPureCustomer(currentUser)) {
        const ownTicket = await this.prisma.subscriberTicket.findFirst({
          where: {
            chitGroupId: auction.chitGroupId,
            customerId: currentUser.sub,
          },
          select: { id: true },
        });
        if (!ownTicket) {
          throw new ForbiddenException(
            'Access denied: You do not belong to this chit scheme',
          );
        }
      } else {
        assertAuctionBranchAccess(auction.chitGroup?.branchId, currentUser);
      }
    }

    // XR-AUC-02: Pure customers never receive Form XVII minutes, pendingCorrection, or fellow winners' collateral/bank PII
    if (isPureCustomer(currentUser)) {
      return sanitizeAuctionForCustomer(
        { ...auction, pendingCorrection: null },
        currentUser!.sub,
      );
    }

    const pendingCorrection = await this.resolvePendingCorrection(id);
    return {
      ...auction,
      pendingCorrection,
    };
  }

  /**
   * Pre-Auction Defaulter Guard resolving either Auction UUID or ChitGroup UUID
   */
  async getEligibleBiddersForIdentifier(
    id: string,
    monthParam?: number,
    currentUser?: JwtPayload,
  ) {
    const auction = await this.prisma.auction.findUnique({ where: { id } });
    if (auction) {
      if (monthParam !== undefined && monthParam !== auction.installmentMonth) {
        throw new BadRequestException(
          `Installment month in query (Month ${monthParam}) does not match auction record (Month ${auction.installmentMonth})`,
        );
      }
      return this.getEligibleBidders(
        auction.chitGroupId,
        auction.installmentMonth,
        currentUser,
      );
    }

    const chit = await this.prisma.chitGroup.findUnique({ where: { id } });
    if (chit) {
      // XR-AUC-07: Fail closed when ChitGroup UUID omits required ?month= query param
      if (monthParam === undefined) {
        throw new BadRequestException(
          'Installment month is required when querying eligible bidders by chit group ID',
        );
      }
      return this.getEligibleBidders(chit.id, monthParam, currentUser);
    }

    throw new NotFoundException('Auction or Chit group not found');
  }

  /**
   * Maker: Record bid resolving either Auction UUID or ChitGroup UUID + month
   */
  async recordBidForIdentifier(
    id: string,
    dto: RecordBidDto,
    makerUserId: string,
    monthParam?: number,
    currentUser?: JwtPayload,
  ) {
    const auction = await this.prisma.auction.findUnique({ where: { id } });
    if (auction) {
      if (monthParam !== undefined && monthParam !== auction.installmentMonth) {
        throw new BadRequestException(
          `Installment month in query (Month ${monthParam}) does not match auction record (Month ${auction.installmentMonth})`,
        );
      }
      return this.recordBid(
        auction.chitGroupId,
        auction.installmentMonth,
        dto,
        makerUserId,
        currentUser,
      );
    }

    const chit = await this.prisma.chitGroup.findUnique({ where: { id } });
    if (chit) {
      if (!monthParam) {
        throw new BadRequestException(
          'Installment month is required when recording bid by chit group ID',
        );
      }
      return this.recordBid(chit.id, monthParam, dto, makerUserId, currentUser);
    }

    throw new NotFoundException('Auction or Chit group not found');
  }

  /**
   * Option A: Record tie-break resolving either Auction UUID or ChitGroup UUID + month
   */
  async recordTieBreakForIdentifier(
    id: string,
    dto: RecordTieBreakDto,
    makerUserId: string,
    monthParam?: number,
    currentUser?: JwtPayload,
  ) {
    const auction = await this.prisma.auction.findUnique({ where: { id } });
    if (auction) {
      if (monthParam !== undefined && monthParam !== auction.installmentMonth) {
        throw new BadRequestException(
          `Installment month in query (Month ${monthParam}) does not match auction record (Month ${auction.installmentMonth})`,
        );
      }
      return this.recordTieBreak(
        auction.chitGroupId,
        auction.installmentMonth,
        dto,
        makerUserId,
        currentUser,
      );
    }

    const chit = await this.prisma.chitGroup.findUnique({ where: { id } });
    if (chit) {
      if (!monthParam) {
        throw new BadRequestException(
          'Installment month is required when recording tie-break by chit group ID',
        );
      }
      return this.recordTieBreak(
        chit.id,
        monthParam,
        dto,
        makerUserId,
        currentUser,
      );
    }

    throw new NotFoundException('Auction or Chit group not found');
  }

  /**
   * Marks Form XVII statutory auction minutes as filed with the Deputy Registrar of Chits office.
   * Atomically transitions Auction.status from COMPLETED -> MINUTES_FILED (Matrix 3) under
   * pessimistic Auction -> AuctionMinutes row locks with branch-scoped Anti-BOLA enforcement.
   */
  async markMinutesFiled(
    auctionId: string,
    dto: MarkMinutesFiledDto,
    userId: string,
    currentUser?: JwtPayload,
  ) {
    // XR-AUC-05: Block non-partner IT Super Admins (without BM/Accountant operational role)
    if (currentUser) {
      const roles = currentUser.roles ?? [];
      if (
        roles.includes(Role.SUPER_ADMIN) &&
        !roles.includes(Role.BRANCH_MANAGER) &&
        !roles.includes(Role.ACCOUNTANT)
      ) {
        await assertVerifiedPartner(
          this.prisma,
          userId,
          'mark statutory auction minutes as filed with Registrar',
        );
      }
    }

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { minutes: true, chitGroup: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    assertAuctionBranchAccess(auction.chitGroup?.branchId, currentUser);

    if (auction.status === AuctionStatus.MINUTES_FILED) {
      throw new BadRequestException(
        'Statutory auction minutes have already been filed with the Registrar for this auction',
      );
    }

    if (auction.status !== AuctionStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot mark minutes as filed: Auction has not yet been finalized',
      );
    }

    if (!auction.minutes) {
      throw new BadRequestException(
        'Cannot mark minutes as filed: Auction minutes have not been generated for this auction',
      );
    }

    const trimmedRef = (dto.filingReference ?? '').trim();
    if (!trimmedRef) {
      throw new BadRequestException(
        'FILING_REFERENCE_REQUIRED: Government challan or filing reference is required and cannot be blank',
      );
    }

    const filedDate = dto.filedDate
      ? this.parseValidDate(dto.filedDate, 'Filed date')
      : new Date();

    if (filedDate < auction.auctionDate) {
      throw new BadRequestException(
        'FILED_DATE_BEFORE_AUCTION: Filing date cannot be prior to auction date.',
      );
    }

    if (filedDate > new Date()) {
      throw new BadRequestException(
        'FILED_DATE_IN_FUTURE: Filing date cannot be in the future.',
      );
    }

    const compliance = computeRegistrarFilingCompliance(
      auction.auctionDate,
      true,
      filedDate,
    );

    const updated = await withTransactionRetry(this.prisma, async (tx) => {
      // Lock Auction -> AuctionMinutes strictly in DAG order
      const lockedAuction = await lockAuctionRow(tx, auctionId);
      if (lockedAuction?.status === AuctionStatus.MINUTES_FILED) {
        throw new BadRequestException(
          'MINUTES_ALREADY_FILED: Statutory auction minutes have already been filed with the Registrar',
        );
      }
      if (
        lockedAuction?.status &&
        lockedAuction.status !== AuctionStatus.COMPLETED
      ) {
        throw new BadRequestException(
          'Cannot mark minutes as filed: Auction has not yet been finalized',
        );
      }

      const lockedMinute = await lockAuctionMinutesRow(tx, auctionId);
      if (lockedMinute?.filedAtRegistrar === true) {
        throw new BadRequestException(
          'MINUTES_ALREADY_FILED: Statutory auction minutes have already been filed with the Registrar',
        );
      }

      await tx.auction.update({
        where: { id: auctionId },
        data: { status: AuctionStatus.MINUTES_FILED },
      });

      const minutes = await tx.auctionMinutes.update({
        where: { auctionId },
        data: {
          filedAtRegistrar: true,
          filedDate,
          filingReference: trimmedRef,
          filingNotes: dto.notes?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'MINUTES_FILED_AT_REGISTRAR',
          entityType: 'AuctionMinutes',
          entityId: minutes.id,
          newValue: {
            auctionId,
            auctionStatus: AuctionStatus.MINUTES_FILED,
            groupCode: auction.chitGroup.groupCode,
            installmentMonth: auction.installmentMonth,
            filedAtRegistrar: true,
            filedDate,
            filingReference: trimmedRef,
            filingDeadline: compliance.filingDeadline,
            filingStatus: compliance.filingStatus,
            isDelayedFiling: compliance.filingStatus === 'FILED_LATE',
          },
        },
      });

      return minutes;
    });

    return {
      message: 'Auction minutes marked as filed with Registrar successfully.',
      minutes: updated,
    };
  }

  /**
   * KFC-FIN-005 / Q12: Maker Partner requests correction of a finalized auction.
   * Enforces verified partner identity (Guardrail 11), Month 2..N-1 (Guardrail 5),
   * frozen commission floor & 1/4 ceiling (Guardrails 3 & 6), exact divisibility (Guardrail 2),
   * winner eligibility (Guardrail 8), disbursed immutability, and FIN-E paid-dues guard.
   */
  async requestAuctionCorrection(
    auctionId: string,
    partnerUserId: string,
    dto: RequestAuctionCorrectionDto,
    userRoles?: string[],
  ) {
    if (userRoles && !userRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'SUPER_ADMIN_REQUIRED: Only Partners (Super Admin) are authorized to request auction corrections.',
      );
    }

    await assertVerifiedPartner(
      this.prisma,
      partnerUserId,
      'request auction corrections',
    );

    // XR-AUC-08: Trim and strictly reject blank/whitespace-only justification reasons
    const trimmedReason = (dto.reason ?? '').trim();
    if (!trimmedReason) {
      throw new BadRequestException(
        'CORRECTION_REASON_REQUIRED: Correction reason is required and cannot be blank',
      );
    }

    const preflightAuction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: true,
        winner: { include: { ticket: true } },
      },
    });

    if (!preflightAuction) {
      throw new NotFoundException('Auction record not found');
    }

    // XR-AUC-03: Closed/completed schemes cannot be mutated via auction correction
    if (
      preflightAuction.chitGroup?.status &&
      preflightAuction.chitGroup.status !== ChitStatus.ACTIVE
    ) {
      throw new BadRequestException(
        `Cannot request auction correction: Chit scheme must be ACTIVE (current status: ${preflightAuction.chitGroup.status})`,
      );
    }

    if (
      preflightAuction.status !== AuctionStatus.COMPLETED &&
      preflightAuction.status !== AuctionStatus.MINUTES_FILED
    ) {
      throw new BadRequestException(
        `AUCTION_NOT_FINALIZED: Only finalized auctions can be corrected (current status: ${preflightAuction.status})`,
      );
    }

    // Guardrail 5: Month 1 company pool and Month N maturity settlement cannot be auction-corrected
    if (
      preflightAuction.installmentMonth < FIRST_AUCTION_MONTH ||
      preflightAuction.installmentMonth >= preflightAuction.chitGroup.durationMonths
    ) {
      throw new BadRequestException(
        `Guardrail 5 Violation: Month ${preflightAuction.installmentMonth} cannot be modified via auction correction (only Months 2 through ${preflightAuction.chitGroup.durationMonths - 1} are auctions).`,
      );
    }

    // Safety Invariant: Disbursed prize money is mathematically and legally immutable
    if (preflightAuction.winner?.disbursementStatus === 'DISBURSED') {
      throw new BadRequestException(
        'DISBURSED_PRIZE_IMMUTABLE: Cannot correct an auction whose prize money has already been disbursed to the winner.',
      );
    }

    const correctedDiscount = toWholeRupeeBigInt(
      dto.correctedBidDiscount,
      'correctedBidDiscount',
      { min: 1n },
    );

    // M9-DUAL-DEF-08: Reject zero-change no-op correction requests
    if (
      Number(correctedDiscount) === Number(preflightAuction.bidDiscount) &&
      (!dto.correctedWinningTicketId ||
        dto.correctedWinningTicketId === preflightAuction.winner?.ticketId)
    ) {
      throw new BadRequestException(
        'NO_CHANGES_DETECTED: Requested correction values are identical to current finalized auction values.',
      );
    }

    // Guardrails 2, 3, 6: Validate frozen commission floor (D >= Cf), 1/4 ceiling (D <= V/4),
    // and exact whole-rupee dividend divisibility (KFC-FIN-002)
    const math = calculateAuctionMath(
      preflightAuction.chitGroup.chitValue,
      BigInt(preflightAuction.chitGroup.totalTickets),
      correctedDiscount,
      preflightAuction.foremanCommissionRate ?? preflightAuction.chitGroup.foremanCommissionRate,
      preflightAuction.chitGroup.maxDiscountCeiling,
    );

    const log = await withTransactionRetry(this.prisma, async (tx) => {
      // M9-DUAL-DEF-05: Enforce strict monotonic DAG lock order: ChitGroup -> Auction -> AuctionWinner
      const lockedChit = await lockChitGroupRow(tx, preflightAuction.chitGroupId);
      if (lockedChit?.status && lockedChit.status !== ChitStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot request auction correction: Chit scheme must be ACTIVE (current status: ${lockedChit.status})`,
        );
      }

      const lockedAuction = await lockAuctionRow(tx, auctionId);
      const authoritativeStatus = lockedAuction?.status ?? preflightAuction.status;
      if (
        authoritativeStatus !== AuctionStatus.COMPLETED &&
        authoritativeStatus !== AuctionStatus.MINUTES_FILED
      ) {
        throw new BadRequestException(
          `AUCTION_NOT_FINALIZED: Only finalized auctions can be corrected (current status: ${authoritativeStatus})`,
        );
      }

      const lockedWinner = preflightAuction.winner
        ? await lockAuctionWinnerRow(tx, preflightAuction.winner.id)
        : null;
      const authoritativeDisbursementStatus =
        lockedWinner?.disbursementStatus ?? preflightAuction.winner?.disbursementStatus;
      if (authoritativeDisbursementStatus === 'DISBURSED') {
        throw new BadRequestException(
          'DISBURSED_PRIZE_IMMUTABLE: Cannot correct an auction whose prize money has already been disbursed to the winner.',
        );
      }

      // Check whether an unresolved correction request is already pending
      const latestRequest = await tx.auditLog.findFirst({
        where: {
          entityType: 'Auction',
          entityId: auctionId,
          action: 'AUCTION_CORRECTION_REQUESTED',
        },
        orderBy: { timestamp: 'desc' },
      });

      if (latestRequest) {
        const latestApproval = await tx.auditLog.findFirst({
          where: {
            entityType: 'Auction',
            entityId: auctionId,
            action: 'AUCTION_CORRECTION_APPROVED',
          },
          orderBy: { timestamp: 'desc' },
        });

        const latestRejection = await tx.auditLog.findFirst({
          where: {
            entityType: 'Auction',
            entityId: auctionId,
            action: 'AUCTION_CORRECTION_REJECTED',
          },
          orderBy: { timestamp: 'desc' },
        });

        const isResolvedByApproval =
          latestApproval &&
          ((latestApproval.newValue as any)?.correctionRequestId === latestRequest.id ||
            (latestApproval.timestamp instanceof Date &&
              latestRequest.timestamp instanceof Date &&
              latestApproval.timestamp.getTime() >= latestRequest.timestamp.getTime()));

        const isResolvedByRejection =
          latestRejection &&
          ((latestRejection.newValue as any)?.correctionRequestId === latestRequest.id ||
            (latestRejection.timestamp instanceof Date &&
              latestRequest.timestamp instanceof Date &&
              latestRejection.timestamp.getTime() >= latestRequest.timestamp.getTime()));

        if (!isResolvedByApproval && !isResolvedByRejection) {
          throw new BadRequestException(
            'PENDING_CORRECTION_EXISTS: An unapproved correction request is already pending review for this auction.',
          );
        }
      }

      // FIN-E: Lock all Month N+1 InstallmentDue rows in deterministic ORDER BY id FOR UPDATE
      // to eliminate TOCTOU races with concurrent recordPayment
      const nextMonth = preflightAuction.installmentMonth + 1;
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`
          SELECT id FROM "InstallmentDue"
          WHERE "chitGroupId" = ${preflightAuction.chitGroupId}
            AND "installmentMonth" = ${nextMonth}
          ORDER BY id FOR UPDATE
        `;
      }

      if (typeof tx.installmentDue?.findMany === 'function') {
        const nextMonthPaidDues = await tx.installmentDue.findMany({
          where: {
            chitGroupId: preflightAuction.chitGroupId,
            installmentMonth: nextMonth,
            status: DueStatus.PAID,
          },
        });

        if (nextMonthPaidDues.length > 0) {
          throw new BadRequestException(
            `ALREADY_PAID_DUES_EXIST: Cannot request correction for Month ${preflightAuction.installmentMonth} auction because ${nextMonthPaidDues.length} subscriber(s) have already paid dues for Month ${nextMonth}. Correction would invalidate settled financial history.`,
          );
        }
      }

      let correctedTicket: any = null;
      if (dto.correctedWinningTicketId) {
        await lockSubscriberTicketRow(tx, dto.correctedWinningTicketId);
        correctedTicket = await tx.subscriberTicket.findUnique({
          where: { id: dto.correctedWinningTicketId },
          include: { customer: true },
        });

        await this.assertTicketEligibleForAuction(
          tx,
          correctedTicket,
          preflightAuction.chitGroupId,
          preflightAuction.installmentMonth,
          {
            allowExistingWinnerTicketId: preflightAuction.winner?.ticketId ?? null,
            notFoundAsBadRequest: true,
          },
        );
      }

      return await tx.auditLog.create({
        data: {
          userId: partnerUserId,
          action: 'AUCTION_CORRECTION_REQUESTED',
          entityType: 'Auction',
          entityId: auctionId,
          oldValue: {
            bidDiscount: preflightAuction.bidDiscount?.toString(),
            prizeMoney: preflightAuction.prizeMoney?.toString(),
            dividendPerTicket: preflightAuction.dividendPerTicket?.toString(),
            ticketId: preflightAuction.winner?.ticketId,
            ticketNumber: preflightAuction.winner?.ticket?.ticketNumber,
          },
          newValue: {
            correctedBidDiscount: correctedDiscount.toString(),
            correctedPrizeMoney: math.prizeMoney.toString(),
            correctedDividendPerTicket: math.dividendPerTicket.toString(),
            correctedWinningTicketId:
              dto.correctedWinningTicketId || preflightAuction.winner?.ticketId,
            correctedTicketNumber:
              correctedTicket?.ticketNumber || preflightAuction.winner?.ticket?.ticketNumber,
            reason: trimmedReason,
            notes: dto.notes?.trim() || null,
            requestedByUserId: partnerUserId,
          },
        },
      });
    });

    return {
      success: true,
      message: `Auction Month ${preflightAuction.installmentMonth} correction requested. An independent Partner must review and authorize approval.`,
      correctionRequestId: log.id,
      auctionId,
      correctedMath: {
        bidDiscount: Number(correctedDiscount),
        foremanCommission: Number(math.commissionAmount),
        totalDividend: Number(math.totalDividend),
        dividendPerTicket: Number(math.dividendPerTicket),
        prizeMoney: Number(math.prizeMoney),
      },
    };
  }

  /**
   * KFC-FIN-005 / Q12: Independent Checker Partner approves auction correction.
   * Strictly enforces Maker != Checker (Guardrail 10), verified partner identity (Guardrail 11),
   * replay prevention, pessimistic DAG locking, in-TX re-fetch (XR-AUC-03), ACTIVE scheme guard,
   * full safety-proof/collateral reset & tie-bidder resync on winner swap (XR-AUC-01),
   * payout re-authorization reset, Form XVII minutes re-filing reset & synchronization,
   * and downstream unpaid dues reconciliation.
   */
  async approveAuctionCorrection(
    auctionId: string,
    checkerPartnerUserId: string,
    dto?: ApproveAuctionCorrectionDto,
    userRoles?: string[],
  ) {
    if (userRoles && !userRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'SUPER_ADMIN_REQUIRED: Only Partners (Super Admin) are authorized to approve auction corrections.',
      );
    }

    await assertVerifiedPartner(
      this.prisma,
      checkerPartnerUserId,
      'approve auction corrections',
    );

    const preflightAuction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: true,
        winner: { include: { ticket: { include: { customer: true } } } },
        minutes: true,
        tieBidders: true,
      },
    });

    if (!preflightAuction) {
      throw new NotFoundException('Auction record not found');
    }

    if (
      preflightAuction.chitGroup?.status &&
      preflightAuction.chitGroup.status !== ChitStatus.ACTIVE
    ) {
      throw new BadRequestException(
        `Cannot approve auction correction: Chit scheme must be ACTIVE (current status: ${preflightAuction.chitGroup.status})`,
      );
    }

    let committedBranchId: string | null | undefined =
      preflightAuction.chitGroup?.branchId;
    let committedMonth = preflightAuction.installmentMonth;

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Pessimistic Acyclic Row Locks: ChitGroup -> Auction
      const lockedChit = await lockChitGroupRow(tx, preflightAuction.chitGroupId);
      if (lockedChit?.status && lockedChit.status !== ChitStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot approve auction correction: Chit scheme must be ACTIVE (current status: ${lockedChit.status})`,
        );
      }

      const lockedAuction = await lockAuctionRow(tx, auctionId);

      // XR-AUC-03: Re-fetch authoritative auction (with winner, chitGroup, minutes, tieBidders) INSIDE TX lock
      const auction =
        typeof tx.auction?.findUnique === 'function'
          ? (await tx.auction.findUnique({
              where: { id: auctionId },
              include: {
                chitGroup: true,
                winner: { include: { ticket: { include: { customer: true } } } },
                minutes: true,
                tieBidders: true,
              },
            })) || preflightAuction
          : preflightAuction;

      const authoritativeStatus = lockedAuction?.status ?? auction.status;
      if (
        authoritativeStatus !== AuctionStatus.COMPLETED &&
        authoritativeStatus !== AuctionStatus.MINUTES_FILED
      ) {
        throw new BadRequestException(
          `AUCTION_NOT_FINALIZED: Only finalized auctions can be corrected (current status: ${authoritativeStatus})`,
        );
      }

      if (
        auction.chitGroup?.status &&
        auction.chitGroup.status !== ChitStatus.ACTIVE
      ) {
        throw new BadRequestException(
          `Cannot approve auction correction: Chit scheme must be ACTIVE (current status: ${auction.chitGroup.status})`,
        );
      }

      if (
        auction.installmentMonth < FIRST_AUCTION_MONTH ||
        auction.installmentMonth >= auction.chitGroup.durationMonths
      ) {
        throw new BadRequestException(
          `Guardrail 5 Violation: Month ${auction.installmentMonth} cannot be modified via auction correction (only Months 2 through ${auction.chitGroup.durationMonths - 1} are auctions).`,
        );
      }

      // Lock AuctionWinner BEFORE checking disbursement state
      const lockedWinner = auction.winner
        ? await lockAuctionWinnerRow(tx, auction.winner.id)
        : null;

      const authoritativeDisbursementStatus =
        lockedWinner?.disbursementStatus ?? auction.winner?.disbursementStatus;

      if (authoritativeDisbursementStatus === 'DISBURSED') {
        throw new BadRequestException(
          'DISBURSED_PRIZE_IMMUTABLE: Cannot correct an auction whose prize money has already been disbursed to the winner.',
        );
      }

      // 0.1 XR-AUC-03: Fetch authoritative latest correction request & approval INSIDE lock (eliminates TOCTOU)
      const pendingRequest = await tx.auditLog.findFirst({
        where: {
          entityType: 'Auction',
          entityId: auctionId,
          action: 'AUCTION_CORRECTION_REQUESTED',
        },
        orderBy: { timestamp: 'desc' },
      });

      if (!pendingRequest || !pendingRequest.newValue) {
        throw new BadRequestException(
          'NO_PENDING_CORRECTION: No pending correction request found for this auction.',
        );
      }

      // Strict Maker != Checker Dual Control
      if (pendingRequest.userId === checkerPartnerUserId) {
        throw new ForbiddenException(
          'Maker-Checker Separation of Duties Violated: The Partner who requested the auction correction cannot approve it. An independent Partner must review and authorize.',
        );
      }

      if (typeof tx.auditLog?.findFirst === 'function') {
        const latestApproval = await tx.auditLog.findFirst({
          where: {
            entityType: 'Auction',
            entityId: auctionId,
            action: 'AUCTION_CORRECTION_APPROVED',
          },
          orderBy: { timestamp: 'desc' },
        });

        const alreadyApproved =
          latestApproval &&
          latestApproval.id !== pendingRequest.id &&
          ((latestApproval.newValue as any)?.correctionRequestId ===
            pendingRequest.id ||
            (latestApproval.timestamp instanceof Date &&
              pendingRequest.timestamp instanceof Date &&
              latestApproval.timestamp.getTime() >=
                pendingRequest.timestamp.getTime()));

        if (alreadyApproved) {
          throw new BadRequestException(
            'NO_PENDING_CORRECTION: This auction correction request has already been approved.',
          );
        }

        const latestRejection = await tx.auditLog.findFirst({
          where: {
            entityType: 'Auction',
            entityId: auctionId,
            action: 'AUCTION_CORRECTION_REJECTED',
          },
          orderBy: { timestamp: 'desc' },
        });

        const alreadyRejected =
          latestRejection &&
          latestRejection.id !== pendingRequest.id &&
          ((latestRejection.newValue as any)?.correctionRequestId ===
            pendingRequest.id ||
            (latestRejection.timestamp instanceof Date &&
              pendingRequest.timestamp instanceof Date &&
              latestRejection.timestamp.getTime() >=
                pendingRequest.timestamp.getTime()));

        if (alreadyRejected) {
          throw new BadRequestException(
            'NO_PENDING_CORRECTION: This auction correction request has already been rejected.',
          );
        }
      }

      const reqData = pendingRequest.newValue as any;
      const correctedDiscount = toWholeRupeeBigInt(
        BigInt(reqData.correctedBidDiscount),
        'correctedBidDiscount',
        { min: 1n },
      );
      const correctedTicketId: string | undefined =
        reqData.correctedWinningTicketId || auction.winner?.ticketId;

      const math = calculateAuctionMath(
        auction.chitGroup.chitValue,
        BigInt(auction.chitGroup.totalTickets),
        correctedDiscount,
        auction.foremanCommissionRate ?? auction.chitGroup.foremanCommissionRate,
        auction.chitGroup.maxDiscountCeiling,
      );

      // Derive ticket locks strictly from authoritative locked auction & request
      const ticketIdsToLock = Array.from(
        new Set(
          [auction.winner?.ticketId, correctedTicketId].filter(
            (tid): tid is string => Boolean(tid),
          ),
        ),
      ).sort();

      const lockedTickets = new Map<
        string,
        {
          status: string;
          isPrized: boolean;
          consecutiveUnpaidMonths?: number;
          removalRequestedByUserId?: string | null;
        }
      >();
      for (const tid of ticketIdsToLock) {
        const locked = await lockSubscriberTicketRow(tx, tid);
        if (locked) {
          lockedTickets.set(tid, locked);
        }
      }

      // 0.2 Re-verify replacement ticket eligibility inside tx if winner changed
      const isWinnerChanging = Boolean(
        auction.winner &&
          correctedTicketId &&
          auction.winner.ticketId !== correctedTicketId,
      );

      let newWinnerTicket: any = auction.winner?.ticket ?? null;
      if (isWinnerChanging && correctedTicketId) {
        const fetchedTicket = await tx.subscriberTicket.findUnique({
          where: { id: correctedTicketId },
          include: { customer: true },
        });
        const locked = lockedTickets.get(correctedTicketId);
        newWinnerTicket = fetchedTicket
          ? {
              ...fetchedTicket,
              ...(locked
                ? {
                    status: locked.status,
                    isPrized: locked.isPrized,
                    consecutiveUnpaidMonths: locked.consecutiveUnpaidMonths,
                    removalRequestedByUserId: locked.removalRequestedByUserId,
                  }
                : {}),
            }
          : null;

        await this.assertTicketEligibleForAuction(
          tx,
          newWinnerTicket,
          auction.chitGroupId,
          auction.installmentMonth,
          { notFoundAsBadRequest: true },
        );
      }

      // 0.3 FIN-E: Lock all Month N+1 InstallmentDue rows in deterministic ORDER BY id FOR UPDATE
      // (strictly preserving acyclic SubscriberTicket -> InstallmentDue DAG) to prevent TOCTOU
      // races with concurrent recordPayment/recordCollection BEFORE checking PAID dues or updating.
      const nextMonth = auction.installmentMonth + 1;
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`
          SELECT id FROM "InstallmentDue"
          WHERE "chitGroupId" = ${auction.chitGroupId}
            AND "installmentMonth" = ${nextMonth}
          ORDER BY id FOR UPDATE
        `;
      }

      let nextMonthUnpaidDues: any[] = [];
      if (typeof tx.installmentDue?.findMany === 'function') {
        const nextMonthPaidDues = await tx.installmentDue.findMany({
          where: {
            chitGroupId: auction.chitGroupId,
            installmentMonth: nextMonth,
            status: DueStatus.PAID,
          },
        });

        if (nextMonthPaidDues.length > 0) {
          throw new BadRequestException(
            `ALREADY_PAID_DUES_EXIST: Cannot approve correction for Month ${auction.installmentMonth} auction because ${nextMonthPaidDues.length} subscriber(s) have already paid dues for Month ${nextMonth}. Correction would invalidate settled financial history.`,
          );
        }

        nextMonthUnpaidDues = await tx.installmentDue.findMany({
          where: {
            chitGroupId: auction.chitGroupId,
            installmentMonth: nextMonth,
            status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          },
        });
      }

      const wasMinutesFiled =
        authoritativeStatus === AuctionStatus.MINUTES_FILED ||
        auction.minutes?.filedAtRegistrar === true;

      // 1. Update Auction financial snapshots; if minutes were previously filed, reset status to COMPLETED
      //    so the amended Form XVII minutes must be re-filed with the Registrar (XR-AUC-03)
      const updatedAuction = await tx.auction.update({
        where: { id: auctionId },
        data: {
          bidDiscount: correctedDiscount,
          foremanCommissionRate: math.commissionRate,
          foremanCommissionAmount: math.commissionAmount,
          totalDividend: math.totalDividend,
          dividendPerTicket: math.dividendPerTicket,
          prizeMoney: math.prizeMoney,
          ...(wasMinutesFiled ? { status: AuctionStatus.COMPLETED } : {}),
        },
      });

      // M9-DUAL-DEF-04: If corrected discount is below 1/4 ceiling, Option A physical tie-breaks are inapplicable.
      // Purge any stale AuctionTieBidder rows and reset wasTieBreakWinner on the winner.
      const effectiveCeiling =
        auction.chitGroup.maxDiscountCeiling ??
        (auction.chitGroup.chitValue / 4n);

      if (correctedDiscount < effectiveCeiling) {
        if (
          auction.tieBidders &&
          auction.tieBidders.length > 0 &&
          typeof tx.auctionTieBidder?.deleteMany === 'function'
        ) {
          await tx.auctionTieBidder.deleteMany({ where: { auctionId } });
        }
        if (auction.winner && auction.winner.wasTieBreakWinner) {
          await tx.auctionWinner.update({
            where: { id: auction.winner.id },
            data: { wasTieBreakWinner: false },
          });
        }
      }

      // 2. Winner ticket swap (XR-AUC-01 full safety proof & tie-bidder reset) OR payout authorization invalidation
      if (isWinnerChanging && auction.winner && correctedTicketId) {
        // Un-prize old ticket
        await tx.subscriberTicket.update({
          where: { id: auction.winner.ticketId },
          data: { isPrized: false, prizedAuctionId: null },
        });

        // Mark new ticket prized
        await tx.subscriberTicket.update({
          where: { id: correctedTicketId },
          data: { isPrized: true, prizedAuctionId: auctionId },
        });

        // Resync AuctionTieBidder.isWinner & wasTieBreakWinner if tie-bidders exist at ceiling
        const tieBidders = Array.isArray(auction.tieBidders)
          ? auction.tieBidders
          : [];
        const newWinnerIsTieBidder =
          correctedDiscount >= effectiveCeiling &&
          tieBidders.some((tb: any) => tb.ticketId === correctedTicketId);

        if (
          correctedDiscount >= effectiveCeiling &&
          tieBidders.length > 0 &&
          typeof tx.auctionTieBidder?.updateMany === 'function'
        ) {
          await tx.auctionTieBidder.updateMany({
            where: { auctionId },
            data: { isWinner: false },
          });
          if (newWinnerIsTieBidder) {
            await tx.auctionTieBidder.updateMany({
              where: { auctionId, ticketId: correctedTicketId },
              data: { isWinner: true },
            });
          }
        }

        // XR-AUC-01: Clear ALL prior winner's safety proof, collateral, signatures, S3 scan, and payout fields
        await tx.auctionWinner.update({
          where: { id: auction.winner.id },
          data: {
            ticketId: correctedTicketId,
            wasTieBreakWinner: newWinnerIsTieBidder,
            ...CLEARED_WINNER_SAFETY_AND_PAYOUT_FIELDS,
          },
        });
      } else if (
        auction.winner &&
        auction.bidDiscount !== correctedDiscount &&
        authoritativeDisbursementStatus === 'AUTHORIZED_BY_CHECKER'
      ) {
        // Prize amount changed for the same winner after payout authorization ->
        // invalidate stale authorization so Partner B must re-authorize with corrected prize money!
        await tx.auctionWinner.update({
          where: { id: auction.winner.id },
          data: {
            disbursedAmount: null,
            disbursementMode: null,
            authorizedByUserId: null,
            disbursementStatus: 'VERIFIED_BY_MAKER',
          },
        });
      }

      // 3. Reconcile downstream unpaid installment dues for Month N+1
      for (const due of nextMonthUnpaidDues) {
        const newNet = due.grossAmount - math.dividendPerTicket;
        if (newNet <= 0n) {
          throw new BadRequestException(
            `INVALID_NET_PAYABLE: Corrected dividend ₹${math.dividendPerTicket.toString()} would produce non-positive net payable (₹${newNet.toString()}) for due ${due.id}`,
          );
        }
        await tx.installmentDue.update({
          where: { id: due.id },
          data: {
            dividendDeduction: math.dividendPerTicket,
            netPayableAmount: newNet,
          },
        });
      }

      // 4. Synchronize Form XVII Statutory Auction Minutes with corrected figures/winner;
      //    reset filedAtRegistrar when amending previously filed minutes so amended Form XVII is re-filed (XR-AUC-03)
      if (auction.minutes && typeof tx.auctionMinutes?.update === 'function') {
        const updatedMinutesText = formatStatutoryAuctionMinutesText({
          installmentMonth: auction.installmentMonth,
          groupName: auction.chitGroup.groupName,
          groupCode: auction.chitGroup.groupCode,
          auctionDate: auction.auctionDate ?? new Date(),
          subscribersPresent: auction.minutes.subscribersPresent,
          winningTicketNumber:
            newWinnerTicket?.ticketNumber ??
            reqData.correctedTicketNumber ??
            auction.winner?.ticket?.ticketNumber ??
            0,
          winnerName:
            newWinnerTicket?.customer?.fullName ??
            auction.winner?.ticket?.customer?.fullName ??
            'Subscriber',
          bidDiscount: correctedDiscount,
          commissionRatePercentLabel: math.commissionRatePercentLabel,
          commissionAmount: math.commissionAmount,
          dividendPerTicket: math.dividendPerTicket,
          prizeMoney: math.prizeMoney,
          notes: `Amended per dual-control correction (${reqData.reason || 'Partner correction'}). ${dto?.notes || ''}`.trim(),
        });

        await tx.auctionMinutes.update({
          where: { auctionId },
          data: {
            minutesText: updatedMinutesText,
            ...(wasMinutesFiled
              ? {
                  filedAtRegistrar: false,
                  filedDate: null,
                  filingReference: null,
                  filingNotes: null,
                }
              : {}),
          },
        });
      }

      // 5. Log Approved Correction (preserving prior Registrar filing metadata in oldValue if reset)
      const priorAuditOldValue = {
        ...((pendingRequest.oldValue as Record<string, any>) ?? {}),
        ...(wasMinutesFiled
          ? {
              previousAuctionStatus: authoritativeStatus,
              previousFiledAtRegistrar: auction.minutes?.filedAtRegistrar ?? true,
              previousFiledDate: auction.minutes?.filedDate ?? null,
              previousFilingReference: auction.minutes?.filingReference ?? null,
              previousFilingNotes: auction.minutes?.filingNotes ?? null,
            }
          : {}),
      };

      await tx.auditLog.create({
        data: {
          userId: checkerPartnerUserId,
          action: 'AUCTION_CORRECTION_APPROVED',
          entityType: 'Auction',
          entityId: auctionId,
          oldValue: priorAuditOldValue,
          newValue: {
            ...reqData,
            correctionRequestId: pendingRequest.id,
            approvedByUserId: checkerPartnerUserId,
            checkerNotes: dto?.notes?.trim() || null,
            minutesFilingResetForRefiling: wasMinutesFiled,
            approvedAt: new Date().toISOString(),
          },
        },
      });

      committedBranchId = auction.chitGroup?.branchId;
      committedMonth = auction.installmentMonth;
      return updatedAuction;
    });

    // Post-commit: Proactively invalidate executive dashboard and daybook report caches
    await this.invalidateReportCaches(committedBranchId);

    return {
      success: true,
      message: `Auction Month ${committedMonth} correction approved by Partner. Dividends and subsequent dues reconciled.`,
      auction: result,
    };
  }

  /**
   * KFC-FIN-005 / Q12: Independent Checker Partner rejects auction correction request.
   * Strictly enforces Maker != Checker (Guardrail 10), verified partner identity (Guardrail 11),
   * pessimistic DAG locking, replay prevention, and audit log tracking.
   */
  async rejectAuctionCorrection(
    auctionId: string,
    checkerPartnerUserId: string,
    dto: RejectAuctionCorrectionDto,
    userRoles?: string[],
  ) {
    if (userRoles && !userRoles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'SUPER_ADMIN_REQUIRED: Only Partners (Super Admin) are authorized to reject auction corrections.',
      );
    }

    await assertVerifiedPartner(
      this.prisma,
      checkerPartnerUserId,
      'reject auction corrections',
    );

    const trimmedReason = (dto.reason ?? '').trim();
    if (!trimmedReason) {
      throw new BadRequestException(
        'REJECTION_REASON_REQUIRED: Rejection reason is required and cannot be blank',
      );
    }

    const preflightAuction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { chitGroup: true },
    });

    if (!preflightAuction) {
      throw new NotFoundException('Auction record not found');
    }

    let committedBranchId: string | null | undefined =
      preflightAuction.chitGroup?.branchId;
    let committedMonth = preflightAuction.installmentMonth;

    await withTransactionRetry(this.prisma, async (tx) => {
      // Pessimistic Acyclic Row Locks: ChitGroup -> Auction
      await lockChitGroupRow(tx, preflightAuction.chitGroupId);
      await lockAuctionRow(tx, auctionId);

      // Find pending correction request
      const pendingRequest = await tx.auditLog.findFirst({
        where: {
          entityType: 'Auction',
          entityId: auctionId,
          action: 'AUCTION_CORRECTION_REQUESTED',
        },
        orderBy: { timestamp: 'desc' },
      });

      if (!pendingRequest || !pendingRequest.newValue) {
        throw new BadRequestException(
          'NO_PENDING_CORRECTION: No pending correction request found for this auction.',
        );
      }

      // Strict Maker != Checker Dual Control
      if (pendingRequest.userId === checkerPartnerUserId) {
        throw new ForbiddenException(
          'Maker-Checker Separation of Duties Violated: The Partner who requested the auction correction cannot reject it. An independent Partner must review and authorize.',
        );
      }

      // Check if already approved
      const latestApproval = await tx.auditLog.findFirst({
        where: {
          entityType: 'Auction',
          entityId: auctionId,
          action: 'AUCTION_CORRECTION_APPROVED',
        },
        orderBy: { timestamp: 'desc' },
      });

      const alreadyApproved =
        latestApproval &&
        latestApproval.id !== pendingRequest.id &&
        ((latestApproval.newValue as any)?.correctionRequestId ===
          pendingRequest.id ||
          (latestApproval.timestamp instanceof Date &&
            pendingRequest.timestamp instanceof Date &&
            latestApproval.timestamp.getTime() >=
              pendingRequest.timestamp.getTime()));

      if (alreadyApproved) {
        throw new BadRequestException(
          'NO_PENDING_CORRECTION: This auction correction request has already been approved.',
        );
      }

      // Check if already rejected
      const latestRejection = await tx.auditLog.findFirst({
        where: {
          entityType: 'Auction',
          entityId: auctionId,
          action: 'AUCTION_CORRECTION_REJECTED',
        },
        orderBy: { timestamp: 'desc' },
      });

      const alreadyRejected =
        latestRejection &&
        latestRejection.id !== pendingRequest.id &&
        ((latestRejection.newValue as any)?.correctionRequestId ===
          pendingRequest.id ||
          (latestRejection.timestamp instanceof Date &&
            pendingRequest.timestamp instanceof Date &&
            latestRejection.timestamp.getTime() >=
              pendingRequest.timestamp.getTime()));

      if (alreadyRejected) {
        throw new BadRequestException(
          'NO_PENDING_CORRECTION: This auction correction request has already been rejected.',
        );
      }

      const reqData = pendingRequest.newValue as any;

      await tx.auditLog.create({
        data: {
          userId: checkerPartnerUserId,
          action: 'AUCTION_CORRECTION_REJECTED',
          entityType: 'Auction',
          entityId: auctionId,
          oldValue: {
            correctionRequestId: pendingRequest.id,
            requestedByUserId: pendingRequest.userId,
            correctedBidDiscount: reqData.correctedBidDiscount,
            correctedWinningTicketId: reqData.correctedWinningTicketId,
            reason: reqData.reason,
          },
          newValue: {
            correctionRequestId: pendingRequest.id,
            rejectedByUserId: checkerPartnerUserId,
            reason: trimmedReason,
            notes: dto.notes?.trim() || null,
            rejectedAt: new Date().toISOString(),
          },
        },
      });

      committedBranchId = preflightAuction.chitGroup?.branchId;
      committedMonth = preflightAuction.installmentMonth;
    });

    await this.invalidateReportCaches(committedBranchId);

    return {
      success: true,
      message: `Auction Month ${committedMonth} correction request rejected by Partner.`,
      auctionId,
    };
  }
}
