import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { stringifyBigIntSafe } from '../common/utils/bigint-json.util';
import { withTtlJitter } from '../common/utils/cache-jitter.util';
import { acquireRedisMutexLock } from '../common/utils/redis-lock.util';
import { RedisConnectionProvider } from '../jobs/providers/redis-connection.provider';
import { DistributedLockService } from '../jobs/services/distributed-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { QueryCashBookDto } from './dto/query-cash-book.dto';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { QueryDayBookDto } from './dto/query-day-book.dto';
import { QueryDefaultersReportDto } from './dto/query-defaulters-report.dto';
import { QueryFormXviiDto } from './dto/query-form-xvii.dto';
import { QueryFormXxiDto } from './dto/query-form-xxi.dto';
import { QueryPendingApprovalsDto } from './dto/query-pending-approvals.dto';
import {
  annotatePendingApprovalsForUser,
  buildBranchPendingApprovalsSnapshot,
  type PendingApprovalsResponse,
  resolveApprovalCallerContext,
} from './helpers/pending-approvals.helper';
import {
  formatIstDate,
  getIstDayBounds,
  parseStrictIstDateRange,
  resolveScopedBranchId,
  sanitizeAuditPayload,
  validatePagination,
} from './helpers/report-scope.helper';
import { StatutoryReportService } from './statutory-report.service';

export type { PendingApprovalsResponse };

const APPROVALS_STREAM_ALLOWED_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.PARTNER,
  Role.BRANCH_MANAGER,
  Role.ACCOUNTANT,
  Role.AUDITOR,
];

