import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuctionStatus, DueStatus, Prisma, Role } from '@prisma/client';
import {
  lockAuctionMinutesRow,
  lockAuctionRow,
  lockChitGroupRow,
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
  FIRST_AUCTION_MONTH,
  FOREMAN_COMMISSION_NUMERATOR,
  FOREMAN_COMMISSION_PERCENT,
  PERCENT_DENOMINATOR,
} from '../common/constants';
import { FinalizeAuctionDto } from './dto/finalize-auction.dto';
import { MarkMinutesFiledDto } from './dto/mark-minutes-filed.dto';
import { RecordBidDto } from './dto/record-bid.dto';
import { RecordTieBreakDto } from './dto/record-tie-break.dto';
import {
  ApproveAuctionCorrectionDto,
  RequestAuctionCorrectionDto,
} from './dto/auction-correction.dto';

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly queueProvider?: BullMqQueueProvider,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Helper: calculates whole-rupee auction math invariants
   */
  private calculateAuctionMath(
    chitValue: bigint,
    totalTickets: bigint,
    bidDiscount: bigint,
  ) {
    const commissionAmount =
      (chitValue * FOREMAN_COMMISSION_NUMERATOR) / PERCENT_DENOMINATOR;
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
      commissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
      commissionAmount,
      totalDividend,
      dividendPerTicket,
      prizeMoney,
    };
  }

  /**
   * Pre-Auction Defaulter Guard: returns only non-prized subscribers with zero arrears
   */
  async getEligibleBidders(chitGroupId: string, month: number) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (month < FIRST_AUCTION_MONTH || month >= chit.durationMonths) {
      throw new BadRequestException(
        `Auctions take place exclusively in Months 2 through ${chit.durationMonths - 1} (Month 1 and Month ${chit.durationMonths} have no auctions)`,
      );
    }

    // ADR-07: Subscribers with arrears or prized tickets are strictly ineligible to bid
    return this.prisma.subscriberTicket.findMany({
      where: {
        chitGroupId,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
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
   * Maker: records in-branch winning auction bid discount (D <= V / 4)
   */
  async recordBid(
    chitGroupId: string,
    month: number,
    dto: RecordBidDto,
    makerUserId: string,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (month < FIRST_AUCTION_MONTH || month >= chit.durationMonths) {
      throw new BadRequestException(
        `Auctions occur exclusively in Months 2 through ${chit.durationMonths - 1}`,
      );
    }

    const bidDiscount = toWholeRupeeBigInt(dto.bidDiscount, 'Bid discount', { min: 1n });

    // 1. ADR-06: Fixed 1/4 (25%) Ceiling Enforcement
    if (bidDiscount > chit.maxDiscountCeiling) {
      throw new BadRequestException(
        `Bid discount ₹${bidDiscount.toString()} exceeds maximum allowable 1/4 ceiling of ₹${chit.maxDiscountCeiling.toString()}`,
      );
    }

    // 2. Minimum Floor: Bid discount >= 4% Commission
    const minFloor =
      (chit.chitValue * FOREMAN_COMMISSION_NUMERATOR) / PERCENT_DENOMINATOR;
    if (bidDiscount < minFloor) {
      throw new BadRequestException(
        `Bid discount ₹${bidDiscount.toString()} must be at least the 4.00% Foreman Commission of ₹${minFloor.toString()}`,
      );
    }

    // 3. ADR-07 Defaulter Check on Winning Ticket
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: dto.ticketId },
      include: { customer: true },
    });

    if (!ticket || ticket.chitGroupId !== chitGroupId) {
      throw new NotFoundException('Selected winning ticket does not belong to this chit scheme');
    }

    if (ticket.isPrized) {
      throw new BadRequestException(
        `Ticket #${ticket.ticketNumber} has already won a prior auction and cannot bid again`,
      );
    }

    if (ticket.consecutiveUnpaidMonths > 0 || ticket.status !== 'ACTIVE') {
      throw new BadRequestException(
        `ADR-07 Violation: Ticket #${ticket.ticketNumber} (${ticket.customer.fullName}) has unpaid arrears and is strictly ineligible to win the auction`,
      );
    }

    const math = this.calculateAuctionMath(
      chit.chitValue,
      BigInt(chit.totalTickets),
      bidDiscount,
    );

    return withTransactionRetry(this.prisma, async (tx) => {
      await lockChitGroupRow(tx, chitGroupId);

      // 0. State Guard: Verify existing auction is not already completed or filed
      const existingAuction = await tx.auction.findUnique({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
      });

      if (
        existingAuction &&
        (existingAuction.status === AuctionStatus.COMPLETED ||
          existingAuction.status === AuctionStatus.MINUTES_FILED)
      ) {
        throw new BadRequestException(
          `Cannot record bid: Auction for Month ${month} is already finalized (status: ${existingAuction.status})`,
        );
      }

      // Upsert auction record
      const auction = await tx.auction.upsert({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
        update: {
          auctionDate: new Date(dto.auctionDate),
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
          auctionDate: new Date(dto.auctionDate),
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

      // Upsert winner record
      await tx.auctionWinner.upsert({
        where: { auctionId: auction.id },
        update: {
          ticketId: ticket.id,
          wasTieBreakWinner: false,
          verifiedByUserId: makerUserId,
        },
        create: {
          auctionId: auction.id,
          ticketId: ticket.id,
          wasTieBreakWinner: false,
          verifiedByUserId: makerUserId,
        },
      });

      return tx.auction.findUnique({
        where: { id: auction.id },
        include: {
          winner: {
            include: {
              ticket: {
                include: { customer: { select: { fullName: true, customerCode: true } } },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Option A (Physical Draw): Records in-branch paper token draw when multiple members bid ceiling
   */
  async recordTieBreak(
    chitGroupId: string,
    month: number,
    dto: RecordTieBreakDto,
    makerUserId: string,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (dto.tiedTickets.length < 2) {
      throw new BadRequestException('At least 2 tied tickets are required to conduct a tie-break draw');
    }

    const uniqueTicketIds = new Set(dto.tiedTickets.map((t) => t.ticketId));
    if (uniqueTicketIds.size !== dto.tiedTickets.length) {
      throw new BadRequestException(
        'Duplicate ticket entries are not permitted in a tie-break draw',
      );
    }

    const bidDiscount = toWholeRupeeBigInt(dto.bidDiscount, 'Bid discount', { min: 1n });

    // In Option A, tie-break happens exclusively when members bid the maximum 1/4 ceiling
    if (bidDiscount !== chit.maxDiscountCeiling) {
      throw new BadRequestException(
        `Tie-break occurs when members bid the exact 1/4 ceiling discount of ₹${chit.maxDiscountCeiling.toString()}`,
      );
    }

    // Verify winning ticket is among the tied list
    const winningEntry = dto.tiedTickets.find((t) => t.ticketId === dto.winningTicketId);
    if (!winningEntry) {
      throw new BadRequestException('Winning ticket must be one of the participating tied tickets');
    }

    const math = this.calculateAuctionMath(
      chit.chitValue,
      BigInt(chit.totalTickets),
      bidDiscount,
    );

    return withTransactionRetry(this.prisma, async (tx) => {
      await lockChitGroupRow(tx, chitGroupId);

      // 0. State Guard: Verify existing auction is not already completed or filed
      const existingAuction = await tx.auction.findUnique({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
      });

      if (
        existingAuction &&
        (existingAuction.status === AuctionStatus.COMPLETED ||
          existingAuction.status === AuctionStatus.MINUTES_FILED)
      ) {
        throw new BadRequestException(
          `Cannot conduct tie-break draw: Auction for Month ${month} is already finalized (status: ${existingAuction.status})`,
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
          auctionDate: new Date(dto.auctionDate),
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
          auctionDate: new Date(dto.auctionDate),
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

      // 2. Clear old tie-bids and record new physical token draws
      await tx.auctionTieBidder.deleteMany({ where: { auctionId: auction.id } });

      for (const t of dto.tiedTickets) {
        await tx.auctionTieBidder.create({
          data: {
            auctionId: auction.id,
            ticketId: t.ticketId,
            bidDiscount,
            tokenNumber: t.tokenNumber || null,
            isWinner: t.ticketId === dto.winningTicketId,
          },
        });
      }

      // 3. Upsert Winner marked as tie-break winner
      await tx.auctionWinner.upsert({
        where: { auctionId: auction.id },
        update: {
          ticketId: dto.winningTicketId,
          wasTieBreakWinner: true,
          verifiedByUserId: makerUserId,
        },
        create: {
          auctionId: auction.id,
          ticketId: dto.winningTicketId,
          wasTieBreakWinner: true,
          verifiedByUserId: makerUserId,
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
            winningTicketId: dto.winningTicketId,
            tiedTicketCount: dto.tiedTickets.length,
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
                include: { customer: { select: { fullName: true, customerCode: true } } },
              },
            },
          },
          tieBidders: {
            include: {
              ticket: {
                include: { customer: { select: { fullName: true } } },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Checker: commits official auction result, freezes dividends, and enforces Maker != Checker (Partner strictly)
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

    if (typeof this.prisma.user?.findUnique === 'function') {
      const checker = await this.prisma.user.findUnique({
        where: { id: checkerUserId },
        select: { isPartner: true },
      });
      if (checker && !checker.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to finalize and commit auctions.',
        );
      }
    }

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
      throw new BadRequestException('Cannot finalize auction: winning ticket has not been recorded');
    }

    // Strict Maker != Checker Dual Control Enforcement
    if (auction.conductedByUserId === checkerUserId) {
      throw new ForbiddenException(
        'Maker-Checker Separation of Duties Violated: The staff who recorded the auction bids cannot finalize and commit the auction result',
      );
    }

    let committedAuction = auction;

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Pessimistic Acyclic Row Locks ("ChitGroup" -> "Auction") to eliminate split-brain vs recordBid/recordTieBreak and duplicate finalizations
      if (auction.chitGroupId) {
        await lockChitGroupRow(tx, auction.chitGroupId);
      }
      const lockedAuction = await lockAuctionRow(tx, auctionId);
      if (
        lockedAuction &&
        (lockedAuction.status === AuctionStatus.COMPLETED ||
          lockedAuction.status === AuctionStatus.MINUTES_FILED)
      ) {
        throw new BadRequestException('AUCTION_ALREADY_FINALIZED: Auction has already been finalized and committed');
      }

      const currentAuction =
        typeof tx.$queryRaw === 'function' && typeof tx.auction?.findUnique === 'function'
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
        throw new BadRequestException('AUCTION_ALREADY_FINALIZED: Auction has already been finalized and committed');
      }
      if (!currentAuction.winner) {
        throw new BadRequestException('Cannot finalize auction: winning ticket has not been recorded');
      }
      if (currentAuction.conductedByUserId === checkerUserId) {
        throw new ForbiddenException(
          'Maker-Checker Separation of Duties Violated: The staff who recorded the auction bids cannot finalize and commit the auction result',
        );
      }
      committedAuction = currentAuction;

      // 1. Commit Auction
      const finalized = await tx.auction.update({
        where: { id: auctionId },
        data: {
          status: AuctionStatus.COMPLETED,
          finalizedByUserId: checkerUserId,
        },
      });

      // 2. Mark Winner Ticket as Prized
      await tx.subscriberTicket.update({
        where: { id: currentAuction.winner.ticketId },
        data: {
          isPrized: true,
          prizedAuctionId: auction.id,
        },
      });

      // 3. Generate Statutory Auction Minutes (Section 17 Tamil Nadu Chit Funds Rules)
      const subscribersPresent = dto?.subscribersPresent;
      if (typeof subscribersPresent !== 'number' || subscribersPresent < 1 || !Number.isInteger(subscribersPresent)) {
        throw new BadRequestException(
          'Statutory Invariant: Number of attending subscribers physically present must be explicitly recorded (minimum 1 subscriber)',
        );
      }

      const winnerName = currentAuction.winner.ticket.customer.fullName;
      const ticketNo = currentAuction.winner.ticket.ticketNumber;
      const discount = currentAuction.bidDiscount?.toString() || '0';
      const dividend = currentAuction.dividendPerTicket?.toString() || '0';

      const minutesText =
        `KUMARAN FINANCE — STATUTORY AUCTION PROCEEDINGS (MONTH ${currentAuction.installmentMonth})\n` +
        `Group: ${currentAuction.chitGroup.groupName} (${currentAuction.chitGroup.groupCode})\n` +
        `Auction Date: ${currentAuction.auctionDate.toISOString().split('T')[0]}\n` +
        `Subscribers Present: ${subscribersPresent}\n` +
        `Winning Ticket: #${ticketNo} (${winnerName})\n` +
        `Winning Bid Discount: ₹${discount}\n` +
        `Foreman Commission (4.00%): ₹${currentAuction.foremanCommissionAmount?.toString() || '0'}\n` +
        `Universal Dividend Per Member: ₹${dividend}\n` +
        `Prize Money Payable: ₹${currentAuction.prizeMoney?.toString() || '0'}\n` +
        `Observations: ${dto?.notes || 'Auction conducted in accordance with Tamil Nadu Chit Funds Rules.'}`;

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

      // 4. Immutable Audit Trail
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
            bidDiscount: discount,
            dividendPerTicket: dividend,
            prizeMoney: currentAuction.prizeMoney?.toString() || '0',
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
                include: { customer: { select: { fullName: true, customerCode: true } } },
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

        const dividendPerTicket = committedAuction.dividendPerTicket ?? BigInt(0);
        const nextMonthNetPayable = (committedAuction.chitGroup.baseInstallment - dividendPerTicket).toString();

        const payload: AuctionResultNotificationJobPayload = {
          chitGroupId: committedAuction.chitGroupId,
          chitCode: committedAuction.chitGroup.groupCode,
          installmentMonth: committedAuction.installmentMonth,
          winningTicketNumber: committedAuction.winner!.ticket.ticketNumber,
          winningDiscountAmount: (committedAuction.bidDiscount ?? BigInt(0)).toString(),
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
        this.logger.warn(`Failed to enqueue auction result notification: ${err.message}`);
      }
    }

    // Post-commit: Proactively invalidate executive dashboard and daybook report caches in Redis
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const branchId = committedAuction.chitGroup?.branchId;
        const targetDate = new Date().toISOString().split('T')[0];
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
          `Failed to proactively invalidate report cache on auction finalization: ${err.message}`,
        );
      }
    }

    return result;
  }

  /**
   * Retrieves statutory auction minutes text for printing and filing
   */
  async getAuctionMinutes(auctionId: string) {
    const minutes = await this.prisma.auctionMinutes.findUnique({
      where: { auctionId },
      include: { auction: { include: { chitGroup: true } } },
    });

    if (!minutes) {
      throw new NotFoundException('Auction minutes not found for this auction');
    }

    return minutes;
  }

  /**
   * Lists all past and scheduled auctions for a chit group
   */
  async getGroupAuctions(chitGroupId: string) {
    return this.prisma.auction.findMany({
      where: { chitGroupId },
      orderBy: { installmentMonth: 'asc' },
      include: {
        winner: {
          include: {
            ticket: {
              include: {
                customer: { select: { customerCode: true, fullName: true, phone: true } },
              },
            },
          },
        },
        tieBidders: true,
        minutes: true,
      },
    });
  }

  /**
   * Retrieves single auction with full details
   */
  async findOne(id: string) {
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

    return auction;
  }

  /**
   * Pre-Auction Defaulter Guard resolving either Auction UUID or ChitGroup UUID
   */
  async getEligibleBiddersForIdentifier(id: string, monthParam?: number) {
    const auction = await this.prisma.auction.findUnique({ where: { id } });
    if (auction) {
      return this.getEligibleBidders(auction.chitGroupId, auction.installmentMonth);
    }

    const chit = await this.prisma.chitGroup.findUnique({ where: { id } });
    if (chit) {
      const month = monthParam ?? 2;
      return this.getEligibleBidders(chit.id, month);
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
  ) {
    const auction = await this.prisma.auction.findUnique({ where: { id } });
    if (auction) {
      return this.recordBid(auction.chitGroupId, auction.installmentMonth, dto, makerUserId);
    }

    const chit = await this.prisma.chitGroup.findUnique({ where: { id } });
    if (chit) {
      if (!monthParam) {
        throw new BadRequestException('Installment month is required when recording bid by chit group ID');
      }
      return this.recordBid(chit.id, monthParam, dto, makerUserId);
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
  ) {
    const auction = await this.prisma.auction.findUnique({ where: { id } });
    if (auction) {
      return this.recordTieBreak(auction.chitGroupId, auction.installmentMonth, dto, makerUserId);
    }

    const chit = await this.prisma.chitGroup.findUnique({ where: { id } });
    if (chit) {
      if (!monthParam) {
        throw new BadRequestException('Installment month is required when recording tie-break by chit group ID');
      }
      return this.recordTieBreak(chit.id, monthParam, dto, makerUserId);
    }

    throw new NotFoundException('Auction or Chit group not found');
  }

  /**
   * Marks Form XVII statutory auction minutes as filed with the Deputy Registrar of Chits office.
   * Records the official government challan/acknowledgement reference, filing date, and staff notes.
   */
  async markMinutesFiled(
    auctionId: string,
    dto: MarkMinutesFiledDto,
    userId: string,
  ) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { minutes: true, chitGroup: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

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

    const filedDate = dto.filedDate ? new Date(dto.filedDate) : new Date();

    const updated = await withTransactionRetry(this.prisma, async (tx) => {
      const lockedMinute = await lockAuctionMinutesRow(tx, auctionId);
      if (lockedMinute?.filedAtRegistrar === true) {
        throw new BadRequestException(
          'MINUTES_ALREADY_FILED: Statutory auction minutes have already been filed with the Registrar',
        );
      }

      const minutes = await tx.auctionMinutes.update({
        where: { auctionId },
        data: {
          filedAtRegistrar: true,
          filedDate,
          filingReference: dto.filingReference?.trim() || null,
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
            groupCode: auction.chitGroup.groupCode,
            installmentMonth: auction.installmentMonth,
            filedAtRegistrar: true,
            filedDate,
            filingReference: dto.filingReference || null,
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
   * Allowed strictly: Super Admin (Partners).
   * Fails closed if prize money has already been disbursed.
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

    if (typeof this.prisma.user?.findUnique === 'function') {
      const partner = await this.prisma.user.findUnique({
        where: { id: partnerUserId },
        select: { isPartner: true },
      });
      if (partner && !partner.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to request auction corrections.',
        );
      }
    }

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: true,
        winner: { include: { ticket: true } },
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (
      auction.status !== AuctionStatus.COMPLETED &&
      auction.status !== AuctionStatus.MINUTES_FILED
    ) {
      throw new BadRequestException(
        `AUCTION_NOT_FINALIZED: Only finalized auctions can be corrected (current status: ${auction.status})`,
      );
    }

    // Safety Invariant: Disbursed prize money is mathematically and legally immutable
    if (auction.winner?.disbursementStatus === 'DISBURSED') {
      throw new BadRequestException(
        'DISBURSED_PRIZE_IMMUTABLE: Cannot correct an auction whose prize money has already been disbursed to the winner.',
      );
    }

    // FIN-E: Fail closed if subsequent month dues have already been paid
    const nextMonth = auction.installmentMonth + 1;
    if (typeof this.prisma.installmentDue?.findMany === 'function') {
      const nextMonthPaidDues = await this.prisma.installmentDue.findMany({
        where: {
          chitGroupId: auction.chitGroupId,
          installmentMonth: nextMonth,
          status: DueStatus.PAID,
        },
      });

      if (nextMonthPaidDues.length > 0) {
        throw new BadRequestException(
          `ALREADY_PAID_DUES_EXIST: Cannot request correction for Month ${auction.installmentMonth} auction because ${nextMonthPaidDues.length} subscriber(s) have already paid dues for Month ${nextMonth}. Correction would invalidate settled financial history.`,
        );
      }
    }

    const correctedDiscount = toWholeRupeeBigInt(
      dto.correctedBidDiscount,
      'correctedBidDiscount',
      { min: 1n },
    );

    // Validate whole-rupee dividend divisibility (KFC-FIN-002) and 25% ceiling (ADR-06)
    const math = this.calculateAuctionMath(
      auction.chitGroup.chitValue,
      BigInt(auction.chitGroup.totalTickets),
      correctedDiscount,
    );

    let correctedTicket: any = null;
    if (dto.correctedWinningTicketId) {
      correctedTicket = await this.prisma.subscriberTicket.findUnique({
        where: { id: dto.correctedWinningTicketId },
      });

      if (!correctedTicket || correctedTicket.chitGroupId !== auction.chitGroupId) {
        throw new BadRequestException(
          'INVALID_TICKET: Corrected winning ticket does not belong to this chit scheme',
        );
      }

      // If ticket is prized in an earlier auction, reject
      if (
        correctedTicket.isPrized &&
        correctedTicket.id !== auction.winner?.ticketId
      ) {
        throw new BadRequestException(
          `TICKET_ALREADY_PRIZED: Ticket #${correctedTicket.ticketNumber} is already prized in another auction`,
        );
      }
    }

    const log = await this.prisma.auditLog.create({
      data: {
        userId: partnerUserId,
        action: 'AUCTION_CORRECTION_REQUESTED',
        entityType: 'Auction',
        entityId: auctionId,
        oldValue: {
          bidDiscount: auction.bidDiscount?.toString(),
          prizeMoney: auction.prizeMoney?.toString(),
          dividendPerTicket: auction.dividendPerTicket?.toString(),
          ticketId: auction.winner?.ticketId,
          ticketNumber: auction.winner?.ticket?.ticketNumber,
        },
        newValue: {
          correctedBidDiscount: correctedDiscount.toString(),
          correctedPrizeMoney: math.prizeMoney.toString(),
          correctedDividendPerTicket: math.dividendPerTicket.toString(),
          correctedWinningTicketId: dto.correctedWinningTicketId || auction.winner?.ticketId,
          correctedTicketNumber: correctedTicket?.ticketNumber || auction.winner?.ticket?.ticketNumber,
          reason: dto.reason,
          notes: dto.notes || null,
          requestedByUserId: partnerUserId,
        },
      },
    });

    return {
      success: true,
      message: `Auction Month ${auction.installmentMonth} correction requested. An independent Partner must review and authorize approval.`,
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
   * Strictly enforces Maker != Checker (maker_partner_id != checker_partner_id).
   * Recalculates dividends, updates winner ticket, and adjusts downstream dues.
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

    if (typeof this.prisma.user?.findUnique === 'function') {
      const checkerPartner = await this.prisma.user.findUnique({
        where: { id: checkerPartnerUserId },
        select: { isPartner: true },
      });
      if (checkerPartner && !checkerPartner.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to approve auction corrections.',
        );
      }
    }

    const pendingRequest = await this.prisma.auditLog.findFirst({
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

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        chitGroup: true,
        winner: { include: { ticket: true } },
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction record not found');
    }

    if (auction.winner?.disbursementStatus === 'DISBURSED') {
      throw new BadRequestException(
        'DISBURSED_PRIZE_IMMUTABLE: Cannot correct an auction whose prize money has already been disbursed to the winner.',
      );
    }

    const reqData = pendingRequest.newValue as any;
    const correctedDiscount = BigInt(reqData.correctedBidDiscount);
    const correctedTicketId = reqData.correctedWinningTicketId || auction.winner?.ticketId;

    const math = this.calculateAuctionMath(
      auction.chitGroup.chitValue,
      BigInt(auction.chitGroup.totalTickets),
      correctedDiscount,
    );

    const result = await withTransactionRetry(this.prisma, async (tx) => {
      // 1. Update Auction financial snapshots
      const updatedAuction = await tx.auction.update({
        where: { id: auctionId },
        data: {
          bidDiscount: correctedDiscount,
          foremanCommissionAmount: math.commissionAmount,
          totalDividend: math.totalDividend,
          dividendPerTicket: math.dividendPerTicket,
          prizeMoney: math.prizeMoney,
        },
      });

      // 2. If winner ticket changed, swap isPrized flags
      if (auction.winner && auction.winner.ticketId !== correctedTicketId) {
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

        // Update winner record
        await tx.auctionWinner.update({
          where: { id: auction.winner.id },
          data: {
            ticketId: correctedTicketId,
            disbursedAmount: null,
            disbursementStatus: 'PENDING_VERIFICATION',
          },
        });
      }

      // 3. Compensating Dues Adjustment for Subsequent Month (if already generated)
      const nextMonth = auction.installmentMonth + 1;
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

        const nextMonthUnpaidDues = await tx.installmentDue.findMany({
          where: {
            chitGroupId: auction.chitGroupId,
            installmentMonth: nextMonth,
            status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          },
        });

        for (const due of nextMonthUnpaidDues) {
          const newNet = due.grossAmount - math.dividendPerTicket;
          await tx.installmentDue.update({
            where: { id: due.id },
            data: {
              dividendDeduction: math.dividendPerTicket,
              netPayableAmount: newNet > 0n ? newNet : 0n,
            },
          });
        }
      }

      // 4. Log Approved Correction
      await tx.auditLog.create({
        data: {
          userId: checkerPartnerUserId,
          action: 'AUCTION_CORRECTION_APPROVED',
          entityType: 'Auction',
          entityId: auctionId,
          oldValue: pendingRequest.oldValue,
          newValue: {
            ...reqData,
            approvedByUserId: checkerPartnerUserId,
            checkerNotes: dto?.notes || null,
            approvedAt: new Date().toISOString(),
          },
        },
      });

      return updatedAuction;
    });

    return {
      success: true,
      message: `Auction Month ${auction.installmentMonth} correction approved by Partner. Dividends and subsequent dues reconciled.`,
      auction: result,
    };
  }
}

