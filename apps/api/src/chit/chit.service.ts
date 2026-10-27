import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChitStatus, InitializationMode, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISCOUNT_CEILING_DIVISOR,
  FOREMAN_COMMISSION_NUMERATOR,
  FOREMAN_COMMISSION_PERCENT,
  PERCENT_DENOMINATOR,
} from '../common/constants';
import { ActivateChitDto } from './dto/activate-chit.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateChitGroupDto } from './dto/create-chit-group.dto';
import { OnboardOngoingChitDto } from './dto/onboard-ongoing-chit.dto';
import { QueryChitDto } from './dto/query-chit.dto';
import { UpdateChitGroupDto } from './dto/update-chit-group.dto';

@Injectable()
export class ChitService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: validates whole-rupee math and returns calculated financial properties
   */
  private calculateSchemeMath(chitValueNum: number, durationMonths: number) {
    const chitValue = BigInt(Math.floor(chitValueNum));
    const duration = BigInt(durationMonths);

    if (chitValue % duration !== 0n) {
      throw new BadRequestException(
        `Chit Value ₹${chitValue.toString()} must be evenly divisible by ${durationMonths} months to guarantee whole-rupee installments (no fractional paise)`,
      );
    }

    const baseInstallment = chitValue / duration;
    // Fixed 1/4 ceiling: V / 4 (ADR-06)
    const maxDiscountCeiling = chitValue / DISCOUNT_CEILING_DIVISOR;

    return {
      chitValue,
      baseInstallment,
      maxDiscountCeiling,
    };
  }

  /**
   * Creates a fresh chit group starting from Month 1 in DRAFT status
   */
  async create(dto: CreateChitGroupDto, staffBranchId?: string | null) {
    if (dto.durationMonths !== dto.totalTickets) {
      throw new BadRequestException(
        `Duration (${dto.durationMonths} months) must equal total tickets (${dto.totalTickets}) in standard chits`,
      );
    }

    const existing = await this.prisma.chitGroup.findUnique({
      where: { groupCode: dto.groupCode.trim() },
    });
    if (existing) {
      throw new ConflictException(
        `Chit group code "${dto.groupCode}" is already in use`,
      );
    }

    let branchId = dto.branchId || staffBranchId;
    if (!branchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (!defaultBranch) {
        throw new NotFoundException('No active branch found');
      }
      branchId = defaultBranch.id;
    }

    const math = this.calculateSchemeMath(dto.chitValue, dto.durationMonths);

    return this.prisma.chitGroup.create({
      data: {
        branchId,
        groupCode: dto.groupCode.trim(),
        groupName: dto.groupName.trim(),
        groupNameTamil: dto.groupNameTamil?.trim() || null,
        chitValue: math.chitValue,
        durationMonths: dto.durationMonths,
        totalTickets: dto.totalTickets,
        baseInstallment: math.baseInstallment,
        maxDiscountCeiling: math.maxDiscountCeiling,
        foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
        initMode: InitializationMode.NEW_GROUP,
        onboardedAtMonth: 1,
        status: ChitStatus.DRAFT,
        sanctionOrderNumber: dto.sanctionOrderNumber?.trim() || null,
        sanctionDate: dto.sanctionDate ? new Date(dto.sanctionDate) : null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });
  }

  /**
   * Mid-Cycle Intake Wizard: Transcribes ongoing chits from physical paper notebooks
   */
  async onboardOngoing(
    dto: OnboardOngoingChitDto,
    creatorUserId: string,
    staffBranchId?: string | null,
  ) {
    if (dto.durationMonths !== dto.totalTickets) {
      throw new BadRequestException('Duration must match total tickets');
    }

    if (
      dto.onboardedAtMonth < 2 ||
      dto.onboardedAtMonth > dto.durationMonths
    ) {
      throw new BadRequestException(
        `Onboarded month (${dto.onboardedAtMonth}) must be between Month 2 and Month ${dto.durationMonths}`,
      );
    }

    const existing = await this.prisma.chitGroup.findUnique({
      where: { groupCode: dto.groupCode.trim() },
    });
    if (existing) {
      throw new ConflictException(
        `Chit group code "${dto.groupCode}" is already in use`,
      );
    }

    // ADR-13: Validate that no customer appears twice in the member allocations
    const customerIds = dto.memberAllocations.map((m) => m.customerId);
    const uniqueCustomerIds = new Set(customerIds);
    if (uniqueCustomerIds.size !== customerIds.length) {
      throw new ConflictException(
        'ADR-13 Violation: A customer cannot hold 2 or more tickets in the same chit group',
      );
    }

    let branchId = dto.branchId || staffBranchId;
    if (!branchId) {
      const defaultBranch = await this.prisma.branch.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      if (!defaultBranch) {
        throw new NotFoundException('No active branch found');
      }
      branchId = defaultBranch.id;
    }

    const math = this.calculateSchemeMath(dto.chitValue, dto.durationMonths);

    // Validate historical auction discounts against 1/4 ceiling
    for (const hw of dto.historicalWinners) {
      if (BigInt(hw.bidDiscount) > math.maxDiscountCeiling) {
        throw new BadRequestException(
          `Historical bid discount ₹${hw.bidDiscount} in Month ${hw.month} exceeds maximum 1/4 ceiling of ₹${math.maxDiscountCeiling.toString()}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create ChitGroup
      const chit = await tx.chitGroup.create({
        data: {
          branchId,
          groupCode: dto.groupCode.trim(),
          groupName: dto.groupName.trim(),
          groupNameTamil: dto.groupNameTamil?.trim() || null,
          chitValue: math.chitValue,
          durationMonths: dto.durationMonths,
          totalTickets: dto.totalTickets,
          baseInstallment: math.baseInstallment,
          maxDiscountCeiling: math.maxDiscountCeiling,
          foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
          initMode: InitializationMode.ONGOING_GROUP,
          onboardedAtMonth: dto.onboardedAtMonth,
          status: ChitStatus.DRAFT,
          sanctionOrderNumber: dto.sanctionOrderNumber?.trim() || null,
          sanctionDate: dto.sanctionDate ? new Date(dto.sanctionDate) : null,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
        },
      });

      // 2. Batch insert member allocations (reduces 20 DB trips to 1)
      await tx.subscriberTicket.createMany({
        data: dto.memberAllocations.map((alloc) => ({
          chitGroupId: chit.id,
          customerId: alloc.customerId,
          ticketNumber: alloc.ticketNumber,
          openingBalance: BigInt(alloc.openingBalance || 0),
        })),
      });

      // Retrieve created tickets in a single indexed query to map ticketNumber -> id
      const createdTickets = await tx.subscriberTicket.findMany({
        where: { chitGroupId: chit.id },
        select: { id: true, ticketNumber: true },
      });
      const ticketMap = new Map<number, string>(
        createdTickets.map((t) => [t.ticketNumber, t.id]),
      );

      // 3. Record historical auctions (Months 2 to onboardedAtMonth - 1)
      for (const hw of dto.historicalWinners) {
        const ticketId = ticketMap.get(hw.ticketNumber);
        if (!ticketId) {
          throw new BadRequestException(
            `Winner ticket #${hw.ticketNumber} for Month ${hw.month} was not found in member allocations`,
          );
        }

        const bidDiscount = BigInt(hw.bidDiscount);
        const commission =
          (math.chitValue * FOREMAN_COMMISSION_NUMERATOR) / PERCENT_DENOMINATOR;
        const totalDividend = bidDiscount - commission;
        const dividendPerTicket = totalDividend / BigInt(dto.durationMonths);
        const prizeMoney = math.chitValue - bidDiscount;

        const auction = await tx.auction.create({
          data: {
            chitGroupId: chit.id,
            installmentMonth: hw.month,
            auctionDate: new Date(hw.auctionDate),
            status: 'COMPLETED',
            isHistoricalEntry: true,
            bidDiscount,
            foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
            foremanCommissionAmount: commission,
            totalDividend,
            dividendPerTicket,
            prizeMoney,
            conductedByUserId: creatorUserId,
          },
        });

        await tx.auctionWinner.create({
          data: {
            auctionId: auction.id,
            ticketId,
            wasTieBreakWinner: false,
            disbursementStatus: 'DISBURSED',
            disbursedAmount: prizeMoney,
          },
        });

        await tx.subscriberTicket.update({
          where: { id: ticketId },
          data: { isPrized: true, prizedAuctionId: auction.id },
        });
      }

      return chit;
    });
  }

  /**
   * Assigns a ticket number to a verified customer under ADR-13 constraints
   */
  async assignTicket(chitGroupId: string, dto: AssignTicketDto) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
      include: { tickets: true },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (chit.status !== ChitStatus.DRAFT && chit.status !== ChitStatus.REGISTERED) {
      throw new BadRequestException(
        `Cannot assign tickets: scheme is already in ${chit.status} status`,
      );
    }

    if (dto.ticketNumber < 1 || dto.ticketNumber > chit.totalTickets) {
      throw new BadRequestException(
        `Ticket number must be between 1 and ${chit.totalTickets}`,
      );
    }

    // Check if ticket number is already taken
    const ticketTaken = chit.tickets.some((t) => t.ticketNumber === dto.ticketNumber);
    if (ticketTaken) {
      throw new ConflictException(
        `Ticket #${dto.ticketNumber} is already allocated in this chit group`,
      );
    }

    // ADR-13: Prevent customer from holding 2 or more tickets in the same group
    const customerAlreadyHasTicket = chit.tickets.some(
      (t) => t.customerId === dto.customerId,
    );
    if (customerAlreadyHasTicket) {
      throw new ConflictException(
        'ADR-13 Violation: Customer already holds a ticket in this chit group (Max 1 ticket per customer)',
      );
    }

    // Verify customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return this.prisma.subscriberTicket.create({
      data: {
        chitGroupId,
        customerId: dto.customerId,
        ticketNumber: dto.ticketNumber,
        openingBalance: BigInt(dto.openingBalance || 0),
      },
      include: {
        customer: {
          select: { id: true, customerCode: true, fullName: true, phone: true },
        },
      },
    });
  }

  /**
   * Activates chit group: verifies capacity, freezes 4% commission, and executes Month 1 rule
   */
  async activate(
    id: string,
    checkerUserId: string,
    _dto?: ActivateChitDto,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id },
      include: {
        tickets: {
          include: { customer: true },
          orderBy: { ticketNumber: 'asc' },
        },
      },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (chit.status === ChitStatus.ACTIVE) {
      throw new BadRequestException('Chit scheme is already active');
    }

    // 1. Verify capacity: all N tickets must be filled
    if (chit.tickets.length !== chit.totalTickets) {
      throw new BadRequestException(
        `Cannot activate chit: ${chit.tickets.length}/${chit.totalTickets} tickets assigned. All tickets must be filled before activation.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 2. Month 1 Rule for fresh chits
      if (chit.initMode === InitializationMode.NEW_GROUP) {
        // Month 1 has NO auction. Full pool is taken by Ticket #1 (Company representative)
        const ticket1 = chit.tickets.find((t) => t.ticketNumber === 1);
        if (ticket1) {
          const month1Auction = await tx.auction.create({
            data: {
              chitGroupId: chit.id,
              installmentMonth: 1,
              auctionDate: chit.startDate,
              status: 'COMPLETED',
              isHistoricalEntry: false,
              bidDiscount: 0n,
              foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
              foremanCommissionAmount: 0n,
              totalDividend: 0n,
              dividendPerTicket: 0n,
              prizeMoney: chit.chitValue,
              conductedByUserId: checkerUserId,
              finalizedByUserId: checkerUserId,
            },
          });

          await tx.auctionWinner.create({
            data: {
              auctionId: month1Auction.id,
              ticketId: ticket1.id,
              wasTieBreakWinner: false,
              disbursementStatus: 'DISBURSED',
              disbursedAmount: chit.chitValue,
              authorizedByUserId: checkerUserId,
              disbursedAt: new Date(),
              paymentReference: 'COMPANY_POOL_MONTH_1',
            },
          });

          await tx.subscriberTicket.update({
            where: { id: ticket1.id },
            data: { isPrized: true, prizedAuctionId: month1Auction.id },
          });
        }
      }

      // 3. Lock commission & activate
      return tx.chitGroup.update({
        where: { id },
        data: {
          status: ChitStatus.ACTIVE,
          foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
        },
        include: {
          branch: true,
          _count: { select: { tickets: true, auctions: true } },
        },
      });
    });
  }

  /**
   * Search & list chit schemes with status filter and pagination
   */
  async findAll(query: QueryChitDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ChitGroupWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim().length > 0) {
      const search = query.search.trim();
      where.OR = [
        { groupCode: { contains: search, mode: 'insensitive' } },
        { groupName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.chitGroup.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          _count: { select: { tickets: true, auctions: true } },
        },
      }),
      this.prisma.chitGroup.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single chit scheme details with tickets and auctions summary
   */
  async findOne(id: string) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, code: true, name: true, nameTamil: true } },
        tickets: {
          include: {
            customer: {
              select: {
                id: true,
                customerCode: true,
                fullName: true,
                phone: true,
              },
            },
          },
          orderBy: { ticketNumber: 'asc' },
        },
        auctions: {
          orderBy: { installmentMonth: 'asc' },
          include: {
            winner: {
              include: {
                ticket: {
                  include: {
                    customer: {
                      select: { customerCode: true, fullName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!chit) {
      throw new NotFoundException(`Chit scheme with ID ${id} not found`);
    }

    return chit;
  }

  /**
   * Get all tickets assigned to a chit group
   */
  async getTickets(chitGroupId: string) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
      select: { id: true, groupCode: true, totalTickets: true },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    return this.prisma.subscriberTicket.findMany({
      where: { chitGroupId },
      orderBy: { ticketNumber: 'asc' },
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
    });
  }

  /**
   * Modifies configuration for a chit scheme strictly while status is DRAFT.
   * Allowed strictly: Super Admin.
   */
  async update(id: string, dto: UpdateChitGroupDto, adminUserId: string) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id },
    });

    if (!chit) {
      throw new NotFoundException(`Chit scheme with ID ${id} not found`);
    }

    if (chit.status !== ChitStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot update chit scheme: Only schemes in DRAFT status can be modified (current status: ${chit.status}). Active or completed schemes are legally frozen.`,
      );
    }

    const data: Prisma.ChitGroupUpdateInput = {};
    if (dto.groupName !== undefined) data.groupName = dto.groupName.trim();
    if (dto.groupNameTamil !== undefined) data.groupNameTamil = dto.groupNameTamil.trim() || null;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.sanctionOrderNumber !== undefined) data.sanctionOrderNumber = dto.sanctionOrderNumber.trim() || null;
    if (dto.sanctionDate !== undefined) data.sanctionDate = dto.sanctionDate ? new Date(dto.sanctionDate) : null;

    const updated = await this.prisma.chitGroup.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'CHIT_GROUP_DRAFT_UPDATED',
        entityType: 'ChitGroup',
        entityId: id,
        newValue: dto as any,
      },
    });

    return updated;
  }

  /**
   * Unassigns a subscriber ticket from a chit group before activation.
   * Allowed: Super Admin, Branch Manager.
   */
  async unassignTicket(
    chitGroupId: string,
    ticketNumber: number,
    staffUserId: string,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
    });

    if (!chit) {
      throw new NotFoundException(`Chit scheme with ID ${chitGroupId} not found`);
    }

    if (chit.status !== ChitStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot unassign ticket: Tickets can only be unassigned while scheme is in DRAFT status (current: ${chit.status}). Once activated, member removals must follow the statutory 3-month arrears rule.`,
      );
    }

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: {
        chitGroupId_ticketNumber: {
          chitGroupId,
          ticketNumber,
        },
      },
      include: { customer: true },
    });

    if (!ticket) {
      throw new NotFoundException(
        `Ticket #${ticketNumber} is not assigned in this chit group`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriberTicket.delete({
        where: { id: ticket.id },
      });

      await tx.auditLog.create({
        data: {
          userId: staffUserId,
          action: 'TICKET_UNASSIGNED_PRE_ACTIVATION',
          entityType: 'SubscriberTicket',
          entityId: ticket.id,
          oldValue: {
            ticketNumber,
            customerId: ticket.customerId,
            customerName: ticket.customer.fullName,
          },
        },
      });
    });

    return {
      success: true,
      message: `Ticket #${ticketNumber} allocated to ${ticket.customer.fullName} has been unassigned successfully.`,
    };
  }
}
