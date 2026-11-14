import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { DistributedLockService } from '../jobs/services/distributed-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { withTtlJitter } from '../common/utils/cache-jitter.util';
import { acquireRedisMutexLock } from '../common/utils/redis-lock.util';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { QueryCashBookDto } from './dto/query-cash-book.dto';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryDayBookDto } from './dto/query-day-book.dto';
import { QueryDefaultersReportDto } from './dto/query-defaulters-report.dto';
import { QueryFormXviiDto } from './dto/query-form-xvii.dto';
import { QueryFormXxiDto } from './dto/query-form-xxi.dto';
import { QueryPendingApprovalsDto } from './dto/query-pending-approvals.dto';
import { StatutoryReportService } from './statutory-report.service';

export interface PendingApprovalsResponse {
  summary: {
    totalPendingCount: number;
    cashHandoversCount: number;
    disbursementAuthorizationsCount: number;
    paymentReversalsCount: number;
    safetyProofVerificationsCount: number;
    cashHandoversTotalAmount: string;
    disbursementsTotalAmount: string;
    reversalsTotalAmount: string;
  };
  cashHandovers: Array<{
    collectorId: string;
    collectorName: string;
    collectorPhone?: string | null;
    branchId: string;
    totalAmount: string;
    paymentCount: number;
    oldestCollectionAt: Date;
    paymentIds: string[];
  }>;
  disbursementAuthorizations: Array<{
    id: string;
    auctionId: string;
    chitGroupCode: string;
    chitGroupName: string;
    installmentMonth: number;
    customerCode: string;
    customerName: string;
    customerPhone: string;
    ticketNumber: number;
    netPayableAmount: string;
    disbursementMode?: string | null;
    verifiedByUserId?: string | null;
    agreementSigned: boolean;
    nomineeSigned: boolean;
    hasSecurityDoc: boolean;
  }>;
  paymentReversals: Array<{
    id: string;
    paymentId: string;
    receiptNumber: string;
    amount: string;
    customerCode?: string;
    customerName?: string;
    reason: string;
    notes?: string | null;
    initiatedByUserId: string;
    createdAt: Date;
  }>;
  safetyProofVerifications: Array<{
    id: string;
    auctionId: string;
    chitGroupCode: string;
    chitGroupName: string;
    installmentMonth: number;
    customerCode: string;
    customerName: string;
    customerPhone: string;
    ticketNumber: number;
    netPayableAmount: string;
    auctionDate: Date;
  }>;
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  // Concurrency bulkhead for database protection during Redis outage
  private activeFallbackDashboardQueries = 0;
  private readonly MAX_CONCURRENT_FALLBACK_QUERIES = 3;
  private readonly MAX_SNAPSHOT_ENTRIES = 20;
  private readonly lastKnownDashboardSnapshot: Map<string, any> = new Map();

  private recordDashboardSnapshot(cacheKey: string, result: any): void {
    if (this.lastKnownDashboardSnapshot.size >= this.MAX_SNAPSHOT_ENTRIES) {
      const firstKey = this.lastKnownDashboardSnapshot.keys().next().value;
      if (firstKey) {
        this.lastKnownDashboardSnapshot.delete(firstKey);
      }
    }
    this.lastKnownDashboardSnapshot.set(cacheKey, result);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly statutoryReportService: StatutoryReportService,
    @Optional() private readonly redisProvider?: RedisConnectionProvider,
    @Optional() private readonly distributedLockService?: DistributedLockService,
  ) {}

  private serializeReport(data: any): string {
    return JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  }

  private deserializeReport(json: string): any {
    return JSON.parse(json, (key, val) => {
      if (
        typeof val === 'string' &&
        [
          'totalInflows',
          'totalOutflows',
          'netCashFlow',
          'cash',
          'upi',
          'bankTransfer',
          'cheque',
          'amount',
          'total',
          'currentCashInSafe',
          'totalAmount',
        ].includes(key) &&
        /^-?\d+$/.test(val)
      ) {
        return BigInt(val);
      }
      return val;
    });
  }

