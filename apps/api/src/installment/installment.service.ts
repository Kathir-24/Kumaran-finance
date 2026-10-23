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

    return this.prisma.$transaction(async (tx) => {
      const generatedDues = [];

      for (const ticket of chit.tickets) {
        const existingDue = await tx.installmentDue.findUnique({
          where: {
            ticketId_installmentMonth: {
              ticketId: ticket.id,
              installmentMonth: month,
            },
          },
        });

        if (existingDue) {
          // If already PAID, do not alter financial figures
          if (existingDue.status === DueStatus.PAID) {
            generatedDues.push(existingDue);
            continue;
          }

          const updated = await tx.installmentDue.update({
            where: { id: existingDue.id },
            data: {
              grossAmount,
              dividendDeduction: dividendPerTicket,
              netPayableAmount,
              cycleStartDate,
              cycleEndDate,
              dueDate,
            },
          });
          generatedDues.push(updated);
        } else {
          const created = await tx.installmentDue.create({
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
          });
          generatedDues.push(created);
        }
      }

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

    // Role-based scoping for CUSTOMER persona
    if (userRole === Role.CUSTOMER && currentUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { phone: true },
      });
      if (!user || user.phone !== ticket.customer.phone) {
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

    // Role-based customer isolation
    if (userRole === Role.CUSTOMER && currentUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { phone: true },
      });
      if (!user || user.phone !== ticket.customer.phone) {
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
  async getDefaulters(branchId?: string, minConsecutiveMonths: number = 1) {
    const where: any = {
      consecutiveUnpaidMonths: { gte: minConsecutiveMonths },
      status: { not: 'REMOVED_DEF_3M' },
    };

    if (branchId) {
      where.chitGroup = { branchId };
    }

    const tickets = await this.prisma.subscriberTicket.findMany({
      where,
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
    });

    return tickets.map((t) => {
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
  }

  /**
   * Executes company 3-month consecutive arrears removal rights (ADR-07 & ADR-12).
   * Authorized strictly for Super Admin (Partners).
   */
  async removeDefaulter(
    ticketId: string,
    adminUserId: string,
    dto: RemoveDefaulterDto,
  ) {
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: { customer: true, chitGroup: true },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
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

    const removedAt = new Date();

    const updated = await this.prisma.subscriberTicket.update({
      where: { id: ticketId },
      data: {
        status: 'REMOVED_DEF_3M',
        removedAt,
        removedByUserId: adminUserId,
      },
      include: { customer: true, chitGroup: true },
    });

    return {
      success: true,
      message: `Subscriber ${updated.customer.fullName} (Ticket #${updated.ticketNumber}) successfully removed from Chit Group ${updated.chitGroup.groupCode} under 3-month consecutive default rule.`,
      ticket: {
        id: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
        consecutiveUnpaidMonths: updated.consecutiveUnpaidMonths,
        removedAt: updated.removedAt,
        removedByUserId: updated.removedByUserId,
        removalReason: dto.reason,
      },
    };
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

    const updated = await this.prisma.$transaction(async (tx) => {
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
    adminUserId: string,
    dto: SettleRemovalDto,
  ) {
    const ticket = await this.prisma.subscriberTicket.findUnique({
      where: { id: ticketId },
      include: { customer: true, chitGroup: true },
    });

    if (!ticket) {
      throw new NotFoundException('Subscriber ticket not found');
    }

    if (ticket.status !== 'REMOVED_DEF_3M') {
      throw new BadRequestException(
        `Defaulter account settlement can only be executed on tickets with REMOVED_DEF_3M status (current status: ${ticket.status})`,
      );
    }

    // Whole Rupee Math: Total paid installments for this ticket
    const allocations = await this.prisma.paymentAllocation.findMany({
      where: { ticketId },
    });

    const totalPaidAmount = allocations.reduce(
      (sum, a) => sum + a.amountAllocated,
      0n,
    );

    // 4.00% Foreman Commission damages based on total chit value
    const damagesAmount = (ticket.chitGroup.chitValue * 4n) / 100n;

    // Refund is remaining paid dues minus damages (bounded at ₹0)
    const refundAmount =
      totalPaidAmount > damagesAmount ? totalPaidAmount - damagesAmount : 0n;

    const voucherNumber = `KC-VOU-DEF-${Date.now().toString().slice(-6)}`;
    const settledAt = new Date();

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'DEF_SETTLEMENT_PROCESSED',
        entityType: 'SubscriberTicket',
        entityId: ticketId,
        newValue: {
          totalPaid: totalPaidAmount.toString(),
          damagesDeducted: damagesAmount.toString(),
          refundAmount: refundAmount.toString(),
          voucherNumber,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
        },
      },
    });

    return {
      success: true,
      message: `Defaulter account for ${ticket.customer.fullName} (Ticket #${ticket.ticketNumber}) successfully settled.`,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customer.fullName,
      groupCode: ticket.chitGroup.groupCode,
      totalPaid: Number(totalPaidAmount),
      damagesDeducted: Number(damagesAmount),
      refundAmount: Number(refundAmount),
      voucherNumber,
      settledAt,
    };
  }
}
