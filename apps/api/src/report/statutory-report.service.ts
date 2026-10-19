import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { QueryCashBookDto } from './dto/query-cash-book.dto';
import { QueryFormXviiDto } from './dto/query-form-xvii.dto';
import { QueryFormXxiDto } from './dto/query-form-xxi.dto';

@Injectable()
export class StatutoryReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Form XXII: Cash Book Register (Physical Cash Only)
   * Strictly isolates physical currency notes and coins in the branch vault/safe.
   * Reconciliation Invariant: Closing Safe Cash = Opening Safe Cash + Cash Inflows - Cash Outflows
   */
  async getCashBookFormXxii(
    query: QueryCashBookDto,
    requestingUser: JwtPayload,
  ) {
    const targetDate = query.date ? new Date(query.date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const branchId =
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN)
        ? requestingUser.branchId || undefined
        : query.branchId;

    // 1. Calculate Opening Safe Cash: Cash Inflows prior to targetDate - Cash Outflows prior to targetDate
    const priorCashInflows = await this.prisma.payment.aggregate({
      where: {
        paymentMethod: 'CASH',
        paymentStatus: 'SUCCESS',
        createdAt: { lt: startOfDay },
        ...(branchId ? { branchId } : {}),
        OR: [
          { cashHandoverStatus: 'ACKNOWLEDGED' },
          { cashHandoverStatus: null },
        ],
      },
      _sum: { amount: true },
    });

    const priorCashOutflows = await this.prisma.auctionWinner.aggregate({
      where: {
        disbursementMode: 'CASH',
        disbursementStatus: 'DISBURSED',
        disbursedAt: { lt: startOfDay },
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      _sum: { disbursedAmount: true },
    });

    const openingCash =
      (priorCashInflows._sum.amount || 0n) -
      (priorCashOutflows._sum.disbursedAmount || 0n);

    // 2. Query Today's Cash Inflows
    const todayPayments = await this.prisma.payment.findMany({
      where: {
        paymentMethod: 'CASH',
        paymentStatus: 'SUCCESS',
        createdAt: { gte: startOfDay, lte: endOfDay },
        ...(branchId ? { branchId } : {}),
        OR: [
          { cashHandoverStatus: 'ACKNOWLEDGED' },
          { cashHandoverStatus: null },
        ],
      },
      include: {
        recordedByUser: { select: { id: true, name: true, phone: true } },
        receipt: { select: { receiptNumber: true } },
        allocations: {
          include: {
            ticket: {
              select: {
                ticketNumber: true,
                chitGroup: { select: { groupCode: true } },
                customer: { select: { customerCode: true, fullName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 3. Query Today's Cash Outflows
    const todayDisbursements = await this.prisma.auctionWinner.findMany({
      where: {
        disbursementMode: 'CASH',
        disbursementStatus: 'DISBURSED',
        disbursedAt: { gte: startOfDay, lte: endOfDay },
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      include: {
        auction: {
          select: {
            installmentMonth: true,
            chitGroup: { select: { groupCode: true, chitValue: true } },
          },
        },
        ticket: {
          select: {
            ticketNumber: true,
            customer: { select: { customerCode: true, fullName: true } },
          },
        },
      },
      orderBy: { disbursedAt: 'asc' },
    });

    let todayInflowsTotal = 0n;
    const inflows = todayPayments.map((p) => {
      todayInflowsTotal += p.amount;
      const firstAlloc = p.allocations[0];
      return {
        paymentId: p.id,
        receiptNumber: p.receipt?.receiptNumber || 'N/A',
        time: p.createdAt,
        amount: p.amount,
        customerCode: firstAlloc?.ticket.customer.customerCode || 'N/A',
        customerName: firstAlloc?.ticket.customer.fullName || 'N/A',
        groupCode: firstAlloc?.ticket.chitGroup.groupCode || 'N/A',
        ticketNumber: firstAlloc?.ticket.ticketNumber || null,
        receivedBy: p.recordedByUser.name,
        source: p.cashHandoverStatus === 'ACKNOWLEDGED' ? 'FIELD_HANDOVER' : 'COUNTER_CASH',
      };
    });

    let todayOutflowsTotal = 0n;
    const outflows = todayDisbursements.map((d) => {
      const amount = d.disbursedAmount || 0n;
      todayOutflowsTotal += amount;
      return {
        winnerId: d.id,
        voucherNumber: d.paymentReference || 'N/A',
        time: d.disbursedAt,
        amount,
        groupCode: d.auction.chitGroup.groupCode,
        installmentMonth: d.auction.installmentMonth,
        ticketNumber: d.ticket.ticketNumber,
        winnerCode: d.ticket.customer.customerCode,
        winnerName: d.ticket.customer.fullName,
      };
    });

    const closingCash = openingCash + todayInflowsTotal - todayOutflowsTotal;

    return {
      statutoryStatus: 'UNVERIFIED-LEGAL',
      registerName: 'Form XXII: Cash Book Register',
      description:
        'Daily register of physical currency notes and coins held in the branch safe / vault.',
      date: startOfDay.toISOString().split('T')[0],
      branchId: branchId || 'ALL_BRANCHES',
      reconciliation: {
        openingCashInSafe: openingCash,
        todayCashInflows: todayInflowsTotal,
        todayCashOutflows: todayOutflowsTotal,
        closingCashInSafe: closingCash,
      },
      inflows,
      outflows,
    };
  }

  /**
   * Form XVII: Auction Minutes Consolidated Register (`UNVERIFIED-LEGAL`)
   * Consolidated chronological record of all auctions for a chit scheme.
   */
  async getAuctionMinutesFormXvii(
    query: QueryFormXviiDto,
    requestingUser: JwtPayload,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: query.chitGroupId },
      include: {
        branch: { select: { id: true, name: true, nameTamil: true } },
      },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN) &&
      requestingUser.branchId &&
      chit.branchId !== requestingUser.branchId
    ) {
      throw new ForbiddenException('Access denied: Chit belongs to another branch');
    }

    const whereAuction: {
      chitGroupId: string;
      status: 'MINUTES_FILED' | 'COMPLETED';
      auctionDate?: { gte?: Date; lte?: Date };
    } = {
      chitGroupId: query.chitGroupId,
      status: 'MINUTES_FILED',
    };

    if (query.fromDate || query.toDate) {
      whereAuction.auctionDate = {};
      if (query.fromDate) whereAuction.auctionDate.gte = new Date(query.fromDate);
      if (query.toDate) whereAuction.auctionDate.lte = new Date(query.toDate);
    }

    const auctions = await this.prisma.auction.findMany({
      where: whereAuction,
      include: {
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
                    customerCode: true,
                    fullName: true,
                  },
                },
              },
            },
          },
          orderBy: { tokenNumber: 'asc' },
        },
        minutes: true,
      },
      orderBy: { installmentMonth: 'asc' },
    });

    const auctionRecords = auctions.map((a) => {
      const winnerTicket = a.winner?.ticket;
      const winnerCustomer = winnerTicket?.customer;
      return {
        auctionId: a.id,
        installmentMonth: a.installmentMonth,
        auctionDate: a.auctionDate,
        chitValue: chit.chitValue,
        bidDiscount: a.bidDiscount || 0n,
        foremanCommissionAmount: a.foremanCommissionAmount || 0n,
        foremanCommissionRate: '4.00%',
        totalDividend: a.totalDividend || 0n,
        dividendPerTicket: a.dividendPerTicket || 0n,
        nextMonthNetInstallment:
          chit.baseInstallment - (a.dividendPerTicket || 0n),
        prizeMoney: a.prizeMoney || 0n,
        winner: winnerCustomer
          ? {
              ticketNumber: winnerTicket?.ticketNumber,
              customerCode: winnerCustomer.customerCode,
              fullName: winnerCustomer.fullName,
              fullNameTamil: winnerCustomer.fullNameTamil,
              phone: winnerCustomer.phone,
              wasTieBreakWinner: a.winner?.wasTieBreakWinner || false,
            }
          : null,
        tiedBiddersCount: a.tieBidders.length,
        tiedBidders: a.tieBidders.map((tb) => ({
          ticketNumber: tb.ticket.ticketNumber,
          customerCode: tb.ticket.customer.customerCode,
          customerName: tb.ticket.customer.fullName,
          tokenNumberDrawn: tb.tokenNumber,
          isWinner: tb.isWinner,
        })),
        conductedByUserId: a.conductedByUserId,
        finalizedByUserId: a.finalizedByUserId,
        subscribersPresent: a.minutes?.subscribersPresent || 0,
        minutesProceedingsText: a.minutes?.minutesText || 'Minutes pending entry',
        signedByForeman: a.minutes?.signedByForeman || false,
        filedAtRegistrar: a.minutes?.filedAtRegistrar || false,
        filedDate: a.minutes?.filedDate || null,
        filingReference: a.minutes?.filingReference || null,
        filingNotes: a.minutes?.filingNotes || null,
      };
    });

    return {
      statutoryStatus: 'UNVERIFIED-LEGAL',
      registerName: 'Form XVII: Auction Minutes Consolidated Register',
      chitGroup: {
        id: chit.id,
        groupCode: chit.groupCode,
        groupName: chit.groupName,
        chitValue: chit.chitValue,
        durationMonths: chit.durationMonths,
        baseInstallment: chit.baseInstallment,
        branchName: chit.branch.name,
        branchNameTamil: chit.branch.nameTamil,
      },
      totalAuctionsFinalized: auctions.length,
      auctions: auctionRecords,
    };
  }

  /**
   * Form XXI: Subscriber Ledger Register (`UNVERIFIED-LEGAL`)
   * Continuous 20-month schedule with dividend credits, payments, and arrears for tickets.
   */
  async getSubscriberLedgerFormXxi(
    query: QueryFormXxiDto,
    requestingUser: JwtPayload,
  ) {
    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: query.chitGroupId },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    if (
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN) &&
      requestingUser.branchId &&
      chit.branchId !== requestingUser.branchId
    ) {
      throw new ForbiddenException('Access denied: Chit belongs to another branch');
    }

    // Role-based customer isolation
    let customerFilterPhone: string | undefined;
    if (requestingUser.roles.includes(Role.CUSTOMER)) {
      customerFilterPhone = requestingUser.phone;
    }

    const tickets = await this.prisma.subscriberTicket.findMany({
      where: {
        chitGroupId: query.chitGroupId,
        ...(query.ticketNumber ? { ticketNumber: query.ticketNumber } : {}),
        ...(customerFilterPhone
          ? { customer: { phone: customerFilterPhone } }
          : {}),
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
        dues: {
          orderBy: { installmentMonth: 'asc' },
          include: {
            allocations: {
              include: {
                payment: {
                  include: {
                    receipt: { select: { receiptNumber: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { ticketNumber: 'asc' },
    });

    if (requestingUser.roles.includes(Role.CUSTOMER) && tickets.length === 0) {
      throw new ForbiddenException(
        'Access denied: You are not enrolled in this chit group or ticket',
      );
    }

    const ticketLedgers = tickets.map((t) => {
      let totalGrossDue = 0n;
      let totalDividendCredit = 0n;
      let totalNetPayable = 0n;
      let totalPaid = 0n;
      let totalOutstandingArrears = 0n;

      const schedule = t.dues.map((d) => {
        totalGrossDue += d.grossAmount;
        totalDividendCredit += d.dividendDeduction;
        totalNetPayable += d.netPayableAmount;
        totalPaid += d.paidAmount;

        const unpaidDue =
          d.status !== 'PAID' ? d.netPayableAmount - d.paidAmount : 0n;
        if (unpaidDue > 0n) {
          totalOutstandingArrears += unpaidDue;
        }

        const alloc = d.allocations[0];
        return {
          installmentMonth: d.installmentMonth,
          dueDate: d.dueDate,
          grossAmount: d.grossAmount,
          dividendDeduction: d.dividendDeduction,
          netPayableAmount: d.netPayableAmount,
          paidAmount: d.paidAmount,
          status: d.status,
          paymentDate: alloc?.payment.createdAt || null,
          receiptNumber: alloc?.payment.receipt?.receiptNumber || null,
          paymentMethod: alloc?.payment.paymentMethod || null,
        };
      });

      return {
        ticketId: t.id,
        ticketNumber: t.ticketNumber,
        isPrized: t.isPrized,
        consecutiveUnpaidMonths: t.consecutiveUnpaidMonths,
        ticketStatus: t.status,
        customer: t.customer,
        summary: {
          totalGrossDue,
          totalDividendCredit,
          totalNetPayable,
          totalPaid,
          totalOutstandingArrears,
        },
        monthlySchedule: schedule,
      };
    });

    return {
      statutoryStatus: 'UNVERIFIED-LEGAL',
      registerName: 'Form XXI: Subscriber Ledger Register',
      chitGroup: {
        id: chit.id,
        groupCode: chit.groupCode,
        groupName: chit.groupName,
        chitValue: chit.chitValue,
        durationMonths: chit.durationMonths,
        baseInstallment: chit.baseInstallment,
      },
      totalTicketsReturned: ticketLedgers.length,
      ledgers: ticketLedgers,
    };
  }
}
