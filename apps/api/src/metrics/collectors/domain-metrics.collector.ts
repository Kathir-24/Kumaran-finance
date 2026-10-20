// ==============================================================================
// Kumaran Chits — Domain & Queue Metrics Collector
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/non-functional-requirements.md (§3), AGENTS.md §3
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BullMqQueueProvider } from '../../jobs/providers/bullmq-queue.provider';
import { MetricsService } from '../services/metrics.service';

@Injectable()
export class DomainMetricsCollector {
  private readonly logger = new Logger(DomainMetricsCollector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProvider: BullMqQueueProvider,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Refreshes all database, queue, and financial domain metrics synchronously before Prometheus scrape.
   */
  async collectAll(): Promise<void> {
    await Promise.allSettled([
      this.collectDatabaseHealth(),
      this.collectQueueMetrics(),
      this.collectDomainKpis(),
    ]);
  }

  private async collectDatabaseHealth(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.metricsService.dbConnected.set(1);
    } catch {
      this.metricsService.dbConnected.set(0);
    }
  }

  private async collectQueueMetrics(): Promise<void> {
    const queues = [
      { name: 'daily-maintenance-queue', queue: this.queueProvider.getDailyMaintenanceQueue() },
      { name: 'notification-queue', queue: this.queueProvider.getNotificationQueue() },
      { name: 'reconciliation-queue', queue: this.queueProvider.getReconciliationQueue() },
    ];

    for (const { name, queue } of queues) {
      if (!queue) {
        continue;
      }
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'waiting' }, counts.waiting || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'active' }, counts.active || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'completed' }, counts.completed || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'failed' }, counts.failed || 0);
        this.metricsService.bullMqQueueJobsCount.set({ queue: name, status: 'delayed' }, counts.delayed || 0);
      } catch (err: any) {
        this.logger.debug(`Could not collect BullMQ counts for ${name}: ${err.message}`);
      }
    }
  }

  private async collectDomainKpis(): Promise<void> {
    try {
      const [
        activeChitsCount,
        activeSubscribersCount,
        overdueCount,
        defaulters3MCount,
        pendingReversalsCount,
        pendingDisbursementsCount,
      ] = await Promise.all([
        this.prisma.chitGroup.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscriberTicket.count({ where: { status: 'ACTIVE' } }),
        this.prisma.installmentDue.count({ where: { status: 'OVERDUE' } }),
        this.prisma.subscriberTicket.count({ where: { status: 'DEFAULT_3_MONTHS' } }),
        this.prisma.paymentReversal.count({ where: { status: 'REQUESTED' } }),
        this.prisma.auctionWinner.count({ where: { disbursementStatus: 'PENDING_VERIFICATION' } }),
      ]);

      this.metricsService.activeChitGroupsTotal.set(activeChitsCount);
      this.metricsService.activeSubscribersTotal.set(activeSubscribersCount);
      this.metricsService.defaulterTicketsCount.set({ bucket: '1_MONTH' }, overdueCount);
      this.metricsService.defaulterTicketsCount.set({ bucket: '3_MONTH_REMOVAL' }, defaulters3MCount);
      this.metricsService.makerCheckerPendingCount.set({ type: 'PAYMENT_REVERSAL' }, pendingReversalsCount);
      this.metricsService.makerCheckerPendingCount.set({ type: 'PRIZE_DISBURSEMENT' }, pendingDisbursementsCount);

      // Today's total collections in whole Rupees
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const dailyAgg = await this.prisma.payment.aggregate({
        where: {
          createdAt: { gte: startOfDay },
          paymentStatus: 'SUCCESS',
        },
        _sum: { amount: true },
      });

      const todayAmount = dailyAgg._sum?.amount ?? 0n;
      this.metricsService.dailyCollectedAmountRupees.set(Number(todayAmount));
    } catch (err: any) {
      this.logger.debug(`Could not collect domain KPIs: ${err.message}`);
    }
  }
}
