import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ChitStatus, InitializationMode, Prisma, Role } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISCOUNT_CEILING_DIVISOR,
  FOREMAN_COMMISSION_NUMERATOR,
  FOREMAN_COMMISSION_PERCENT,
  PERCENT_DENOMINATOR,
  MASTER_CACHE_SCHEME_TTL_SECONDS,
  MasterCacheKeys,
} from '../common/constants';
import { withTtlJitter } from '../common/utils/cache-jitter.util';
import { isPrismaDecimal } from '../common/interceptors/bigint.interceptor';
import { parseBigIntField, stringifyBigIntSafe } from '../common/utils/bigint-json.util';
import { lockChitGroupRow } from '../common/utils/state-transition-lock.util';
import { withTransactionRetry } from '../common/utils/transaction-retry.util';
import { toWholeRupeeBigInt } from '../common/utils/whole-rupee.util';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { ActivateChitDto } from './dto/activate-chit.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateChitGroupDto } from './dto/create-chit-group.dto';
import { OnboardOngoingChitDto } from './dto/onboard-ongoing-chit.dto';
import { QueryChitDto } from './dto/query-chit.dto';
import { UpdateChitGroupDto } from './dto/update-chit-group.dto';

@Injectable()
export class ChitService {
  private readonly logger = new Logger(ChitService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
  ) {}

