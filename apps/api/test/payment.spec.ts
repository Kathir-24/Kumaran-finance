import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DueStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { JwtPayload } from '../src/auth/interfaces/jwt-payload.interface';
import { PaymentService } from '../src/payment/payment.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Module 7: Payments, Bilingual Receipts & Maker-Checker Reversals Tests', () => {
  let paymentService: PaymentService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockTicketId = 'ticket-uuid-001';
  const mockMakerId = 'partner-maker-uuid-001';
  const mockCheckerId = 'partner-checker-uuid-002';
  const mockCustomerId = 'cust-uuid-001';
  const mockPaymentId = 'payment-uuid-001';

  const mockTicket = {
    id: mockTicketId,
    ticketNumber: 7,
    status: 'ACTIVE',
    customerId: mockCustomerId,
    customer: {
      id: mockCustomerId,
      customerCode: 'KC-CUST-00007',
      fullName: 'S. Sundaram',
      fullNameTamil: 'சுந்தரம்',
      phone: '9842143210',
      addressLine1: '14, Netaji Road',
      city: 'Perundurai',
      pincode: '638052',
    },
    chitGroup: {
      id: 'chit-group-uuid-001',
      groupCode: 'KCA-1L-20M-01',
      status: 'ACTIVE',
      chitValue: 100000n,
      durationMonths: 20,
      branchId: mockBranchId,
      branch: {
        id: mockBranchId,
        code: 'PRD',
        name: 'Head Office - Perundurai',
        nameTamil: 'தலைமை கிளை, பெருந்துறை',
        address: 'Main Road, Perundurai, Erode',
        phone: '+91 98765 43210',
      },
    },
  };

  const mockDue = {
    id: 'due-uuid-001',
    ticketId: mockTicketId,
    installmentMonth: 4,
    grossAmount: 5000n,
    dividendDeduction: 1250n,
    netPayableAmount: 3750n, // Exact payable amount
    paidAmount: 0n,
    status: DueStatus.UNPAID,
    dueDate: new Date('2026-10-10T00:00:00.000Z'),
  };

  beforeEach(() => {
    prismaMock = {
      payment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      paymentAllocation: {
        create: jest.fn(),
      },
      receipt: {
        count: jest.fn(),
        create: jest.fn(),
      },
      paymentReversal: {
        create: jest.fn(),
        update: jest.fn(),
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
      customer: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    paymentService = new PaymentService(prismaMock as unknown as PrismaService);
  });

  describe('1. Exact Inet Single Discrete Payment Invariant (ADR-07)', () => {
    it('should record exact net installment payment and generate sequential bilingual receipt', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.count.mockResolvedValue(411);

      const createdPayment = {
        id: mockPaymentId,
        amount: 3750n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date('2026-10-18T10:45:00.000Z'),
      };
      prismaMock.payment.create.mockResolvedValue(createdPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-01' });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-01',
        receiptNumber: 'KC-REC-PRD-2026-00412',
        isBilingual: true,
      });
      prismaMock.installmentDue.update.mockResolvedValue({
        ...mockDue,
        status: DueStatus.PAID,
        paidAmount: 3750n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValue([mockDue]);
      prismaMock.subscriberTicket.update.mockResolvedValue(mockTicket);

      const result = await paymentService.recordPayment(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3750,
          paymentMethod: PaymentMethod.CASH,
        },
        mockMakerId,
        mockBranchId,
      );

      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 3750n,
            paymentMethod: PaymentMethod.CASH,
            paymentStatus: PaymentStatus.SUCCESS,
          }),
        }),
      );
      expect(prismaMock.receipt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receiptNumber: 'KC-REC-PRD-2026-00412',
            isBilingual: true,
          }),
        }),
      );
      expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDue.id },
          data: expect.objectContaining({
            status: DueStatus.PAID,
            paidAmount: 3750n,
          }),
        }),
      );
      expect(result.dueStatus).toBe(DueStatus.PAID);
      expect(result.paidAmount).toBe(3750n);
    });

    it('should persist optional cashier notes when provided in payment dto', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.count.mockResolvedValue(412);
      prismaMock.payment.create.mockResolvedValue({
        id: mockPaymentId,
        amount: 3750n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        notes: 'Paid at Perundurai head office counter',
        createdAt: new Date('2026-10-18T10:45:00.000Z'),
      });
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-02' });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-02',
        receiptNumber: 'KC-REC-PRD-2026-00413',
        isBilingual: true,
      });
      prismaMock.installmentDue.update.mockResolvedValue({
        ...mockDue,
        status: DueStatus.PAID,
        paidAmount: 3750n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValue([mockDue]);
      prismaMock.subscriberTicket.update.mockResolvedValue(mockTicket);

      await paymentService.recordPayment(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3750,
          paymentMethod: PaymentMethod.CASH,
          notes: 'Paid at Perundurai head office counter',
        },
        mockMakerId,
        mockBranchId,
      );

      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: 'Paid at Perundurai head office counter',
          }),
        }),
      );
    });

    it('should reject partial payment (< Inet) with 400 PARTIAL_PAYMENTS_NOT_ALLOWED', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);

      await expect(
        paymentService.recordPayment(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 2000, // Less than ₹3,750
            paymentMethod: PaymentMethod.CASH,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject overpayment (> Inet) with 400 PARTIAL_PAYMENTS_NOT_ALLOWED', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);

      await expect(
        paymentService.recordPayment(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 5000, // Higher than net due ₹3,750
            paymentMethod: PaymentMethod.CASH,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject double payment when installment is already PAID', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue({
        ...mockDue,
        status: DueStatus.PAID,
        paidAmount: 3750n,
      });

      await expect(
        paymentService.recordPayment(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3750,
            paymentMethod: PaymentMethod.CASH,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('INSTALLMENT_ALREADY_PAID'),
        }),
      );
    });

    it('should deduplicate payment if idempotency key already exists', async () => {
      const existingPayment = {
        id: 'existing-payment-001',
        amount: 3750n,
        idempotencyKey: 'idemp-uuid-123',
      };
      prismaMock.payment.findUnique.mockResolvedValue(existingPayment);

      const result = await paymentService.recordPayment(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3750,
          paymentMethod: PaymentMethod.UPI,
          idempotencyKey: 'idemp-uuid-123',
        },
        mockMakerId,
      );

      expect(result.duplicateIgnored).toBe(true);
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('should reject payment if chit scheme is not ACTIVE', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        ...mockTicket,
        chitGroup: { ...mockTicket.chitGroup, status: 'DRAFT' },
      });

      await expect(
        paymentService.recordPayment(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3750,
            paymentMethod: PaymentMethod.CASH,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payment if ticket is flagged as REMOVED_DEF_3M', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        ...mockTicket,
        status: 'REMOVED_DEF_3M',
      });

      await expect(
        paymentService.recordPayment(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3750,
            paymentMethod: PaymentMethod.CASH,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Bilingual Receipt Formatting (English + தமிழ்)', () => {
    it('should generate formatted bilingual receipt matching approved template', async () => {
      const mockPaymentWithRelations = {
        id: mockPaymentId,
        customerId: mockCustomerId,
        amount: 3750n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.SUCCESS,
        transactionRef: null,
        createdAt: new Date('2026-10-18T10:45:00.000Z'),
        receipt: {
          receiptNumber: 'KC-REC-PRD-2026-00412',
          issuedAt: new Date('2026-10-18T10:45:00.000Z'),
        },
        recordedByUser: {
          name: 'Muniasamy AG',
          phone: '9842100099',
        },
        allocations: [
          {
            due: mockDue,
            ticket: mockTicket,
          },
        ],
      };

      prismaMock.payment.findUnique.mockResolvedValue(mockPaymentWithRelations);

      const staffUser: JwtPayload = {
        sub: mockMakerId,
        phone: '9842199999',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access',
      };

      const receipt = await paymentService.getBilingualReceipt(
        mockPaymentId,
        staffUser,
      );

      expect(receipt.receiptNumber).toBe('KC-REC-PRD-2026-00412');
      expect(receipt.isBilingual).toBe(true);
      expect(receipt.formattedText).toContain('KUMARAN FINANCE');
      expect(receipt.formattedText).toContain('குமரன் பைனான்ஸ்');
      expect(receipt.formattedText).toContain('சந்தா ரசீது / SUBSCRIPTION RECEIPT');
      expect(receipt.formattedText).toContain('KC-REC-PRD-2026-00412');
      expect(receipt.formattedText).toContain('KCA-1L-20M-01');
      expect(receipt.formattedText).toContain('₹ 3750');
      expect(receipt.formattedText).toContain('ரொக்கம் / CASH');
    });
  });

  describe('3. Maker-Checker Payment Reversals (ADR-08 & Operations SOP §2)', () => {
    const mockSuccessPayment = {
      id: mockPaymentId,
      customerId: mockCustomerId,
      amount: 3750n,
      paymentMethod: PaymentMethod.CASH,
      paymentStatus: PaymentStatus.SUCCESS,
      reversal: null,
      allocations: [
        {
          installmentDueId: mockDue.id,
          ticketId: mockTicketId,
          due: mockDue,
        },
      ],
    };

    it('should allow Maker (Accountant/Manager/Partner A) to request payment reversal', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(mockSuccessPayment);
      prismaMock.paymentReversal.create.mockResolvedValue({
        id: 'rev-01',
        paymentId: mockPaymentId,
        reason: 'WRONG_TICKET_ENTERED',
        status: 'REQUESTED',
        initiatedByUserId: mockMakerId,
      });

      const result = await paymentService.requestReversal(
        mockPaymentId,
        {
          reason: 'WRONG_TICKET_ENTERED',
          notes: 'Customer Ticket 7 was entered instead of Ticket 8',
        },
        mockMakerId,
      );

      expect(prismaMock.paymentReversal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: mockPaymentId,
            reason: 'WRONG_TICKET_ENTERED',
            status: 'REQUESTED',
            initiatedByUserId: mockMakerId,
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PAYMENT_REVERSAL_REQUESTED',
            userId: mockMakerId,
          }),
        }),
      );
      expect(result.message).toContain('Pending Checker approval');
    });

    it('should reject reversal request if payment is already REVERSED', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockSuccessPayment,
        paymentStatus: PaymentStatus.REVERSED,
      });

      await expect(
        paymentService.requestReversal(
          mockPaymentId,
          { reason: 'DUPLICATE_ENTRY' },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject reversal request if a request is already pending', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockSuccessPayment,
        reversal: { status: 'REQUESTED' },
      });

      await expect(
        paymentService.requestReversal(
          mockPaymentId,
          { reason: 'DUPLICATE_ENTRY' },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should ENFORCE MAKER != CHECKER: Throw 403 Forbidden if Maker attempts to approve own reversal', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockSuccessPayment,
        reversal: {
          id: 'rev-01',
          paymentId: mockPaymentId,
          status: 'REQUESTED',
          initiatedByUserId: mockMakerId, // Initiated by mockMakerId
        },
      });

      // Checker is also mockMakerId (Violation!)
      await expect(
        paymentService.approveReversal(
          mockPaymentId,
          { notes: 'Self-approval attempt' },
          mockMakerId, // Same as Maker!
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should ENFORCE SUPER_ADMIN EXCLUSIVITY: Block Branch Manager from approving payment reversal', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockSuccessPayment,
        reversal: {
          id: 'rev-01',
          paymentId: mockPaymentId,
          status: 'REQUESTED',
          initiatedByUserId: mockMakerId,
        },
      });

      // User has only BRANCH_MANAGER role
      await expect(
        paymentService.approveReversal(
          mockPaymentId,
          { notes: 'Branch manager approval attempt' },
          mockCheckerId,
          [Role.BRANCH_MANAGER], // Not Super Admin!
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should approve reversal when Checker (Partner B) approves Partner A request, setting REVERSED and due to UNPAID', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockSuccessPayment,
        reversal: {
          id: 'rev-01',
          paymentId: mockPaymentId,
          reason: 'WRONG_TICKET_ENTERED',
          notes: 'Customer Ticket 7 error',
          status: 'REQUESTED',
          initiatedByUserId: mockMakerId, // Maker is Partner A
        },
      });
      prismaMock.installmentDue.count.mockResolvedValue(1);

      const result = await paymentService.approveReversal(
        mockPaymentId,
        { notes: 'Verified counter receipt with cashier' },
        mockCheckerId, // Checker is Partner B (Maker != Checker satisfied!)
        [Role.SUPER_ADMIN],
      );

      expect(prismaMock.paymentReversal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { paymentId: mockPaymentId },
          data: expect.objectContaining({
            status: 'APPROVED',
            approvedByUserId: mockCheckerId,
          }),
        }),
      );
      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPaymentId },
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.REVERSED,
          }),
        }),
      );
      expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockDue.id },
          data: expect.objectContaining({
            status: DueStatus.UNPAID,
            paidAmount: 0n,
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PAYMENT_REVERSED',
            userId: mockCheckerId,
            newValue: expect.objectContaining({
              paymentStatus: 'REVERSED',
              dueStatus: 'UNPAID',
              makerUserId: mockMakerId,
              checkerUserId: mockCheckerId,
            }),
          }),
        }),
      );
      expect(result.paymentStatus).toBe(PaymentStatus.REVERSED);
      expect(result.dueStatus).toBe(DueStatus.UNPAID);
    });

    it('should reject reversal request when Checker rejects with justification', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        ...mockSuccessPayment,
        reversal: {
          id: 'rev-01',
          status: 'REQUESTED',
          initiatedByUserId: mockMakerId,
        },
      });

      const result = await paymentService.rejectReversal(
        mockPaymentId,
        { rejectionReason: 'Cheque cleared at Indian Overseas Bank' },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      expect(prismaMock.paymentReversal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { paymentId: mockPaymentId },
          data: expect.objectContaining({
            status: 'REJECTED',
            approvedByUserId: mockCheckerId,
          }),
        }),
      );
      expect(result.message).toContain('Payment remains in SUCCESS status');
    });
  });

  describe('4. Persona Scoping & Ownership Guards', () => {
    it('should block a Customer from accessing another customer payment record', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        id: mockPaymentId,
        customerId: 'different-cust-uuid',
      });
      prismaMock.customer.findUnique.mockResolvedValue({ id: 'my-cust-uuid' });

      const customerUser: JwtPayload = {
        sub: 'user-cust-001',
        phone: '9842100000',
        roles: [Role.CUSTOMER],
        branchId: null,
        tokenType: 'access',
      };

      await expect(
        paymentService.getPaymentById(mockPaymentId, customerUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. BullMQ Notification Queue Hookup', () => {
    it('should enqueue payment receipt job to notification-queue upon successful payment', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'job-123', status: 'ENQUEUED' }),
      };

      const queuedPaymentService = new PaymentService(
        prismaMock as unknown as PrismaService,
        mockQueueProvider as any,
      );

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.count.mockResolvedValue(411);

      const createdPayment = {
        id: mockPaymentId,
        amount: 3750n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date('2026-10-18T10:45:00.000Z'),
      };
      prismaMock.payment.create.mockResolvedValue(createdPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-01' });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-01',
        receiptNumber: 'KC-REC-PRD-2026-00412',
        isBilingual: true,
      });
      prismaMock.installmentDue.update.mockResolvedValue({
        ...mockDue,
        status: DueStatus.PAID,
        paidAmount: 3750n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValue([mockDue]);
      prismaMock.subscriberTicket.update.mockResolvedValue(mockTicket);

      const result = await queuedPaymentService.recordPayment(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3750,
          paymentMethod: PaymentMethod.CASH,
        },
        mockMakerId,
      );

      expect(result.receipt.receiptNumber).toBe('KC-REC-PRD-2026-00412');
      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        'notification-queue',
        'dispatch-payment-receipt',
        expect.objectContaining({
          recipientPhone: mockTicket.customer.phone,
          receiptNumber: 'KC-REC-PRD-2026-00412',
          amountPaid: '3750',
          ticketNumber: mockTicket.ticketNumber,
        }),
      );
    });

    it('should not fail payment recording if queueProvider.addJob throws an error (fire-and-forget resilience)', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
      };

      const queuedPaymentService = new PaymentService(
        prismaMock as unknown as PrismaService,
        mockQueueProvider as any,
      );

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.count.mockResolvedValue(411);

      const createdPayment = {
        id: mockPaymentId,
        amount: 3750n,
        paymentMethod: PaymentMethod.CASH,
        cashHandoverStatus: 'PENDING_HANDOVER',
        createdAt: new Date('2026-10-18T10:45:00.000Z'),
      };
      prismaMock.payment.create.mockResolvedValue(createdPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-01' });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-01',
        receiptNumber: 'KC-REC-PRD-2026-00412',
        isBilingual: true,
      });
      prismaMock.installmentDue.update.mockResolvedValue({
        ...mockDue,
        status: DueStatus.PAID,
        paidAmount: 3750n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValue([mockDue]);
      prismaMock.subscriberTicket.update.mockResolvedValue(mockTicket);

      const result = await queuedPaymentService.recordPayment(
        {
          ticketId: mockTicketId,
          installmentMonth: 4,
          amount: 3750,
          paymentMethod: PaymentMethod.CASH,
        },
        mockMakerId,
      );

      expect(result.receipt.receiptNumber).toBe('KC-REC-PRD-2026-00412');
      expect(result.dueStatus).toBe(DueStatus.PAID);
    });
  });
});
