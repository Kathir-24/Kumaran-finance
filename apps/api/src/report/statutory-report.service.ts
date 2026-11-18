import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { QueryCashBookDto } from './dto/query-cash-book.dto';
import { QueryFormXviiDto } from './dto/query-form-xvii.dto';
import { QueryFormXxiDto } from './dto/query-form-xxi.dto';
import {
  assertChitBranchAccess,
  assertStatutoryRegisterCallerPrecheck,
  computeRegistrarFilingCompliance,
  formatFrozenCommissionRate,
  getIstDayBounds,
  parseStrictIstDateRange,
  resolveCustomerLedgerWhere,
  resolveScopedBranchId,
} from './helpers/report-scope.helper';

@Injectable()
export class StatutoryReportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Form XXII: Cash Book Register (Physical Cash Only)
   * Strictly isolates physical currency notes and coins in the branch vault/safe
   * using exact Asia/Kolkata (IST) calendar day boundaries.
   * Reconciliation Invariant: Closing Safe Cash = Opening Safe Cash + Cash Inflows - Cash Outflows
   */
  async getCashBookFormXxii(
    query: QueryCashBookDto,
    requestingUser: JwtPayload,
  ) {
    const { dateStr, startOfDay, endOfDay } = getIstDayBounds(query.date, 'date');
    const branchId = resolveScopedBranchId(requestingUser, query.branchId);

    // 1. Calculate Opening Safe Cash: Cash Inflows prior to IST startOfDay - Cash Outflows prior to IST startOfDay
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

    // 2. Query Target IST Day Cash Inflows
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
        recordedByUser: { select: { id: true, name: true } },
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

    // 3. Query Target IST Day Cash Outflows
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
        receivedBy: p.recordedByUser?.name || 'Unknown',
        source:
          p.cashHandoverStatus === 'ACKNOWLEDGED'
            ? 'FIELD_HANDOVER'
            : 'COUNTER_CASH',
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
      date: dateStr,
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
   * Consolidated chronological record of all auctions for a chit scheme (Months 2 to N-1),
   * using dynamic frozen foreman commission rates (Guardrail 3) and statutory 21-day
   * Deputy Registrar filing countdown compliance (Chit Funds Act §24).
   */
  async getAuctionMinutesFormXvii(
    query: QueryFormXviiDto,
    requestingUser: JwtPayload,
  ) {
    // Anti-oracle precheck BEFORE DB lookup (blocks disallowed roles / branchless BRANCH_MANAGER)
    assertStatutoryRegisterCallerPrecheck(requestingUser);

    const auctionDateRange = parseStrictIstDateRange(query.fromDate, query.toDate);

    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: query.chitGroupId },
      include: {
        branch: { select: { id: true, name: true, nameTamil: true } },
      },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    assertChitBranchAccess(chit.branchId, requestingUser);

    const whereAuction: {
      chitGroupId: string;
      status: { in: ('MINUTES_FILED' | 'COMPLETED')[] };
      installmentMonth: { gte: number; lt: number };
      auctionDate?: { gte?: Date; lte?: Date };
    } = {
      chitGroupId: query.chitGroupId,
      status: { in: ['MINUTES_FILED', 'COMPLETED'] },
      // Guardrail 5: Auctions occur strictly in Months 2 through N-1 (no auction in Month 1 or Month N)
      installmentMonth: { gte: 2, lt: chit.durationMonths },
    };

    if (auctionDateRange) {
      whereAuction.auctionDate = auctionDateRange;
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

    const now = new Date();
    let filedCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    const auctionRecords = auctions.map((a) => {
      const winnerTicket = a.winner?.ticket;
      const winnerCustomer = winnerTicket?.customer;
      const filedAtRegistrar = Boolean(a.minutes?.filedAtRegistrar);
      const filedDate = a.minutes?.filedDate || null;
      const compliance = computeRegistrarFilingCompliance(
        a.auctionDate,
        filedAtRegistrar,
        filedDate,
        now,
      );

      if (filedAtRegistrar) {
        filedCount += 1;
      } else if (compliance.isFilingOverdue) {
        overdueCount += 1;
      } else {
        pendingCount += 1;
      }

      return {
        auctionId: a.id,
        installmentMonth: a.installmentMonth,
        auctionDate: a.auctionDate,
        chitValue: chit.chitValue,
        bidDiscount: a.bidDiscount || 0n,
        foremanCommissionAmount: a.foremanCommissionAmount || 0n,
        foremanCommissionRate: formatFrozenCommissionRate(
          a.foremanCommissionRate,
          chit.foremanCommissionRate,
        ),
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
        minutesProceedingsText:
          a.minutes?.minutesText || 'Minutes pending entry',
        signedByForeman: a.minutes?.signedByForeman || false,
        filedAtRegistrar,
        filedDate,
        filingReference: a.minutes?.filingReference || null,
        filingNotes: a.minutes?.filingNotes || null,
        filingDeadline: compliance.filingDeadline,
        filingDeadlineDate: compliance.filingDeadlineDate,
        filingDaysRemaining: compliance.filingDaysRemaining,
        isFilingOverdue: compliance.isFilingOverdue,
        filingStatus: compliance.filingStatus,
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
        foremanCommissionRate: formatFrozenCommissionRate(
          chit.foremanCommissionRate,
        ),
        branchName: chit.branch.name,
        branchNameTamil: chit.branch.nameTamil,
      },
      totalAuctionsFinalized: auctions.length,
      filingSummary: {
        totalAuctions: auctions.length,
        filedCount,
        pendingCount,
        overdueCount,
      },
      auctions: auctionRecords,
    };
  }

  /**
   * Form XXI: Subscriber Ledger Register (`UNVERIFIED-LEGAL`)
   * Continuous N-month schedule with dividend credits, payments, and arrears for tickets.
   */
  async getSubscriberLedgerFormXxi(
    query: QueryFormXxiDto,
    requestingUser: JwtPayload,
  ) {
    // Anti-oracle precheck BEFORE DB lookup (blocks disallowed roles / branchless BRANCH_MANAGER / identityless CUSTOMER)
    assertStatutoryRegisterCallerPrecheck(requestingUser, {
      allowCustomer: true,
    });

    const chit = await this.prisma.chitGroup.findUnique({
      where: { id: query.chitGroupId },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    if (!chit) {
      throw new NotFoundException('Chit scheme not found');
    }

    assertChitBranchAccess(chit.branchId, requestingUser, {
      allowCustomer: true,
    });

    // Fail-closed customer self-isolation (never returns all tickets if identity is missing)
    const { isPureCustomer, customerFilter } =
      resolveCustomerLedgerWhere(requestingUser);

    // XR-M7-RPT-04: Validate basic positive integer shape for all callers, but defer
    // scheme-specific `ticketNumber > maxTickets` bounds check for pure CUSTOMER callers
    // until AFTER enrollment/ownership verification (eliminates scheme size oracle).
    if (query.ticketNumber !== undefined) {
      if (!Number.isInteger(query.ticketNumber) || query.ticketNumber < 1) {
        throw new BadRequestException(
          'INVALID_TICKET_NUMBER: ticketNumber must be a positive integer',
        );
      }
      if (!isPureCustomer) {
        const maxTickets = chit.totalTickets ?? chit.durationMonths;
        if (maxTickets > 0 && query.ticketNumber > maxTickets) {
          throw new BadRequestException(
            `INVALID_TICKET_NUMBER: ticketNumber must be between 1 and ${maxTickets}`,
          );
        }
      }
    }

    const tickets = await this.prisma.subscriberTicket.findMany({
      where: {
        chitGroupId: query.chitGroupId,
        ...(query.ticketNumber ? { ticketNumber: query.ticketNumber } : {}),
        ...(customerFilter || {}),
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
        winningAuction: {
          select: {
            paymentReference: true,
            disbursedAt: true,
          },
        },
        dues: {
          orderBy: { installmentMonth: 'asc' },
          include: {
            allocations: {
              where: { payment: { paymentStatus: 'SUCCESS' } },
              include: {
                payment: {
                  select: {
                    createdAt: true,
                    paymentMethod: true,
                    paymentStatus: true,
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

    if (isPureCustomer && tickets.length === 0) {
      throw new ForbiddenException(
        'Access denied: You are not enrolled in this chit group or ticket',
      );
    }

    // KC-09: Verified provenance for prize arrears offsets from immutable audit logs
    const allDueIds = tickets.flatMap((t) => t.dues.map((d) => d.id));
    const rawOffsetLogs =
      allDueIds.length > 0 && typeof this.prisma.auditLog?.findMany === 'function'
        ? await this.prisma.auditLog.findMany({
            where: {
              entityType: 'InstallmentDue',
              action: 'PRIZE_ARREARS_OFFSET_ALLOCATED',
              entityId: { in: allDueIds },
            },
            select: {
              entityId: true,
              timestamp: true,
              newValue: true,
            },
          })
        : [];
    const offsetAuditLogs = rawOffsetLogs || [];
    const offsetLogByDueId = new Map(
      offsetAuditLogs.map((log) => [log.entityId, log]),
    );

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

        // Only consider SUCCESS payments (never display reversed/failed payment allocations)
        const alloc = (d.allocations ?? []).find(
          (a) =>
            a.payment &&
            (a.payment.paymentStatus === undefined ||
              a.payment.paymentStatus === 'SUCCESS'),
        );
        const offsetLog = offsetLogByDueId.get(d.id);
        const isPrizeArrearsOffset = Boolean(offsetLog);

        let paymentDate: Date | null = null;
        let receiptNumber: string | null = null;
        let paymentMethod: string | null = null;

        if (d.status === 'PAID' && alloc) {
          paymentDate = alloc.payment.createdAt;
          receiptNumber = alloc.payment.receipt?.receiptNumber || null;
          paymentMethod = alloc.payment.paymentMethod;
        } else if (d.status === 'PAID' && isPrizeArrearsOffset) {
          // Exact settlement timestamp from immutable audit trail (never substitute due date)
          paymentDate = offsetLog!.timestamp;
          const voucherRef = t.winningAuction?.paymentReference;
          receiptNumber = voucherRef ? `OFFSET-${voucherRef}` : 'PRIZE-OFFSET';
          paymentMethod = 'PRIZE_ARREARS_OFFSET';
        } else if (d.status === 'PAID') {
          // Paid due without payment allocation or prize offset log (e.g. migration / accounting adjustment)
          paymentDate = null;
          receiptNumber = null;
          paymentMethod = 'DIRECT_ADJUSTMENT';
        }

        return {
          installmentMonth: d.installmentMonth,
          dueDate: d.dueDate,
          grossAmount: d.grossAmount,
          dividendDeduction: d.dividendDeduction,
          netPayableAmount: d.netPayableAmount,
          paidAmount: d.paidAmount,
          status: d.status,
          paymentDate,
          receiptNumber,
          paymentMethod,
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
        foremanCommissionRate: formatFrozenCommissionRate(
          chit.foremanCommissionRate,
        ),
      },
      totalTicketsReturned: ticketLedgers.length,
      ledgers: ticketLedgers,
    };
  }
}
