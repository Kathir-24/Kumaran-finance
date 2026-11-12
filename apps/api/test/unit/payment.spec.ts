import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DueStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { PaymentService } from '../../src/payment/payment.service';
import { PrismaService } from '../../src/prisma/prisma.service';

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
        findFirst: jest.fn(),
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
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
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
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00411' } as any);

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
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00411' } as any);

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
        expect.objectContaining({
          jobId: 'receipt-KC-REC-PRD-2026-00412',
          priority: 1,
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
      prismaMock.receipt.findFirst.mockResolvedValue({ receiptNumber: 'KC-REC-PRD-2026-00411' } as any);

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

    it('should enqueue reversal approval alert to notification-queue when reversal is requested', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'job-rev-alert', status: 'ENQUEUED' }),
      };

      const queuedPaymentService = new PaymentService(
        prismaMock as unknown as PrismaService,
        mockQueueProvider as any,
      );

      prismaMock.payment.findUnique.mockResolvedValue({
        id: mockPaymentId,
        customerId: mockCustomerId,
        amount: 3750n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.SUCCESS,
        reversal: null,
      });

      prismaMock.paymentReversal.create.mockResolvedValue({
        id: 'rev-01',
        paymentId: mockPaymentId,
        reason: 'Duplicate entry at office counter',
        status: 'REQUESTED',
        initiatedByUserId: mockMakerId,
      });
      prismaMock.auditLog.create.mockResolvedValue({});

      const result = await queuedPaymentService.requestReversal(
        mockPaymentId,
        { reason: 'Duplicate entry at office counter' },
        mockMakerId,
      );

      expect(result.message).toContain('Payment reversal requested successfully');
      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        'notification-queue',
        'dispatch-approval-alert',
        expect.objectContaining({
          approvalType: 'REVERSAL_APPROVAL',
          entityId: mockPaymentId,
          amount: '3750',
          excludeUserId: mockMakerId,
          data: expect.objectContaining({
            paymentId: mockPaymentId,
            reason: 'Duplicate entry at office counter',
            reversalId: 'rev-01',
          }),
        }),
        expect.objectContaining({
          jobId: 'approval-alert-reversal-rev-01',
          priority: 1,
        }),
      );
    });
  });

  describe('6. Bank UTR Anti-Duplication Constraint & Rejection', () => {
    it('should throw ConflictException if duplicate transactionRef (UTR) is submitted', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDue);
      prismaMock.receipt.findFirst.mockResolvedValue(null);

      const p2002Error: any = new Error('Unique constraint failed on the fields: (transactionRef)');
      p2002Error.code = 'P2002';
      p2002Error.meta = { target: ['transactionRef'] };

      prismaMock.payment.create.mockRejectedValue(p2002Error);

      await expect(
        paymentService.recordPayment(
          {
            ticketId: mockTicketId,
            installmentMonth: 4,
            amount: 3750,
            paymentMethod: PaymentMethod.UPI,
            transactionRef: 'DUPLICATE-UTR-999',
          },
          mockMakerId,
          mockBranchId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('7. Customer UPI Claim Submission & Staff Verification Workflow', () => {
    const mockDueForClaim = {
      id: 'due-claim-001',
      ticketId: mockTicketId,
      installmentMonth: 4,
      grossAmount: 5000n,
      dividendDeduction: 1250n,
      netPayableAmount: 3750n,
      paidAmount: 0n,
      status: DueStatus.UNPAID,
      ticket: mockTicket,
    };

    const mockCustomerUser: JwtPayload = {
      sub: 'user-cust-001',
      phone: '9842143210',
      roles: [Role.CUSTOMER],
      branchId: null,
      tokenType: 'access',
    };

    const mockAccountantUser: JwtPayload = {
      sub: 'user-acct-001',
      phone: '9842100000',
      roles: [Role.ACCOUNTANT],
      branchId: mockBranchId,
      tokenType: 'access',
    };

    it('should allow customer to submit a UPI claim in INITIATED status with valid UTR', async () => {
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDueForClaim);
      prismaMock.customer.findUnique = jest.fn().mockResolvedValue({ id: mockCustomerId });
      prismaMock.payment.findFirst.mockResolvedValue(null);
      prismaMock.paymentAllocation.findFirst = jest.fn().mockResolvedValue(null);

      const createdClaimPayment = {
        id: 'claim-payment-001',
        branchId: mockBranchId,
        recordedByUserId: mockCustomerUser.sub,
        customerId: mockCustomerId,
        amount: 3750n,
        paymentMethod: PaymentMethod.UPI,
        paymentStatus: PaymentStatus.INITIATED,
        transactionRef: 'UTR-123456789012',
        cashHandoverStatus: 'ACKNOWLEDGED',
        notes: 'Customer UPI Claim (Self-Reported)',
        createdAt: new Date(),
      };

      prismaMock.payment.create.mockResolvedValue(createdClaimPayment);
      prismaMock.paymentAllocation.create.mockResolvedValue({ id: 'alloc-claim-001' });

      const result = await paymentService.submitUpiClaim(
        {
          dueId: 'due-claim-001',
          utrNumber: 'UTR-123456789012',
        },
        mockCustomerUser,
      );

      expect(result.success).toBe(true);
      expect(result.claimId).toBe('claim-payment-001');
      expect(result.status).toBe(PaymentStatus.INITIATED);
      expect(result.utrNumber).toBe('UTR-123456789012');
      expect(result.amount).toBe(3750);
      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.INITIATED,
            paymentMethod: PaymentMethod.UPI,
            transactionRef: 'UTR-123456789012',
          }),
        }),
      );
    });

    it('should reject UPI claim if UTR has already been used in database', async () => {
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDueForClaim);
      prismaMock.customer.findUnique = jest.fn().mockResolvedValue({ id: mockCustomerId });
      prismaMock.payment.findFirst.mockResolvedValue({
        id: 'existing-payment-id',
        transactionRef: 'UTR-ALREADY-USED',
      });

      await expect(
        paymentService.submitUpiClaim(
          {
            dueId: 'due-claim-001',
            utrNumber: 'UTR-ALREADY-USED',
          },
          mockCustomerUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject UPI claim if another claim is already pending for that due', async () => {
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDueForClaim);
      prismaMock.customer.findUnique = jest.fn().mockResolvedValue({ id: mockCustomerId });
      prismaMock.payment.findFirst.mockResolvedValue(null);
      prismaMock.paymentAllocation.findFirst = jest.fn().mockResolvedValue({
        id: 'alloc-existing',
        payment: { transactionRef: 'UTR-PREVIOUS-PENDING' },
      });

      await expect(
        paymentService.submitUpiClaim(
          {
            dueId: 'due-claim-001',
            utrNumber: 'UTR-NEW-ONE',
          },
          mockCustomerUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should verify pending UPI claim and issue sequential bilingual receipt (Maker != Checker)', async () => {
      const pendingClaim = {
        id: 'claim-payment-001',
        branchId: mockBranchId,
        recordedByUserId: mockCustomerUser.sub, // Submitter is customer
        customerId: mockCustomerId,
        amount: 3750n,
        paymentMethod: PaymentMethod.UPI,
        paymentStatus: PaymentStatus.INITIATED,
        transactionRef: 'UTR-123456789012',
        notes: 'Customer UPI Claim',
        allocations: [
          {
            id: 'alloc-claim-001',
            due: mockDueForClaim,
            ticket: mockTicket,
          },
        ],
      };

      prismaMock.payment.findUnique.mockResolvedValue(pendingClaim);
      prismaMock.receipt.findFirst.mockResolvedValue(null);
      prismaMock.payment.update.mockResolvedValue({
        ...pendingClaim,
        paymentStatus: PaymentStatus.SUCCESS,
      });
      prismaMock.receipt.create.mockResolvedValue({
        id: 'rec-claim-001',
        receiptNumber: 'KC-REC-PRD-2026-00001',
        isBilingual: true,
      });
      prismaMock.installmentDue.update.mockResolvedValue({
        ...mockDueForClaim,
        status: DueStatus.PAID,
        paidAmount: 3750n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValue([mockDueForClaim]);
      prismaMock.subscriberTicket.update.mockResolvedValue(mockTicket);
      prismaMock.auditLog.create.mockResolvedValue({});

      const result = await paymentService.verifyUpiClaim(
        'claim-payment-001',
        mockAccountantUser.sub, // Checker is accountant != customer
        mockAccountantUser.roles,
        { verificationNotes: 'KVB Bank Statement matched' },
      );

      expect(result.success).toBe(true);
      expect(result.dueStatus).toBe(DueStatus.PAID);
      expect(result.receipt.receiptNumber).toBe('KC-REC-PRD-2026-00001');
      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'claim-payment-001' },
          data: expect.objectContaining({ paymentStatus: PaymentStatus.SUCCESS }),
        }),
      );
    });

    it('should strictly reject self-verification (Maker != Checker constraint)', async () => {
      const pendingClaim = {
        id: 'claim-payment-001',
        recordedByUserId: 'user-submitter-001',
        paymentMethod: PaymentMethod.UPI,
        paymentStatus: PaymentStatus.INITIATED,
        allocations: [{ due: mockDueForClaim, ticket: mockTicket }],
      };

      prismaMock.payment.findUnique.mockResolvedValue(pendingClaim);

      await expect(
        paymentService.verifyUpiClaim(
          'claim-payment-001',
          'user-submitter-001', // Same user attempting to verify own claim
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
