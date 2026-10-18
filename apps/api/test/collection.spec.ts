import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DueStatus, PaymentMethod, Role } from '@prisma/client';
import { CollectionService } from '../src/collection/collection.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
      },
      paymentAllocation: {
        create: jest.fn(),
      },
      receipt: {
        count: jest.fn(),
        create: jest.fn(),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      installmentDue: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
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
      prismaMock.receipt.count.mockResolvedValue(44);

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

    it('should safely deduplicate offline sync requests with identical idempotencyKey', async () => {
      const existingPayment = {
        id: 'existing-payment-uuid',
        amount: 3950n,
        idempotencyKey: 'duplicate-key-123',
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
});
