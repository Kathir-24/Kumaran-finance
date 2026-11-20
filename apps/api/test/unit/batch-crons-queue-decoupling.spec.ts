// ==============================================================================
// Kumaran Chits — Issue 8 (P1: JOB-02): Batch Crons BullMQ Decoupling Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Architecture: ADR-07, BullMQ Non-Blocking Async Notification Offloading
// Test Coverage:
//   1. DailyArrearsService enqueues JOB_DISPATCH_DEFAULT_WARNING to NOTIFICATION_QUEUE
//      with deterministic jobId and priority 2 when queueProvider is injected.
//   2. DailyArrearsService falls back to synchronous NotificationService when queueProvider is absent.
//   3. DailyArrearsService fallback through BullMqQueueProvider when Redis is disconnected.
//   4. DailyArrearsService queue error resilience (never aborts cron execution).
//   5. ReconciliationService enqueues JOB_DISPATCH_PAYMENT_RECEIPT to NOTIFICATION_QUEUE
//      with deterministic jobId and priority 1 when auto-resolving ghost drops.
//   6. ReconciliationService falls back to synchronous NotificationService when queueProvider is absent.
//   7. ReconciliationService fallback through BullMqQueueProvider when Redis is disconnected.
//   8. ReconciliationService queue error resilience (never reverts DB transaction).
//   9. ForwardRef circular injection compatibility across QueueProvider and Batch Crons.
// ==============================================================================