  /**
   * Reads a cached report JSON payload or acquires a 4-second tokenized Redis mutex lock
   * (atomic Lua release) to prevent cache stampedes across concurrent callers.
   */
  private async readCacheOrAcquireStampedeLock(
    cacheKey: string,
    waitMs: number,
    label: string,
  ): Promise<
    | { hit: true; data: any }
    | { hit: false; redis: any; isRedisConnected: boolean; releaseLock: (() => Promise<void>) | null }
  > {
    const redis = this.redisProvider?.getClient();
    const isRedisConnected = Boolean(redis && this.redisProvider?.getIsConnected());
    let releaseLock: (() => Promise<void>) | null = null;

    if (isRedisConnected && redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return { hit: true, data: this.deserializeReport(cached) };
        }

        let lockAcquired = false;
        if (this.distributedLockService) {
          const lock = await this.distributedLockService.acquireLock(cacheKey, 4000);
          if (lock.acquired) {
            releaseLock = lock.release;
            lockAcquired = true;
          }
        } else {
          const lock = await acquireRedisMutexLock(redis, cacheKey, 4000, this.logger);
          if (lock.acquired) {
            releaseLock = lock.release;
            lockAcquired = true;
          }
        }

        if (!lockAcquired) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          const retryCached = await redis.get(cacheKey);
          if (retryCached) {
            return { hit: true, data: this.deserializeReport(retryCached) };
          }
        }
      } catch (err: any) {
        this.logger.warn(`Redis ${label} cache read error: ${err.message}`);
      }
    }

    return { hit: false, redis, isRedisConnected, releaseLock };
  }

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

    const cacheKey = `report:dashboard:${branchId || 'ALL'}`;
    const cacheGuard = await this.readCacheOrAcquireStampedeLock(cacheKey, 250, 'dashboard');
    if (cacheGuard.hit) {
      return cacheGuard.data;
    }

    const { redis, isRedisConnected, releaseLock } = cacheGuard;
    if (!isRedisConnected) {
      // Fail-Open Concurrency Bulkhead: When Redis is unavailable, limit concurrent heavy computations
      if (this.activeFallbackDashboardQueries >= this.MAX_CONCURRENT_FALLBACK_QUERIES) {
        const fallback = this.lastKnownDashboardSnapshot.get(cacheKey);
        if (fallback) {
          this.logger.warn(
            `Fail-open bulkhead saturated (${this.activeFallbackDashboardQueries}/${this.MAX_CONCURRENT_FALLBACK_QUERIES}). Serving in-memory snapshot for ${cacheKey}`,
          );
          return fallback;
        }
      }
    }

    const isFallbackMode = !isRedisConnected;
    if (isFallbackMode) {
      this.activeFallbackDashboardQueries++;
    }

    try {
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

    const result = {
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

      if (isRedisConnected && redis) {
        try {
          await redis.setex(cacheKey, withTtlJitter(30), this.serializeReport(result));
        } catch (err: any) {
          this.logger.warn(`Redis dashboard cache write error: ${err.message}`);
        }
      }
      this.recordDashboardSnapshot(cacheKey, result);
      return result;
    } finally {
      if (isFallbackMode) {
        this.activeFallbackDashboardQueries = Math.max(0, this.activeFallbackDashboardQueries - 1);
      }
      if (releaseLock) {
        try {
          await releaseLock();
        } catch {}
      }
    }
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

    const dateStr = startOfDay.toISOString().split('T')[0];
    const cacheKey = `report:daybook:${branchId || 'ALL'}:${dateStr}`;
    const cacheGuard = await this.readCacheOrAcquireStampedeLock(cacheKey, 200, 'daybook');
    if (cacheGuard.hit) {
      return cacheGuard.data;
    }

    const { redis, isRedisConnected, releaseLock } = cacheGuard;

    try {
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

    const reportResult = {
      date: dateStr,
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

      if (isRedisConnected && redis) {
        try {
          await redis.setex(cacheKey, withTtlJitter(60), this.serializeReport(reportResult));
        } catch (err: any) {
          this.logger.warn(`Redis daybook cache write error: ${err.message}`);
        }
      }
      return reportResult;
    } finally {
      if (releaseLock) {
        try {
          await releaseLock();
        } catch {}
      }
    }
  }

  /**
   * Invalidates Redis cache for daybook reports upon new payments or reversals.
   */
  async invalidateReportCache(branchId?: string, date?: Date): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const targetDate = date
          ? date.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
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
        this.logger.warn(`Failed to invalidate report cache: ${err.message}`);
      }
    }
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
    if (!requestingUser.roles || !requestingUser.roles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException(
        'SUPER_ADMIN_REQUIRED: Only Super Admin is authorized to view audit trail logs',
      );
    }

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

  /**
   * Aggregated Maker-Checker Pending Approvals Queue
   * Centralizes pending cash handovers, prize disbursements, payment reversals, and safety proofs.
   * Scoped to branch for Branch Manager; Global for Super Admin & Accountant.
   */
  async getPendingApprovals(
    requestingUser: JwtPayload,
    queryOrBranchId?: QueryPendingApprovalsDto | string,
  ): Promise<PendingApprovalsResponse> {
    const rawBranchId =
      typeof queryOrBranchId === 'string'
        ? queryOrBranchId
        : queryOrBranchId?.branchId;

    const branchId =
      requestingUser.roles.includes(Role.BRANCH_MANAGER) &&
      !requestingUser.roles.includes(Role.SUPER_ADMIN)
        ? requestingUser.branchId || undefined
        : rawBranchId;

    const cacheKey = `report:approvals:${branchId || 'ALL'}`;
    const redis = this.redisProvider?.getClient();

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err: any) {
        this.logger.warn(`Redis approvals cache read error: ${err.message}`);
      }
    }

    // 1. Pending Cash Handovers
    const pendingCashPayments = await this.prisma.payment.findMany({
      where: {
        paymentMethod: 'CASH',
        cashHandoverStatus: 'PENDING_HANDOVER',
        paymentStatus: 'SUCCESS',
        ...(branchId ? { branchId } : {}),
      },
      include: {
        recordedByUser: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const cashHandoverMap = new Map<
      string,
      {
        collectorId: string;
        collectorName: string;
        collectorPhone?: string | null;
        branchId: string;
        totalAmount: bigint;
        paymentCount: number;
        oldestCollectionAt: Date;
        paymentIds: string[];
      }
    >();

    let cashHandoversTotalBigInt = 0n;
    for (const p of pendingCashPayments) {
      cashHandoversTotalBigInt += p.amount;
      const existing = cashHandoverMap.get(p.recordedByUserId);
      if (existing) {
        existing.totalAmount += p.amount;
        existing.paymentCount += 1;
        existing.paymentIds.push(p.id);
        if (p.createdAt < existing.oldestCollectionAt) {
          existing.oldestCollectionAt = p.createdAt;
        }
      } else {
        cashHandoverMap.set(p.recordedByUserId, {
          collectorId: p.recordedByUserId,
          collectorName: p.recordedByUser?.name || 'Unknown Agent',
          collectorPhone: p.recordedByUser?.phone || null,
          branchId: p.branchId,
          totalAmount: p.amount,
          paymentCount: 1,
          oldestCollectionAt: p.createdAt,
          paymentIds: [p.id],
        });
      }
    }

    const cashHandovers = Array.from(cashHandoverMap.values()).map((h) => ({
      ...h,
      totalAmount: h.totalAmount.toString(),
    }));

    // 2. Pending Disbursement Authorizations (Checker step)
    const pendingAuthorizations = await this.prisma.auctionWinner.findMany({
      where: {
        disbursementStatus: 'VERIFIED_BY_MAKER',
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      include: {
        auction: {
          include: {
            chitGroup: {
              select: { groupCode: true, groupName: true, branchId: true },
            },
          },
        },
        ticket: {
          include: {
            customer: {
              select: { customerCode: true, fullName: true, phone: true },
            },
          },
        },
      },
      orderBy: { auction: { auctionDate: 'desc' } },
    });

    let disbursementsTotalBigInt = 0n;
    const disbursementAuthorizations = pendingAuthorizations.map((w) => {
      const netAmount = w.disbursedAmount || w.auction.prizeMoney || 0n;
      disbursementsTotalBigInt += netAmount;
      return {
        id: w.id,
        auctionId: w.auctionId,
        chitGroupCode: w.auction.chitGroup.groupCode,
        chitGroupName: w.auction.chitGroup.groupName,
        installmentMonth: w.auction.installmentMonth,
        customerCode: w.ticket.customer.customerCode,
        customerName: w.ticket.customer.fullName,
        customerPhone: w.ticket.customer.phone,
        ticketNumber: w.ticket.ticketNumber,
        netPayableAmount: netAmount.toString(),
        disbursementMode: w.disbursementMode,
        verifiedByUserId: w.verifiedByUserId,
        agreementSigned: w.agreementSigned,
        nomineeSigned: w.nomineeSigned,
        hasSecurityDoc: !!w.securityDocS3Key,
      };
    });

    // 3. Pending Payment Reversals (Checker step)
    const pendingReversals = await this.prisma.paymentReversal.findMany({
      where: {
        status: 'REQUESTED',
        ...(branchId ? { payment: { branchId } } : {}),
      },
      include: {
        payment: {
          include: {
            receipt: { select: { receiptNumber: true } },
            allocations: {
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
      orderBy: { createdAt: 'desc' },
    });

    let reversalsTotalBigInt = 0n;
    const paymentReversals = pendingReversals.map((r) => {
      reversalsTotalBigInt += r.payment.amount;
      const primaryCustomer =
        r.payment.allocations[0]?.ticket?.customer;
      return {
        id: r.id,
        paymentId: r.paymentId,
        receiptNumber: r.payment.receipt?.receiptNumber || 'N/A',
        amount: r.payment.amount.toString(),
        customerCode: primaryCustomer?.customerCode,
        customerName: primaryCustomer?.fullName,
        reason: r.reason,
        notes: r.notes,
        initiatedByUserId: r.initiatedByUserId,
        createdAt: r.createdAt,
      };
    });

    // 4. Pending Safety Proof Verifications (Maker step)
    const pendingSafetyProofs = await this.prisma.auctionWinner.findMany({
      where: {
        disbursementStatus: 'PENDING_VERIFICATION',
        ...(branchId ? { auction: { chitGroup: { branchId } } } : {}),
      },
      include: {
        auction: {
          include: {
            chitGroup: {
              select: { groupCode: true, groupName: true },
            },
          },
        },
        ticket: {
          include: {
            customer: {
              select: { customerCode: true, fullName: true, phone: true },
            },
          },
        },
      },
      orderBy: { auction: { auctionDate: 'desc' } },
    });

    const safetyProofVerifications = pendingSafetyProofs.map((w) => ({
      id: w.id,
      auctionId: w.auctionId,
      chitGroupCode: w.auction.chitGroup.groupCode,
      chitGroupName: w.auction.chitGroup.groupName,
      installmentMonth: w.auction.installmentMonth,
      customerCode: w.ticket.customer.customerCode,
      customerName: w.ticket.customer.fullName,
      customerPhone: w.ticket.customer.phone,
      ticketNumber: w.ticket.ticketNumber,
      netPayableAmount: (w.disbursedAmount || w.auction.prizeMoney || 0n).toString(),
      auctionDate: w.auction.auctionDate,
    }));

    const totalPendingCount =
      cashHandovers.length +
      disbursementAuthorizations.length +
      paymentReversals.length +
      safetyProofVerifications.length;

    const result: PendingApprovalsResponse = {
      summary: {
        totalPendingCount,
        cashHandoversCount: cashHandovers.length,
        disbursementAuthorizationsCount: disbursementAuthorizations.length,
        paymentReversalsCount: paymentReversals.length,
        safetyProofVerificationsCount: safetyProofVerifications.length,
        cashHandoversTotalAmount: cashHandoversTotalBigInt.toString(),
        disbursementsTotalAmount: disbursementsTotalBigInt.toString(),
        reversalsTotalAmount: reversalsTotalBigInt.toString(),
      },
      cashHandovers,
      disbursementAuthorizations,
      paymentReversals,
      safetyProofVerifications,
    };

    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        await redis.setex(cacheKey, 15, JSON.stringify(result));
      } catch (err: any) {
        this.logger.warn(`Redis approvals cache write error: ${err.message}`);
      }
    }

    return result;
  }
}
