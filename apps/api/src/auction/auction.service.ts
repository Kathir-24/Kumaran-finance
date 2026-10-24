import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AuctionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BullMqQueueProvider } from '../jobs/providers/bullmq-queue.provider';
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

    const bidDiscount = BigInt(Math.floor(dto.bidDiscount));

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

    return this.prisma.$transaction(async (tx) => {
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

    const bidDiscount = BigInt(Math.floor(dto.bidDiscount));

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

    return this.prisma.$transaction(async (tx) => {
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

    if (auction.status === AuctionStatus.COMPLETED) {
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

    const result = await this.prisma.$transaction(async (tx) => {
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
        where: { id: auction.winner!.ticketId },
        data: {
          isPrized: true,
          prizedAuctionId: auction.id,
        },
      });

      // 3. Generate Statutory Auction Minutes
      const winnerName = auction.winner!.ticket.customer.fullName;
      const ticketNo = auction.winner!.ticket.ticketNumber;
      const discount = auction.bidDiscount?.toString() || '0';
      const dividend = auction.dividendPerTicket?.toString() || '0';

      const minutesText =
        `KUMARAN FINANCE — STATUTORY AUCTION PROCEEDINGS (MONTH ${auction.installmentMonth})\n` +
        `Group: ${auction.chitGroup.groupName} (${auction.chitGroup.groupCode})\n` +
        `Auction Date: ${auction.auctionDate.toISOString().split('T')[0]}\n` +
        `Subscribers Present: ${dto?.subscribersPresent || 1}\n` +
        `Winning Ticket: #${ticketNo} (${winnerName})\n` +
        `Winning Bid Discount: ₹${discount}\n` +
        `Foreman Commission (4.00%): ₹${auction.foremanCommissionAmount?.toString() || '0'}\n` +
        `Universal Dividend Per Member: ₹${dividend}\n` +
        `Prize Money Payable: ₹${auction.prizeMoney?.toString() || '0'}\n` +
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
    if (queue && auction && auction.chitGroup) {
      try {
        const tickets = await this.prisma.subscriberTicket.findMany({
          where: {
            chitGroupId: auction.chitGroupId,
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

        const dividendPerTicket = auction.dividendPerTicket ?? BigInt(0);
        const nextMonthNetPayable = (auction.chitGroup.baseInstallment - dividendPerTicket).toString();

        const payload: AuctionResultNotificationJobPayload = {
          chitGroupId: auction.chitGroupId,
          chitCode: auction.chitGroup.groupCode,
          installmentMonth: auction.installmentMonth,
          winningTicketNumber: auction.winner!.ticket.ticketNumber,
          winningDiscountAmount: (auction.bidDiscount ?? BigInt(0)).toString(),
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
        );
        this.logger.log(
          `Enqueued auction result notification for group ${auction.chitGroup.groupCode} Month ${auction.installmentMonth} (${tickets.length} subscribers)`,
        );
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue auction result notification: ${err.message}`);
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

    const updated = await this.prisma.$transaction(async (tx) => {
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

