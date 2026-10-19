import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import {
  DAILY_MAINTENANCE_QUEUE,
  JOB_DISPATCH_AUCTION_REMINDER,
  JOB_DISPATCH_DEFAULT_WARNING,
  JOB_DISPATCH_PAYMENT_RECEIPT,
  JOB_PROCESS_DAILY_ARREARS,
  JOB_RUN_DAILY_RECONCILIATION,
  NOTIFICATION_QUEUE,
  RECONCILIATION_QUEUE,
} from '../constants/queue-names.constant';
import { DailyArrearsService } from '../services/daily-arrears.service';
import { NotificationService } from '../services/notification.service';
import { ReconciliationService } from '../services/reconciliation.service';
import { RedisConnectionProvider } from './redis-connection.provider';

export interface QueueStatusReport {
  queueName: string;
  isRedisConnected: boolean;
  waitingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

@Injectable()
export class BullMqQueueProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqQueueProvider.name);

  private dailyMaintenanceQueue: Queue | null = null;
  private notificationQueue: Queue | null = null;
  private reconciliationQueue: Queue | null = null;

  private maintenanceWorker: Worker | null = null;
  private notificationWorker: Worker | null = null;
  private reconciliationWorker: Worker | null = null;

  constructor(
    private readonly redisProvider: RedisConnectionProvider,
    private readonly dailyArrearsService: DailyArrearsService,
    private readonly notificationService: NotificationService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  onModuleInit(): void {
    const client = this.redisProvider.getClient();
    if (!client) {
      this.logger.warn('Redis client not available. Operating BullMQ queues in direct-execution mode.');
      return;
    }

    try {
      // 1. Initialize BullMQ Queues with Redis connection
      this.dailyMaintenanceQueue = new Queue(DAILY_MAINTENANCE_QUEUE, {
        connection: client as any,
      });

      this.notificationQueue = new Queue(NOTIFICATION_QUEUE, {
        connection: client as any,
      });

      this.reconciliationQueue = new Queue(RECONCILIATION_QUEUE, {
        connection: client as any,
      });

      // 2. Initialize Workers
      this.maintenanceWorker = new Worker(
        DAILY_MAINTENANCE_QUEUE,
        async (job) => {
          if (job.name === JOB_PROCESS_DAILY_ARREARS) {
            const cutoff = job.data?.cutoffDate ? new Date(job.data.cutoffDate) : undefined;
            return await this.dailyArrearsService.processDailyOverdueAndArrears(cutoff);
          }
        },
        { connection: client as any },
      );

      this.notificationWorker = new Worker(
        NOTIFICATION_QUEUE,
        async (job) => {
          if (job.name === JOB_DISPATCH_PAYMENT_RECEIPT) {
            return await this.notificationService.dispatchPaymentReceipt(job.data);
          }
          if (job.name === JOB_DISPATCH_AUCTION_REMINDER) {
            return await this.notificationService.dispatchAuctionReminder(job.data);
          }
          if (job.name === JOB_DISPATCH_DEFAULT_WARNING) {
            return await this.notificationService.dispatchDefaultWarning(job.data);
          }
        },
        { connection: client as any },
      );

      this.reconciliationWorker = new Worker(
        RECONCILIATION_QUEUE,
        async (job) => {
          if (job.name === JOB_RUN_DAILY_RECONCILIATION) {
            return await this.reconciliationService.reconcileSettlement(job.data?.records || []);
          }
        },
        { connection: client as any },
      );

      this.logger.log('BullMQ Queues and Workers initialized successfully.');
    } catch (err: any) {
      this.logger.warn(`Could not start BullMQ workers on Redis: ${err.message}. Using direct execution.`);
    }
  }

  /**
   * Adds a job to a BullMQ queue, or executes immediately if Redis is offline.
   */
  async addJob(queueName: string, jobName: string, data: any): Promise<{ jobId: string; status: string }> {
    const isConnected = this.redisProvider.getIsConnected();

    if (isConnected) {
      let targetQueue: Queue | null = null;
      if (queueName === DAILY_MAINTENANCE_QUEUE) targetQueue = this.dailyMaintenanceQueue;
      else if (queueName === NOTIFICATION_QUEUE) targetQueue = this.notificationQueue;
      else if (queueName === RECONCILIATION_QUEUE) targetQueue = this.reconciliationQueue;

      if (targetQueue) {
        const job = await targetQueue.add(jobName, data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        });
        return { jobId: job.id || `job-${Date.now()}`, status: 'ENQUEUED' };
      }
    }

    // Direct execution fallback if Redis is offline / in testing
    this.logger.log(`Executing job ${jobName} directly (Redis offline/fallback mode)`);
    if (jobName === JOB_PROCESS_DAILY_ARREARS) {
      const cutoff = data?.cutoffDate ? new Date(data.cutoffDate) : undefined;
      await this.dailyArrearsService.processDailyOverdueAndArrears(cutoff);
    } else if (jobName === JOB_DISPATCH_PAYMENT_RECEIPT) {
      await this.notificationService.dispatchPaymentReceipt(data);
    } else if (jobName === JOB_DISPATCH_AUCTION_REMINDER) {
      await this.notificationService.dispatchAuctionReminder(data);
    } else if (jobName === JOB_DISPATCH_DEFAULT_WARNING) {
      await this.notificationService.dispatchDefaultWarning(data);
    } else if (jobName === JOB_RUN_DAILY_RECONCILIATION) {
      await this.reconciliationService.reconcileSettlement(data?.records || []);
    }

    return { jobId: `direct-${Date.now()}`, status: 'EXECUTED_DIRECT' };
  }

  /**
   * Returns health status and job counts for all registered queues.
   */
  async getQueueStatusReports(): Promise<QueueStatusReport[]> {
    const isRedisConnected = this.redisProvider.getIsConnected();
    const queues = [
      { name: DAILY_MAINTENANCE_QUEUE, queue: this.dailyMaintenanceQueue },
      { name: NOTIFICATION_QUEUE, queue: this.notificationQueue },
      { name: RECONCILIATION_QUEUE, queue: this.reconciliationQueue },
    ];

    const reports: QueueStatusReport[] = [];

    for (const q of queues) {
      if (isRedisConnected && q.queue) {
        try {
          const counts = await q.queue.getJobCounts('waiting', 'active', 'completed', 'failed');
          reports.push({
            queueName: q.name,
            isRedisConnected: true,
            waitingCount: counts.waiting || 0,
            activeCount: counts.active || 0,
            completedCount: counts.completed || 0,
            failedCount: counts.failed || 0,
          });
          continue;
        } catch {
          // Fall through to fallback status
        }
      }

      reports.push({
        queueName: q.name,
        isRedisConnected: false,
        waitingCount: 0,
        activeCount: 0,
        completedCount: 0,
        failedCount: 0,
      });
    }

    return reports;
  }

  async onModuleDestroy(): Promise<void> {
    const workers = [this.maintenanceWorker, this.notificationWorker, this.reconciliationWorker];
    for (const worker of workers) {
      if (worker) {
        try {
          await worker.close();
        } catch {}
      }
    }

    const queues = [this.dailyMaintenanceQueue, this.notificationQueue, this.reconciliationQueue];
    for (const queue of queues) {
      if (queue) {
        try {
          await queue.close();
        } catch {}
      }
    }
  }
}