const BIGINT_REVIVER_KEYS = new Set([
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
]);

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
    return stringifyBigIntSafe(data);
  }

  private deserializeReport(json: string): any {
    return JSON.parse(json, (key, val) => {
      if (
        typeof val === 'string' &&
        BIGINT_REVIVER_KEYS.has(key) &&
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
    reviveBigInt: boolean = true,
  ): Promise<
    | { hit: true; data: any }
    | {
        hit: false;
        redis: any;
        isRedisConnected: boolean;
        releaseLock: (() => Promise<void>) | null;
      }
  > {
    const redis = this.redisProvider?.getClient();
    const isRedisConnected = Boolean(
      redis && this.redisProvider?.getIsConnected(),
    );
    let releaseLock: (() => Promise<void>) | null = null;
    const parsePayload = (raw: string) =>
      reviveBigInt ? this.deserializeReport(raw) : JSON.parse(raw);

    if (isRedisConnected && redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return { hit: true, data: parsePayload(cached) };
        }

        let lockAcquired = false;
        if (this.distributedLockService) {
          const lock = await this.distributedLockService.acquireLock(
            cacheKey,
            4000,
          );
          if (lock.acquired) {
            releaseLock = lock.release;
            lockAcquired = true;
          }
        } else {
          const lock = await acquireRedisMutexLock(
            redis,
            cacheKey,
            4000,
            this.logger,
          );
          if (lock.acquired) {
            releaseLock = lock.release;
            lockAcquired = true;
          }
        }

        if (!lockAcquired) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          const retryCached = await redis.get(cacheKey);
          if (retryCached) {
            return { hit: true, data: parsePayload(retryCached) };
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
   * Uses strict Asia/Kolkata (IST) day boundaries and pure 64-bit BigInt math.
   */
  async getExecutiveDashboard(
    query: QueryDashboardDto,
    requestingUser: JwtPayload,
  ) {
    const branchId = resolveScopedBranchId(requestingUser, query.branchId);

    const cacheKey = `report:dashboard:${branchId || 'ALL'}`;
    const cacheGuard = await this.readCacheOrAcquireStampedeLock(
      cacheKey,
      250,
      'dashboard',
    );
    if (cacheGuard.hit) {
      return cacheGuard.data;
    }

    const { redis, isRedisConnected, releaseLock } = cacheGuard;
    if (!isRedisConnected) {
      // Fail-Open Concurrency Bulkhead: When Redis is unavailable, limit concurrent heavy computations
      if (
        this.activeFallbackDashboardQueries >=
        this.MAX_CONCURRENT_FALLBACK_QUERIES
      ) {
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
      const { startOfDay: startOfToday, endOfDay: endOfToday } =
        getIstDayBounds();

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

      // 2. Today's Collections by Payment Method (IST day window)
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
        else if (p.paymentMethod === 'BANK_TRANSFER')
          todayBankCollections += p.amount;
        else if (p.paymentMethod === 'CHEQUE')
          todayChequeCollections += p.amount;
      }

      // 3. Today's Prize Disbursements (IST day window)
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
          paymentStatus: 'SUCCESS',
          cashHandoverStatus: 'PENDING_HANDOVER',
          ...(branchId ? { branchId } : {}),
        },
      });

      const pendingSafetyProofVerifications =
        await this.prisma.auctionWinner.count({
          where: {
            disbursementStatus: 'PENDING_VERIFICATION',
            auction: {
              status: { in: ['COMPLETED', 'MINUTES_FILED'] },
              ...(branchId ? { chitGroup: { branchId } } : {}),
            },
          },
        });

      const pendingDisbursementAuthorizations =
        await this.prisma.auctionWinner.count({
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
          status: { notIn: ['REMOVED_DEF_3M', 'SURRENDERED'] },
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
          const diff = d.netPayableAmount - d.paidAmount;
          if (diff > 0n) {
            ticketUnpaid += diff;
          }
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
          bucket2Months: {
            count: count2Months,
            totalAmount: arrears2MonthsTotal,
          },
          bucket3MonthsAndAbove: {
            count: count3Months,
            totalAmount: arrears3MonthsTotal,
            note: 'Eligible for company removal rights under ADR-07',
          },
        },
      };

      if (isRedisConnected && redis) {
        try {
          await redis.setex(
            cacheKey,
            withTtlJitter(30),
            this.serializeReport(result),
          );
        } catch (err: any) {
          this.logger.warn(`Redis dashboard cache write error: ${err.message}`);
        }
      }
      this.recordDashboardSnapshot(cacheKey, result);
      return result;
    } finally {
      if (isFallbackMode) {
        this.activeFallbackDashboardQueries = Math.max(
          0,
          this.activeFallbackDashboardQueries - 1,
        );
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
   * using exact Asia/Kolkata (IST) calendar day boundaries.
   */
  async getDayBook(query: QueryDayBookDto, requestingUser: JwtPayload) {
    const { dateStr, startOfDay, endOfDay } = getIstDayBounds(
      query.date,
      'date',
    );
    const branchId = resolveScopedBranchId(requestingUser, query.branchId);

    const cacheKey = `report:daybook:${branchId || 'ALL'}:${dateStr}`;
    const cacheGuard = await this.readCacheOrAcquireStampedeLock(
      cacheKey,
      200,
      'daybook',
    );
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
        else if (p.paymentMethod === 'BANK_TRANSFER')
          bankTransferInflow += p.amount;
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
          collectedBy: p.recordedByUser?.name || 'Unknown',
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
          await redis.setex(
            cacheKey,
            withTtlJitter(60),
            this.serializeReport(reportResult),
          );
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
   * Invalidates Redis cache for daybook, dashboard, and approvals upon financial mutations.
   * Uses exact IST date key (plus UTC date key if straddling 00:00-05:29 IST midnight boundary).
   */
  async invalidateReportCache(branchId?: string, date?: Date): Promise<void> {
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected()) {
      try {
        const instant = date ?? new Date();
        const istDate = formatIstDate(instant);
        const utcDate = instant.toISOString().split('T')[0];
        const dates = istDate === utcDate ? [istDate] : [istDate, utcDate];

        const keys: string[] = ['report:dashboard:ALL', 'report:approvals:ALL'];
        for (const d of dates) {
          keys.push(`report:daybook:ALL:${d}`);
          keys.push(`report:daybook:ALL_BRANCHES:${d}`);
        }
        if (branchId) {
          keys.push(`report:dashboard:${branchId}`);
          keys.push(`report:approvals:${branchId}`);
          for (const d of dates) {
            keys.push(`report:daybook:${branchId}:${d}`);
          }
        }
        await redis.del(...keys);
      } catch (err: any) {
        this.logger.warn(`Failed to invalidate report cache: ${err.message}`);
      }
    }
  }

  /**
   * Defaulters & Arrears Aging Register
   * Fail-closed branch scoping for COLLECTION_AGENT and BRANCH_MANAGER.
   */
  async getDefaultersAgingReport(
    query: QueryDefaultersReportDto,
    requestingUser: JwtPayload,
  ) {
    const branchId = resolveScopedBranchId(requestingUser, query.branchId, {
      allowCollectionAgent: true,
    });

    const minArrearsMonths = query.minArrearsMonths ?? 1;
    if (
      !Number.isInteger(minArrearsMonths) ||
      minArrearsMonths < 1 ||
      minArrearsMonths > 120
    ) {
      throw new BadRequestException(
        'INVALID_FILTER: minArrearsMonths must be an integer between 1 and 120',
      );
    }

    const { page, limit, skip } = validatePagination(
      query.page,
      query.limit,
      20,
      100,
    );

    const where: any = {
      consecutiveUnpaidMonths: { gte: minArrearsMonths },
      status: { notIn: ['REMOVED_DEF_3M', 'SURRENDERED'] },
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
              id: true,
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
        const diff = d.netPayableAmount - d.paidAmount;
        const unpaid = diff > 0n ? diff : 0n;
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
        chitGroupId: t.chitGroupId ?? t.chitGroup.id,
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
   * Immutable Audit Trail Register (Guardrail 11 / ADR-21)
   * Restricted strictly to Role.SUPER_ADMIN. Recursively redacts secrets/tokens/raw PAN
   * from oldValue/newValue JSON snapshots before returning.
   */
  async getAuditLogs(query: QueryAuditLogsDto, requestingUser: JwtPayload) {
    if (
      !Array.isArray(requestingUser?.roles) ||
      !requestingUser.roles.includes(Role.SUPER_ADMIN)
    ) {
      throw new ForbiddenException(
        'SUPER_ADMIN_REQUIRED: Only Super Admin is authorized to view audit trail logs',
      );
    }

    const { page, limit, skip } = validatePagination(
      query.page,
      query.limit,
      50,
      100,
    );
    const timestampRange = parseStrictIstDateRange(
      query.fromDate,
      query.toDate,
    );

    const where: any = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.entityType) {
      where.entityType = query.entityType;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (timestampRange) {
      where.timestamp = timestampRange;
    }

    const [totalCount, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, roles: true },
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
        oldValue: sanitizeAuditPayload(l.oldValue),
        newValue: sanitizeAuditPayload(l.newValue),
      })),
    };
  }

  // Pass-through delegations to StatutoryReportService
  async getCashBookFormXxii(
    query: QueryCashBookDto,
    requestingUser: JwtPayload,
  ) {
    return this.statutoryReportService.getCashBookFormXxii(
      query,
      requestingUser,
    );
  }

  async getAuctionMinutesFormXvii(
    query: QueryFormXviiDto,
    requestingUser: JwtPayload,
  ) {
    return this.statutoryReportService.getAuctionMinutesFormXvii(
      query,
      requestingUser,
    );
  }

  async getSubscriberLedgerFormXxi(
    query: QueryFormXxiDto,
    requestingUser: JwtPayload,
  ) {
    return this.statutoryReportService.getSubscriberLedgerFormXxi(
      query,
      requestingUser,
    );
  }

  /**
   * Resolves and validates mid-flight session validity, token expiry cutoff, persisted Session
   * identity (F04), live DB roles/branchId, and role authorization for open SSE streams (F15).
   * Returns a refreshed JwtPayload reflecting live DB state so mid-stream role/partner demotions
   * take effect immediately on the next tick (XR-M7-RPT-01).
   */
  async resolveLiveStreamUser(currentUser: JwtPayload): Promise<JwtPayload> {
    // 1. Check access token expiration claim (standard 15m lifetime)
    if (currentUser.exp) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds >= currentUser.exp) {
        throw new UnauthorizedException(
          'Access token expired: SSE stream terminated',
        );
      }
    }

    // 2. Fast-path check: Redis revocation cutoff
    const redis = this.redisProvider?.getClient();
    if (redis && this.redisProvider?.getIsConnected() && currentUser.iat) {
      try {
        const revokedBeforeStr = await redis.get(
          `auth:revoked:${currentUser.sub}`,
        );
        if (revokedBeforeStr) {
          const revokedBefore = parseInt(revokedBeforeStr, 10);
          if (currentUser.iat * 1000 < revokedBefore) {
            throw new UnauthorizedException(
              'Session revoked: SSE stream terminated',
            );
          }
        }
      } catch (err: any) {
        if (err instanceof UnauthorizedException) throw err;
      }
    }

    // 3. Database check: user active status, DB tokenRevokedBefore cutoff, live roles/branch
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.sub },
      select: {
        isActive: true,
        tokenRevokedBefore: true,
        roles: true,
        branchId: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'User account deactivated: SSE stream terminated',
      );
    }

    if (user.tokenRevokedBefore && currentUser.iat) {
      if (currentUser.iat * 1000 < user.tokenRevokedBefore.getTime()) {
        throw new UnauthorizedException(
          'Session invalidated: SSE stream terminated',
        );
      }
    }

    // 3b. Persisted multi-device Session identity check (F04) when sid & clientType are present
    if (
      currentUser.sid &&
      currentUser.clientType &&
      typeof this.prisma.session?.findUnique === 'function'
    ) {
      const session = await this.prisma.session.findUnique({
        where: {
          userId_clientType: {
            userId: currentUser.sub,
            clientType: currentUser.clientType,
          },
        },
        select: { id: true, revokedAt: true, expiresAt: true },
      });
      if (
        !session ||
        session.revokedAt !== null ||
        session.id !== currentUser.sid ||
        (session.expiresAt && session.expiresAt.getTime() <= Date.now())
      ) {
        throw new UnauthorizedException(
          'Session terminated: SSE stream disconnected',
        );
      }
    }

    // 4. Role verification aligned with @Sse('approvals-stream') controller RBAC
    const hasAllowedRole = user.roles.some((r) =>
      APPROVALS_STREAM_ALLOWED_ROLES.includes(r),
    );
    if (!hasAllowedRole) {
      throw new ForbiddenException(
        'Permissions updated: User no longer authorized for approvals stream',
      );
    }

    // 5. Fail-closed branch assignment & mid-stream reassignment check for pure BRANCH_MANAGER
    const hasGlobalRole = user.roles.some((r) =>
      ([Role.SUPER_ADMIN, Role.PARTNER, Role.ACCOUNTANT, Role.AUDITOR] as Role[]).includes(r),
    );
    if (!hasGlobalRole && user.roles.includes(Role.BRANCH_MANAGER)) {
      const liveBranchId = user.branchId?.trim();
      if (!liveBranchId) {
        throw new ForbiddenException(
          'BRANCH_SCOPE_REQUIRED: Branch assignment is required for approvals stream',
        );
      }
      if (liveBranchId !== currentUser.branchId?.trim()) {
        throw new ForbiddenException(
          'BRANCH_SCOPE_CHANGED: Branch assignment updated; SSE stream terminated',
        );
      }
    }

    return {
      ...currentUser,
      roles: user.roles,
      branchId: user.branchId ?? null,
    };
  }

  /**
   * Asserts mid-flight session validity for open SSE streams (F15).
   * Preserves void return contract while delegating to live DB authorization check.
   */
  async assertStreamAuthorization(currentUser: JwtPayload): Promise<void> {
    await this.resolveLiveStreamUser(currentUser);
  }

  /**
   * Aggregated Maker-Checker Pending Approvals Queue
   * Aggregates all 8 dual-control queues with Redis stampede protection, fail-closed branch scoping,
   * and post-cache per-caller Maker-Checker (Guardrail 10) & Partner (Guardrail 11) annotation.
   */
  async getPendingApprovals(
    requestingUser: JwtPayload,
    queryOrBranchId?: QueryPendingApprovalsDto | string,
  ): Promise<PendingApprovalsResponse> {
    const rawBranchId =
      typeof queryOrBranchId === 'string'
        ? queryOrBranchId
        : queryOrBranchId?.branchId;
    const actionableOnly =
      typeof queryOrBranchId === 'object' && queryOrBranchId !== null
        ? Boolean(queryOrBranchId.actionableOnly)
        : false;

    const branchId = resolveScopedBranchId(requestingUser, rawBranchId);

    const cacheKey = `report:approvals:${branchId || 'ALL'}`;
    const cacheGuard = await this.readCacheOrAcquireStampedeLock(
      cacheKey,
      150,
      'approvals',
      false,
    );

    let baseSnapshot: PendingApprovalsResponse;
    if (cacheGuard.hit) {
      baseSnapshot = cacheGuard.data as PendingApprovalsResponse;
    } else {
      const { redis, isRedisConnected, releaseLock } = cacheGuard;
      try {
        baseSnapshot = await buildBranchPendingApprovalsSnapshot(
          this.prisma,
          branchId,
        );

        if (isRedisConnected && redis) {
          try {
            await redis.setex(
              cacheKey,
              withTtlJitter(15),
              JSON.stringify(baseSnapshot),
            );
          } catch (err: any) {
            this.logger.warn(
              `Redis approvals cache write error: ${err.message}`,
            );
          }
        }
      } finally {
        if (releaseLock) {
          try {
            await releaseLock();
          } catch {}
        }
      }
    }

    const callerContext = await resolveApprovalCallerContext(
      this.prisma,
      requestingUser,
    );
    return annotatePendingApprovalsForUser(
      baseSnapshot,
      callerContext,
      actionableOnly,
    );
  }
}