  /**
   * Atomically invalidates scheme catalog and detail caches in Redis
   */
  private async invalidateSchemesCache(schemeId?: string): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const keys: string[] = [MasterCacheKeys.schemesAll];
        if (schemeId) {
          keys.push(MasterCacheKeys.schemeById(schemeId));
        }
        await redis.del(...keys);
      } catch (err: any) {
        this.logger.warn(`Failed to invalidate scheme cache: ${err.message}`);
      }
    }
  }

  /**
   * Helper: validates whole-rupee math and returns calculated financial properties
   */
  private calculateSchemeMath(chitValueNum: number, durationMonths: number) {
    const chitValue = toWholeRupeeBigInt(chitValueNum, 'Chit value', { min: 1n });
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
  async create(
    dto: CreateChitGroupDto,
    creatorUserId?: string,
    staffBranchId?: string | null,
  ) {
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

    // Support legacy 2-argument signature create(dto, staffBranchId) vs new create(dto, creatorUserId, staffBranchId)
    let branchId: string | undefined = dto.branchId || (staffBranchId ?? undefined);
    let actualCreatorUserId: string | null = null;
    if (staffBranchId !== undefined) {
      actualCreatorUserId = creatorUserId || null;
    } else if (creatorUserId) {
      if (creatorUserId.startsWith('branch') || !branchId) {
        branchId = creatorUserId;
      } else {
        actualCreatorUserId = creatorUserId;
      }
    }

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

    const created = await this.prisma.chitGroup.create({
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
        createdByUserId: actualCreatorUserId,
        sanctionOrderNumber: dto.sanctionOrderNumber?.trim() || null,
        sanctionDate: dto.sanctionDate ? new Date(dto.sanctionDate) : null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    if (typeof this.prisma.auditLog?.create === 'function') {
      await this.prisma.auditLog.create({
        data: {
          userId: actualCreatorUserId || 'SYSTEM',
          action: 'CHIT_GROUP_CREATED',
          entityType: 'ChitGroup',
          entityId: created.id,
          newValue: {
            groupCode: created.groupCode,
            chitValue: created.chitValue.toString(),
            durationMonths: created.durationMonths,
            status: created.status,
            createdByUserId: actualCreatorUserId,
          },
        },
      });
    }

    await this.invalidateSchemesCache(created.id);
    return created;
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

    // Full ticket roster validation: all N tickets must be allocated
    if (dto.memberAllocations.length !== dto.totalTickets) {
      throw new BadRequestException(
        `Cannot onboard ongoing chit: All ${dto.totalTickets} tickets must be allocated in member roster (received ${dto.memberAllocations.length})`,
      );
    }

    const ticketNumbers = dto.memberAllocations.map((m) => m.ticketNumber);
    const uniqueTicketNumbers = new Set(ticketNumbers);
    if (uniqueTicketNumbers.size !== ticketNumbers.length) {
      throw new BadRequestException('Duplicate ticket numbers found in member allocations');
    }

    for (let t = 1; t <= dto.totalTickets; t++) {
      if (!uniqueTicketNumbers.has(t)) {
        throw new BadRequestException(
          `Missing ticket #${t} in member allocations: all tickets from 1 to ${dto.totalTickets} must be assigned`,
        );
      }
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
    const commission =
      (math.chitValue * FOREMAN_COMMISSION_NUMERATOR) / PERCENT_DENOMINATOR;

    // Validate historical winners completeness: must cover Months 2 to onboardedAtMonth - 1 without gaps or duplicates
    const expectedHistoricalCount = dto.onboardedAtMonth - 2;
    if (dto.historicalWinners.length !== expectedHistoricalCount) {
      throw new BadRequestException(
        `Historical winners count (${dto.historicalWinners.length}) must exactly match months 2 to ${dto.onboardedAtMonth - 1} (${expectedHistoricalCount} auctions expected)`,
      );
    }

    const historicalMonths = new Set(dto.historicalWinners.map((hw) => hw.month));
    for (let m = 2; m < dto.onboardedAtMonth; m++) {
      if (!historicalMonths.has(m)) {
        throw new BadRequestException(
          `Historical winners must cover Month ${m}: all months from 2 to ${dto.onboardedAtMonth - 1} must be recorded without gaps or duplicates`,
        );
      }
    }

    // Validate that each winner ticket is unique and assigned
    const winnerTicketNumbers = dto.historicalWinners.map((hw) => hw.ticketNumber);
    const uniqueWinnerTickets = new Set(winnerTicketNumbers);
    if (uniqueWinnerTickets.size !== winnerTicketNumbers.length) {
      throw new BadRequestException(
        'Duplicate winner ticket detected: A ticket cannot win more than one historical auction',
      );
    }

    // Validate historical auction discounts: 4% floor (D >= Cf), 1/4 ceiling (D <= V/4), and whole-rupee divisibility ((D - Cf) % N == 0)
    for (const hw of dto.historicalWinners) {
      if (hw.ticketNumber === 1) {
        throw new BadRequestException(
          'Ticket #1 is reserved for statutory company pool and cannot be an auction winner for Month >= 2',
        );
      }

      if (!uniqueTicketNumbers.has(hw.ticketNumber)) {
        throw new BadRequestException(
          `Winner ticket #${hw.ticketNumber} for Month ${hw.month} was not found in member allocations`,
        );
      }

      const bidDiscount = toWholeRupeeBigInt(hw.bidDiscount, 'Bid discount', { min: 1n });

      if (bidDiscount > math.maxDiscountCeiling) {
        throw new BadRequestException(
          `Historical bid discount ₹${hw.bidDiscount} in Month ${hw.month} exceeds maximum 1/4 ceiling of ₹${math.maxDiscountCeiling.toString()}`,
        );
      }

      if (bidDiscount < commission) {
        throw new BadRequestException(
          `Historical bid discount ₹${hw.bidDiscount} in Month ${hw.month} must be at least the foreman commission of ₹${commission.toString()} (4.00% floor)`,
        );
      }

      const totalDividend = bidDiscount - commission;
      if (totalDividend % BigInt(dto.totalTickets) !== 0n) {
        throw new BadRequestException(
          `NON_DIVISIBLE_DIVIDEND: Historical total dividend ₹${totalDividend.toString()} in Month ${hw.month} must be evenly divisible by ${dto.totalTickets} tickets to guarantee whole-rupee installments`,
        );
      }
    }

    const activated = await this.prisma.$transaction(async (tx) => {
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
          createdByUserId: creatorUserId,
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
          openingBalance:
            alloc.openingBalance !== undefined && alloc.openingBalance !== null
              ? toWholeRupeeBigInt(alloc.openingBalance, 'Opening balance', { min: 0n })
              : 0n,
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

      // Auto-create Month 1 statutory company pool auction (Guardrail 5 / ADR-05)
      const ticket1Id = ticketMap.get(1);
      if (!ticket1Id) {
        throw new BadRequestException('Ticket #1 must be allocated in member roster');
      }

      const month1Auction = await tx.auction.create({
        data: {
          chitGroupId: chit.id,
          installmentMonth: 1,
          auctionDate: new Date(dto.startDate),
          status: 'COMPLETED',
          isHistoricalEntry: true,
          bidDiscount: 0n,
          foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
          foremanCommissionAmount: 0n,
          totalDividend: 0n,
          dividendPerTicket: 0n,
          prizeMoney: math.chitValue,
          conductedByUserId: null, // Month 1 has no auction (statutory company pool)
          finalizedByUserId: creatorUserId,
        },
      });

      await tx.auctionWinner.create({
        data: {
          auctionId: month1Auction.id,
          ticketId: ticket1Id,
          wasTieBreakWinner: false,
          isHistoricalEntry: true,
          disbursementStatus: 'DISBURSED',
          disbursedAmount: math.chitValue,
          authorizedByUserId: creatorUserId,
          disbursedAt: new Date(dto.startDate),
          paymentReference: 'HISTORICAL_COMPANY_POOL_MONTH_1',
        },
      });

      await tx.subscriberTicket.update({
        where: { id: ticket1Id },
        data: { isPrized: true, prizedAuctionId: month1Auction.id },
      });

      // 3. Record historical auctions (Months 2 to onboardedAtMonth - 1)
      for (const hw of dto.historicalWinners) {
        const ticketId = ticketMap.get(hw.ticketNumber);
        if (!ticketId) {
          throw new BadRequestException(
            `Winner ticket #${hw.ticketNumber} for Month ${hw.month} was not found in member allocations`,
          );
        }

        const bidDiscount = toWholeRupeeBigInt(hw.bidDiscount, 'Bid discount', { min: 1n });
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
            conductedByUserId: null, // Historical transcription from paper notebook
            finalizedByUserId: creatorUserId,
          },
        });

        await tx.auctionWinner.create({
          data: {
            auctionId: auction.id,
            ticketId,
            wasTieBreakWinner: false,
            isHistoricalEntry: true,
            disbursementStatus: 'DISBURSED',
            disbursedAmount: prizeMoney,
            authorizedByUserId: creatorUserId,
            disbursedAt: new Date(hw.auctionDate),
            paymentReference: `HISTORICAL_AUCTION_MONTH_${hw.month}`,
          },
        });

        await tx.subscriberTicket.update({
          where: { id: ticketId },
          data: { isPrized: true, prizedAuctionId: auction.id },
        });
      }

      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            userId: creatorUserId,
            action: 'CHIT_GROUP_ONBOARDED',
            entityType: 'ChitGroup',
            entityId: chit.id,
            newValue: {
              groupCode: chit.groupCode,
              chitValue: chit.chitValue.toString(),
              durationMonths: chit.durationMonths,
              onboardedAtMonth: chit.onboardedAtMonth,
              status: chit.status,
              createdByUserId: creatorUserId,
            },
          },
        });
      }

      return chit;
    });

    await this.invalidateSchemesCache(activated.id);
    return activated;
  }

  /**
   * Acquires an exclusive row lock on ChitGroup at the root of the State Machine Lock DAG
   * and verifies that the locked database status permits the transition.
   * Gracefully returns false in unit-test mocks that do not implement $queryRaw.
   */
  private async assertLockedChitGroupStatus(
    tx: any,
    chitGroupId: string,
    allowedStatuses: ChitStatus[],
    invalidStatusMessage: (status: ChitStatus | string) => string,
  ): Promise<boolean> {
    const hasRawLock = typeof tx?.$queryRaw === 'function';
    const lockedChit = await lockChitGroupRow(tx, chitGroupId);

    if (hasRawLock && !lockedChit) {
      throw new NotFoundException(`Chit scheme with ID ${chitGroupId} not found`);
    }

    if (
      lockedChit &&
      !allowedStatuses.includes(lockedChit.status as ChitStatus)
    ) {
      throw new BadRequestException(invalidStatusMessage(lockedChit.status));
    }

    return hasRawLock;
  }

  private mapTicketUniqueConstraintError(err: any, ticketNumber: number): never {
    if (err?.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? err.meta.target.join(',')
        : String(err.meta?.target || err.message || '');

      if (target.includes('customerId')) {
        throw new ConflictException(
          'ADR-13 Violation: Customer already holds a ticket in this chit group (Max 1 ticket per customer)',
        );
      }

      if (target.includes('ticketNumber')) {
        throw new ConflictException(
          `Ticket #${ticketNumber} is already allocated in this chit group`,
        );
      }
    }

    throw err;
  }

  private assertTicketAssignmentPreconditions<
    T extends {
      status: ChitStatus;
      totalTickets: number;
      tickets: Array<{ ticketNumber: number; customerId: string }>;
    },
  >(chit: T | null | undefined, dto: AssignTicketDto): T {
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

    if (chit.tickets.some((t) => t.ticketNumber === dto.ticketNumber)) {
      throw new ConflictException(
        `Ticket #${dto.ticketNumber} is already allocated in this chit group`,
      );
    }

    // ADR-13: Prevent customer from holding 2 or more tickets in the same group
    if (chit.tickets.some((t) => t.customerId === dto.customerId)) {
      throw new ConflictException(
        'ADR-13 Violation: Customer already holds a ticket in this chit group (Max 1 ticket per customer)',
      );
    }

    return chit;
  }

  private assertActivationPreconditions<
    T extends {
      status: ChitStatus;
      totalTickets: number;
      tickets: unknown[];
    },
  >(chit: T | null | undefined): T {
    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (chit.status !== ChitStatus.DRAFT && chit.status !== ChitStatus.REGISTERED) {
      throw new BadRequestException(
        `Cannot activate chit scheme: Scheme is in ${chit.status} status. Only DRAFT or REGISTERED schemes can be activated.`,
      );
    }

    // Verify capacity: all N tickets must be filled before activation
    if (chit.tickets.length !== chit.totalTickets) {
      throw new BadRequestException(
        `Cannot activate chit: ${chit.tickets.length}/${chit.totalTickets} tickets assigned. All tickets must be filled before activation.`,
      );
    }

    return chit;
  }

  /**
   * Assigns a ticket number to a verified customer under ADR-13 constraints
   */
  async assignTicket(chitGroupId: string, dto: AssignTicketDto) {
    this.assertTicketAssignmentPreconditions(
      await this.prisma.chitGroup.findUnique({
        where: { id: chitGroupId },
        include: { tickets: true },
      }),
      dto,
    );

    // Verify customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    const openingBalanceBigInt =
      dto.openingBalance !== undefined && dto.openingBalance !== null
        ? toWholeRupeeBigInt(dto.openingBalance, 'Opening balance', { min: 0n })
        : 0n;

    const assignedTicket = await withTransactionRetry(this.prisma, async (tx) => {
      const hasRawLock = await this.assertLockedChitGroupStatus(
        tx,
        chitGroupId,
        [ChitStatus.DRAFT, ChitStatus.REGISTERED],
        (status) => `Cannot assign tickets: scheme is already in ${status} status`,
      );

      if (hasRawLock && typeof tx?.chitGroup?.findUnique === 'function') {
        const currentChit = await tx.chitGroup.findUnique({
          where: { id: chitGroupId },
          include: { tickets: true },
        });
        this.assertTicketAssignmentPreconditions(currentChit, dto);
      }

      try {
        return await tx.subscriberTicket.create({
          data: {
            chitGroupId,
            customerId: dto.customerId,
            ticketNumber: dto.ticketNumber,
            openingBalance: openingBalanceBigInt,
          },
          include: {
            customer: {
              select: { id: true, customerCode: true, fullName: true, phone: true },
            },
          },
        });
      } catch (err: any) {
        this.mapTicketUniqueConstraintError(err, dto.ticketNumber);
      }
    });

    await this.invalidateSchemesCache(chitGroupId);
    return assignedTicket;
  }

  /**
   * Activates chit group: verifies capacity, freezes 4% commission, and executes Month 1 rule
   */
  async activate(
    id: string,
    checkerUserId: string,
    _dto?: ActivateChitDto,
  ) {
    // Guardrail 11 & SEC-A: Verify Partner identity
    if (typeof this.prisma.user?.findUnique === 'function') {
      const checker = await this.prisma.user.findUnique({
        where: { id: checkerUserId.trim() },
        select: { isPartner: true },
      });
      if (!checker || !checker.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to activate chit schemes.',
        );
      }
    }

    const chit = this.assertActivationPreconditions(
      await this.prisma.chitGroup.findUnique({
        where: { id },
        include: {
          tickets: {
            include: { customer: true },
            orderBy: { ticketNumber: 'asc' },
          },
        },
      }),
    );

    // Guardrail 10 & ADR-10: Maker != Checker separation of duties
    if (
      chit.createdByUserId &&
      chit.createdByUserId.trim().toLowerCase() === checkerUserId.trim().toLowerCase()
    ) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: The user who created or onboarded the chit scheme cannot activate it. An independent Partner must review and commit.',
      );
    }

    const activated = await withTransactionRetry(this.prisma, async (tx) => {
      // 0. Acquire pessimistic row lock on ChitGroup to serialize concurrent activations & draft mutations
      const hasRawLock = await this.assertLockedChitGroupStatus(
        tx,
        id,
        [ChitStatus.DRAFT, ChitStatus.REGISTERED],
        (status) =>
          `Cannot activate chit scheme: Scheme is in ${status} status. Only DRAFT or REGISTERED schemes can be activated.`,
      );

      // Re-read authoritative scheme & ticket roster inside lock to prevent TOCTOU races with unassignTicket
      const currentChit = this.assertActivationPreconditions(
        hasRawLock && typeof tx?.chitGroup?.findUnique === 'function'
          ? await tx.chitGroup.findUnique({
              where: { id },
              include: {
                tickets: {
                  include: { customer: true },
                  orderBy: { ticketNumber: 'asc' },
                },
              },
            })
          : chit,
      );

      // Guardrail 10 & ADR-10: Maker != Checker inside transaction
      if (
        currentChit.createdByUserId &&
        currentChit.createdByUserId.trim().toLowerCase() === checkerUserId.trim().toLowerCase()
      ) {
        throw new ForbiddenException(
          'MAKER_CHECKER_VIOLATION: The user who created or onboarded the chit scheme cannot activate it. An independent Partner must review and commit.',
        );
      }

      // 2. Month 1 Rule for fresh chits
      if (currentChit.initMode === InitializationMode.NEW_GROUP) {
        // Month 1 has NO auction. Full pool is taken by Ticket #1 (Company representative)
        const ticket1 = currentChit.tickets.find((t: any) => t.ticketNumber === 1);
        if (ticket1) {
          const month1Auction = await tx.auction.create({
            data: {
              chitGroupId: currentChit.id,
              installmentMonth: 1,
              auctionDate: currentChit.startDate,
              status: 'COMPLETED',
              isHistoricalEntry: false,
              bidDiscount: 0n,
              foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
              foremanCommissionAmount: 0n,
              totalDividend: 0n,
              dividendPerTicket: 0n,
              prizeMoney: currentChit.chitValue,
              conductedByUserId: null, // Month 1 has no auction (statutory company pool)
              finalizedByUserId: checkerUserId,
            },
          });

          await tx.auctionWinner.create({
            data: {
              auctionId: month1Auction.id,
              ticketId: ticket1.id,
              wasTieBreakWinner: false,
              disbursementStatus: 'DISBURSED',
              disbursedAmount: currentChit.chitValue,
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
      const updatedChit = await tx.chitGroup.update({
        where: { id },
        data: {
          status: ChitStatus.ACTIVE,
          foremanCommissionRate: new Prisma.Decimal(FOREMAN_COMMISSION_PERCENT),
          activatedByUserId: checkerUserId,
        },
        include: {
          branch: true,
          _count: { select: { tickets: true, auctions: true } },
        },
      });

      // 4. Immutable Audit Trail (ADR-10 / KC-03)
      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            userId: checkerUserId,
            action: 'CHIT_GROUP_ACTIVATED',
            entityType: 'ChitGroup',
            entityId: id,
            oldValue: {
              status: currentChit.status,
              foremanCommissionRate: currentChit.foremanCommissionRate?.toString() || null,
            },
            newValue: {
              status: ChitStatus.ACTIVE,
              foremanCommissionRate: FOREMAN_COMMISSION_PERCENT.toString(),
              groupCode: currentChit.groupCode,
              chitValue: currentChit.chitValue.toString(),
              durationMonths: currentChit.durationMonths,
              activatedByUserId: checkerUserId,
            },
          },
        });
      }

      return updatedChit;
    });

    await this.invalidateSchemesCache(id);
    return activated;
  }

  private static readonly CATALOG_BIGINT_FIELDS = [
    'chitValue',
    'baseInstallment',
    'maxDiscountCeiling',
  ] as const;

  private normalizeCatalogItem<T extends Record<string, any>>(item: T): T {
    if (!item || typeof item !== 'object' || !('foremanCommissionRate' in item)) {
      return item;
    }

    const rawRate = item.foremanCommissionRate;
    let normalizedRate = rawRate;
    if (isPrismaDecimal(rawRate)) {
      normalizedRate = rawRate.toNumber();
    } else if (typeof rawRate === 'string') {
      const numericRate = Number(rawRate);
      if (Number.isFinite(numericRate)) {
        normalizedRate = numericRate;
      }
    }

    return normalizedRate === rawRate
      ? item
      : { ...item, foremanCommissionRate: normalizedRate };
  }

  private serializeCatalog(result: {
    data: Record<string, any>[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }): string {
    return stringifyBigIntSafe(result);
  }

  private deserializeCatalog(cached: string) {
    const parsed = JSON.parse(cached);
    if (!parsed || !Array.isArray(parsed.data)) {
      return parsed;
    }

    return {
      ...parsed,
      data: parsed.data.map((item: Record<string, any>) => {
        if (!item || typeof item !== 'object') {
          return item;
        }
        const revived: Record<string, any> = { ...item };
        for (const field of ChitService.CATALOG_BIGINT_FIELDS) {
          if (revived[field] !== null && revived[field] !== undefined) {
            const parsedBigInt = parseBigIntField(revived[field]);
            if (parsedBigInt !== undefined) {
              revived[field] = parsedBigInt;
            }
          }
        }
        return this.normalizeCatalogItem(revived);
      }),
    };
  }

  /**
   * Search & list chit schemes with status filter and pagination.
   * Default catalog view cached in Redis for 30 minutes with fail-open safety.
   */
  async findAll(query: QueryChitDto) {
    const isDefaultQuery =
      (!query.status || (typeof query.status === 'string' && query.status.trim() === '')) &&
      (!query.search || query.search.trim() === '') &&
      (!query.page || Number(query.page) === 1) &&
      (!query.limit || Number(query.limit) === 20);

    const redis = this.redisProvider?.getClient();
    if (isDefaultQuery && redis && this.redisProvider?.getIsConnected()) {
      try {
        const cached = await redis.get(MasterCacheKeys.schemesAll);
        if (cached) {
          return this.deserializeCatalog(cached);
        }
      } catch (err: any) {
        this.logger.warn(`Redis scheme cache read error: ${err.message}`);
      }
    }

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

    const result = {
      data: data.map((item) => this.normalizeCatalogItem(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    if (isDefaultQuery && redis && this.redisProvider?.getIsConnected()) {
      try {
        await redis.set(
          MasterCacheKeys.schemesAll,
          this.serializeCatalog(result),
          'EX',
          withTtlJitter(MASTER_CACHE_SCHEME_TTL_SECONDS),
        );
      } catch (err: any) {
        this.logger.warn(`Redis scheme cache write error: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Get single chit scheme details with tickets and auctions summary.
   * If requested by a Chit Subscriber (Role.CUSTOMER), sanitizes fellow members' PII.
   */
  async findOne(id: string, currentUser?: JwtPayload) {
    const redis = this.redisProvider?.getClient();
    const cacheKey = MasterCacheKeys.schemeById(id);

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.__notFound) {
            throw new NotFoundException(`Chit scheme with ID ${id} not found`);
          }
        }
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Redis scheme negative cache read error: ${err.message}`);
      }
    }

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
      if (redis && this.redisProvider?.getIsConnected()) {
        try {
          // Negative Caching: prevent cache penetration from repetitive invalid lookups (60s TTL)
          await redis.set(cacheKey, JSON.stringify({ __notFound: true }), 'EX', 60);
        } catch (err: any) {
          this.logger.warn(`Redis scheme negative cache write error: ${err.message}`);
        }
      }
      throw new NotFoundException(`Chit scheme with ID ${id} not found`);
    }

    // DPDP & Anti-BOLA: If requester is strictly a Chit Subscriber (Role.CUSTOMER),
    // protect fellow subscribers' PII (phone number, customer identity).
    // The subscriber sees full details only for their own ticket; other members are masked.
    const isCustomerOnly =
      currentUser &&
      currentUser.roles?.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r) =>
        ([Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.COLLECTION_AGENT, Role.AUDITOR] as Role[]).includes(r),
      );

    if (isCustomerOnly) {
      const sanitizedTickets = chit.tickets.map((t) => {
        const isOwnTicket =
          t.customerId === currentUser.sub ||
          t.customer?.id === currentUser.sub ||
          t.customer?.phone === currentUser.phone;

        if (isOwnTicket) {
          return t;
        }

        return {
          ...t,
          customer: t.customer
            ? {
                id: 'MASKED',
                customerCode: 'KC-CUST-RESERVED',
                fullName: `Subscriber (Ticket #${t.ticketNumber})`,
                phone: '+91 ******0000',
              }
            : null,
        };
      });

      return {
        ...chit,
        tickets: sanitizedTickets,
      };
    }

    return chit;
  }

  /**
   * Get all tickets assigned to a chit group.
   * Enforces group membership verification and fellow subscriber PII masking (F08).
   */
  async getTickets(chitGroupId: string, currentUser?: JwtPayload) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
      select: { id: true, groupCode: true, totalTickets: true, branchId: true },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

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
          throw new ForbiddenException('Access denied: You do not belong to this chit scheme');
        }
      } else if (
        (currentUser.roles.includes(Role.BRANCH_MANAGER) ||
          currentUser.roles.includes(Role.COLLECTION_AGENT)) &&
        !currentUser.roles.includes(Role.SUPER_ADMIN) &&
        !currentUser.roles.includes(Role.AUDITOR) &&
        !currentUser.roles.includes(Role.ACCOUNTANT)
      ) {
        if (!currentUser.branchId) {
          throw new ForbiddenException(
            currentUser.roles.includes(Role.BRANCH_MANAGER)
              ? 'Access denied: Branch manager must have an assigned branch'
              : 'Access denied: Collection agent must have an assigned branch',
          );
        }
        if (!chit.branchId || chit.branchId !== currentUser.branchId) {
          throw new ForbiddenException('Access denied: Chit scheme belongs to another branch');
        }
      }
    }

    const tickets = await this.prisma.subscriberTicket.findMany({
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

    if (
      currentUser &&
      currentUser.roles.includes(Role.CUSTOMER) &&
      !currentUser.roles.some((r: Role) => r !== Role.CUSTOMER)
    ) {
      return tickets.map((t) => {
        if (t.customerId === currentUser.sub) {
          return t;
        }
        return {
          ...t,
          customer: t.customer
            ? {
                id: 'MASKED',
                customerCode: 'KC-CUST-RESERVED',
                fullName: `Subscriber (Ticket #${t.ticketNumber})`,
                fullNameTamil: null,
                phone: '+91 ******0000',
              }
            : null,
        };
      });
    }

    return tickets;
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

    const updated = await withTransactionRetry(this.prisma, async (tx) => {
      await this.assertLockedChitGroupStatus(
        tx,
        id,
        [ChitStatus.DRAFT],
        (status) =>
          `Cannot update chit scheme: Only schemes in DRAFT status can be modified (current status: ${status}). Active or completed schemes are legally frozen.`,
      );

      const updatedChit = await tx.chitGroup.update({
        where: { id },
        data,
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'CHIT_GROUP_DRAFT_UPDATED',
          entityType: 'ChitGroup',
          entityId: id,
          newValue: dto as any,
        },
      });

      return updatedChit;
    });

    await this.invalidateSchemesCache(id);
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

    let customerName = ticket.customer.fullName;

    await withTransactionRetry(this.prisma, async (tx) => {
      const hasRawLock = await this.assertLockedChitGroupStatus(
        tx,
        chitGroupId,
        [ChitStatus.DRAFT],
        (status) =>
          `Cannot unassign ticket: Tickets can only be unassigned while scheme is in DRAFT status (current: ${status}). Once activated, member removals must follow the statutory 3-month arrears rule.`,
      );

      const currentTicket =
        hasRawLock && typeof tx?.subscriberTicket?.findUnique === 'function'
          ? await tx.subscriberTicket.findUnique({
              where: {
                chitGroupId_ticketNumber: {
                  chitGroupId,
                  ticketNumber,
                },
              },
              include: { customer: true },
            })
          : ticket;

      if (!currentTicket) {
        throw new NotFoundException(
          `Ticket #${ticketNumber} is not assigned in this chit group`,
        );
      }

      customerName = currentTicket.customer.fullName;

      await tx.subscriberTicket.delete({
        where: { id: currentTicket.id },
      });

      await tx.auditLog.create({
        data: {
          userId: staffUserId,
          action: 'TICKET_UNASSIGNED_PRE_ACTIVATION',
          entityType: 'SubscriberTicket',
          entityId: currentTicket.id,
          oldValue: {
            ticketNumber,
            customerId: currentTicket.customerId,
            customerName,
          },
        },
      });
    });

    await this.invalidateSchemesCache(chitGroupId);

    return {
      success: true,
      message: `Ticket #${ticketNumber} allocated to ${customerName} has been unassigned successfully.`,
    };
  }

  /**
   * Registers a draft chit scheme after Chit Registrar sanction order is recorded
   * Allowed: Super Admin
   */
  async register(id: string, userId: string) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id },
    });

    if (!chit) {
      throw new NotFoundException(`Chit scheme with ID ${id} not found`);
    }

    if (chit.status !== ChitStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot register chit scheme: Scheme is in ${chit.status} status. Only DRAFT schemes can be registered.`,
      );
    }

    if (!chit.sanctionOrderNumber || !chit.sanctionDate) {
      throw new BadRequestException(
        'Cannot register chit scheme: Sanction order number and sanction date must be recorded before registration.',
      );
    }

    const updated = await withTransactionRetry(this.prisma, async (tx) => {
      const hasRawLock = await this.assertLockedChitGroupStatus(
        tx,
        id,
        [ChitStatus.DRAFT],
        (status) =>
          `Cannot register chit scheme: Scheme is in ${status} status. Only DRAFT schemes can be registered.`,
      );

      const currentChit =
        hasRawLock && typeof tx?.chitGroup?.findUnique === 'function'
          ? await tx.chitGroup.findUnique({ where: { id } })
          : chit;

      if (!currentChit?.sanctionOrderNumber || !currentChit?.sanctionDate) {
        throw new BadRequestException(
          'Cannot register chit scheme: Sanction order number and sanction date must be recorded before registration.',
        );
      }

      const updatedChit = await tx.chitGroup.update({
        where: { id },
        data: {
          status: ChitStatus.REGISTERED,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      });

      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'CHIT_GROUP_REGISTERED',
            entityType: 'ChitGroup',
            entityId: id,
            oldValue: { status: chit.status },
            newValue: { status: ChitStatus.REGISTERED },
          },
        });
      }

      return updatedChit;
    });

    await this.invalidateSchemesCache(id);
    return updated;
  }

  /**
   * Cancels an unactivated draft chit scheme
   * Allowed: Super Admin
   */
  async cancel(id: string, userId: string) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id },
    });

    if (!chit) {
      throw new NotFoundException(`Chit scheme with ID ${id} not found`);
    }

    if (chit.status !== ChitStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot cancel chit scheme: Scheme is in ${chit.status} status. Only DRAFT schemes can be cancelled.`,
      );
    }

    const updated = await withTransactionRetry(this.prisma, async (tx) => {
      await this.assertLockedChitGroupStatus(
        tx,
        id,
        [ChitStatus.DRAFT],
        (status) =>
          `Cannot cancel chit scheme: Scheme is in ${status} status. Only DRAFT schemes can be cancelled.`,
      );

      const updatedChit = await tx.chitGroup.update({
        where: { id },
        data: {
          status: ChitStatus.CANCELLED,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      });

      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'CHIT_GROUP_CANCELLED',
            entityType: 'ChitGroup',
            entityId: id,
            oldValue: { status: chit.status },
            newValue: { status: ChitStatus.CANCELLED },
          },
        });
      }

      return updatedChit;
    });

    await this.invalidateSchemesCache(id);
    return updated;
  }

  /**
   * Final account reconciliation and scheme closure
   * Allowed: Super Admin
   */
  async close(id: string, userId: string) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id },
    });

    if (!chit) {
      throw new NotFoundException(`Chit scheme with ID ${id} not found`);
    }

    if (chit.status !== ChitStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot close chit scheme: Scheme is in ${chit.status} status. Only COMPLETED schemes can be closed.`,
      );
    }

    const updated = await withTransactionRetry(this.prisma, async (tx) => {
      await this.assertLockedChitGroupStatus(
        tx,
        id,
        [ChitStatus.COMPLETED],
        (status) =>
          `Cannot close chit scheme: Scheme is in ${status} status. Only COMPLETED schemes can be closed.`,
      );

      const updatedChit = await tx.chitGroup.update({
        where: { id },
        data: {
          status: ChitStatus.CLOSED,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      });

      if (typeof tx.auditLog?.create === 'function') {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'CHIT_GROUP_CLOSED',
            entityType: 'ChitGroup',
            entityId: id,
            oldValue: { status: chit.status },
            newValue: { status: ChitStatus.CLOSED },
          },
        });
      }

      return updatedChit;
    });

    await this.invalidateSchemesCache(id);
    return updated;
  }
}
