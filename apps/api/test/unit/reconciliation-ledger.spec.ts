import { DueStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { ReconciliationService } from '../../src/jobs/services/reconciliation.service';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Financial Integrity & Reconciliation: Ghost Drop Ledger Atomicity Tests', () => {
  let reconciliationService: ReconciliationService;
  let notificationServiceMock: any;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockPaymentId = 'pay-ghost-uuid-101';
  const mockDueId = 'due-uuid-201';
  const mockTicketId = 'tkt-uuid-301';
  const mockCustomerId = 'cust-uuid-401';
  const mockCustomerPhone = '9842100108';
  const mockOrderRef = 'ORDER_UPI_20261029_001';
  const mockGatewayPaymentId = 'pay_gateway_trx_999';
  const mockInstallmentAmount = 3750n;

  beforeEach(() => {
    notificationServiceMock = {
      dispatchPaymentReceipt: jest.fn().mockResolvedValue({
        smsId: 'sms-rec-123',
        whatsappId: 'wa-rec-123',
        channel: 'PUSH_NOTIFICATION',
      }),
    };

    prismaMock = {
      $transaction: jest.fn(async (callback) => callback(prismaMock)),
      payment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      installmentDue: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      subscriberTicket: {
        update: jest.fn(),
      },
      receipt: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    reconciliationService = new ReconciliationService(
      prismaMock as unknown as PrismaService,
      notificationServiceMock as unknown as NotificationService,
    );
  });

  const buildMockGhostPayment = (overrides?: Partial<any>) => ({
    id: mockPaymentId,
    branchId: mockBranchId,
    customerId: mockCustomerId,
    recordedByUserId: 'agent-uuid-001',
    amount: mockInstallmentAmount,
    paymentMethod: PaymentMethod.UPI,
    paymentStatus: PaymentStatus.INITIATED,
    transactionRef: mockOrderRef,
    notes: 'Customer self-reported UPI claim',
    createdAt: new Date('2026-10-29T10:00:00Z'),
    allocations: [
      {
        id: 'alloc-uuid-501',
        paymentId: mockPaymentId,
        ticketId: mockTicketId,
        installmentDueId: mockDueId,
        amountAllocated: mockInstallmentAmount,
        due: {
          id: mockDueId,
          ticketId: mockTicketId,
          installmentMonth: 4,
          status: DueStatus.UNPAID,
          grossAmount: 5000n,
          dividendDeduction: 1250n,
          netPayableAmount: mockInstallmentAmount,
          paidAmount: 0n,
        },
        ticket: {
          id: mockTicketId,
          ticketNumber: 8,
          customerId: mockCustomerId,
          status: 'DEFAULT_3_MONTHS',
          consecutiveUnpaidMonths: 3,
          customer: {
            id: mockCustomerId,
            fullName: 'A. Shanmugam',
            phone: mockCustomerPhone,
            fcmToken: 'fcm-device-token-sample',
          },
          chitGroup: {
            groupCode: 'KCA-1L-20M-01',
            branchId: mockBranchId,
            branch: { code: 'PRD' },
          },
        },
      },
    ],
    receipt: null,
    ...overrides,
  });

  // =========================================================================
  // 1. ATOMIC GHOST DROP RESOLUTION
  // =========================================================================
  describe('1. Atomic Ghost Drop Resolution & Invariants', () => {
    it('RECON-INV-01 & RECON-INV-02: wraps payment and due updates inside atomic $transaction', async () => {
      const mockPayment = buildMockGhostPayment();

      prismaMock.payment.findFirst.mockResolvedValue(mockPayment);
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.payment.update.mockResolvedValue({
        ...mockPayment,
        paymentStatus: PaymentStatus.SUCCESS,
      });

      prismaMock.installmentDue.update.mockResolvedValue({
        id: mockDueId,
        status: DueStatus.PAID,
        paidAmount: mockInstallmentAmount,
      });

      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: mockTicketId,
        consecutiveUnpaidMonths: 0,
        status: 'ACTIVE',
      });

      prismaMock.receipt.findUnique.mockResolvedValue(null);
      prismaMock.receipt.findFirst.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00045',
      });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-uuid-999',
        receiptNumber: 'KC-REC-PRD-2026-00046',
      });

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: mockOrderRef,
          gatewayPaymentId: mockGatewayPaymentId,
          amount: mockInstallmentAmount,
          status: 'SUCCESS',
          settledAt: new Date('2026-10-29T10:05:00Z'),
        },
      ]);

      expect(result.autoResolvedGhostDropsCount).toBe(1);
      expect(result.exceptionCount).toBe(0);

      // Invariant 1: Transaction Scope
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      // Invariant 2: Payment transitioned to SUCCESS
      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPaymentId },
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.SUCCESS,
            notes: expect.stringContaining(mockGatewayPaymentId),
          }),
        }),
      );

      // Invariant 3: InstallmentDue marked PAID with whole Rupee BigInt
      expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDueId },
          data: {
            status: DueStatus.PAID,
            paidAmount: mockInstallmentAmount,
          },
        }),
      );
    });

    it('RECON-INV-03: generates sequential collision-proof receipt during auto-resolution', async () => {
      const mockPayment = buildMockGhostPayment();

      prismaMock.payment.findFirst.mockResolvedValue(mockPayment);
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.payment.update.mockResolvedValue(mockPayment);
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      prismaMock.receipt.findUnique.mockResolvedValue(null);
      prismaMock.receipt.findFirst.mockResolvedValue({
        receiptNumber: 'KC-REC-PRD-2026-00120',
      });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-uuid-121',
        receiptNumber: 'KC-REC-PRD-2026-00121',
      });

      await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: mockOrderRef,
          gatewayPaymentId: mockGatewayPaymentId,
          amount: mockInstallmentAmount,
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(prismaMock.receipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: mockBranchId,
            paymentId: mockPaymentId,
            receiptNumber: 'KC-REC-PRD-2026-00121',
            isBilingual: true,
          }),
        }),
      );
    });

    it('RECON-INV-04: recalculates arrears and clears DEFAULT_3_MONTHS status', async () => {
      const mockPayment = buildMockGhostPayment();

      prismaMock.payment.findFirst.mockResolvedValue(mockPayment);
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.payment.update.mockResolvedValue(mockPayment);
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.receipt.findUnique.mockResolvedValue({ id: 'rec-existing' });

      await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: mockOrderRef,
          gatewayPaymentId: mockGatewayPaymentId,
          amount: mockInstallmentAmount,
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTicketId },
          data: expect.objectContaining({
            consecutiveUnpaidMonths: 0,
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('RECON-INV-05: dispatches official receipt notification asynchronously post-commit', async () => {
      const mockPayment = buildMockGhostPayment();

      prismaMock.payment.findFirst.mockResolvedValue(mockPayment);
      prismaMock.payment.findUnique.mockResolvedValue(mockPayment);
      prismaMock.payment.update.mockResolvedValue(mockPayment);
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.installmentDue.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.update.mockResolvedValue({});
      prismaMock.receipt.findUnique.mockResolvedValue({
        id: 'rec-uuid-121',
        receiptNumber: 'KC-REC-PRD-2026-00121',
      });

      await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: mockOrderRef,
          gatewayPaymentId: mockGatewayPaymentId,
          amount: mockInstallmentAmount,
          status: 'SUCCESS',
          settledAt: new Date('2026-10-29T10:05:00Z'),
        },
      ]);

      expect(notificationServiceMock.dispatchPaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: mockPaymentId,
          receiptNumber: 'KC-REC-PRD-2026-00121',
          recipientPhone: mockCustomerPhone,
          subscriberName: 'A. Shanmugam',
          amountPaid: '3750',
          chitCode: 'KCA-1L-20M-01',
          ticketNumber: 8,
          paymentMode: PaymentMethod.UPI,
        }),
      );
    });
  });

  // =========================================================================
  // 2. DISCREPANCY & EXCEPTION HANDLING
  // =========================================================================
  describe('2. Discrepancy & Unmapped Credits Invariants', () => {
    it('RECON-INV-06: flags discrepancy when settlement amount does not match internal record', async () => {
      const mockPayment = buildMockGhostPayment({ amount: 3750n });
      prismaMock.payment.findFirst.mockResolvedValue(mockPayment);

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: mockOrderRef,
          gatewayPaymentId: mockGatewayPaymentId,
          amount: 3000n, // Gateway says ₹3000, internal says ₹3750
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(result.exceptionCount).toBe(1);
      expect(result.autoResolvedGhostDropsCount).toBe(0);
      expect(result.details[0]).toContain(`Discrepancy on Order ${mockOrderRef}`);

      // Invariant: MUST NOT alter database
      expect(prismaMock.payment.update).not.toHaveBeenCalled();
      expect(prismaMock.installmentDue.update).not.toHaveBeenCalled();
    });

    it('RECON-INV-07: flags unmapped credit when gateway order does not exist in database', async () => {
      prismaMock.payment.findFirst.mockResolvedValue(null);

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER_UNKNOWN_999',
          gatewayPaymentId: 'pay_unknown_999',
          amount: 5000n,
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(result.exceptionCount).toBe(1);
      expect(result.details[0]).toContain('Unmapped Credit');
      expect(prismaMock.payment.update).not.toHaveBeenCalled();
    });
  });
});
