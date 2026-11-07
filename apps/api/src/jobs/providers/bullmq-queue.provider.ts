import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import {
  CRON_DAILY_ARREARS,
  CRON_PRE_AUCTION_REMINDERS,
  CRON_SETTLEMENT_RECONCILIATION,
  JOB_SCAN_PRE_AUCTION_REMINDERS,
  REPEATABLE_JOB_DAILY_ARREARS,
  REPEATABLE_JOB_PRE_AUCTION_REMINDERS,
  REPEATABLE_JOB_SETTLEMENT_RECONCILIATION,
  TIMEZONE_IST,
} from '../constants/cron-schedules.constant';
import {
  DAILY_MAINTENANCE_QUEUE,
  JOB_DISPATCH_APPROVAL_ALERT,
  JOB_DISPATCH_AUCTION_REMINDER,
  JOB_DISPATCH_AUCTION_RESULT,
  JOB_DISPATCH_DEFAULT_WARNING,
  JOB_DISPATCH_PAYMENT_RECEIPT,
  JOB_PROCESS_DAILY_ARREARS,
  JOB_RUN_DAILY_RECONCILIATION,
  NOTIFICATION_QUEUE,
  RECONCILIATION_QUEUE,
} from '../constants/queue-names.constant';
import { AuctionReminderSchedulerService } from '../services/auction-reminder-scheduler.service';
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

export interface JobEnqueueOptions {
  jobId?: string;
  priority?: number;
  attempts?: number;
  backoff?: { type: string; delay: number };
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
    @Optional() private readonly auctionReminderSchedulerService?: AuctionReminderSchedulerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const client = this.redisProvider.getClient();
    if (!client) {
      this.logger.warn('Redis client not available. Operating BullMQ queues in direct-execution mode.');
      return;
    }

    try {
      // 1. Initialize BullMQ Queues with Redis connection & error guardians
      this.dailyMaintenanceQueue = new Queue(DAILY_MAINTENANCE_QUEUE, {
        connection: client as any,
      });
      this.dailyMaintenanceQueue.on('error', (err) => {
        this.logger.warn(`Daily maintenance queue connection error: ${err.message}`);
      });

      this.notificationQueue = new Queue(NOTIFICATION_QUEUE, {
        connection: client as any,
      });
      this.notificationQueue.on('error', (err) => {
        this.logger.warn(`Notification queue connection error: ${err.message}`);
      });

      this.reconciliationQueue = new Queue(RECONCILIATION_QUEUE, {
        connection: client as any,
      });
      this.reconciliationQueue.on('error', (err) => {
        this.logger.warn(`Reconciliation queue connection error: ${err.message}`);
      });

      // 2. Initialize Workers with error guardians (if enabled for this process)
      const enableWorkers = process.env.ENABLE_BULLMQ_WORKERS !== 'false';
      if (enableWorkers) {
        this.maintenanceWorker = new Worker(
          DAILY_MAINTENANCE_QUEUE,
          async (job) => {
            if (job.name === JOB_PROCESS_DAILY_ARREARS) {
              const cutoff = job.data?.cutoffDate ? new Date(job.data.cutoffDate) : undefined;
              return await this.dailyArrearsService.processDailyOverdueAndArrears(cutoff);
            }
          },
          {
            connection: client as any,
            concurrency: 2,
            lockDuration: 30000,
            stalledInterval: 30000,
          },
        );
        this.maintenanceWorker.on('error', (err) => {
          this.logger.warn(`Maintenance worker connection error: ${err.message}`);
        });

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
            if (job.name === JOB_DISPATCH_AUCTION_RESULT) {
              return await this.notificationService.dispatchAuctionResult(job.data);
            }
            if (job.name === JOB_DISPATCH_APPROVAL_ALERT) {
              return await this.notificationService.dispatchApprovalAlert(job.data);
            }
            if (job.name === JOB_SCAN_PRE_AUCTION_REMINDERS && this.auctionReminderSchedulerService) {
              return await this.auctionReminderSchedulerService.scanAndBroadcastUpcomingAuctions(
                job.data?.targetDate ? new Date(job.data.targetDate) : undefined,
              );
            }
          },
          {
            connection: client as any,
            concurrency: 5, // Process up to 5 push/SMS notifications in parallel
            lockDuration: 30000,
            stalledInterval: 30000,
          },
        );
        this.notificationWorker.on('error', (err) => {
          this.logger.warn(`Notification worker connection error: ${err.message}`);
        });

        this.reconciliationWorker = new Worker(
          RECONCILIATION_QUEUE,
          async (job) => {
            if (job.name === JOB_RUN_DAILY_RECONCILIATION) {
              return await this.reconciliationService.reconcileSettlement(job.data?.records || []);
            }
          },
          {
            connection: client as any,
            concurrency: 2,
            lockDuration: 30000,
            stalledInterval: 30000,
          },
        );
        this.reconciliationWorker.on('error', (err) => {
          this.logger.warn(`Reconciliation worker connection error: ${err.message}`);
        });

        // 3. Register Automated Repeatable Cron Jobs (Asia/Kolkata timezone)
        await this.registerRepeatableJobs();

