import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuctionStatus, Prisma } from '@prisma/client';
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
   * Checker: commits official auction result, freezes dividends, and enforces Maker != Checker
   */
  async finalizeAuction(
    auctionId: string,
    checkerUserId: string,
    dto?: FinalizeAuctionDto,
  ) {
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

      // 3. Generate Statutory Auction Minutes
      const winnerName = currentAuction.winner.ticket.customer.fullName;
      const ticketNo = currentAuction.winner.ticket.ticketNumber;
      const discount = currentAuction.bidDiscount?.toString() || '0';
      const dividend = currentAuction.dividendPerTicket?.toString() || '0';

      const minutesText =
        `KUMARAN FINANCE — STATUTORY AUCTION PROCEEDINGS (MONTH ${currentAuction.installmentMonth})\n` +
        `Group: ${currentAuction.chitGroup.groupName} (${currentAuction.chitGroup.groupCode})\n` +
        `Auction Date: ${currentAuction.auctionDate.toISOString().split('T')[0]}\n` +
        `Subscribers Present: ${dto?.subscribersPresent || 1}\n` +
        `Winning Ticket: #${ticketNo} (${winnerName})\n` +
        `Winning Bid Discount: ₹${discount}\n` +
        `Foreman Commission (4.00%): ₹${currentAuction.foremanCommissionAmount?.toString() || '0'}\n` +
        `Universal Dividend Per Member: ₹${dividend}\n` +
        `Prize Money Payable: ₹${currentAuction.prizeMoney?.toString() || '0'}\n` +
        `Observations: ${dto?.notes || 'Auction conducted in accordance with Tamil Nadu Chit Funds Rules.'}`;

      await tx.auctionMinutes.upsert({
        where: { auctionId },
        update: {
          subscribersPresent: dto?.subscribersPresent || 1,
          minutesText,
          signedByForeman: dto?.signedByForeman ?? true,
        },
        create: {
          auctionId,
          subscribersPresent: dto?.subscribersPresent || 1,
          minutesText,
          signedByForeman: dto?.signedByForeman ?? true,
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
            jobId: `auction-result:${committedAuction.id}:m${committedAuction.installmentMonth}`,
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
}

