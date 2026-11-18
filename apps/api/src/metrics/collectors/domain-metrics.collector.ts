// ==============================================================================
// Kumaran Chits — Domain & Queue Metrics Collector
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3), AGENTS.md §3
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BullMqQueueProvider } from '../../jobs/providers/bullmq-queue.provider';
import { MetricsService } from '../services/metrics.service';

const PROBE_TIMEOUT_MS = 2500;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MAX_SAFE_GAUGE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

@Injectable()
export class DomainMetricsCollector {
  private readonly logger = new Logger(DomainMetricsCollector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProvider: BullMqQueueProvider,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Refreshes all database, queue, and financial domain metrics safely before Prometheus scrape.
   * Every probe is isolated with bounded timeouts and error swallowing so failures never crash scrapes.
   */
  async collectAll(): Promise<void> {
    await Promise.allSettled([
      this.collectDatabaseHealth(),
      this.collectQueueMetrics(),
      this.collectDomainKpis(),
    ]);
  }

  /**
   * Pure BigInt-safe conversion to a finite whole-rupee Prometheus gauge value.
   * Guards against negative corruption, NaN, Infinity, and > Number.MAX_SAFE_INTEGER overflow.
   */
  public safeBigIntToGaugeValue(raw: bigint | number | null | undefined): number {
    if (raw === null || raw === undefined) {
      return 0;
    }

    let asBigInt: bigint;
    if (typeof raw === 'bigint') {
      asBigInt = raw;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      asBigInt = BigInt(Math.trunc(raw));
    } else {
      return 0;
    }

    if (asBigInt <= 0n) {
      return 0;
    }

    if (asBigInt > MAX_SAFE_GAUGE_BIGINT) {
      this.logger.warn(
        `Daily collected rupee total (${asBigInt.toString()}) exceeds Number.MAX_SAFE_INTEGER; clamping gauge value`,
      );
      return Number.MAX_SAFE_INTEGER;
    }

    return Number(asBigInt);
  }

  /**
   * Computes start of current business day in IST (Asia/Kolkata, UTC+05:30).
   */
  public getStartOfIstDay(now: Date = new Date()): Date {
    const istShifted = new Date(now.getTime() + IST_OFFSET_MS);
    istShifted.setUTCHours(0, 0, 0, 0);
    return new Date(istShifted.getTime() - IST_OFFSET_MS);
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Metrics probe timeout (${PROBE_TIMEOUT_MS}ms): ${label}`));
          }, PROBE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async collectDatabaseHealth(): Promise<void> {
    try {
      await this.withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        'db-health',
      );
      this.metricsService.dbConnected.set(1);
    } catch {
      this.metricsService.dbConnected.set(0);
    }
  }

  private async collectQueueMetrics(): Promise<void> {
    const queueGetters = [
      { name: 'daily-maintenance-queue', get: () => this.queueProvider.getDailyMaintenanceQueue() },
      { name: 'notification-queue', get: () => this.queueProvider.getNotificationQueue() },
      { name: 'reconciliation-queue', get: () => this.queueProvider.getReconciliationQueue() },
    ];

    for (const { name, get } of queueGetters) {
      try {
        const queue = get();
        if (!queue) {
          continue;
        }
        const counts = await this.withTimeout(
          queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
          `queue:${name}`,
        );
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'waiting' }, counts.waiting || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'active' }, counts.active || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'completed' }, counts.completed || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'failed' }, counts.failed || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'delayed' }, counts.delayed || 0);
      } catch (err: any) {
        this.logger.debug(`Could not collect BullMQ counts for ${name}: ${err?.message}`);
      }
    }
  }

  private async collectDomainKpis(): Promise<void> {
    try {
      const startOfIstDay = this.getStartOfIstDay();

      const [
        activeChitsCount,
        activeSubscribersCount,
        defaulters1MCount,
        defaulters3MCount,
        pendingReversalsCount,
        pendingVerificationCount,
        verifiedByMakerFinalizedCount,
        scheduledMakerVerifiedRows,
        dailyAgg,
      ] = await this.withTimeout(
        Promise.all([
          this.prisma.chitGroup.count({ where: { status: 'ACTIVE' } }),
          this.prisma.subscriberTicket.count({ where: { status: 'ACTIVE' } }),
          this.prisma.subscriberTicket.count({
            where: {
              consecutiveUnpaidMonths: 1,
              status: { not: 'REMOVED_DEF_3M' },
            },
          }),
          this.prisma.subscriberTicket.count({
            where: {
              consecutiveUnpaidMonths: { gte: 3 },
              status: { not: 'REMOVED_DEF_3M' },
            },
          }),
          this.prisma.paymentReversal.count({ where: { status: 'REQUESTED' } }),
          this.prisma.auctionWinner.count({
            where: {
              disbursementStatus: 'PENDING_VERIFICATION',
              auction: {
                status: {
                  in: ['COMPLETED', 'MINUTES_FILED'],
                },
              },
            },
          }),
          this.prisma.auctionWinner.count({
            where: {
              disbursementStatus: 'VERIFIED_BY_MAKER',
              auction: {
                status: {
                  in: ['COMPLETED', 'MINUTES_FILED'],
                },
              },
            },
          }),
          typeof this.prisma.auctionWinner?.findMany === 'function'
            ? this.prisma.auctionWinner.findMany({
                where: {
                  disbursementStatus: 'VERIFIED_BY_MAKER',
                  auction: { status: 'SCHEDULED' },
                },
                select: {
                  auction: {
                    select: {
                      installmentMonth: true,
                      chitGroup: { select: { durationMonths: true } },
                    },
                  },
                },
              })
            : Promise.resolve([]),
          this.prisma.payment.aggregate({
            where: {
              createdAt: { gte: startOfIstDay },
              paymentStatus: 'SUCCESS',
            },
            _sum: { amount: true },
          }),
        ]),
        'domain-kpis',
      );

      // Include Month N prepared maturity settlements (SCHEDULED + installmentMonth === durationMonths)
      const monthNPreparedCount = (scheduledMakerVerifiedRows ?? []).filter(
        (row) =>
          typeof row.auction?.chitGroup?.durationMonths === 'number' &&
          row.auction.installmentMonth === row.auction.chitGroup.durationMonths,
      ).length;
      const pendingDisbursementsCount =
        pendingVerificationCount + verifiedByMakerFinalizedCount + monthNPreparedCount;

      this.metricsService.activeChitGroupsTotal.set(activeChitsCount);
      this.metricsService.activeSubscribersTotal.set(activeSubscribersCount);
      this.metricsService.defaulterTicketsCount.set({ bucket: '1_MONTH' }, defaulters1MCount);
      this.metricsService.defaulterTicketsCount.set({ bucket: '3_MONTH_REMOVAL' }, defaulters3MCount);
      this.metricsService.makerCheckerPendingCount.set({ type: 'PAYMENT_REVERSAL' }, pendingReversalsCount);
      this.metricsService.makerCheckerPendingCount.set({ type: 'PRIZE_DISBURSEMENT' }, pendingDisbursementsCount);

      const todayAmount = this.safeBigIntToGaugeValue(dailyAgg._sum?.amount ?? 0n);
      this.metricsService.dailyCollectedAmountRupees.set(todayAmount);
    } catch (err: any) {
      this.logger.debug(`Could not collect domain KPIs: ${err?.message}`);
    }
  }
}
