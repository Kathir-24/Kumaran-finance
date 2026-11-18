import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DueStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { CollectionService, getIstDayRange } from '../../src/collection/collection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { BullMqQueueProvider } from '../../src/jobs/providers/bullmq-queue.provider';

describe('Module 6: Field Collections & Dual-Control Cash Handover Tests', () => {
  let collectionService: CollectionService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockTicketId = 'ticket-uuid-001';
  const mockCollectorId = 'collector-agent-uuid-001';
  const mockPartnerId = 'partner-checker-uuid-002';
  const mockPaymentId1 = 'payment-uuid-001';
  const mockPaymentId2 = 'payment-uuid-002';

  const mockTicket = {
    id: mockTicketId,
    ticketNumber: 3,
    status: 'ACTIVE',
    customerId: 'cust-uuid-001',
    customer: {
      id: 'cust-uuid-001',
      customerCode: 'KC-CUST-00003',
      fullName: 'Ramasamy K',
      fullNameTamil: 'ராமசாமி',
      phone: '9842100003',
    },
    chitGroup: {
      id: 'chit-group-uuid-001',
      groupCode: 'KCA-1L-20M-01',
      status: 'ACTIVE',
      branchId: mockBranchId,
      branch: { code: 'PRD' },
    },
  };

  const mockDue = {
    id: 'due-uuid-001',
    ticketId: mockTicketId,
    installmentMonth: 4,
    grossAmount: 5000n,
    dividendDeduction: 1050n,
    netPayableAmount: 3950n, // Exact payable amount
    paidAmount: 0n,
    status: DueStatus.UNPAID,
    dueDate: new Date('2026-10-10T00:00:00.000Z'),
  };

  beforeEach(() => {
    prismaMock = {
      payment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      paymentAllocation: {
        create: jest.fn(),
      },
      receipt: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      installmentDue: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    collectionService = new CollectionService(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('1. Exact Inet Single Discrete Payment Invariant (ADR-07)', () => {
    it('should record exact net installment collection and issue sequential bilingual receipt', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00044' } as any);

      const createdPayment = {
        id: mockPaymentId1,
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date('2026-10-18T10:30:00.000Z'),
      };
      prismaMock.payment.create.mockResolvedValue(createdPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-01' });
      prismaMock.receipt.create.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00045',
      });
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.count.mockResolvedValue(0); // Arrears resolved
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      const result = await collectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3950, // Exactly matches due.netPayableAmount
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: 'offline-uuid-001',
        },
        mockCollectorId,
        mockBranchId,
      );

      expect(result.netPaidAmount).toBe(3950n);
      expect(result.receiptNumber).toBe('KC-REC-PRD-2026-00045');
      expect(result.cashHandoverStatus).toBe('PENDING_HANDOVER');
      expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDue.id },
          data: expect.objectContaining({
            paidAmount: 3950n,
            status: DueStatus.PAID,
          }),
        }),
      );
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consecutiveUnpaidMonths: 0,
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should strictly reject partial payment attempt (ADR-07 invariant)', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue); // due is ₹3,950

      // Attempt to pay partial amount ₹2,000 must be rejected
      await expect(
        collectionService.recordCollection(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 2000,
            paymentMethod: PaymentMethod.CASH,
          },
          mockCollectorId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should strictly reject overpayment / advance attempt (ADR-07 invariant)', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue); // due is ₹3,950

      // Attempt to pay advance amount ₹5,000 must be rejected
      await expect(
        collectionService.recordCollection(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 5000,
            paymentMethod: PaymentMethod.CASH,
          },
          mockCollectorId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate payment attempt if installment is already paid', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue({
        ...mockDue,
        status: DueStatus.PAID, // Already paid!
      });

      await expect(
        collectionService.recordCollection(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3950,
            paymentMethod: PaymentMethod.CASH,
          },
          mockCollectorId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject out-of-order collection with 400 PRIOR_INSTALLMENT_UNPAID when prior month is unpaid', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.installmentDue.findFirst.mockResolvedValue({
        id: 'due-003',
        ticketId: mockTicketId,
        installmentMonth: 3,
        status: DueStatus.UNPAID,
      });

      await expect(
        collectionService.recordCollection(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3950,
            paymentMethod: PaymentMethod.CASH,
          },
          mockCollectorId,
          mockBranchId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'PRIOR_INSTALLMENT_UNPAID: Month 3 installment must be settled before paying Month 4.',
        ),
      );
    });

    it('should safely deduplicate offline sync requests with identical idempotencyKey', async () => {
      const existingPayment = {
        id: 'existing-payment-uuid',
        amount: 3950n,
        idempotencyKey: 'duplicate-key-123',
        recordedByUserId: mockCollectorId,
        allocations: [],
        receipt: { receiptNumber: 'KC-REC-PRD-2026-00010' },
      };
      prismaMock.payment.findUnique.mockResolvedValue(existingPayment);

      const result = await collectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3950,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: 'duplicate-key-123',
        },
        mockCollectorId,
        mockBranchId,
      );

      expect(result.duplicateIgnored).toBe(true);
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('2. Evening Cash Handover Batch Submission', () => {
    it('should aggregate pending cash collections for evening handover batch', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: mockPaymentId1,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          createdAt: new Date('2026-10-18T10:00:00.000Z'),
          allocations: [
            {
              ticket: { ticketNumber: 1, customer: { customerCode: 'C1', fullName: 'Member 1' } },
              due: { installmentMonth: 4 },
            },
          ],
          receipt: { receiptNumber: 'KC-REC-001' },
        },
        {
          id: mockPaymentId2,
          amount: 4000n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          createdAt: new Date('2026-10-18T11:00:00.000Z'),
          allocations: [
            {
              ticket: { ticketNumber: 2, customer: { customerCode: 'C2', fullName: 'Member 2' } },
              due: { installmentMonth: 4 },
            },
          ],
          receipt: { receiptNumber: 'KC-REC-002' },
        },
      ]);

      const handover = await collectionService.submitHandover(mockCollectorId);

      expect(handover.collectorUserId).toBe(mockCollectorId);
      expect(handover.paymentsCount).toBe(2);
      expect(handover.totalPendingAmount).toBe(7950n); // 3950 + 4000
      expect(handover.paymentIds).toEqual([mockPaymentId1, mockPaymentId2]);
    });
  });

  describe('3. Dual-Control Cash Handover Separation of Duties (collector != acknowledger)', () => {
    it('should strictly reject cash handover acknowledgment if collector == acknowledger', async () => {
      // The same agent attempts to sign off their own collected cash!
      await expect(
        collectionService.acknowledgeHandover(
          {
            collectorUserId: mockCollectorId,
            acknowledgedAmount: 7950,
            paymentIds: [mockPaymentId1, mockPaymentId2],
          },
          mockCollectorId, // Same user!
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject acknowledgment if counted amount does not match sum of payments', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: mockPaymentId1,
          recordedByUserId: mockCollectorId,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
        },
        {
          id: mockPaymentId2,
          recordedByUserId: mockCollectorId,
          amount: 4000n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
        },
      ]);

      // Physical cash counted is ₹7,000 but batch sum is ₹7,950 -> Discrepancy!
      await expect(
        collectionService.acknowledgeHandover(
          {
            collectorUserId: mockCollectorId,
            acknowledgedAmount: 7000,
            paymentIds: [mockPaymentId1, mockPaymentId2],
          },
          mockPartnerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully acknowledge cash handover when collector != acknowledger and amounts match', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: mockPaymentId1,
          recordedByUserId: mockCollectorId,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
        },
        {
          id: mockPaymentId2,
          recordedByUserId: mockCollectorId,
          amount: 4000n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
        },
      ]);
      prismaMock.payment.updateMany.mockResolvedValue({ count: 2 });

      const result = await collectionService.acknowledgeHandover(
        {
          collectorUserId: mockCollectorId,
          acknowledgedAmount: 7950,
          paymentIds: [mockPaymentId1, mockPaymentId2],
          notes: 'Counted: ₹500 x 15 = ₹7500, ₹200 x 2 = ₹400, ₹50 x 1 = ₹50. Total: ₹7950.',
        },
        mockPartnerId, // Partner acknowledges (mockPartnerId != mockCollectorId)
      );

      expect(result.success).toBe(true);
      expect(result.acknowledgedAmount).toBe(7950n);
      expect(result.collectorUserId).toBe(mockCollectorId);
      expect(result.acknowledgedByUserId).toBe(mockPartnerId);
      expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [mockPaymentId1, mockPaymentId2] } },
          data: expect.objectContaining({
            cashHandoverStatus: 'ACKNOWLEDGED',
            cashHandoverAcknowledgedByUserId: mockPartnerId,
          }),
        }),
      );
    });
  });

  describe('4. Daily Collection Summary & Agent Scoping', () => {
    it('should aggregate today collections and separate pending handover from vault deposits', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: mockPaymentId1,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          createdAt: new Date(),
          receipt: { receiptNumber: 'KC-REC-001' },
          recordedByUser: { name: 'Agent 1' },
          allocations: [
            {
              ticket: {
                ticketNumber: 1,
                customer: { customerCode: 'C1', fullName: 'Customer 1' },
                chitGroup: { groupCode: 'GRP1' },
              },
              due: { installmentMonth: 3 },
            },
          ],
        },
        {
          id: mockPaymentId2,
          amount: 5000n,
          paymentMethod: PaymentMethod.UPI,
          cashHandoverStatus: 'ACKNOWLEDGED',
          createdAt: new Date(),
          receipt: { receiptNumber: 'KC-REC-002' },
          recordedByUser: { name: 'Agent 1' },
          allocations: [
            {
              ticket: {
                ticketNumber: 2,
                customer: { customerCode: 'C2', fullName: 'Customer 2' },
                chitGroup: { groupCode: 'GRP1' },
              },
              due: { installmentMonth: 3 },
            },
          ],
        },
      ]);

      const summary = await collectionService.getDailySummary();

      expect(summary.totalPaymentsCount).toBe(2);
      expect(summary.totals.totalCollected).toBe(8950n);
      expect(summary.totals.cashCollected).toBe(3950n);
      expect(summary.totals.cashPendingHandover).toBe(3950n);
      expect(summary.totals.digitalCollected).toBe(5000n);
    });

    it('should restrict collection agents to their own collections in daily summary', async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);

      await collectionService.getDailySummary(
        {},
        mockCollectorId,
        Role.COLLECTION_AGENT,
      );

      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recordedByUserId: mockCollectorId,
          }),
        }),
      );
    });
  });

  describe('5. Offline Queue Batch Synchronization (POST /collections/sync-offline-queue)', () => {
    it('should successfully sync batch of offline collections and return receipts', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00010' } as any);

      const createdPayment = {
        id: 'pmt-sync-01',
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date('2026-10-21T09:30:00.000Z'),
      };
      prismaMock.payment.create.mockResolvedValue(createdPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-sync-01' });
      prismaMock.receipt.create.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00011',
      });
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.count.mockResolvedValue(0);
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      const syncDto = {
        items: [
          {
            idempotencyKey: 'idemp-sync-001',
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3950,
            paymentMethod: PaymentMethod.CASH,
            collectedAt: '2026-10-21T09:30:00.000Z',
          },
        ],
      };

      const result = await collectionService.syncOfflineQueue(
        syncDto,
        mockCollectorId,
        mockBranchId,
      );

      expect(result.totalSubmitted).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.synced[0].idempotencyKey).toBe('idemp-sync-001');
      expect(result.synced[0].receiptNumber).toBe('KC-REC-PRD-2026-00011');
      expect(result.synced[0].isDuplicate).toBe(false);
      expect(result.failed).toHaveLength(0);
    });

    it('should handle idempotent re-submission cleanly by returning existing receipt (isDuplicate = true)', async () => {
      const existingPayment = {
        id: 'existing-pmt-001',
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        recordedByUserId: mockCollectorId,
        createdAt: new Date('2026-10-21T09:00:00.000Z'),
        receipt: { receiptNumber: 'KC-REC-PRD-2026-00005' },
      };
      prismaMock.payment.findUnique.mockResolvedValue(existingPayment);

      const syncDto = {
        items: [
          {
            idempotencyKey: 'existing-idemp-key',
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3950,
            paymentMethod: PaymentMethod.CASH,
            collectedAt: '2026-10-21T09:00:00.000Z',
          },
        ],
      };

      const result = await collectionService.syncOfflineQueue(
        syncDto,
        mockCollectorId,
        mockBranchId,
      );

      expect(result.totalSubmitted).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.synced[0].idempotencyKey).toBe('existing-idemp-key');
      expect(result.synced[0].paymentId).toBe('existing-pmt-001');
      expect(result.synced[0].receiptNumber).toBe('KC-REC-PRD-2026-00005');
      expect(result.synced[0].isDuplicate).toBe(true);
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('should provide partial success isolation when one item succeeds and others fail', async () => {
      // Item 1: Valid payment
      // Item 2: Fails because due is already paid
      // Item 3: Fails because amount does not match exact Inet
      const alreadyPaidDue = {
        ...mockDue,
        id: 'due-paid-002',
        status: DueStatus.PAID,
      };

      // Mock sequential calls
      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique
        .mockResolvedValueOnce(mockDue) // Item 1: Valid
        .mockResolvedValueOnce(alreadyPaidDue) // Item 2: Already Paid
        .mockResolvedValueOnce(mockDue); // Item 3: Partial mismatch
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00050' } as any);
      prismaMock.payment.create.mockResolvedValue({
        id: 'pmt-item-1',
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        createdAt: new Date(),
      });
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-1' });
      prismaMock.receipt.create.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00051',
      });
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.count.mockResolvedValue(0);
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      const syncDto = {
        items: [
          {
            idempotencyKey: 'item-1-ok',
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3950,
            paymentMethod: PaymentMethod.CASH,
            collectedAt: '2026-10-21T10:00:00.000Z',
          },
          {
            idempotencyKey: 'item-2-already-paid',
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3950,
            paymentMethod: PaymentMethod.CASH,
            collectedAt: '2026-10-21T10:05:00.000Z',
          },
          {
            idempotencyKey: 'item-3-partial-fail',
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 2000, // Invalid partial amount
            paymentMethod: PaymentMethod.CASH,
            collectedAt: '2026-10-21T10:10:00.000Z',
          },
        ],
      };

      const result = await collectionService.syncOfflineQueue(
        syncDto,
        mockCollectorId,
        mockBranchId,
      );

      expect(result.totalSubmitted).toBe(3);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(2);

      // Item 1 succeeded
      expect(result.synced[0].idempotencyKey).toBe('item-1-ok');
      expect(result.synced[0].receiptNumber).toBe('KC-REC-PRD-2026-00051');

      // Item 2 failed with INSTALLMENT_ALREADY_PAID
      expect(result.failed[0].idempotencyKey).toBe('item-2-already-paid');
      expect(result.failed[0].errorCode).toBe('INSTALLMENT_ALREADY_PAID');

      // Item 3 failed with PARTIAL_PAYMENTS_NOT_ALLOWED
      expect(result.failed[1].idempotencyKey).toBe('item-3-partial-fail');
      expect(result.failed[1].errorCode).toBe('PARTIAL_PAYMENTS_NOT_ALLOWED');
    });
  });

  describe('6. BullMQ Notification Queue Hookup', () => {
    it('should enqueue collection receipt job to notification-queue upon successful doorstep collection', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'job-coll-123', status: 'ENQUEUED' }),
      };

      const queuedCollectionService = new CollectionService(
        prismaMock as unknown as PrismaService,
        mockQueueProvider as any,
      );

      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00010' } as any);

      const createdPayment = {
        id: 'pmt-coll-01',
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date('2026-10-21T09:30:00.000Z'),
      };
      prismaMock.payment.create.mockResolvedValue(createdPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-coll-01' });
      prismaMock.receipt.create.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00011',
      });
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.count.mockResolvedValue(0);
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      const result = await queuedCollectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3950,
          paymentMethod: PaymentMethod.CASH,
        },
        mockCollectorId,
        mockBranchId,
      );

      expect(result.receiptNumber).toBe('KC-REC-PRD-2026-00011');
      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        'notification-queue',
        'dispatch-payment-receipt',
        expect.objectContaining({
          recipientPhone: mockTicket.customer.phone,
          receiptNumber: 'KC-REC-PRD-2026-00011',
          amountPaid: '3950',
          ticketNumber: mockTicket.ticketNumber,
        }),
        expect.objectContaining({
          jobId: 'receipt-KC-REC-PRD-2026-00011',
          priority: 1,
        }),
      );
    });

    it('should not fail doorstep collection if queueProvider.addJob throws an error (fire-and-forget resilience)', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockRejectedValue(new Error('Queue timeout')),
      };

      const queuedCollectionService = new CollectionService(
        prismaMock as unknown as PrismaService,
        mockQueueProvider as any,
      );

      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00010' } as any);

      const createdPayment = {
        id: 'pmt-coll-01',
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date('2026-10-21T09:30:00.000Z'),
      };
      prismaMock.payment.create.mockResolvedValue(createdPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-coll-01' });
      prismaMock.receipt.create.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00011',
      });
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.count.mockResolvedValue(0);
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      const result = await queuedCollectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3950,
          paymentMethod: PaymentMethod.CASH,
        },
        mockCollectorId,
        mockBranchId,
      );

      expect(result.receiptNumber).toBe('KC-REC-PRD-2026-00011');
      expect(result.paymentId).toBe('pmt-coll-01');
    });
  });

  describe('KC-07: IST Calendar Date Range & Midnight Boundary Verification', () => {
    it('should calculate exact UTC bounds for a date-only string (YYYY-MM-DD)', () => {
      const { start, end } = getIstDayRange('2026-11-15');
      expect(start.toISOString()).toBe('2026-11-14T18:30:00.000Z');
      expect(end.toISOString()).toBe('2026-11-15T18:29:59.999Z');
    });

    it('should correctly extract IST calendar day from UTC late-night timestamps crossing midnight', () => {
      // 19:00:00 UTC on Nov 14 is 00:30:00 IST on Nov 15
      const { start, end } = getIstDayRange('2026-11-14T19:00:00.000Z');
      expect(start.toISOString()).toBe('2026-11-14T18:30:00.000Z');
      expect(end.toISOString()).toBe('2026-11-15T18:29:59.999Z');
    });

    it('should correctly handle offset-aware timestamp strings (+05:30)', () => {
      const { start, end } = getIstDayRange('2026-11-15T00:15:00+05:30');
      expect(start.toISOString()).toBe('2026-11-14T18:30:00.000Z');
      expect(end.toISOString()).toBe('2026-11-15T18:29:59.999Z');
    });

    it('should assign exact IST midnight boundary (18:30:00.000Z) to the new IST calendar day', () => {
      const { start, end } = getIstDayRange('2026-11-14T18:30:00.000Z');
      expect(start.toISOString()).toBe('2026-11-14T18:30:00.000Z');
      expect(end.toISOString()).toBe('2026-11-15T18:29:59.999Z');
    });

    it('should assign 1ms before IST midnight (18:29:59.999Z) to the preceding IST calendar day', () => {
      const { start, end } = getIstDayRange('2026-11-14T18:29:59.999Z');
      expect(start.toISOString()).toBe('2026-11-13T18:30:00.000Z');
      expect(end.toISOString()).toBe('2026-11-14T18:29:59.999Z');
    });

    it('should accept Date objects and format in Asia/Kolkata timezone', () => {
      const dateObj = new Date('2026-11-15T04:30:00.000Z'); // 10:00 AM IST
      const { start, end } = getIstDayRange(dateObj);
      expect(start.toISOString()).toBe('2026-11-14T18:30:00.000Z');
      expect(end.toISOString()).toBe('2026-11-15T18:29:59.999Z');
    });

    it('should throw BadRequestException when given an invalid date string', () => {
      expect(() => getIstDayRange('not-a-valid-date')).toThrow(BadRequestException);
    });
  });

  describe('Module 5 Forensic Hardening (DEF-10, DEF-11, DEF-12)', () => {
    it('DEF-10: should restore ticket from DEFAULT_3_MONTHS to ACTIVE when field collection drops consecutive arrears from 3 to 2', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        ...mockTicket,
        status: 'DEFAULT_3_MONTHS',
        consecutiveUnpaidMonths: 3,
      });
      prismaMock.installmentDue.findUnique.mockResolvedValue({
        ...mockDue,
        id: 'due-m2',
        installmentMonth: 2,
      });
      prismaMock.installmentDue.findFirst.mockResolvedValue(null);
      prismaMock.payment.create.mockResolvedValue({
        id: 'pmt-def10',
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date(),
      });
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-def10' });
      prismaMock.receipt.create.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00099' });
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.findMany.mockResolvedValue([
        { id: 'due-m4', installmentMonth: 4, status: DueStatus.OVERDUE },
        { id: 'due-m3', installmentMonth: 3, status: DueStatus.OVERDUE },
        { id: 'due-m2', installmentMonth: 2, status: DueStatus.OVERDUE },
        { id: 'due-m1', installmentMonth: 1, status: DueStatus.PAID },
      ]);
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      await collectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 2,
          amount: 3950,
          paymentMethod: PaymentMethod.CASH,
        },
        mockCollectorId,
        mockBranchId,
      );

      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTicketId },
          data: {
            consecutiveUnpaidMonths: 2,
            status: 'ACTIVE',
          },
        }),
      );
    });

    it('DEF-11: should reject cash handover acknowledgment when a payment in the batch is REVERSED', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pmt-reversed',
          recordedByUserId: mockCollectorId,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.REVERSED,
          cashHandoverStatus: 'PENDING_HANDOVER',
          amount: 3950n,
        },
      ]);

      await expect(
        collectionService.acknowledgeHandover(
          {
            collectorUserId: mockCollectorId,
            paymentIds: ['pmt-reversed'],
            acknowledgedAmount: 3950,
          },
          mockPartnerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('DEF-12: should sort multi-month offline sync items chronologically per ticket and map PRIOR_INSTALLMENT_UNPAID cleanly', async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);
      const recordSpy = jest
        .spyOn(collectionService, 'recordCollection')
        .mockResolvedValueOnce({
          paymentId: 'pmt-m2',
          receiptNumber: 'KC-REC-PRD-2026-00101',
          amount: 3950n,
          collectedAt: new Date(),
        } as any)
        .mockRejectedValueOnce(
          new BadRequestException(
            'PRIOR_INSTALLMENT_UNPAID: Month 3 installment must be settled before paying Month 4.',
          ),
        );

      const res = await collectionService.syncOfflineQueue(
        {
          items: [
            {
              ticketId: mockTicketId,
              installmentMonth: 4,
              amount: 3950,
              paymentMethod: PaymentMethod.CASH,
              idempotencyKey: 'off-key-m4',
              collectedAt: '2026-11-17T10:15:00.000Z',
            },
            {
              ticketId: mockTicketId,
              installmentMonth: 2,
              amount: 3950,
              paymentMethod: PaymentMethod.CASH,
              idempotencyKey: 'off-key-m2',
              collectedAt: '2026-11-17T10:10:00.000Z',
            },
          ],
        },
        mockCollectorId,
        mockBranchId,
      );

      // Month 2 was processed BEFORE Month 4 due to chronological sorting per ticket
      expect(recordSpy.mock.calls[0][0].installmentMonth).toBe(2);
      expect(recordSpy.mock.calls[1][0].installmentMonth).toBe(4);
      expect(res.successCount).toBe(1);
      expect(res.failureCount).toBe(1);
      expect(res.failed[0].errorCode).toBe('PRIOR_INSTALLMENT_UNPAID');
      recordSpy.mockRestore();
    });
  });

  describe('Module 8 Forensic Hardening Regression Tests (DEF-M8-REV-02..07 & XR-M8-PAY-01)', () => {
    it('DEF-M8-REV-02: sorts multi-ticket interleaved offline sync items strictly chronologically per ticket', async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);
      const recordSpy = jest
        .spyOn(collectionService, 'recordCollection')
        .mockResolvedValue({
          paymentId: 'pmt-ok',
          receiptNumber: 'KC-REC-PRD-2026-00999',
          amount: 3950n,
          collectedAt: new Date(),
        } as any);

      const items = [
        { ticketId: 'ticket-A', installmentMonth: 3, amount: 3950, paymentMethod: PaymentMethod.CASH, idempotencyKey: 'k-A3', collectedAt: '2026-11-18T10:00:00.000Z' },
        { ticketId: 'ticket-B', installmentMonth: 1, amount: 3950, paymentMethod: PaymentMethod.CASH, idempotencyKey: 'k-B1', collectedAt: '2026-11-18T10:05:00.000Z' },
        { ticketId: 'ticket-A', installmentMonth: 2, amount: 3950, paymentMethod: PaymentMethod.CASH, idempotencyKey: 'k-A2', collectedAt: '2026-11-18T10:10:00.000Z' },
        { ticketId: 'ticket-C', installmentMonth: 5, amount: 3950, paymentMethod: PaymentMethod.CASH, idempotencyKey: 'k-C5', collectedAt: '2026-11-18T10:15:00.000Z' },
        { ticketId: 'ticket-A', installmentMonth: 1, amount: 3950, paymentMethod: PaymentMethod.CASH, idempotencyKey: 'k-A1', collectedAt: '2026-11-18T10:20:00.000Z' },
      ];

      const res = await collectionService.syncOfflineQueue({ items }, mockCollectorId, mockBranchId);
      expect(res.successCount).toBe(5);

      // Verify execution order grouped by ticketId ascending and installmentMonth ascending
      const callSequence = recordSpy.mock.calls.map((call) => `${call[0].ticketId}:${call[0].installmentMonth}`);
      expect(callSequence).toEqual([
        'ticket-A:1',
        'ticket-A:2',
        'ticket-A:3',
        'ticket-B:1',
        'ticket-C:5',
      ]);
      recordSpy.mockRestore();
    });

    it('DEF-M8-REV-03: rejects cash handover acknowledgment when batch spans multiple branches', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pmt-branch-1',
          branchId: 'branch-uuid-1',
          recordedByUserId: mockCollectorId,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          paymentStatus: PaymentStatus.SUCCESS,
        },
        {
          id: 'pmt-branch-2',
          branchId: 'branch-uuid-2',
          recordedByUserId: mockCollectorId,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          paymentStatus: PaymentStatus.SUCCESS,
        },
      ]);

      await expect(
        collectionService.acknowledgeHandover(
          {
            collectorUserId: mockCollectorId,
            acknowledgedAmount: 7900,
            paymentIds: ['pmt-branch-1', 'pmt-branch-2'],
          },
          mockPartnerId,
          'branch-uuid-1',
          [Role.BRANCH_MANAGER],
        ),
      ).rejects.toThrow('All payments in a cash handover batch must belong to the same branch');
    });

    it('DEF-M8-REV-03: blocks non-Super-Admin from acknowledging cash handover for another branch (CROSS_BRANCH_FORBIDDEN)', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pmt-branch-2',
          branchId: 'branch-uuid-2',
          recordedByUserId: mockCollectorId,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          paymentStatus: PaymentStatus.SUCCESS,
        },
      ]);

      await expect(
        collectionService.acknowledgeHandover(
          {
            collectorUserId: mockCollectorId,
            acknowledgedAmount: 3950,
            paymentIds: ['pmt-branch-2'],
          },
          mockPartnerId,
          'branch-uuid-1', // Manager of Branch 1 attempting to acknowledge Branch 2!
          [Role.BRANCH_MANAGER],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DEF-M8-REV-03: allows Super Admin to acknowledge cash handover regardless of branch', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pmt-branch-2',
          branchId: 'branch-uuid-2',
          recordedByUserId: mockCollectorId,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          paymentStatus: PaymentStatus.SUCCESS,
        },
      ]);
      prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await collectionService.acknowledgeHandover(
        {
          collectorUserId: mockCollectorId,
          acknowledgedAmount: 3950,
          paymentIds: ['pmt-branch-2'],
        },
        mockPartnerId,
        'branch-uuid-1', // Super Admin can acknowledge across branches
        [Role.SUPER_ADMIN],
      );

      expect(result.success).toBe(true);
      expect(result.acknowledgedAmount).toBe(3950n);
    });

    it('DEF-M8-REV-05: deduplicates duplicate payment IDs in acknowledgeHandover dto', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pmt-dup-1',
          branchId: mockBranchId,
          recordedByUserId: mockCollectorId,
          amount: 3950n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          paymentStatus: PaymentStatus.SUCCESS,
        },
      ]);
      prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await collectionService.acknowledgeHandover(
        {
          collectorUserId: mockCollectorId,
          acknowledgedAmount: 3950,
          paymentIds: ['pmt-dup-1', 'pmt-dup-1'], // Duplicate ID in request
        },
        mockPartnerId,
        mockBranchId,
        [Role.SUPER_ADMIN],
      );

      expect(result.success).toBe(true);
      expect(result.totalPaymentsAcknowledged).toBe(1);
    });

    it('DEF-M8-REV-07: maps DUPLICATE_TRANSACTION_REF and CROSS_BRANCH_FORBIDDEN in syncOfflineQueue', async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);
      const recordSpy = jest
        .spyOn(collectionService, 'recordCollection')
        .mockRejectedValueOnce(
          new ConflictException(
            'DUPLICATE_TRANSACTION_REF: The bank UTR "123456789012" has already been recorded in another payment.',
          ),
        )
        .mockRejectedValueOnce(
          new ForbiddenException(
            'CROSS_BRANCH_FORBIDDEN: You cannot record collections for chit groups belonging to another branch',
          ),
        );

      const res = await collectionService.syncOfflineQueue(
        {
          items: [
            { ticketId: 'ticket-1', installmentMonth: 1, amount: 3950, paymentMethod: PaymentMethod.UPI, idempotencyKey: 'k-dup-utr', transactionRef: '123456789012', collectedAt: '2026-11-18T10:00:00.000Z' },
            { ticketId: 'ticket-2', installmentMonth: 1, amount: 3950, paymentMethod: PaymentMethod.CASH, idempotencyKey: 'k-xbranch', collectedAt: '2026-11-18T10:05:00.000Z' },
          ],
        },
        mockCollectorId,
        mockBranchId,
      );

      expect(res.failureCount).toBe(2);
      expect(res.failed[0].errorCode).toBe('DUPLICATE_TRANSACTION_REF');
      expect(res.failed[1].errorCode).toBe('CROSS_BRANCH_FORBIDDEN');
      recordSpy.mockRestore();
    });

    it('XR-M8-PAY-01 & M8-REV: passes paymentId in collection receipt notification payload', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      };
      const queuedCollectionService = new CollectionService(
        prismaMock as unknown as PrismaService,
        mockQueueProvider as unknown as BullMqQueueProvider,
      );

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.payment.create.mockResolvedValue({
        id: 'pmt-with-id-123',
        branchId: mockBranchId,
        amount: 3950n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date(),
      });
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-1' });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-1',
        receiptNumber: 'KC-REC-PRD-2026-00055',
      });
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      await queuedCollectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3950,
          paymentMethod: PaymentMethod.CASH,
        },
        mockCollectorId,
        mockBranchId,
      );

      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        'notification-queue',
        'dispatch-payment-receipt',
        expect.objectContaining({
          paymentId: 'pmt-with-id-123',
          receiptNumber: 'KC-REC-PRD-2026-00055',
        }),
        expect.any(Object),
      );
    });
  });
});