import { DueStatus, PaymentStatus } from '@prisma/client';
import {
  JOB_DISPATCH_DEFAULT_WARNING,
  JOB_DISPATCH_PAYMENT_RECEIPT,
  NOTIFICATION_QUEUE,
} from '../../src/jobs/constants/queue-names.constant';
import {
  DefaultWarningJobPayload,
  PaymentReceiptNotificationJobPayload,
} from '../../src/jobs/dto/job-payloads.dto';
import { BullMqQueueProvider } from '../../src/jobs/providers/bullmq-queue.provider';
import { RedisConnectionProvider } from '../../src/jobs/providers/redis-connection.provider';
import { DailyArrearsService } from '../../src/jobs/services/daily-arrears.service';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { ReconciliationService } from '../../src/jobs/services/reconciliation.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('JOB-02: Synchronous Notification Bypasses in Batch Crons (BullMQ Decoupling)', () => {
  let prismaMock: any;
  let notificationService: NotificationService;
  let mockQueueProvider: jest.Mocked<{ addJob: jest.Mock }>;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
      installmentDue: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      subscriberTicket: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      receipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    notificationService = new NotificationService(
      undefined,
      undefined,
      prismaMock as unknown as PrismaService,
    );
    jest.spyOn(notificationService, 'dispatchDefaultWarning').mockResolvedValue({
      notificationId: 'mock-warn-id',
      channel: 'SMS',
    } as any);
    jest.spyOn(notificationService, 'dispatchPaymentReceipt').mockResolvedValue({
      channel: 'PUSH',
    } as any);

    mockQueueProvider = {
      addJob: jest.fn().mockResolvedValue({ jobId: 'mock-job-id', status: 'ENQUEUED' }),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // SECTION 1: DailyArrearsService Decoupling
  // ============================================================================
  describe('1. DailyArrearsService BullMQ Decoupling', () => {
    const cutoffDate = new Date('2026-10-25T00:00:00Z');

    const sampleDefaultingTicket = {
      id: 'tkt-def-001',
      ticketNumber: 5,
      consecutiveUnpaidMonths: 2,
      status: 'ACTIVE',
      customer: {
        id: 'cust-001',
        fullName: 'K. Rajendran',
        phone: '9842155555',
        fcmToken: 'fcm-token-rajendran',
      },
      chitGroup: {
        id: 'grp-001',
        groupCode: 'KCA-2L-20M-01',
      },
      dues: [
        {
          id: 'due-1',
          installmentMonth: 3,
          status: DueStatus.OVERDUE,
          netPayableAmount: 10000n,
          paidAmount: 0n,
        },
        {
          id: 'due-2',
          installmentMonth: 2,
          status: DueStatus.OVERDUE,
          netPayableAmount: 10000n,
          paidAmount: 0n,
        },
        {
          id: 'due-3',
          installmentMonth: 1,
          status: DueStatus.OVERDUE,
          netPayableAmount: 10000n,
          paidAmount: 0n,
        },
      ],
    };

    it('should enqueue JOB_DISPATCH_DEFAULT_WARNING to BullMQ NOTIFICATION_QUEUE with deterministic jobId and priority 2', async () => {
      const arrearsService = new DailyArrearsService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      prismaMock.subscriberTicket.findMany.mockResolvedValue([sampleDefaultingTicket]);

      const result = await arrearsService.processDailyOverdueAndArrears(cutoffDate);

      // Verify ticket state updated in DB
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-def-001' },
        data: {
          consecutiveUnpaidMonths: 3,
          status: 'DEFAULT_3_MONTHS',
        },
      });

      // Verify BullMQ enqueue call
      expect(mockQueueProvider.addJob).toHaveBeenCalledTimes(1);
      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        NOTIFICATION_QUEUE,
        JOB_DISPATCH_DEFAULT_WARNING,
        expect.objectContaining<DefaultWarningJobPayload>({
          ticketId: 'tkt-def-001',
          customerName: 'K. Rajendran',
          customerPhone: '9842155555',
          chitCode: 'KCA-2L-20M-01',
          ticketNumber: 5,
          consecutiveUnpaidMonths: 3,
          totalOverdueAmount: '30000',
          fcmToken: 'fcm-token-rajendran',
        }),
        {
          jobId: 'default-warning-tkt-def-001-2026-10-25',
          priority: 2,
        },
      );

      // Verify synchronous dispatch was NOT called
      expect(notificationService.dispatchDefaultWarning).not.toHaveBeenCalled();

      // Verify result metrics
      expect(result.ticketsEvaluated).toBe(1);
      expect(result.ticketsInArrears).toBe(1);
      expect(result.ticketsInDefault3M).toBe(1);
    });

    it('should gracefully fall back to synchronous NotificationService when queueProvider is absent', async () => {
      const arrearsServiceNoQueue = new DailyArrearsService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        undefined, // queueProvider is absent
      );

      prismaMock.subscriberTicket.findMany.mockResolvedValue([sampleDefaultingTicket]);

      const result = await arrearsServiceNoQueue.processDailyOverdueAndArrears(cutoffDate);

      // Verify direct notification dispatch executed
      expect(notificationService.dispatchDefaultWarning).toHaveBeenCalledTimes(1);
      expect(notificationService.dispatchDefaultWarning).toHaveBeenCalledWith(
        expect.objectContaining<DefaultWarningJobPayload>({
          ticketId: 'tkt-def-001',
          customerName: 'K. Rajendran',
          customerPhone: '9842155555',
          chitCode: 'KCA-2L-20M-01',
          ticketNumber: 5,
          consecutiveUnpaidMonths: 3,
          totalOverdueAmount: '30000',
          fcmToken: 'fcm-token-rajendran',
        }),
      );

      expect(result.ticketsInDefault3M).toBe(1);
    });

    it('should fall back to direct notification execution via BullMqQueueProvider when Redis is disconnected', async () => {
      const redisProviderDisconnected = {
        getIsConnected: jest.fn().mockReturnValue(false),
        getClient: jest.fn().mockReturnValue(null),
      } as unknown as RedisConnectionProvider;

      // Construct live BullMqQueueProvider with disconnected Redis provider
      const liveQueueProvider = new BullMqQueueProvider(
        redisProviderDisconnected,
        {} as any,
        notificationService,
        {} as any,
      );

      const arrearsService = new DailyArrearsService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        liveQueueProvider,
      );

      prismaMock.subscriberTicket.findMany.mockResolvedValue([sampleDefaultingTicket]);

      await arrearsService.processDailyOverdueAndArrears(cutoffDate);

      // Live provider's fallback mode triggers dispatchDefaultWarning directly
      expect(notificationService.dispatchDefaultWarning).toHaveBeenCalledTimes(1);
      expect(notificationService.dispatchDefaultWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'tkt-def-001',
          consecutiveUnpaidMonths: 3,
        }),
      );
    });

    it('should catch queue errors, log warning, and complete remaining ticket processing without crashing', async () => {
      mockQueueProvider.addJob.mockRejectedValueOnce(
        new Error('BullMQ connection timed out during enqueue'),
      );

      const arrearsService = new DailyArrearsService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        sampleDefaultingTicket,
        {
          ...sampleDefaultingTicket,
          id: 'tkt-def-002',
          ticketNumber: 6,
          customer: { fullName: 'Second Customer', phone: '9842166666', fcmToken: null },
        },
      ]);

      // Execution must NOT throw even if queue throws
      let result: any;
      await expect(
        (async () => {
          result = await arrearsService.processDailyOverdueAndArrears(cutoffDate);
        })(),
      ).resolves.not.toThrow();

      // Both tickets were evaluated despite the first queue failure
      expect(result?.ticketsEvaluated).toBe(2);
      expect(result?.ticketsInDefault3M).toBe(2);
      expect(mockQueueProvider.addJob).toHaveBeenCalledTimes(2);
    });

    it('should NOT enqueue or dispatch warning when ticket was already in DEFAULT_3_MONTHS', async () => {
      const alreadyDefaultTicket = {
        ...sampleDefaultingTicket,
        status: 'DEFAULT_3_MONTHS', // was already in default
      };

      const arrearsService = new DailyArrearsService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      prismaMock.subscriberTicket.findMany.mockResolvedValue([alreadyDefaultTicket]);

      await arrearsService.processDailyOverdueAndArrears(cutoffDate);

      expect(mockQueueProvider.addJob).not.toHaveBeenCalled();
      expect(notificationService.dispatchDefaultWarning).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SECTION 2: ReconciliationService Decoupling
  // ============================================================================
  describe('2. ReconciliationService BullMQ Decoupling', () => {
    const mockSettlementTime = new Date('2026-10-29T10:00:00Z');

    const sampleGhostPayment = {
      id: 'pay-ghost-001',
      branchId: 'branch-prd-001',
      paymentStatus: PaymentStatus.INITIATED,
      paymentMethod: 'UPI',
      amount: 5000n,
      transactionRef: 'ORDER-GHOST-RECON-01',
      notes: null,
      allocations: [
        {
          id: 'alloc-001',
          installmentDueId: 'due-ghost-001',
          ticketId: 'tkt-ghost-001',
          amountAllocated: 5000n,
          due: {
            id: 'due-ghost-001',
            installmentMonth: 2,
            status: DueStatus.UNPAID,
          },
          ticket: {
            id: 'tkt-ghost-001',
            ticketNumber: 12,
            status: 'ACTIVE',
            customer: {
              id: 'cust-012',
              fullName: 'V. Murugan',
              phone: '9842177777',
              fcmToken: 'fcm-token-murugan',
            },
            chitGroup: {
              groupCode: 'KCA-1L-20M-01',
              branchId: 'branch-prd-001',
              branch: { code: 'PRD' },
            },
          },
        },
      ],
      receipt: null,
    };

    const setupGhostDropMocks = () => {
      prismaMock.payment.findFirst.mockResolvedValue(sampleGhostPayment);
      prismaMock.payment.findUnique.mockResolvedValue(sampleGhostPayment);
      prismaMock.payment.update.mockResolvedValue({
        ...sampleGhostPayment,
        paymentStatus: PaymentStatus.SUCCESS,
      });
      prismaMock.installmentDue.update.mockResolvedValue({
        id: 'due-ghost-001',
        status: DueStatus.PAID,
        paidAmount: 5000n,
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: 'tkt-ghost-001',
        consecutiveUnpaidMonths: 0,
      });
      prismaMock.receipt.findUnique.mockResolvedValue(null);
      prismaMock.receipt.findFirst.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00070',
      });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-001',
        receiptNumber: 'KC-REC-PRD-2026-00071',
      });
    };

    it('should enqueue JOB_DISPATCH_PAYMENT_RECEIPT to BullMQ NOTIFICATION_QUEUE with deterministic jobId and priority 1', async () => {
      setupGhostDropMocks();

      const reconciliationService = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-GHOST-RECON-01',
          gatewayPaymentId: 'pay_gateway_001',
          amount: 5000n,
          status: 'SUCCESS',
          settledAt: mockSettlementTime,
        },
      ]);

      expect(result.autoResolvedGhostDropsCount).toBe(1);
      expect(result.exceptionCount).toBe(0);

      // Verify BullMQ enqueue call
      expect(mockQueueProvider.addJob).toHaveBeenCalledTimes(1);
      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        NOTIFICATION_QUEUE,
        JOB_DISPATCH_PAYMENT_RECEIPT,
        expect.objectContaining<PaymentReceiptNotificationJobPayload>({
          paymentId: 'pay-ghost-001',
          receiptNumber: 'KC-REC-PRD-2026-00071',
          recipientPhone: '9842177777',
          subscriberName: 'V. Murugan',
          amountPaid: '5000',
          chitCode: 'KCA-1L-20M-01',
          ticketNumber: 12,
          paymentMode: 'UPI',
          transactionTimestamp: mockSettlementTime.toISOString(),
          receiptDownloadUrl: '',
          passbookAppUrl: 'https://app.kumaranfinance.in/passbook/tkt-ghost-001',
          fcmToken: 'fcm-token-murugan',
        }),
        {
          jobId: 'receipt-KC-REC-PRD-2026-00071',
          priority: 1,
        },
      );

      // Verify synchronous dispatch was NOT called
      expect(notificationService.dispatchPaymentReceipt).not.toHaveBeenCalled();
    });

    it('should gracefully fall back to synchronous NotificationService when queueProvider is absent', async () => {
      setupGhostDropMocks();

      const reconciliationServiceNoQueue = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        undefined, // queueProvider absent
      );

      const result = await reconciliationServiceNoQueue.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-GHOST-RECON-01',
          gatewayPaymentId: 'pay_gateway_001',
          amount: 5000n,
          status: 'SUCCESS',
          settledAt: mockSettlementTime,
        },
      ]);

      expect(result.autoResolvedGhostDropsCount).toBe(1);
      expect(notificationService.dispatchPaymentReceipt).toHaveBeenCalledTimes(1);
      expect(notificationService.dispatchPaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining<Partial<PaymentReceiptNotificationJobPayload>>({
          paymentId: 'pay-ghost-001',
          receiptNumber: 'KC-REC-PRD-2026-00071',
          recipientPhone: '9842177777',
          subscriberName: 'V. Murugan',
          amountPaid: '5000',
          chitCode: 'KCA-1L-20M-01',
          ticketNumber: 12,
          paymentMode: 'UPI',
        }),
      );
    });

    it('should fall back to direct receipt execution via BullMqQueueProvider when Redis is disconnected', async () => {
      setupGhostDropMocks();

      const redisProviderDisconnected = {
        getIsConnected: jest.fn().mockReturnValue(false),
        getClient: jest.fn().mockReturnValue(null),
      } as unknown as RedisConnectionProvider;

      const liveQueueProvider = new BullMqQueueProvider(
        redisProviderDisconnected,
        {} as any,
        notificationService,
        {} as any,
      );

      const reconciliationService = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        liveQueueProvider,
      );

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-GHOST-RECON-01',
          gatewayPaymentId: 'pay_gateway_001',
          amount: 5000n,
          status: 'SUCCESS',
          settledAt: mockSettlementTime,
        },
      ]);

      expect(result.autoResolvedGhostDropsCount).toBe(1);
      expect(notificationService.dispatchPaymentReceipt).toHaveBeenCalledTimes(1);
      expect(notificationService.dispatchPaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay-ghost-001',
          receiptNumber: 'KC-REC-PRD-2026-00071',
        }),
      );
    });

    it('should catch queue errors, log warning, and preserve successful DB resolution without throwing', async () => {
      setupGhostDropMocks();

      mockQueueProvider.addJob.mockRejectedValueOnce(
        new Error('BullMQ Redis buffer overflow during enqueue'),
      );

      const reconciliationService = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      let result: any;
      await expect(
        (async () => {
          result = await reconciliationService.reconcileSettlement([
            {
              gatewayOrderId: 'ORDER-GHOST-RECON-01',
              gatewayPaymentId: 'pay_gateway_001',
              amount: 5000n,
              status: 'SUCCESS',
              settledAt: mockSettlementTime,
            },
          ]);
        })(),
      ).resolves.not.toThrow();

      // Ghost drop was successfully auto-resolved in DB despite queue failure
      expect(result?.autoResolvedGhostDropsCount).toBe(1);
      expect(result?.exceptionCount).toBe(0);
      expect(prismaMock.payment.update).toHaveBeenCalled();
    });

    it('should catch synchronous notification error during fallback mode without crashing reconciliation', async () => {
      setupGhostDropMocks();

      jest.spyOn(notificationService, 'dispatchPaymentReceipt').mockRejectedValueOnce(
        new Error('SMS Gateway connection reset'),
      );

      const reconciliationServiceNoQueue = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        undefined,
      );

      let result: any;
      await expect(
        (async () => {
          result = await reconciliationServiceNoQueue.reconcileSettlement([
            {
              gatewayOrderId: 'ORDER-GHOST-RECON-01',
              gatewayPaymentId: 'pay_gateway_001',
              amount: 5000n,
              status: 'SUCCESS',
              settledAt: mockSettlementTime,
            },
          ]);
        })(),
      ).resolves.not.toThrow();

      expect(result?.autoResolvedGhostDropsCount).toBe(1);
    });

    it('should NOT enqueue or dispatch receipt notification when settlement already matches or is mismatched', async () => {
      // Scenario: Payment is already SUCCESS
      prismaMock.payment.findFirst.mockResolvedValueOnce({
        id: 'pay-matched',
        paymentStatus: PaymentStatus.SUCCESS,
        amount: 5000n,
        transactionRef: 'ORDER-MATCHED',
      });

      const reconciliationService = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-MATCHED',
          gatewayPaymentId: 'pay_matched_001',
          amount: 5000n,
          status: 'SUCCESS',
          settledAt: mockSettlementTime,
        },
      ]);

      expect(result.matchedCount).toBe(1);
      expect(result.autoResolvedGhostDropsCount).toBe(0);
      expect(mockQueueProvider.addJob).not.toHaveBeenCalled();
      expect(notificationService.dispatchPaymentReceipt).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SECTION 3: ForwardRef Circular Injection & Architecture Invariants
  // ============================================================================
  describe('3. ForwardRef Circular Injection & Architecture Invariants', () => {
    it('should allow bidirectional construction between BullMqQueueProvider, DailyArrearsService, and ReconciliationService without circular reference failure', () => {
      const redisProvider = {
        getIsConnected: jest.fn().mockReturnValue(false),
        getClient: jest.fn().mockReturnValue(null),
      } as unknown as RedisConnectionProvider;

      // 1. Construct cron services with optional queueProvider
      let queueProviderInstance: BullMqQueueProvider;

      const arrearsService = new DailyArrearsService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        // Lazy getter / closure simulating NestJS forwardRef resolution
        new Proxy({} as BullMqQueueProvider, {
          get: (_target, prop) => (queueProviderInstance as any)?.[prop],
        }),
      );

      const reconciliationService = new ReconciliationService(
        prismaMock as unknown as PrismaService,
        notificationService,
        undefined,
        new Proxy({} as BullMqQueueProvider, {
          get: (_target, prop) => (queueProviderInstance as any)?.[prop],
        }),
      );

      // 2. Construct BullMqQueueProvider injecting the cron services
      queueProviderInstance = new BullMqQueueProvider(
        redisProvider,
        arrearsService,
        notificationService,
        reconciliationService,
      );

      expect(queueProviderInstance).toBeDefined();
      expect(arrearsService).toBeDefined();
      expect(reconciliationService).toBeDefined();
    });
  });
});
