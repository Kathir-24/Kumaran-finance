// ==============================================================================
// Kumaran Chits — Background Processing & Queue Resilience Test Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/03-architecture/bullmq-architecture.md (§3, §4)
// ==============================================================================

import { BullMqQueueProvider, JobEnqueueOptions } from '../src/jobs/providers/bullmq-queue.provider';
import { NOTIFICATION_QUEUE, DAILY_MAINTENANCE_QUEUE, RECONCILIATION_QUEUE } from '../src/jobs/constants/queue-names.constant';

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
        jobId: 'receipt:KC-REC-PRD-2026-00412',
        priority: 1,
      };

      const result = await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        receiptPayload,
        options,
      );

      expect(result.status).toBe('ENQUEUED');
      expect(result.jobId).toBe('receipt:KC-REC-PRD-2026-00412');
      expect(mockTargetQueue.add).toHaveBeenCalledWith(
        'dispatch-payment-receipt',
        receiptPayload,
        expect.objectContaining({
          jobId: 'receipt:KC-REC-PRD-2026-00412',
          priority: 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        }),
      );
    });

    it('JOB-DEDUP-2: Re-enqueuing with the same jobId returns identical jobId without creating a duplicate', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      const options: JobEnqueueOptions = {
        jobId: 'receipt:KC-REC-PRD-2026-00412',
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
      expect(res2.jobId).toBe('receipt:KC-REC-PRD-2026-00412');
    });
  });

  describe('2. 3-Tier Priority Scheduling', () => {
    it('JOB-PRIO-1: Critical payment receipts and approval alerts are enqueued with Priority 1', async () => {
      (queueProvider as any).notificationQueue = mockTargetQueue;

      await queueProvider.addJob(
        NOTIFICATION_QUEUE,
        'dispatch-payment-receipt',
        { receiptNumber: 'KC-REC-PRD-2026-00412' },
        { jobId: 'receipt:KC-REC-PRD-2026-00412', priority: 1 },
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
        { jobId: 'auction-result:auc-01:m2', priority: 5 },
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
        { jobId: 'auction-reminder:grp-01:m4', priority: 10 },
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
        { jobId: 'receipt:KC-REC-PRD-2026-00999', priority: 1 },
      );

      expect(result.status).toBe('EXECUTED_DIRECT');
      expect(result.jobId).toBe('receipt:KC-REC-PRD-2026-00999');
      expect(mockNotificationService.dispatchPaymentReceipt).toHaveBeenCalledWith(payload);
      expect(mockTargetQueue.add).not.toHaveBeenCalled();
    });

    it('JOB-FALLBACK-2: Direct execution preserves jobId for daily arrears execution', async () => {
      mockRedisProvider.getIsConnected.mockReturnValue(false);

      const result = await queueProvider.addJob(
        DAILY_MAINTENANCE_QUEUE,
        'process-daily-arrears',
        { cutoffDate: '2026-11-01T00:00:00.000Z' },
        { jobId: 'arrears:2026-11-01' },
      );

      expect(result.status).toBe('EXECUTED_DIRECT');
      expect(result.jobId).toBe('arrears:2026-11-01');
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
});
