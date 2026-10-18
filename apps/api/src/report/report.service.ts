import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { QueryCashBookDto } from './dto/query-cash-book.dto';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryDayBookDto } from './dto/query-day-book.dto';
import { QueryDefaultersReportDto } from './dto/query-defaulters-report.dto';
import { QueryFormXviiDto } from './dto/query-form-xvii.dto';
import { QueryFormXxiDto } from './dto/query-form-xxi.dto';
import { StatutoryReportService } from './statutory-report.service';

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statutoryReportService: StatutoryReportService,
  ) {}

  /**
   * Executive Dashboard KPI & Status Summary
   */
  async getExecutiveDashboard(
    query: QueryDashboardDto,
    requestingUser: JwtPayload,
  ) {
    const branchId =
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN)
        ? requestingUser.branchId || undefined
        : query.branchId;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);

    // 1. Chit Schemes & Member metrics
    const activeChitsCount = await this.prisma.chitGroup.count({
      where: {
        status: 'ACTIVE',
        ...(branchId ? { branchId } : {}),
      },
    });

    const totalSubscribersCount = await this.prisma.customer.count({
      where: branchId ? { branchId } : {},
    });

    const activeTicketsCount = await this.prisma.subscriberTicket.count({
      where: {
        status: 'ACTIVE',
        ...(branchId ? { chitGroup: { branchId } } : {}),
      },
    });

    // 2. Today's Collections by Payment Method
    const todayPayments = await this.prisma.payment.findMany({
      where: {
        paymentStatus: 'SUCCESS',
        createdAt: { gte: startOfToday, lte: endOfToday },
        ...(branchId ? { branchId } : {}),
      },
      select: { amount: true, paymentMethod: true },
    });

    let todayCashCollections = 0n;
    let todayUpiCollections = 0n;
    let todayBankCollections = 0n;
    let todayChequeCollections = 0n;
    let todayTotalCollections = 0n;

    for (const p of todayPayments) {
      todayTotalCollections += p.amount;
      if (p.paymentMethod === 'CASH') todayCashCollections += p.amount;
      else if (p.paymentMethod === 'UPI') todayUpiCollections += p.amount;
      else if (p.paymentMethod === 'BANK_TRANSFER') todayBankCollections += p.amount;
      else if (p.paymentMethod === 'CHEQUE') todayChequeCollections += p.amount;
    }

    // 3. Today's Prize Disbursements
    const todayDisbursements = await this.prisma.auctionWinner.findMany({
      where: {
        disbursementStatus: 'DISBURSED',
        disbursedAt: { gte: startOfToday, lte: endOfToday },
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      select: { disbursedAmount: true },
    });

    let todayTotalDisbursements = 0n;
    for (const d of todayDisbursements) {
      todayTotalDisbursements += d.disbursedAmount || 0n;
    }

    // 4. Branch Vault Cash Balance (All-Time Cash Inflows - Cash Outflows)
    const allTimeCashInflows = await this.prisma.payment.aggregate({
      where: {
        paymentMethod: 'CASH',
        paymentStatus: 'SUCCESS',
        ...(branchId ? { branchId } : {}),
        OR: [
          { cashHandoverStatus: 'ACKNOWLEDGED' },
          { cashHandoverStatus: null },
        ],
      },
      _sum: { amount: true },
    });

    const allTimeCashOutflows = await this.prisma.auctionWinner.aggregate({
      where: {
        disbursementMode: 'CASH',
        disbursementStatus: 'DISBURSED',
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      _sum: { disbursedAmount: true },
    });

    const vaultCashBalance =
      (allTimeCashInflows._sum.amount || 0n) -
      (allTimeCashOutflows._sum.disbursedAmount || 0n);

    // 5. Pending Dual-Control & Operational Actions
    const pendingCashHandovers = await this.prisma.payment.count({
      where: {
        paymentMethod: 'CASH',
        cashHandoverStatus: 'PENDING_HANDOVER',
        ...(branchId ? { branchId } : {}),
      },
    });

    const pendingSafetyProofVerifications = await this.prisma.auctionWinner.count({
      where: {
        disbursementStatus: 'PENDING_VERIFICATION',
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
    });

    const pendingDisbursementAuthorizations = await this.prisma.auctionWinner.count({
      where: {
        disbursementStatus: 'VERIFIED_BY_MAKER',
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
    });

    const authorizedAwaitingRelease = await this.prisma.auctionWinner.count({
      where: {
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
    });

    // 6. Arrears Aging Buckets
    const overdueDues = await this.prisma.subscriberTicket.findMany({
      where: {
        consecutiveUnpaidMonths: { gte: 1 },
        status: { not: 'REMOVED_DEF_3M' },
        ...(branchId ? { chitGroup: { branchId } } : {}),
      },
      select: {
        consecutiveUnpaidMonths: true,
        dues: {
          where: { status: { not: 'PAID' } },
          select: { netPayableAmount: true, paidAmount: true },
        },
      },
    });

    let arrears1MonthTotal = 0n;
    let arrears2MonthsTotal = 0n;
    let arrears3MonthsTotal = 0n;
    let count1Month = 0;
    let count2Months = 0;
    let count3Months = 0;

    for (const t of overdueDues) {
      let ticketUnpaid = 0n;
      for (const d of t.dues) {
        ticketUnpaid += d.netPayableAmount - d.paidAmount;
      }

      if (t.consecutiveUnpaidMonths === 1) {
        count1Month += 1;
        arrears1MonthTotal += ticketUnpaid;
      } else if (t.consecutiveUnpaidMonths === 2) {
        count2Months += 1;
        arrears2MonthsTotal += ticketUnpaid;
      } else if (t.consecutiveUnpaidMonths >= 3) {
        count3Months += 1;
        arrears3MonthsTotal += ticketUnpaid;
      }
    }

    return {
      scope: branchId ? `BRANCH_${branchId}` : 'COMPANY_WIDE',
      activeChitsCount,
      totalSubscribersCount,
      activeTicketsCount,
      todayCollections: {
        total: todayTotalCollections,
        cash: todayCashCollections,
        upi: todayUpiCollections,
        bankTransfer: todayBankCollections,
        cheque: todayChequeCollections,
      },
      todayDisbursements: {
        total: todayTotalDisbursements,
      },
      branchVault: {
        currentCashInSafe: vaultCashBalance,
      },
      pendingActions: {
        cashHandoversPendingSignoff: pendingCashHandovers,
        winnersPendingSafetyProof: pendingSafetyProofVerifications,
        disbursementsPendingAuthorization: pendingDisbursementAuthorizations,
        authorizedVouchersAwaitingRelease: authorizedAwaitingRelease,
      },
      arrearsAging: {
        bucket1Month: { count: count1Month, totalAmount: arrears1MonthTotal },
        bucket2Months: { count: count2Months, totalAmount: arrears2MonthsTotal },
        bucket3MonthsAndAbove: {
          count: count3Months,
          totalAmount: arrears3MonthsTotal,
          note: 'Eligible for company removal rights under ADR-07',
        },
      },
    };
  }

  /**
   * Day Book Register: Daily journal of ALL payment modes (Cash, UPI, Bank Transfer, Cheque)
   */
  async getDayBook(query: QueryDayBookDto, requestingUser: JwtPayload) {
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

    // 1. Query Collections (Inflows) across all modes
    const payments = await this.prisma.payment.findMany({
      where: {
        paymentStatus: 'SUCCESS',
        createdAt: { gte: startOfDay, lte: endOfDay },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        receipt: { select: { receiptNumber: true } },
        recordedByUser: { select: { name: true } },
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

    // 2. Query Disbursements (Outflows) across all modes
    const disbursements = await this.prisma.auctionWinner.findMany({
      where: {
        disbursementStatus: 'DISBURSED',
        disbursedAt: { gte: startOfDay, lte: endOfDay },
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      include: {
        auction: {
          select: {
            installmentMonth: true,
            chitGroup: { select: { groupCode: true } },
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

    let cashInflow = 0n;
    let upiInflow = 0n;
    let bankTransferInflow = 0n;
    let chequeInflow = 0n;
    let totalInflows = 0n;

    const inflowsList = payments.map((p) => {
      totalInflows += p.amount;
      if (p.paymentMethod === 'CASH') cashInflow += p.amount;
      else if (p.paymentMethod === 'UPI') upiInflow += p.amount;
      else if (p.paymentMethod === 'BANK_TRANSFER') bankTransferInflow += p.amount;
      else if (p.paymentMethod === 'CHEQUE') chequeInflow += p.amount;

      const firstAlloc = p.allocations[0];
      return {
        paymentId: p.id,
        receiptNumber: p.receipt?.receiptNumber || 'N/A',
        time: p.createdAt,
        paymentMethod: p.paymentMethod,
        transactionRef: p.transactionRef,
        amount: p.amount,
        groupCode: firstAlloc?.ticket.chitGroup.groupCode || 'N/A',
        ticketNumber: firstAlloc?.ticket.ticketNumber || null,
        customerCode: firstAlloc?.ticket.customer.customerCode || 'N/A',
        customerName: firstAlloc?.ticket.customer.fullName || 'N/A',
        collectedBy: p.recordedByUser.name,
      };
    });

    let totalOutflows = 0n;
    const outflowsList = disbursements.map((d) => {
      const amount = d.disbursedAmount || 0n;
      totalOutflows += amount;
      return {
        winnerId: d.id,
        voucherNumber: d.paymentReference || 'N/A',
        time: d.disbursedAt,
        disbursementMode: d.disbursementMode,
        amount,
        groupCode: d.auction.chitGroup.groupCode,
        installmentMonth: d.auction.installmentMonth,
        ticketNumber: d.ticket.ticketNumber,
        winnerCode: d.ticket.customer.customerCode,
        winnerName: d.ticket.customer.fullName,
      };
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      branchId: branchId || 'ALL_BRANCHES',
      summary: {
        totalInflows,
        totalOutflows,
        netCashFlow: totalInflows - totalOutflows,
        inflowByMethod: {
          cash: cashInflow,
          upi: upiInflow,
          bankTransfer: bankTransferInflow,
          cheque: chequeInflow,
        },
      },
      inflows: inflowsList,
      outflows: outflowsList,
    };
  }

  /**
   * Defaulters & Arrears Aging Register
   * Scoped to branch for COLLECTION_AGENT and BRANCH_MANAGER.
   */
  async getDefaultersAgingReport(
    query: QueryDefaultersReportDto,
    requestingUser: JwtPayload,
  ) {
    const isCollectionAgent = requestingUser.roles.includes(Role.COLLECTION_AGENT);
    const isBranchManager =
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN);

    const branchId = isCollectionAgent || isBranchManager
      ? requestingUser.branchId || undefined
      : query.branchId;

    const minArrearsMonths = query.minArrearsMonths || 1;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      consecutiveUnpaidMonths: { gte: minArrearsMonths },
      status: { not: 'REMOVED_DEF_3M' },
    };

    if (query.chitGroupId) {
      where.chitGroupId = query.chitGroupId;
    }

    if (branchId) {
      where.chitGroup = { branchId };
    }

    const [totalCount, tickets] = await Promise.all([
      this.prisma.subscriberTicket.count({ where }),
      this.prisma.subscriberTicket.findMany({
        where,
        include: {
          customer: {
            select: {
              customerCode: true,
              fullName: true,
              fullNameTamil: true,
              phone: true,
            },
          },
          chitGroup: {
            select: {
              groupCode: true,
              groupName: true,
              baseInstallment: true,
            },
          },
          dues: {
            where: { status: { not: 'PAID' } },
            orderBy: { installmentMonth: 'asc' },
            select: {
              installmentMonth: true,
              dueDate: true,
              netPayableAmount: true,
              paidAmount: true,
              status: true,
            },
          },
        },
        orderBy: [{ consecutiveUnpaidMonths: 'desc' }, { ticketNumber: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const items = tickets.map((t) => {
      let totalArrearsAmount = 0n;
      const unpaidMonths = t.dues.map((d) => {
        const unpaid = d.netPayableAmount - d.paidAmount;
        totalArrearsAmount += unpaid;
        return {
          installmentMonth: d.installmentMonth,
          dueDate: d.dueDate,
          netPayableAmount: d.netPayableAmount,
          paidAmount: d.paidAmount,
          outstandingDue: unpaid,
          status: d.status,
        };
      });

      return {
        ticketId: t.id,
        groupCode: t.chitGroup.groupCode,
        ticketNumber: t.ticketNumber,
        customerCode: t.customer.customerCode,
        customerName: t.customer.fullName,
        customerNameTamil: t.customer.fullNameTamil,
        phone: t.customer.phone,
        consecutiveUnpaidMonths: t.consecutiveUnpaidMonths,
        riskCategory:
          t.consecutiveUnpaidMonths >= 3
            ? 'HIGH_RISK_3M_REMOVAL'
            : t.consecutiveUnpaidMonths === 2
              ? 'MEDIUM_RISK_2M'
              : 'ATTENTION_1M',
        eligibleForRemovalRights: t.consecutiveUnpaidMonths >= 3,
        totalArrearsAmount,
        unpaidDues: unpaidMonths,
      };
    });

    return {
      scope: branchId ? `BRANCH_${branchId}` : 'ALL_BRANCHES',
      pagination: {
        page,
        limit,
        totalRecords: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      defaulters: items,
    };
  }

  /**
   * Immutable Audit Trail Register
   * Append-only log of dual-control actions with filters and customer self-scoping.
   */
  async getAuditLogs(query: QueryAuditLogsDto, requestingUser: JwtPayload) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (requestingUser.roles.includes(Role.CUSTOMER)) {
      // Customer self-isolation: only view audit logs where customer was the actor
      where.userId = requestingUser.sub;
    } else {
      if (query.userId) {
        where.userId = query.userId;
      }
      if (
        requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
        !requestingUser.roles.includes(Role.SUPER_ADMIN) &&
        requestingUser.branchId
      ) {
        where.user = { branchId: requestingUser.branchId };
      }
    }

    if (query.entityType) {
      where.entityType = query.entityType;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.fromDate || query.toDate) {
      where.timestamp = {};
      if (query.fromDate) where.timestamp.gte = new Date(query.fromDate);
      if (query.toDate) where.timestamp.lte = new Date(query.toDate);
    }

    const [totalCount, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, phone: true, roles: true },
          },
        },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      pagination: {
        page,
        limit,
        totalRecords: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        timestamp: l.timestamp,
        ipAddress: l.ipAddress,
        performedBy: l.user
          ? {
              id: l.user.id,
              name: l.user.name,
              roles: l.user.roles,
            }
          : null,
        oldValue: l.oldValue,
        newValue: l.newValue,
      })),
    };
  }

  // Pass-through delegations to StatutoryReportService
  async getCashBookFormXxii(query: QueryCashBookDto, requestingUser: JwtPayload) {
    return this.statutoryReportService.getCashBookFormXxii(query, requestingUser);
  }

  async getAuctionMinutesFormXvii(query: QueryFormXviiDto, requestingUser: JwtPayload) {
    return this.statutoryReportService.getAuctionMinutesFormXvii(query, requestingUser);
  }

  async getSubscriberLedgerFormXxi(query: QueryFormXxiDto, requestingUser: JwtPayload) {
    return this.statutoryReportService.getSubscriberLedgerFormXxi(query, requestingUser);
  }
}
