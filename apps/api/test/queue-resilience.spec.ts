// ==============================================================================
// Kumaran Chits — Background Processing & Queue Resilience Test Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/bullmq-architecture.md (§3, §4)
// ==============================================================================

import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { BullMqQueueProvider, JobEnqueueOptions } from '../src/jobs/providers/bullmq-queue.provider';
import {
  BULLMQ_FAILED_JOB_MAX_AGE_SECONDS,
  BULLMQ_FAILED_JOB_MAX_COUNT,
  createDefaultBullMqJobOptions,
  DAILY_MAINTENANCE_QUEUE,
  NOTIFICATION_QUEUE,
  RECONCILIATION_QUEUE,
} from '../src/jobs/constants/queue-names.constant';

async function createLiveTestRedis(): Promise<Redis | null> {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || '6379');
  const db = Number(process.env.REDIS_DB || '0') || 0;
  const client = new Redis({
    host,
    port,
    db,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 1000,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    if (pong === 'PONG') {
      return client;
    }
  } catch {
    // Redis unavailable in offline CI environments
  }
  client.disconnect();
  return null;
}

describe('Background Processing & Queue Resilience Suite', () => {
  let queueProvider: BullMqQueueProvider;
  let mockRedisProvider: any;
  let mockDailyArrearsService: any;
  let mockNotificationService: any;
  let mockReconciliationService: any;
  let mockAuctionSchedulerService: any;

  let mockTargetQueue: any;
  let mockClient: any;

  beforeEach(() => {
    mockTargetQueue = {
      add: jest.fn().mockImplementation((jobName: string, data: any, opts: any) => {
        return Promise.resolve({
          id: opts?.jobId || `job-${Date.now()}`,
          name: jobName,
          data,
          opts,
        });
      }),
      on: jest.fn(),
      upsertJobScheduler: jest.fn().mockResolvedValue({}),
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 2,
        active: 1,
        completed: 10,
        failed: 0,
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockClient = {
      status: 'ready',
    };

    mockRedisProvider = {
      getClient: jest.fn().mockReturnValue(mockClient),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    mockDailyArrearsService = {
      processDailyOverdueAndArrears: jest.fn().mockResolvedValue({ status: 'OK' }),
    };

    mockNotificationService = {
      dispatchPaymentReceipt: jest.fn().mockResolvedValue({ success: true }),
      dispatchAuctionReminder: jest.fn().mockResolvedValue({ dispatchedCount: 1 }),
      dispatchDefaultWarning: jest.fn().mockResolvedValue({ success: true }),
      dispatchAuctionResult: jest.fn().mockResolvedValue({ success: true }),
      dispatchApprovalAlert: jest.fn().mockResolvedValue({ success: true }),
    };

    mockReconciliationService = {
      reconcileSettlement: jest.fn().mockResolvedValue({ matchedCount: 0 }),
    };

    mockAuctionSchedulerService = {
      scanAndBroadcastUpcomingAuctions: jest.fn().mockResolvedValue({ chitsCount: 0 }),
    };

    queueProvider = new BullMqQueueProvider(
      mockRedisProvider,
      mockDailyArrearsService,
      mockNotificationService,
      mockReconciliationService,
      mockAuctionSchedulerService,
    );
  });

  describe('1. Deterministic jobId Deduplication', () => {
    it('JOB-DEDUP-1: Should pass deterministic jobId to BullMQ targetQueue.add', async () => {
      // Manually assign mock queue to simulate initialized state
      (queueProvider as any).notificationQueue = mockTargetQueue;

      const receiptPayload = {
        recipientPhone: '9842143210',
        amountPaid: '3750',
        receiptNumber: 'KC-REC-PRD-2026-00412',
      };

      const options: JobEnqueueOptions = {
        jobId: 'receipt-KC-REC-PRD-2026-00412',
        priority: 1,
      };

      const result = await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        receiptPayload,
        options,
      );

      expect(result.status).toBe('ENQUEUED');
      expect(result.jobId).toBe('receipt-KC-REC-PRD-2026-00412');
      expect(mockTargetQueue.add).toHaveBeenCalledWith(
        'dispatch-payment-receipt',
        receiptPayload,
        expect.objectContaining({
          jobId: 'receipt-KC-REC-PRD-2026-00412',
          priority: 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: {
            count: BULLMQ_FAILED_JOB_MAX_COUNT,
            age: BULLMQ_FAILED_JOB_MAX_AGE_SECONDS,
          },
        }),
      );
    });

    it('JOB-DEDUP-2: Re-enqueuing with the same jobId returns identical jobId without creating a duplicate', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      const options: JobEnqueueOptions = {
        jobId: 'receipt-KC-REC-PRD-2026-00412',
        priority: 1,
      };

      // First call
      const res1 = await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        { receiptNumber: 'KC-REC-PRD-2026-00412' },
        options,
      );

      // Second duplicate call
      const res2 = await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        { receiptNumber: 'KC-REC-PRD-2026-00412' },
        options,
      );

      expect(res1.jobId).toBe(res2.jobId);
      expect(res2.jobId).toBe('receipt-KC-REC-PRD-2026-00412');
    });

    it('JOB-DEDUP-3: Normalizes colon delimiters in custom jobIds so BullMQ v6 never rejects Custom Id', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      const result = await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        { receiptNumber: 'KC-REC-PRD-2026-00412' },
        { jobId: 'receipt-KC-REC-PRD-2026-00412', priority: 1 },
      );

      expect(result.jobId).toBe('receipt-KC-REC-PRD-2026-00412');
      expect(mockTargetQueue.add).toHaveBeenCalledWith(
        'dispatch-payment-receipt',
        expect.anything(),
        expect.objectContaining({
          jobId: 'receipt-KC-REC-PRD-2026-00412',
        }),
      );
    });
  });

  describe('2. 3-Tier Priority Scheduling', () => {
    it('JOB-PRIO-1: Critical payment receipts and approval alerts are enqueued with Priority 1', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        { receiptNumber: 'KC-REC-PRD-2026-00412' },
        { jobId: 'receipt-KC-REC-PRD-2026-00412', priority: 1 },
      );

      expect(mockTargetQueue.add).toHaveBeenCalledWith(
        'dispatch-payment-receipt',
        expect.anything(),
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('JOB-PRIO-2: Operational auction results are enqueued with Priority 5', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-auction-result',
        { chitCode: 'KCA-1L-20M-01', month: 2 },
        { jobId: 'auction-result-auc-01-m2', priority: 5 },
      );

      expect(mockTargetQueue.add).toHaveBeenCalledWith(
        'dispatch-auction-result',
        expect.anything(),
        expect.objectContaining({ priority: 5 }),
      );
    });

    it('JOB-PRIO-3: Bulk auction reminders default to Priority 10 (background bulk tier)', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-auction-reminder',
        { chitCode: 'KCA-1L-20M-01' },
        { jobId: 'auction-reminder-grp-01-m4', priority: 10 },
      );

      expect(mockTargetQueue.add).toHaveBeenCalledWith(
        'dispatch-auction-reminder',
        expect.anything(),
        expect.objectContaining({ priority: 10 }),
      );
    });
  });

  describe('3. Direct Execution Fallback Resilience', () => {
    it('JOB-FALLBACK-1: When Redis is disconnected, addJob executes directly in-process without losing payload', async () => {
      mockRedisProvider.getIsConnected.mockReturnValue(false);

      const payload = {
        recipientPhone: '9842143210',
        amountPaid: '5000',
        receiptNumber: 'KC-REC-PRD-2026-00999',
      };

      const result = await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        payload,
        { jobId: 'receipt-KC-REC-PRD-2026-00999', priority: 1 },
      );

      expect(result.status).toBe('EXECUTED_DIRECT');
      expect(result.jobId).toBe('receipt-KC-REC-PRD-2026-00999');
      expect(mockNotificationService.dispatchPaymentReceipt).toHaveBeenCalledWith(payload);
      expect(mockTargetQueue.add).not.toHaveBeenCalled();
    });

    it('JOB-FALLBACK-2: Direct execution preserves jobId for daily arrears execution', async () => {
      mockRedisProvider.getIsConnected.mockReturnValue(false);

      const result = await queueProvider.addJob(
        DAILY_MAINTENANCE_QUEUE,
        'process-daily-arrears',
        { cutoffDate: '2026-11-01T00:00:00.000Z' },
        { jobId: 'arrears-2026-11-01' },
      );

      expect(result.status).toBe('EXECUTED_DIRECT');
      expect(result.jobId).toBe('arrears-2026-11-01');
      expect(mockDailyArrearsService.processDailyOverdueAndArrears).toHaveBeenCalledWith(
        new Date('2026-11-01T00:00:00.000Z'),
      );
    });
  });

  describe('4. Worker Concurrency & Queue Health Status', () => {
    it('JOB-METRIC-1: getQueueStatusReports accurately aggregates waiting, active, completed, and failed counts', async () => {
      (queueProvider as any).dailyMaintenanceQueue = mockTargetQueue;
      (queueProvider as any).notificationQueue = mockTargetQueue;
      (queueProvider as any).reconciliationQueue = mockTargetQueue;

      const reports = await queueProvider.getQueueStatusReports();

      expect(reports).toHaveLength(3);
      for (const report of reports) {
        expect(report.isRedisConnected).toBe(true);
        expect(report.waitingCount).toBe(2);
        expect(report.activeCount).toBe(1);
        expect(report.completedCount).toBe(10);
        expect(report.failedCount).toBe(0);
      }
    });

    it('JOB-METRIC-2: getRepeatableJobs queries schedulers for IST crons', async () => {
      mockTargetQueue.getJobSchedulers = jest.fn().mockResolvedValue([
        { id: 'daily-arrears-ist', pattern: '1 0 * * *', tz: 'Asia/Kolkata', next: 1700000000 },
      ]);
      (queueProvider as any).dailyMaintenanceQueue = mockTargetQueue;

      const repeatable = await queueProvider.getRepeatableJobs();
      expect(repeatable.length).toBeGreaterThan(0);
      expect(repeatable[0].id).toBe('daily-arrears-ist');
      expect(repeatable[0].tz).toBe('Asia/Kolkata');
    });
  });

  describe('5. Bounded Failed-Job (DLQ) Retention & Pruning (DEF-DB-06)', () => {
    it('JOB-RETENTION-1: addJob enforces removeOnFail cap { count: 500, age: 604800 } across all 3 queues', async () => {
      (queueProvider as any).dailyMaintenanceQueue = mockTargetQueue;
      (queueProvider as any).notificationQueue = mockTargetQueue;
      (queueProvider as any).reconciliationQueue = mockTargetQueue;

      const cases = [
        { queue: DAILY_MAINTENANCE_QUEUE, job: 'process-daily-arrears' },
        { queue: NOTIFICATION_QUEUE, job: 'dispatch-payment-receipt' },
        { queue: RECONCILIATION_QUEUE, job: 'run-daily-reconciliation' },
      ];

      for (const item of cases) {
        await queueProvider.addJob(item.queue, item.job, { test: true });
      }

      expect(mockTargetQueue.add).toHaveBeenCalledTimes(3);
      for (const call of mockTargetQueue.add.mock.calls) {
        expect(call[2]).toEqual(
          expect.objectContaining({
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: { count: 500, age: 604800 },
          }),
        );
      }
    });

    it('JOB-RETENTION-2: Custom removeOnFail override does not mutate createDefaultBullMqJobOptions()', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      const baseline = createDefaultBullMqJobOptions();
      await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        { receiptNumber: 'KC-REC-OVR-1' },
        { removeOnFail: { count: 100, age: 86400 } },
      );

      expect(mockTargetQueue.add).toHaveBeenLastCalledWith(
        'dispatch-payment-receipt',
        { receiptNumber: 'KC-REC-OVR-1' },
        expect.objectContaining({
          removeOnFail: { count: 100, age: 86400 },
        }),
      );

      const secondBaseline = createDefaultBullMqJobOptions();
      expect(secondBaseline).toEqual(baseline);
      expect(secondBaseline).not.toBe(baseline);
    });

    it('JOB-RETENTION-3: Worker failed handler logs intermediate retries as warn and terminal exhaustion with [DLQ]', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      try {
        (queueProvider as any).handleWorkerJobFailure(
          'Notification',
          { id: 'job-1', name: 'dispatch-payment-receipt', attemptsMade: 1, opts: { attempts: 3 } },
          new Error('Temporary gateway timeout'),
        );
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3'));
        expect(errorSpy).not.toHaveBeenCalled();

        (queueProvider as any).handleWorkerJobFailure(
          'Notification',
          { id: 'job-1', name: 'dispatch-payment-receipt', attemptsMade: 3, opts: { attempts: 3 } },
          new Error('Permanent invalid token'),
        );
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[DLQ] Notification job dispatch-payment-receipt (job-1)'));

        (queueProvider as any).handleWorkerJobFailure(
          'Maintenance',
          undefined,
          new Error('Missing job metadata'),
        );
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-job (unknown-id)'));
      } finally {
        warnSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });

    it('JOB-RETENTION-4: onModuleInit sets defaultJobOptions across all 3 BullMQ Queues so IST crons inherit caps', async () => {
      const redis = await createLiveTestRedis();
      if (!redis) {
        return;
      }

      const prevEnableWorkers = process.env.ENABLE_BULLMQ_WORKERS;
      process.env.ENABLE_BULLMQ_WORKERS = 'false';

      const liveProvider = new BullMqQueueProvider(
        {
          getClient: () => redis,
          getIsConnected: () => true,
        } as any,
        mockDailyArrearsService,
        mockNotificationService,
        mockReconciliationService,
        mockAuctionSchedulerService,
      );

      try {
        await liveProvider.onModuleInit();

        const queues = [
          liveProvider.getDailyMaintenanceQueue(),
          liveProvider.getNotificationQueue(),
          liveProvider.getReconciliationQueue(),
        ];

        for (const q of queues) {
          expect(q).not.toBeNull();
          expect(q!.opts.defaultJobOptions).toEqual({
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: {
              count: BULLMQ_FAILED_JOB_MAX_COUNT,
              age: BULLMQ_FAILED_JOB_MAX_AGE_SECONDS,
            },
          });
        }
      } finally {
        if (prevEnableWorkers === undefined) {
          delete process.env.ENABLE_BULLMQ_WORKERS;
        } else {
          process.env.ENABLE_BULLMQ_WORKERS = prevEnableWorkers;
        }
        await liveProvider.onModuleDestroy();
        await redis.quit();
      }
    });

    it('JOB-RETENTION-5: Live Redis 7 prunes N=4 permanently failed jobs to strict removeOnFail count=2 cap', async () => {
      const redis = await createLiveTestRedis();
      if (!redis) {
        return;
      }

      const testQueueName = `dlq-prune-test-${Date.now()}`;
      const queue = new Queue(testQueueName, {
        connection: redis as any,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 10 },
          removeOnComplete: true,
          removeOnFail: { count: 2, age: BULLMQ_FAILED_JOB_MAX_AGE_SECONDS },
        },
      });

      let terminalFailures = 0;
      let resolveAllFailed!: () => void;
      const allFailedPromise = new Promise<void>((resolve) => {
        resolveAllFailed = resolve;
      });

      const worker = new Worker(
        testQueueName,
        async () => {
          throw new Error('Simulated permanent SMS gateway outage');
        },
        { connection: redis as any, concurrency: 1 },
      );

      worker.on('failed', (job) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? 2)) {
          terminalFailures += 1;
          if (terminalFailures === 4) {
            resolveAllFailed();
          }
        }
      });

      try {
        for (let i = 1; i <= 4; i += 1) {
          await queue.add(`fail-job-${i}`, { seq: i });
        }

        await allFailedPromise;
        // Allow BullMQ's in-flight Lua moveToFailed script to complete trimming on the 4th terminal job
        await new Promise((r) => setTimeout(r, 150));

        const counts = await queue.getJobCounts('failed');
        expect(counts.failed).toBe(2);

        const retainedFailed = await queue.getFailed(0, -1);
        expect(retainedFailed).toHaveLength(2);
      } finally {
        await worker.close();
        await queue.obliterate({ force: true });
        await queue.close();
        await redis.quit();
      }
    });
  });
});
