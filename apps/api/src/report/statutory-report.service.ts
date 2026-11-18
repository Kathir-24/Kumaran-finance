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
    // DEF-M10-STAT-01 & DEF-M10-STAT-02:
    // - Physical cash enters the vault at `cashHandoverAcknowledgedAt` (for field handovers) or `createdAt` (for counter cash).
    //   Since `createdAt <= cashHandoverAcknowledgedAt` always holds, `createdAt < startOfDay` combined with the OR clause
    //   is an exact partition with today's inflows and guarantees Opening Safe Cash(T) === Closing Safe Cash(T-1).
    // - Historical cash receipts that were later reversed remain recorded as inflows on their vault-entry date; their cash
    //   refund is accounted as an explicit cash outflow on `paymentReversal.reversedAt`.
    const vaultEntryEligibilityWhere = [
      { cashHandoverStatus: 'ACKNOWLEDGED' },
      { cashHandoverStatus: null },
    ];

    const priorCashInflows = await this.prisma.payment.aggregate({
      where: {
        paymentMethod: 'CASH',
        paymentStatus: { in: ['SUCCESS', 'REVERSED'] },
        createdAt: { lt: startOfDay },
        ...(branchId ? { branchId } : {}),
        OR: [
          {
            cashHandoverStatus: 'ACKNOWLEDGED',
            cashHandoverAcknowledgedAt: { lt: startOfDay },
          },
          {
            cashHandoverStatus: 'ACKNOWLEDGED',
            cashHandoverAcknowledgedAt: null,
          },
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

    // Prior approved physical cash payment reversals (refunded out of branch safe prior to startOfDay)
    const priorCashReversals =
      typeof this.prisma.paymentReversal?.findMany === 'function'
        ? (await this.prisma.paymentReversal.findMany({
            where: {
              status: 'APPROVED',
              reversedAt: { lt: startOfDay },
              payment: {
                paymentMethod: 'CASH',
                ...(branchId ? { branchId } : {}),
                OR: vaultEntryEligibilityWhere,
              },
            },
            select: {
              payment: { select: { amount: true } },
            },
          })) || []
        : [];

    let priorCashReversalsTotal = 0n;
    for (const rev of priorCashReversals) {
      priorCashReversalsTotal += rev.payment?.amount || 0n;
    }

    const openingCash =
      (priorCashInflows._sum.amount || 0n) -
      (priorCashOutflows._sum.disbursedAmount || 0n) -
      priorCashReversalsTotal;

    // 2. Query Target IST Day Cash Inflows (keyed on vault entry time: cashHandoverAcknowledgedAt ?? createdAt)
    const todayPayments = await this.prisma.payment.findMany({
      where: {
        paymentMethod: 'CASH',
        paymentStatus: { in: ['SUCCESS', 'REVERSED'] },
        ...(branchId ? { branchId } : {}),
        OR: [
          {
            cashHandoverStatus: 'ACKNOWLEDGED',
            cashHandoverAcknowledgedAt: { gte: startOfDay, lte: endOfDay },
          },
          {
            cashHandoverStatus: 'ACKNOWLEDGED',
            cashHandoverAcknowledgedAt: null,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
          {
            cashHandoverStatus: null,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
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

    // 3. Query Target IST Day Cash Outflows (Physical Cash Prize Disbursements + Approved Cash Payment Reversals)
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

    const todayCashReversals =
      typeof this.prisma.paymentReversal?.findMany === 'function'
        ? (await this.prisma.paymentReversal.findMany({
            where: {
              status: 'APPROVED',
              reversedAt: { gte: startOfDay, lte: endOfDay },
              payment: {
                paymentMethod: 'CASH',
                ...(branchId ? { branchId } : {}),
                OR: vaultEntryEligibilityWhere,
              },
            },
            include: {
              payment: {
                select: {
                  id: true,
                  amount: true,
                  receipt: { select: { receiptNumber: true } },
                  allocations: {
                    include: {
                      ticket: {
                        select: {
                          ticketNumber: true,
                          chitGroup: { select: { groupCode: true } },
                          customer: {
                            select: { customerCode: true, fullName: true },
                          },
                        },
                      },
                      due: {
                        select: { installmentMonth: true },
                      },
                    },
                  },
                },
              },
            },
            orderBy: { reversedAt: 'asc' },
          })) || []
        : [];

    let todayInflowsTotal = 0n;
    const inflows = todayPayments
      .map((p) => {
        todayInflowsTotal += p.amount;
        const firstAlloc = p.allocations[0];
        const vaultArrivalTime =
          p.cashHandoverStatus === 'ACKNOWLEDGED' && p.cashHandoverAcknowledgedAt
            ? p.cashHandoverAcknowledgedAt
            : p.createdAt;
        return {
          paymentId: p.id,
          receiptNumber: p.receipt?.receiptNumber || 'N/A',
          time: vaultArrivalTime,
          collectedAt: p.createdAt,
          acknowledgedAt: p.cashHandoverAcknowledgedAt || null,
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
      })
      .sort(
        (a, b) =>
          (a.time ? new Date(a.time).getTime() : 0) -
          (b.time ? new Date(b.time).getTime() : 0),
      );

    let todayOutflowsTotal = 0n;
    const disbursementOutflows = todayDisbursements.map((d) => {
      const amount = d.disbursedAmount || 0n;
      todayOutflowsTotal += amount;
      return {
        outflowType: 'PRIZE_DISBURSEMENT' as const,
        winnerId: d.id,
        reversalId: null as string | null,
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

    const reversalOutflows = todayCashReversals.map((rev) => {
      const amount = rev.payment?.amount || 0n;
      todayOutflowsTotal += amount;
      const firstAlloc = rev.payment?.allocations?.[0];
      const origReceipt = rev.payment?.receipt?.receiptNumber;
      return {
        outflowType: 'CASH_PAYMENT_REVERSAL' as const,
        winnerId: null as string | null,
        reversalId: rev.id,
        paymentId: rev.paymentId,
        voucherNumber: origReceipt ? `REV-${origReceipt}` : `REV-${rev.id}`,
        time: rev.reversedAt,
        amount,
        groupCode: firstAlloc?.ticket?.chitGroup?.groupCode || 'N/A',
        installmentMonth: firstAlloc?.due?.installmentMonth ?? null,
        ticketNumber: firstAlloc?.ticket?.ticketNumber ?? null,
        winnerCode: firstAlloc?.ticket?.customer?.customerCode || 'N/A',
        winnerName: firstAlloc?.ticket?.customer?.fullName || 'N/A',
        reason: rev.reason,
      };
    });

    const outflows = [...disbursementOutflows, ...reversalOutflows].sort(
      (a, b) =>
        (a.time ? new Date(a.time).getTime() : 0) -
        (b.time ? new Date(b.time).getTime() : 0),
    );

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

      const winningTieBidder = a.tieBidders.find((tb) => tb.isWinner);
      const winningTokenNumber = winningTieBidder?.tokenNumber ?? null;
      const tiedDiscountAmount =
        a.tieBidders.length > 0
          ? (a.tieBidders[0].bidDiscount ?? a.bidDiscount ?? 0n)
          : null;

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
        winningTokenNumber,
        tiedDiscountAmount,
        tiedBidders: a.tieBidders.map((tb) => ({
          ticketNumber: tb.ticket.ticketNumber,
          customerCode: tb.ticket.customer.customerCode,
          customerName: tb.ticket.customer.fullName,
          bidDiscount: tb.bidDiscount ?? a.bidDiscount ?? 0n,
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
          cumulativeGrossDue: totalGrossDue,
          cumulativeDividendCredit: totalDividendCredit,
          cumulativeNetPayable: totalNetPayable,
          cumulativePaid: totalPaid,
          runningBalance: totalNetPayable - totalPaid,
          status: d.status,
          paymentDate,
          receiptNumber,
          paymentMethod,
        };
      });

      // DEF-M10-STAT-03: Build contiguous 1..N passbook print slots with running cumulative totals
      const scheduleByMonth = new Map(
        schedule.map((row) => [row.installmentMonth, row]),
      );
      const totalMonths = Math.max(chit.durationMonths || 0, schedule.length);
      let lastCumGross = 0n;
      let lastCumDividend = 0n;
      let lastCumNet = 0n;
      let lastCumPaid = 0n;
      let lastRunningBalance = 0n;

      const contiguousSchedule = Array.from({ length: totalMonths }, (_, idx) => {
        const monthNum = idx + 1;
        const existing = scheduleByMonth.get(monthNum);
        if (existing) {
          lastCumGross = existing.cumulativeGrossDue;
          lastCumDividend = existing.cumulativeDividendCredit;
          lastCumNet = existing.cumulativeNetPayable;
          lastCumPaid = existing.cumulativePaid;
          lastRunningBalance = existing.runningBalance;
          return existing;
        }
        return {
          installmentMonth: monthNum,
          dueDate: null as Date | null,
          grossAmount: chit.baseInstallment,
          dividendDeduction: 0n,
          netPayableAmount: chit.baseInstallment,
          paidAmount: 0n,
          cumulativeGrossDue: lastCumGross,
          cumulativeDividendCredit: lastCumDividend,
          cumulativeNetPayable: lastCumNet,
          cumulativePaid: lastCumPaid,
          runningBalance: lastRunningBalance,
          status: 'SCHEDULED' as const,
          paymentDate: null as Date | null,
          receiptNumber: null as string | null,
          paymentMethod: null as string | null,
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
        passbookPrintMeta: {
          totalDurationMonths: totalMonths,
          scheduledMonthsCount: schedule.length,
          isContiguous: contiguousSchedule.length === totalMonths,
        },
        monthlySchedule: schedule,
        contiguousSchedule,
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
