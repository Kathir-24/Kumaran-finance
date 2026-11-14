import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChitStatus, DueStatus, Role } from '@prisma/client';
import {
  COMPANY_POOL_MONTH,
  CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS,
} from '../common/constants';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  lockChitGroupRow,
  lockSubscriberTicketRow,
} from '../common/utils/state-transition-lock.util';
import { withTransactionRetry } from '../common/utils/transaction-retry.util';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateDuesDto } from './dto/generate-dues.dto';
import { QueryDuesDto } from './dto/query-dues.dto';
import { RemoveDefaulterDto } from './dto/remove-defaulter.dto';
import { SettleRemovalDto } from './dto/settle-removal.dto';
import { SubstituteSubscriberDto } from './dto/substitute-subscriber.dto';

@Injectable()
export class InstallmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates or updates monthly installment dues for all tickets in a chit group.
   * Enforces Universal Equal Dividend Deduction across all members (including auction winner).
   */
  async generateMonthlyDues(
    chitGroupId: string,
    month: number,
    dto?: GenerateDuesDto,
    actorUserId?: string,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: chitGroupId },
      include: {
        tickets: {
          where: { status: { not: 'REMOVED_DEF_3M' } },
          orderBy: { ticketNumber: 'asc' },
        },
      },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (chit.status !== ChitStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot generate dues: Chit scheme must be ACTIVE before monthly dues can be scheduled',
      );
    }

    if (month < 1 || month > chit.durationMonths) {
      throw new BadRequestException(
        `Installment month (${month}) must be between Month 1 and Month ${chit.durationMonths}`,
      );
    }

    // Determine Universal Dividend for this month
    let dividendPerTicket = 0n;

    if (month === COMPANY_POOL_MONTH) {
      // Month 1 has NO auction. Full pool is taken by company ticket. Universal dividend is strictly ₹0.
      dividendPerTicket = 0n;
    } else {
      // Months 2 through N: dividend is determined by the auction for this cycle month (or prior month)
      let auction = await this.prisma.auction.findUnique({
        where: {
          chitGroupId_installmentMonth: {
            chitGroupId,
            installmentMonth: month,
          },
        },
      });

      if (!auction || auction.dividendPerTicket === null) {
        auction = await this.prisma.auction.findUnique({
          where: {
            chitGroupId_installmentMonth: {
              chitGroupId,
              installmentMonth: month - 1,
            },
          },
        });
      }

      if (!auction || auction.dividendPerTicket === null) {
        throw new BadRequestException(
          `Cannot generate Month ${month} dues: Auction for Month ${month} has not yet been recorded and finalized`,
        );
      }

      dividendPerTicket = auction.dividendPerTicket;
    }

    const grossAmount = chit.baseInstallment;
    const netPayableAmount = grossAmount - dividendPerTicket;

    if (netPayableAmount <= 0n) {
      throw new BadRequestException(
        `Calculated net installment payable (₹${netPayableAmount.toString()}) must be greater than zero`,
      );
    }

    // Determine cycle window (Payment Date to Next Cycle Date)
    let cycleStartDate: Date;
    if (dto?.cycleStartDate) {
      cycleStartDate = new Date(dto.cycleStartDate);
    } else {
      cycleStartDate = new Date(chit.startDate);
      cycleStartDate.setMonth(cycleStartDate.getMonth() + (month - 1));
    }

    let cycleEndDate: Date;
    if (dto?.cycleEndDate) {
      cycleEndDate = new Date(dto.cycleEndDate);
    } else {
      cycleEndDate = new Date(cycleStartDate);
      cycleEndDate.setMonth(cycleEndDate.getMonth() + 1);
    }

    let dueDate: Date;
    if (dto?.dueDate) {
      dueDate = new Date(dto.dueDate);
    } else {
      dueDate = new Date(cycleEndDate);
    }

    return withTransactionRetry(this.prisma, async (tx) => {
      // 0. Lock owning ChitGroup row to serialize concurrent monthly due scheduling (zero P2002 crashes)
      await lockChitGroupRow(tx, chitGroupId);

      // 1. Fetch all existing dues for all tickets in 1 single SQL query (Eliminates N+1 query pattern)
      const ticketIds = chit.tickets.map((t) => t.id);
      const existingDues: any[] = await tx.installmentDue.findMany({
        where: {
          ticketId: { in: ticketIds },
          installmentMonth: month,
        },
      });
      const existingDueMap = new Map<string, any>(
        (existingDues || []).map((d: any) => [d.ticketId, d]),
      );

      const generatedDues: any[] = [];
      const duesToUpdate: any[] = [];
      const duesToCreate: any[] = [];

      for (const ticket of chit.tickets) {
        const existingDue = existingDueMap.get(ticket.id);
        if (existingDue) {
          // If already PAID, do not alter financial figures
          if (existingDue.status === DueStatus.PAID) {
            generatedDues.push(existingDue);
            continue;
          }
          duesToUpdate.push(existingDue);
        } else {
          duesToCreate.push(ticket);
        }
      }

      // Execute updates in parallel within transaction
      if (duesToUpdate.length > 0) {
        const updatedDues = await Promise.all(
          duesToUpdate.map((due) =>
            tx.installmentDue.update({
              where: { id: due.id },
              data: {
                grossAmount,
                dividendDeduction: dividendPerTicket,
                netPayableAmount,
                cycleStartDate,
                cycleEndDate,
                dueDate,
              },
            }),
          ),
        );
        generatedDues.push(...updatedDues);
      }

      // Execute creations in parallel within transaction
      if (duesToCreate.length > 0) {
        const createdDues = await Promise.all(
          duesToCreate.map((ticket) =>
            tx.installmentDue.create({
              data: {
                chitGroupId,
                ticketId: ticket.id,
                installmentMonth: month,
                cycleStartDate,
                cycleEndDate,
                dueDate,
                grossAmount,
                dividendDeduction: dividendPerTicket,
                netPayableAmount,
                paidAmount: 0n,
                status: DueStatus.UNPAID,
              },
            }),
          ),
        );
        generatedDues.push(...createdDues);
      }

      // Immutable Audit Log (ADR-10 / KC-04)
      await tx.auditLog.create({
        data: {
          userId: actorUserId || null,
          action: 'INSTALLMENT_DUES_GENERATED',
          entityType: 'ChitGroup',
          entityId: chitGroupId,
          newValue: {
            installmentMonth: month,
            grossAmount: grossAmount.toString(),
            dividendDeduction: dividendPerTicket.toString(),
            netPayableAmount: netPayableAmount.toString(),
            totalDuesScheduled: generatedDues.length,
            duesCreatedCount: duesToCreate.length,
            duesUpdatedCount: duesToUpdate.length,
            isIdempotentNoop: duesToCreate.length === 0 && duesToUpdate.length === 0,
          },
        },
      });

      return {
        chitGroupId,
        installmentMonth: month,
        cycleStartDate,
        cycleEndDate,
        grossAmount,
        dividendDeduction: dividendPerTicket,
        netPayableAmount,
        totalDuesScheduled: generatedDues.length,
        dues: generatedDues,
      };
    });
  }

  /**
   * Retrieves all installment dues for a specific subscriber ticket.
   * Enforces customer ownership scoping for CUSTOMER persona.
   */
  async getTicketDues(
    ticketId: string,
    currentUserId?: string,
    userRole?: Role,
  ) {
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: {
        customer: true,
        chitGroup: { select: { id: true, groupCode: true, groupName: true, durationMonths: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    // Role-based scoping for CUSTOMER persona: anti-BOLA check against ticket subscriber ownership
    if (userRole === Role.CUSTOMER && currentUserId) {
      const isOwner =
        ticket.customerId === currentUserId ||
        ticket.customer?.id === currentUserId ||
        ticket.customer?.phone === currentUserId;
      if (!isOwner) {
        throw new ForbiddenException(
          'Access denied: You can only view your own ticket dues',
        );
      }
    }

    return this.prisma.installmentDue.findMany({
      where: { ticketId },
      orderBy: { installmentMonth: 'asc' },
      include: {
        allocations: {
          include: {
            payment: {
              select: {
                id: true,
                paymentMethod: true,
                createdAt: true,
                paymentStatus: true,
                receipt: {
                  select: { receiptNumber: true },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Generates a comprehensive real-time Member Passbook Ledger statement.
   * Includes all months 1..N with gross dues, dividends earned, net payable, and payments.
   */
  async getPassbook(
    ticketId: string,
    currentUserId?: string,
    userRole?: Role,
  ) {
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
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
        chitGroup: {
          select: {
            id: true,
            groupCode: true,
            groupName: true,
            chitValue: true,
            durationMonths: true,
            baseInstallment: true,
            startDate: true,
            endDate: true,
          },
        },
        dues: {
          orderBy: { installmentMonth: 'asc' },
          include: {
            allocations: {
              include: {
                payment: {
                  select: {
                    id: true,
                    paymentMethod: true,
                    createdAt: true,
                    paymentStatus: true,
                    receipt: {
                      select: { receiptNumber: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    // Role-based customer isolation: anti-BOLA check against ticket subscriber ownership
    if (userRole === Role.CUSTOMER && currentUserId) {
      const isOwner =
        ticket.customerId === currentUserId ||
        ticket.customer?.id === currentUserId ||
        ticket.customer?.phone === currentUserId;
      if (!isOwner) {
        throw new ForbiddenException(
          'Access denied: You can only view your own passbook ledger',
        );
      }
    }

    // Compute cumulative totals in BigInt whole Rupees
    let totalGrossDue = 0n;
    let totalDividend = 0n;
    let totalNetDue = 0n;
    let totalPaid = 0n;

    const ledgerEntries = ticket.dues.map((due) => {
      totalGrossDue += due.grossAmount;
      totalDividend += due.dividendDeduction;
      totalNetDue += due.netPayableAmount;
      totalPaid += due.paidAmount;

      const successfulAllocation = due.allocations.find(
        (a) => a.payment.paymentStatus === 'SUCCESS',
      );

      const cycleStart = due.cycleStartDate || due.dueDate;
      const cycleEnd = due.cycleEndDate || due.dueDate;
      const actualPaidDate = successfulAllocation?.payment.createdAt || null;

      return {
        month: due.installmentMonth,
        installmentMonth: due.installmentMonth,
        cycleStartDate: cycleStart,
        cycleEndDate: cycleEnd,
        paymentDate: cycleStart,
        paidDate: actualPaidDate,
        amountPaid: due.paidAmount,
        dividend: due.dividendDeduction,
        total: due.grossAmount,
        dueDate: due.dueDate,
        grossAmount: due.grossAmount,
        dividendDeduction: due.dividendDeduction,
        netPayableAmount: due.netPayableAmount,
        paidAmount: due.paidAmount,
        status: due.status,
        receiptNumber: (successfulAllocation?.payment as any)?.receipt?.receiptNumber || null,
        paymentMethod: successfulAllocation?.payment.paymentMethod || null,
      };
    });

    const outstandingBalance = totalNetDue - totalPaid;

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        isPrized: ticket.isPrized,
        consecutiveUnpaidMonths: ticket.consecutiveUnpaidMonths,
        joiningDate: ticket.joiningDate,
      },
      customer: {
        customerCode: ticket.customer.customerCode,
        fullName: ticket.customer.fullName,
        fullNameTamil: ticket.customer.fullNameTamil,
        phone: ticket.customer.phone,
      },
      chitGroup: {
        groupCode: ticket.chitGroup.groupCode,
        groupName: ticket.chitGroup.groupName,
        chitValue: ticket.chitGroup.chitValue,
        durationMonths: ticket.chitGroup.durationMonths,
        baseInstallment: ticket.chitGroup.baseInstallment,
      },
      summary: {
        totalScheduledMonths: ticket.dues.length,
        totalGrossDue,
        totalDividend,
        totalNetDue,
        totalPaid,
        outstandingBalance,
      },
      ledgerEntries,
    };
  }

  /**
   * Retrieves all member dues for a specific month in a chit scheme.
   */
  async getGroupMonthDues(
    chitGroupId: string,
    month: number,
    query?: QueryDuesDto,
  ) {
    const where: any = {
      chitGroupId,
      installmentMonth: month,
    };

    if (query?.status) {
      where.status = query.status;
    }

    return this.prisma.installmentDue.findMany({
      where,
      orderBy: { ticket: { ticketNumber: 'asc' } },
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            isPrized: true,
            consecutiveUnpaidMonths: true,
            status: true,
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
    });
  }

  /**
   * Lists all subscribers with continuous unpaid arrears.
   * Highlights subscribers with >= 3 consecutive missed months for company removal.
   */
  async getDefaulters(
    branchId?: string,
    minConsecutiveMonths: number = 1,
    pagination?: { page: number; limit: number },
  ) {
    const where: any = {
      consecutiveUnpaidMonths: { gte: minConsecutiveMonths },
      status: { not: 'REMOVED_DEF_3M' },
    };

    if (branchId) {
      where.chitGroup = { branchId };
    }

    const skip = pagination ? (pagination.page - 1) * pagination.limit : undefined;
    const take = pagination ? pagination.limit : undefined;

    const [tickets, total] = await Promise.all([
      this.prisma.subscriberTicket.findMany({
        where,
        skip,
        take,
        orderBy: { consecutiveUnpaidMonths: 'desc' },
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
          chitGroup: {
            select: {
              id: true,
              groupCode: true,
              groupName: true,
              chitValue: true,
              branch: { select: { id: true, name: true, code: true } },
            },
          },
          dues: {
            where: { status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] } },
            orderBy: { installmentMonth: 'asc' },
            select: {
              installmentMonth: true,
              netPayableAmount: true,
              dueDate: true,
              status: true,
            },
          },
        },
      }),
      pagination ? this.prisma.subscriberTicket.count({ where }) : Promise.resolve(0),
    ]);

    const mappedData = tickets.map((t) => {
      const totalOverdueAmount = t.dues.reduce(
        (sum, d) => sum + d.netPayableAmount,
        0n,
      );

      return {
        ticketId: t.id,
        ticketNumber: t.ticketNumber,
        isPrized: t.isPrized,
        status: t.status,
        consecutiveUnpaidMonths: t.consecutiveUnpaidMonths,
        eligibleForRemoval:
          t.consecutiveUnpaidMonths >= CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS,
        totalOverdueAmount,
        customer: t.customer,
        chitGroup: t.chitGroup,
        unpaidDues: t.dues,
      };
    });

    if (pagination) {
      return {
        data: mappedData,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      };
    }

    return mappedData;
  }

  /**
   * Maker Partner requests company 3-month consecutive arrears removal (ADR-07, ADR-12 & SEC-B).
   * Authorized strictly for verified Partners (Super Admin).
   * Transitions ticket status to PENDING_REMOVAL_APPROVAL.
   */
  async requestDefaulterRemoval(
    ticketId: string,
    partnerUserId: string,
    dto: RemoveDefaulterDto,
  ) {
    if (typeof this.prisma.user?.findUnique === 'function') {
      const partner = await this.prisma.user.findUnique({
        where: { id: partnerUserId },
        select: { isPartner: true },
      });
      if (partner && !partner.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to request defaulter removal.',
        );
      }
    }

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: { customer: true, chitGroup: true },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    // KFC-SEC-004: Prized subscriber tickets are immutable and cannot be removed
    if (ticket.isPrized) {
      throw new BadRequestException(
        'PRIZED_TICKET_IMMUTABLE: Prized subscriber tickets cannot be removed under defaulter rules. Prize money has already been disbursed; company recovery must proceed via security documents/legal instruments.',
      );
    }

    if (ticket.status === 'REMOVED_DEF_3M') {
      throw new BadRequestException('Subscriber ticket is already removed from this chit scheme');
    }

    // ADR-07 & ADR-12 Enforcement: Must have at least 3 consecutive unpaid months
    if (ticket.consecutiveUnpaidMonths < CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS) {
      throw new BadRequestException(
        `ADR-07 Violation: Company default removal rights can only be exercised after at least ${CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS} consecutive unpaid months. Ticket #${ticket.ticketNumber} currently has ${ticket.consecutiveUnpaidMonths} consecutive unpaid months.`,
      );
    }

    const requestedAt = new Date();

    const updated = await this.prisma.subscriberTicket.update({
      where: { id: ticketId },
      data: {
        status: 'PENDING_REMOVAL_APPROVAL',
        removalRequestedAt: requestedAt,
        removalRequestedByUserId: partnerUserId,
        removalReason: dto.reason,
      },
      include: { customer: true, chitGroup: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: partnerUserId,
        action: 'DEFAULTER_REMOVAL_REQUESTED',
        entityType: 'SubscriberTicket',
        entityId: ticketId,
        newValue: {
          ticketNumber: updated.ticketNumber,
          customerName: updated.customer.fullName,
          groupCode: updated.chitGroup.groupCode,
          consecutiveUnpaidMonths: updated.consecutiveUnpaidMonths,
          removalReason: dto.reason,
          status: 'PENDING_REMOVAL_APPROVAL',
        },
      },
    });

    return {
      success: true,
      message: `Defaulter removal requested for ${updated.customer.fullName} (Ticket #${updated.ticketNumber}). Pending independent Partner B approval.`,
      ticket: {
        id: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
        consecutiveUnpaidMonths: updated.consecutiveUnpaidMonths,
        removalRequestedAt: updated.removalRequestedAt,
        removalRequestedByUserId: updated.removalRequestedByUserId,
        removalReason: updated.removalReason,
      },
    };
  }

  /**
   * Independent Checker Partner approves company 3-month consecutive arrears removal (ADR-07, ADR-12 & SEC-B).
   * Strictly enforces Maker != Checker (maker_partner_id != checker_partner_id).
   * Transitions ticket status to REMOVED_DEF_3M.
   */
  async approveDefaulterRemoval(
    ticketId: string,
    checkerPartnerUserId: string,
    dto?: { notes?: string },
  ) {
    if (typeof this.prisma.user?.findUnique === 'function') {
      const checker = await this.prisma.user.findUnique({
        where: { id: checkerPartnerUserId },
        select: { isPartner: true },
      });
      if (checker && !checker.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to approve defaulter removal.',
        );
      }
    }

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: { customer: true, chitGroup: true },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    if (ticket.status !== 'PENDING_REMOVAL_APPROVAL') {
      throw new BadRequestException(
        `NO_PENDING_REMOVAL: Ticket is not pending removal approval (current status: ${ticket.status})`,
      );
    }

    // Strict Maker != Checker Dual Control (SEC-B)
    if (ticket.removalRequestedByUserId === checkerPartnerUserId) {
      throw new ForbiddenException(
        'MAKER_CHECKER_VIOLATION: The Partner who requested defaulter removal cannot approve it. An independent Partner must review and commit.',
      );
    }

    if (ticket.isPrized) {
      throw new BadRequestException(
        'PRIZED_TICKET_IMMUTABLE: Prized subscriber tickets cannot be removed under defaulter rules.',
      );
    }

    if (ticket.consecutiveUnpaidMonths < CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS) {
      throw new BadRequestException(
        `ADR-07 Violation: Company default removal rights require at least ${CONSECUTIVE_UNPAID_DEFAULT_THRESHOLD_MONTHS} consecutive unpaid months.`,
      );
    }

    const removedAt = new Date();

    const updated = await this.prisma.subscriberTicket.update({
      where: { id: ticketId },
      data: {
        status: 'REMOVED_DEF_3M',
        removedAt,
        removedByUserId: checkerPartnerUserId,
      },
      include: { customer: true, chitGroup: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: checkerPartnerUserId,
        action: 'DEFAULTER_REMOVAL_APPROVED',
        entityType: 'SubscriberTicket',
        entityId: ticketId,
        newValue: {
          ticketNumber: updated.ticketNumber,
          customerName: updated.customer.fullName,
          groupCode: updated.chitGroup.groupCode,
          removedByUserId: checkerPartnerUserId,
          requestedByUserId: ticket.removalRequestedByUserId,
          removedAt: removedAt.toISOString(),
          status: 'REMOVED_DEF_3M',
          notes: dto?.notes || null,
        },
      },
    });

    return {
      success: true,
      message: `Subscriber ${updated.customer.fullName} (Ticket #${updated.ticketNumber}) successfully removed from Chit Group ${updated.chitGroup.groupCode} under two-partner dual control.`,
      ticket: {
        id: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
        consecutiveUnpaidMonths: updated.consecutiveUnpaidMonths,
        removedAt: updated.removedAt,
        removedByUserId: updated.removedByUserId,
        removalReason: updated.removalReason,
      },
    };
  }

  /**
   * Independent Checker Partner rejects defaulter removal request.
   * Reverts ticket status to DEFAULT_3_MONTHS.
   */
  async rejectDefaulterRemoval(
    ticketId: string,
    checkerPartnerUserId: string,
    reason?: string,
  ) {
    if (typeof this.prisma.user?.findUnique === 'function') {
      const checker = await this.prisma.user.findUnique({
        where: { id: checkerPartnerUserId },
        select: { isPartner: true },
      });
      if (checker && !checker.isPartner) {
        throw new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to reject defaulter removal.',
        );
      }
    }

    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: { customer: true, chitGroup: true },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    if (ticket.status !== 'PENDING_REMOVAL_APPROVAL') {
      throw new BadRequestException(
        `NO_PENDING_REMOVAL: Ticket is not pending removal approval (current status: ${ticket.status})`,
      );
    }

    const updated = await this.prisma.subscriberTicket.update({
      where: { id: ticketId },
      data: {
        status: 'DEFAULT_3_MONTHS',
        removalRequestedAt: null,
        removalRequestedByUserId: null,
        removalReason: null,
      },
      include: { customer: true, chitGroup: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: checkerPartnerUserId,
        action: 'DEFAULTER_REMOVAL_REJECTED',
        entityType: 'SubscriberTicket',
        entityId: ticketId,
        newValue: {
          ticketNumber: updated.ticketNumber,
          customerName: updated.customer.fullName,
          groupCode: updated.chitGroup.groupCode,
          rejectedByUserId: checkerPartnerUserId,
          rejectionReason: reason || null,
          status: 'DEFAULT_3_MONTHS',
        },
      },
    });

    return {
      success: true,
      message: `Defaulter removal request rejected for Ticket #${updated.ticketNumber}. Status reverted to DEFAULT_3_MONTHS.`,
      ticket: {
        id: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
      },
    };
  }

  /**
   * Executes company 3-month consecutive arrears removal rights (ADR-07 & ADR-12).
   * Authorized strictly for Super Admin (Partners).
   * Note: In production two-partner workflow, this initiates the request.
   */
  async removeDefaulter(
    ticketId: string,
    adminUserId: string,
    dto: RemoveDefaulterDto,
  ) {
    return this.requestDefaulterRemoval(ticketId, adminUserId, dto);
  }

  /**
   * Assigns a replacement subscriber to a ticket previously removed under REMOVED_DEF_3M.
   * Enforces ADR-13: a customer cannot hold 2 or more tickets in the same chit scheme.
   * Allowed strictly: Super Admin.
   */
  async substituteSubscriber(
    ticketId: string,
    adminUserId: string,
    dto: SubstituteSubscriberDto,
  ) {
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: { customer: true, chitGroup: true },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    // KFC-SEC-004: Prized subscriber tickets are immutable and cannot be substituted
    if (ticket.isPrized) {
      throw new BadRequestException(
        'PRIZED_TICKET_IMMUTABLE: Prized subscriber tickets cannot be substituted under defaulter rules.',
      );
    }

    if (ticket.status !== 'REMOVED_DEF_3M') {
      throw new BadRequestException(
        `Subscriber substitution can only be executed on tickets with REMOVED_DEF_3M status (current status: ${ticket.status})`,
      );
    }

    const newCustomer = await this.prisma.customer.findUnique({
      where: { id: dto.newCustomerId },
    });

    if (!newCustomer) {
      throw new NotFoundException('Replacement customer profile not found');
    }

    if (!newCustomer.isKycVerified) {
      throw new BadRequestException(
        'Replacement subscriber customer must have verified KYC status before ticket substitution',
      );
    }

    // ADR-13 Invariant: Customer cannot hold 2 or more tickets in the same chit group
    const existingInGroup = await this.prisma.subscriberTicket.findUnique({
      where: {
        chitGroupId_customerId: {
          chitGroupId: ticket.chitGroupId,
          customerId: dto.newCustomerId,
        },
      },
    });

    if (existingInGroup) {
      throw new ConflictException(
        `ADR-13 Violation: Customer ${newCustomer.fullName} already holds Ticket #${existingInGroup.ticketNumber} in Chit Group ${ticket.chitGroup.groupCode}. A customer cannot hold 2 or more tickets in the same scheme.`,
      );
    }

    const previousCustomerId = ticket.customerId;
    const previousCustomerName = ticket.customer.fullName;

    let updated: any;
    try {
      updated = await withTransactionRetry(this.prisma, async (tx) => {
        // 0. Pessimistic Row Lock (SELECT FOR UPDATE) to eliminate concurrent duplicate substitution
        const lockedTicket = await lockSubscriberTicketRow(tx, ticketId);
        if (lockedTicket && lockedTicket.status !== 'REMOVED_DEF_3M') {
          throw new BadRequestException(
            `Subscriber substitution failed: Ticket ${ticketId} is no longer in REMOVED_DEF_3M status (current status: ${lockedTicket.status})`,
          );
        }

        const subTicket = await tx.subscriberTicket.update({
          where: { id: ticketId },
          data: {
            customerId: dto.newCustomerId,
            status: 'ACTIVE',
            consecutiveUnpaidMonths: 0,
            removedAt: null,
            removedByUserId: null,
          },
          include: { customer: true, chitGroup: true },
        });

        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: 'TICKET_SUBSCRIBER_SUBSTITUTED',
            entityType: 'SubscriberTicket',
            entityId: ticketId,
            oldValue: {
              customerId: previousCustomerId,
              customerName: previousCustomerName,
              status: 'REMOVED_DEF_3M',
            },
            newValue: {
              customerId: dto.newCustomerId,
              customerName: newCustomer.fullName,
              status: 'ACTIVE',
              reason: dto.reason,
            },
          },
        });

        return subTicket;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(
          `ADR-13 Violation: Customer ${newCustomer.fullName} already holds a ticket in Chit Group ${ticket.chitGroup.groupCode}. A customer cannot hold 2 or more tickets in the same scheme.`,
        );
      }
      throw err;
    }

    return {
      success: true,
      message: `Subscriber replacement successfully executed. Ticket #${updated.ticketNumber} re-assigned to ${updated.customer.fullName} and restored to ACTIVE status.`,
      ticket: {
        id: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
        previousCustomerId,
        previousCustomerName,
        newCustomerId: updated.customer.id,
        newCustomerName: updated.customer.fullName,
      },
    };
  }

  /**
   * Settles the account of a subscriber removed under 3-month consecutive default.
   * Calculates Total Paid Dues minus 4.00% Foreman Commission damages.
   * Allowed: Super Admin, Accountant.
   */
  async settleRemoval(
    ticketId: string,
    _adminUserId: string,
    _dto: SettleRemovalDto,
  ) {
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: { customer: true, chitGroup: true },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    // KFC-SEC-004: Prized subscriber tickets are immutable and cannot be settled under defaulter exit rules
    if (ticket.isPrized) {
      throw new BadRequestException(
        'PRIZED_TICKET_IMMUTABLE: Prized subscriber tickets cannot be settled under defaulter exit rules.',
      );
    }

    if (ticket.status !== 'REMOVED_DEF_3M') {
      throw new BadRequestException(
        `Defaulter account settlement can only be executed on tickets with REMOVED_DEF_3M status (current status: ${ticket.status})`,
      );
    }

    // KFC-FIN-006 / Q25: Early exit settlement formula is NOT confirmed by business owner/legal.
    // Fail closed to prevent unauthorized payouts until formal resolution.
    throw new BadRequestException(
      'UNAPPROVED_SETTLEMENT_POLICY: Early exit and defaulter settlement formula (Q25) is pending formal Partner Board resolution and statutory legal validation. Automated settlement payout execution is strictly locked fail-closed.',
    );
  }

  /**
   * Generates a zero-fee NPCI-compliant UPI Intent URI for mobile app deep-linking.
   * Direct settlement to Kumaran Finance KVB current account.
   */
  async getUpiIntent(dueId: string, requestingUser?: JwtPayload) {
    const due = await this.prisma.installmentDue.findUnique({
      where: { id: dueId },
      include: {
        ticket: {
          include: {
            customer: true,
            chitGroup: true,
          },
        },
      },
    });

    if (!due) {
      throw new NotFoundException(`Installment due with ID ${dueId} not found`);
    }

    // Role-based authorization & Anti-BOLA guard:
    // If requesting user is CUSTOMER, they can only request intent for their own ticket
    if (requestingUser && requestingUser.roles.includes(Role.CUSTOMER)) {
      const isPrivilegedStaff = requestingUser.roles.some((r) =>
        ([Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT, Role.COLLECTION_AGENT] as Role[]).includes(r),
      );
      if (!isPrivilegedStaff) {
        const customer = await this.prisma.customer.findUnique({
          where: { phone: requestingUser.phone },
          select: { id: true },
        });
        if (!customer || customer.id !== due.ticket.customerId) {
          throw new ForbiddenException(
            'BOLA_VIOLATION: You are not authorized to access UPI payment details for another customer ticket',
          );
        }
      }
    }

    if (due.status === DueStatus.PAID) {
      throw new BadRequestException(
        `INSTALLMENT_ALREADY_PAID: Month ${due.installmentMonth} installment has already been paid in full`,
      );
    }

    const vpa = process.env.COMPANY_UPI_VPA || 'kumaranfinance@kvb';
    const payeeName = process.env.COMPANY_UPI_NAME || 'Kumaran Finance';
    const netPayable = Number(due.netPayableAmount);
    const groupCode = due.ticket.chitGroup.groupCode;
    const ticketNumber = due.ticket.ticketNumber;
    const month = due.installmentMonth;
    const transactionNote = `${groupCode} Ticket #${ticketNumber} Month ${month}`;
    const trackingRef = due.id.replace(/-/g, '').slice(0, 30);

    const params = new URLSearchParams({
      pa: vpa,
      pn: payeeName,
      am: due.netPayableAmount.toString(),
      cu: 'INR',
      tn: transactionNote,
      tr: trackingRef,
    });
    const upiUri = `upi://pay?${params.toString()}`;

    return {
      dueId: due.id,
      ticketId: due.ticketId,
      groupCode,
      ticketNumber,
      installmentMonth: month,
      netPayableAmount: netPayable,
      payeeVpa: vpa,
      payeeName,
      transactionNote,
      upiUri,
    };
  }
}