        this.logger.log('BullMQ Queues, Workers, and Repeatable Crons initialized successfully.');
      } else {
        this.logger.log(
          'BullMQ Queues initialized in Producer-Only mode (ENABLE_BULLMQ_WORKERS=false). Worker execution isolated to dedicated worker processes.',
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not start BullMQ workers on Redis: ${err.message}. Using direct execution.`);
    }
  }

  /**
   * Registers automated Indian Standard Time (Asia/Kolkata) repeatable cron jobs on BullMQ queues.
   */
  async registerRepeatableJobs(): Promise<void> {
    if (!this.dailyMaintenanceQueue || !this.reconciliationQueue || !this.notificationQueue) {
      return;
    }

    try {
      // 1. Daily Midnight Arrears & 3-Month Default Recalculation (00:01 AM IST)
      await this.dailyMaintenanceQueue.upsertJobScheduler(
        REPEATABLE_JOB_DAILY_ARREARS,
        {
          pattern: CRON_DAILY_ARREARS,
          tz: TIMEZONE_IST,
        },
        {
          name: JOB_PROCESS_DAILY_ARREARS,
          data: {},
        },
      );

      // 2. Daily Payment Settlement Reconciliation (06:00 AM IST)
      await this.reconciliationQueue.upsertJobScheduler(
        REPEATABLE_JOB_SETTLEMENT_RECONCILIATION,
        {
          pattern: CRON_SETTLEMENT_RECONCILIATION,
          tz: TIMEZONE_IST,
        },
        {
          name: JOB_RUN_DAILY_RECONCILIATION,
          data: { records: [] },
        },
      );

      // 3. Pre-Auction Reminders Broadcast (09:00 AM IST)
      await this.notificationQueue.upsertJobScheduler(
        REPEATABLE_JOB_PRE_AUCTION_REMINDERS,
        {
          pattern: CRON_PRE_AUCTION_REMINDERS,
          tz: TIMEZONE_IST,
        },
        {
          name: JOB_SCAN_PRE_AUCTION_REMINDERS,
          data: {},
        },
      );

      this.logger.log('Registered 3 automated repeatable cron jobs on BullMQ (Asia/Kolkata).');
    } catch (err: any) {
      this.logger.warn(`Failed to register repeatable cron jobs: ${err.message}`);
    }
  }

  /**
   * Returns list of registered repeatable jobs across active queues.
   */
  async getRepeatableJobs(): Promise<Array<{ queue: string; id: string; pattern?: string; tz?: string; next?: number }>> {
    const list: Array<{ queue: string; id: string; pattern?: string; tz?: string; next?: number }> = [];
    const queues = [
      { name: DAILY_MAINTENANCE_QUEUE, queue: this.dailyMaintenanceQueue },
      { name: RECONCILIATION_QUEUE, queue: this.reconciliationQueue },
      { name: NOTIFICATION_QUEUE, queue: this.notificationQueue },
    ];

    for (const q of queues) {
      if (q.queue) {
        try {
          const schedulers = await q.queue.getJobSchedulers();
          for (const s of schedulers) {
            list.push({
              queue: q.name,
              id: s.id || '',
              pattern: s.pattern,
              tz: s.tz,
              next: s.next,
            });
          }
        } catch {
          // Ignore if queue unavailable
        }
      }
    }
    return list;
  }

  /**
   * Adds a job to a BullMQ queue, or executes immediately if Redis is offline.
   * Supports deterministic jobId deduplication and priority weighting (1=high, 10=low).
   */
  async addJob(
    queueName: string,
    jobName: string,
    data: any,
    options?: JobEnqueueOptions,
  ): Promise<{ jobId: string; status: string }> {
    const isConnected = this.redisProvider.getIsConnected();

    if (isConnected) {
      let targetQueue: Queue | null = null;
      if (queueName === DAILY_MAINTENANCE_QUEUE) targetQueue = this.dailyMaintenanceQueue;
      else if (queueName === NOTIFICATION_QUEUE) targetQueue = this.notificationQueue;
      else if (queueName === RECONCILIATION_QUEUE) targetQueue = this.reconciliationQueue;

      if (targetQueue) {
        const job = await targetQueue.add(jobName, data, {
          jobId: options?.jobId,
          priority: options?.priority,
          attempts: options?.attempts ?? 3,
          backoff: options?.backoff ?? { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        });
        return { jobId: job?.id || options?.jobId || `job-${Date.now()}`, status: 'ENQUEUED' };
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
    } else if (jobName === JOB_DISPATCH_AUCTION_RESULT) {
      await this.notificationService.dispatchAuctionResult(data);
    } else if (jobName === JOB_DISPATCH_APPROVAL_ALERT) {
      await this.notificationService.dispatchApprovalAlert(data);
    } else if (jobName === JOB_RUN_DAILY_RECONCILIATION) {
      await this.reconciliationService.reconcileSettlement(data?.records || []);
    } else if (jobName === JOB_SCAN_PRE_AUCTION_REMINDERS && this.auctionReminderSchedulerService) {
      await this.auctionReminderSchedulerService.scanAndBroadcastUpcomingAuctions(
        data?.targetDate ? new Date(data.targetDate) : undefined,
      );
    }

    return { jobId: options?.jobId || `direct-${Date.now()}`, status: 'EXECUTED_DIRECT' };
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

  getDailyMaintenanceQueue(): Queue | null {
    return this.dailyMaintenanceQueue;
  }

  getNotificationQueue(): Queue | null {
    return this.notificationQueue;
  }

  getReconciliationQueue(): Queue | null {
    return this.reconciliationQueue;
  }

  getNotificationWorker(): Worker | null {
    return this.notificationWorker;
  }

  getMaintenanceWorker(): Worker | null {
    return this.maintenanceWorker;
  }

  getReconciliationWorker(): Worker | null {
    return this.reconciliationWorker;
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
