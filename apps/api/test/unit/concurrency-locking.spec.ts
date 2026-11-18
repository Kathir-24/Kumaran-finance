import { BadRequestException } from '@nestjs/common';
import { AuctionStatus, DueStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { AuctionService } from '../../src/auction/auction.service';
import { CollectionService } from '../../src/collection/collection.service';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { ReconciliationService } from '../../src/jobs/services/reconciliation.service';
import { PaymentService } from '../../src/payment/payment.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Module 12: High-Concurrency Pessimistic Row Locking (SELECT FOR UPDATE) Tests', () => {
  let paymentService: PaymentService;
  let auctionService: AuctionService;
  let disbursementService: DisbursementService;
  let collectionService: CollectionService;
  let reconciliationService: ReconciliationService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockTicketId = 'ticket-uuid-001';
  const mockMakerId = 'partner-maker-uuid-001';
  const mockCheckerId = 'partner-checker-uuid-002';
  const mockCustomerId = 'cust-uuid-001';
  const mockAuctionId = 'auction-uuid-001';
  const mockWinnerId = 'winner-uuid-001';

  beforeEach(() => {
    prismaMock = {
      payment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation((args) => ({
          id: 'payment-uuid-101',
          ...args.data,
        })),
        update: jest.fn().mockImplementation((args) => ({
          id: args.where?.id || 'payment-uuid-101',
          ...args.data,
        })),
        count: jest.fn(),
      },
      paymentAllocation: {
        create: jest.fn().mockImplementation((args) => ({
          id: 'alloc-uuid-101',
          ...args.data,
        })),
      },
      receipt: {
        count: jest.fn().mockResolvedValue(10),
        create: jest.fn().mockImplementation((args) => ({
          id: 'rec-uuid-101',
          ...args.data,
        })),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      subscriberTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockTicketId,
          ticketNumber: 5,
          status: 'ACTIVE',
          customerId: mockCustomerId,
          customer: {
            id: mockCustomerId,
            customerCode: 'KC-CUST-00005',
            fullName: 'M. Palanisamy',
            fullNameTamil: 'பழனிசாமி',
            phone: '9842100005',
          },
          chitGroup: {
            id: 'chit-group-uuid-001',
            groupCode: 'KCA-1L-20M-01',
            groupName: 'KCA-1L-20M-01',
            status: 'ACTIVE',
            branchId: mockBranchId,
            branch: { id: mockBranchId, code: 'PRD' },
          },
        }),
        update: jest.fn().mockResolvedValue({ id: mockTicketId, isPrized: true }),
      },
      installmentDue: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'due-uuid-001',
          ticketId: mockTicketId,
          installmentMonth: 3,
          netPayableAmount: 4000n,
          paidAmount: 0n,
          status: DueStatus.UNPAID,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'due-uuid-001',
          status: DueStatus.PAID,
          paidAmount: 4000n,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      auction: {
        findUnique: jest.fn().mockResolvedValue({
          id: mockAuctionId,
          chitGroupId: 'chit-group-uuid-001',
          installmentMonth: 3,
          auctionDate: new Date('2026-10-15T10:00:00.000Z'),
          status: AuctionStatus.SCHEDULED,
          bidDiscount: 20000n,
          foremanCommissionAmount: 4000n,
          dividendPerTicket: 800n,
          prizeMoney: 80000n,
          conductedByUserId: mockMakerId,
          chitGroup: {
            id: 'chit-group-uuid-001',
            groupCode: 'KCA-1L-20M-01',
            groupName: 'KCA-1L-20M-01',
          },
          winner: {
            id: mockWinnerId,
            ticketId: mockTicketId,
            ticket: {
              ticketNumber: 5,
              customer: { fullName: 'M. Palanisamy' },
            },
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: mockAuctionId,
          status: AuctionStatus.COMPLETED,
          finalizedByUserId: mockCheckerId,
        }),
      },
      auctionWinner: {
        update: jest.fn().mockResolvedValue({
          id: mockWinnerId,
          disbursementStatus: 'DISBURSED',
        }),
      },
      auctionMinutes: {
        upsert: jest.fn().mockResolvedValue({ id: 'min-uuid-001' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid-001' }),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
    };

    paymentService = new PaymentService(prismaMock as unknown as PrismaService);
    auctionService = new AuctionService(prismaMock as unknown as PrismaService, null as any);
    disbursementService = new DisbursementService(
      prismaMock as unknown as PrismaService,
      null as any,
      null as any,
    );
    collectionService = new CollectionService(prismaMock as unknown as PrismaService);
    reconciliationService = new ReconciliationService(prismaMock as unknown as PrismaService);
  });

  describe('1. Payment Pessimistic Locking & Zero Double Payment (ADR-07)', () => {
    it('should reject concurrent payment when locked row reveals status is already PAID', async () => {
      // Mock $queryRaw FOR UPDATE returning locked row that was just paid by parallel request
      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) return [{ id: 'branch-prd-001' }];
        if (sql.includes('"SubscriberTicket"')) return [{ id: mockTicketId }];
        if (sql.includes('"InstallmentDue"')) {
          return [{ id: 'due-uuid-001', status: DueStatus.PAID, netPayableAmount: 4000n }];
        }
        return [];
      });

      await expect(
        paymentService.recordPayment(
          {
            ticketId: mockTicketId,
            installmentMonth: 3,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: 'concurrent-key-2',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });

    it('should proceed and lock row when locked row reveals status is UNPAID', async () => {
      // First concurrent request acquires row lock with status UNPAID
      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) return [{ id: 'branch-prd-001' }];
        if (sql.includes('"SubscriberTicket"')) return [{ id: mockTicketId }];
        if (sql.includes('"InstallmentDue"')) {
          return [{ id: 'due-uuid-001', status: DueStatus.UNPAID, netPayableAmount: 4000n }];
        }
        return [];
      });

      const result = await paymentService.recordPayment(
        {
          ticketId: mockTicketId,
          installmentMonth: 3,
          amount: 4000,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: 'concurrent-key-1',
        },
        mockMakerId,
      );

      expect(result).toBeDefined();
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.payment.create).toHaveBeenCalled();
      expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'due-uuid-001' },
          data: expect.objectContaining({ status: DueStatus.PAID }),
        }),
      );
    });
  });

  describe('2. Auction Finalization Pessimistic Locking', () => {
    it('should acquire ChitGroup -> Auction locks in DAG order and reject duplicate finalization when locked row reveals COMPLETED status', async () => {
      const lockOrder: string[] = [];
      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"ChitGroup"')) {
          lockOrder.push('ChitGroup');
          return [{ id: 'chit-group-uuid-001', status: 'ACTIVE' }];
        }
        if (sql.includes('"Auction"')) {
          lockOrder.push('Auction');
          return [{ id: mockAuctionId, status: AuctionStatus.COMPLETED }];
        }
        return [];
      });

      await expect(
        auctionService.finalizeAuction(
          mockAuctionId,
          mockCheckerId,
          { subscribersPresent: 5, signedByForeman: true },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(lockOrder).toEqual(['ChitGroup', 'Auction']);
      expect(prismaMock.auction.update).not.toHaveBeenCalled();
    });
  });

  describe('3. Prize Disbursement Pessimistic Locking', () => {
    it('should reject duplicate release when locked row reveals DISBURSED status', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: mockWinnerId, disbursementStatus: 'DISBURSED' },
      ]);

      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'CASH-VAULT-PRD-01' },
          mockCheckerId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.auctionWinner.update).not.toHaveBeenCalled();
    });
  });

  describe('4. Field Collection DAG Locking & Inside-TX Receipt Sequencing (DEF-DB-01)', () => {
    it('should acquire Branch -> SubscriberTicket -> InstallmentDue locks in strict order BEFORE reading receipt sequence inside TX', async () => {
      const opTrace: string[] = [];

      prismaMock.receipt.findFirst.mockImplementation(async () => {
        opTrace.push('receipt.findFirst');
        return { receiptNumber: 'KC-REC-PRD-2026-00099' };
      });

      prismaMock.$queryRaw.mockImplementation(async (query: any, ...values: any[]) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) {
          opTrace.push(`LOCK:Branch:${values[0]}`);
          return [{ id: values[0] }];
        }
        if (sql.includes('"SubscriberTicket"')) {
          opTrace.push('LOCK:SubscriberTicket');
          return [{ id: mockTicketId }];
        }
        if (sql.includes('"InstallmentDue"')) {
          opTrace.push('LOCK:InstallmentDue');
          return [{ id: 'due-uuid-001', status: DueStatus.UNPAID, netPayableAmount: 4000n }];
        }
        return [];
      });

      const result = await collectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 3,
          amount: 4000,
          paymentMethod: PaymentMethod.CASH,
        },
        mockMakerId,
        mockBranchId,
      );

      expect(result.receiptNumber).toBe('KC-REC-PRD-2026-00100');
      expect(opTrace).toEqual([
        `LOCK:Branch:${mockBranchId}`,
        'LOCK:SubscriberTicket',
        'LOCK:InstallmentDue',
        'receipt.findFirst',
      ]);
      expect(prismaMock.receipt.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should reject duplicate collection when locked InstallmentDue reveals PAID status', async () => {
      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) return [{ id: mockBranchId }];
        if (sql.includes('"SubscriberTicket"')) return [{ id: mockTicketId }];
        if (sql.includes('"InstallmentDue"')) {
          return [{ id: 'due-uuid-001', status: DueStatus.PAID, netPayableAmount: 4000n }];
        }
        return [];
      });

      await expect(
        collectionService.recordCollection(
          {
            ticketId: mockTicketId,
            installmentMonth: 3,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
          },
          mockMakerId,
          mockBranchId,
        ),
      ).rejects.toThrow('INSTALLMENT_ALREADY_PAID');

      expect(prismaMock.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('5. UPI Claim Verification 4-Tier DAG Locking (DEF-DB-01)', () => {
    const buildPendingUpiClaim = () => ({
      id: 'upi-claim-001',
      branchId: mockBranchId,
      recordedByUserId: mockMakerId,
      customerId: mockCustomerId,
      amount: 4000n,
      paymentMethod: PaymentMethod.UPI,
      paymentStatus: PaymentStatus.INITIATED,
      transactionRef: 'UTR123456789012',
      notes: 'Customer claim',
      allocations: [
        {
          id: 'alloc-upi-001',
          ticketId: mockTicketId,
          installmentDueId: 'due-uuid-001',
          due: {
            id: 'due-uuid-001',
            installmentMonth: 3,
            netPayableAmount: 4000n,
            status: DueStatus.UNPAID,
          },
          ticket: {
            id: mockTicketId,
            ticketNumber: 5,
            customerId: mockCustomerId,
            customer: { id: mockCustomerId, fullName: 'M. Palanisamy', phone: '9842100005' },
            chitGroup: {
              groupCode: 'KCA-1L-20M-01',
              branchId: mockBranchId,
              branch: { code: 'PRD' },
            },
          },
        },
      ],
    });

    it('should acquire 4-tier locks (Branch -> SubscriberTicket -> InstallmentDue -> Payment) BEFORE generating receipt sequence', async () => {
      const opTrace: string[] = [];
      prismaMock.payment.findUnique.mockResolvedValue(buildPendingUpiClaim());
      prismaMock.receipt.findFirst.mockImplementation(async () => {
        opTrace.push('receipt.findFirst');
        return { receiptNumber: 'KC-REC-PRD-2026-00200' };
      });

      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) {
          opTrace.push('LOCK:Branch');
          return [{ id: mockBranchId }];
        }
        if (sql.includes('"SubscriberTicket"')) {
          opTrace.push('LOCK:SubscriberTicket');
          return [{ id: mockTicketId }];
        }
        if (sql.includes('"InstallmentDue"')) {
          opTrace.push('LOCK:InstallmentDue');
          return [{ id: 'due-uuid-001', status: DueStatus.UNPAID, netPayableAmount: 4000n }];
        }
        if (sql.includes('"Payment"')) {
          opTrace.push('LOCK:Payment');
          return [{ id: 'upi-claim-001', paymentStatus: PaymentStatus.INITIATED }];
        }
        return [];
      });

      const res = await paymentService.verifyUpiClaim(
        'upi-claim-001',
        mockCheckerId,
        [Role.SUPER_ADMIN],
        { verificationNotes: 'Verified' },
      );

      expect(res.receipt.receiptNumber).toBe('KC-REC-PRD-2026-00201');
      expect(opTrace).toEqual([
        'LOCK:Branch',
        'LOCK:SubscriberTicket',
        'LOCK:InstallmentDue',
        'LOCK:Payment',
        'receipt.findFirst',
      ]);
    });

    it('should reject duplicate verification when locked Payment reveals SUCCESS status', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(buildPendingUpiClaim());
      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) return [{ id: mockBranchId }];
        if (sql.includes('"SubscriberTicket"')) return [{ id: mockTicketId }];
        if (sql.includes('"InstallmentDue"')) {
          return [{ id: 'due-uuid-001', status: DueStatus.UNPAID, netPayableAmount: 4000n }];
        }
        if (sql.includes('"Payment"')) {
          return [{ id: 'upi-claim-001', paymentStatus: PaymentStatus.SUCCESS }];
        }
        return [];
      });

      await expect(
        paymentService.verifyUpiClaim('upi-claim-001', mockCheckerId, [Role.SUPER_ADMIN]),
      ).rejects.toThrow('PAYMENT_ALREADY_PROCESSED');

      expect(prismaMock.receipt.create).not.toHaveBeenCalled();
    });

    it('should reject UPI verification when locked InstallmentDue was already paid in cash/field', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(buildPendingUpiClaim());
      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) return [{ id: mockBranchId }];
        if (sql.includes('"SubscriberTicket"')) return [{ id: mockTicketId }];
        if (sql.includes('"InstallmentDue"')) {
          return [{ id: 'due-uuid-001', status: DueStatus.PAID, netPayableAmount: 4000n }];
        }
        if (sql.includes('"Payment"')) {
          return [{ id: 'upi-claim-001', paymentStatus: PaymentStatus.INITIATED }];
        }
        return [];
      });

      await expect(
        paymentService.verifyUpiClaim('upi-claim-001', mockCheckerId, [Role.SUPER_ADMIN]),
      ).rejects.toThrow('INSTALLMENT_ALREADY_PAID');

      expect(prismaMock.receipt.create).not.toHaveBeenCalled();
    });
  });

  describe('6. ReconciliationService 4-Tier DAG Locking & Conflict Fail-Closed (DEF-DB-01)', () => {
    it('should acquire 4-tier locks and fail closed when InstallmentDue was already paid concurrently', async () => {
      const opTrace: string[] = [];
      const ghostPayment = {
        id: 'pay-ghost-001',
        branchId: mockBranchId,
        amount: 4000n,
        paymentMethod: PaymentMethod.UPI,
        paymentStatus: PaymentStatus.INITIATED,
        transactionRef: 'ORDER-CONCURR-001',
        notes: 'Ghost pending',
        allocations: [
          {
            id: 'alloc-1',
            ticketId: mockTicketId,
            installmentDueId: 'due-uuid-001',
            amountAllocated: 4000n,
            due: { id: 'due-uuid-001', installmentMonth: 3 },
            ticket: {
              id: mockTicketId,
              ticketNumber: 5,
              status: 'ACTIVE',
              customer: { fullName: 'M. Palanisamy', phone: '9842100005', fcmToken: null },
              chitGroup: { groupCode: 'KCA-1L-20M-01', branchId: mockBranchId, branch: { code: 'PRD' } },
            },
          },
        ],
      };

      prismaMock.payment.findFirst.mockResolvedValue(ghostPayment);
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-ghost-001',
        paymentStatus: PaymentStatus.INITIATED,
      });

      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) {
          opTrace.push('LOCK:Branch');
          return [{ id: mockBranchId }];
        }
        if (sql.includes('"SubscriberTicket"')) {
          opTrace.push('LOCK:SubscriberTicket');
          return [{ id: mockTicketId }];
        }
        if (sql.includes('"InstallmentDue"')) {
          opTrace.push('LOCK:InstallmentDue');
          return [{ id: 'due-uuid-001', status: DueStatus.PAID, netPayableAmount: 4000n }];
        }
        if (sql.includes('"Payment"')) {
          opTrace.push('LOCK:Payment');
          return [{ id: 'pay-ghost-001', paymentStatus: PaymentStatus.INITIATED }];
        }
        return [];
      });

      const result = await reconciliationService.reconcileSettlement([
        {
          gatewayOrderId: 'ORDER-CONCURR-001',
          gatewayPaymentId: 'gw_pay_001',
          amount: 4000n,
          status: 'SUCCESS',
          settledAt: new Date(),
        },
      ]);

      expect(opTrace).toEqual([
        'LOCK:Branch',
        'LOCK:SubscriberTicket',
        'LOCK:InstallmentDue',
        'LOCK:Payment',
      ]);
      expect(result.autoResolvedGhostDropsCount).toBe(0);
      expect(result.exceptionCount).toBe(1);
      expect(result.details[0]).toContain('CONFLICT_DUE_ALREADY_PAID');
      expect(prismaMock.receipt.create).not.toHaveBeenCalled();
    });
  });

  describe('7. O(1) Numeric Suffix MAX(CAST) Receipt Sequence Path (DEF-DB-01)', () => {
    it('should compute next sequential receipt directly from scalar maxSeq query without invoking findFirst/findUnique loops', async () => {
      prismaMock.$queryRaw.mockImplementation(async (query: any) => {
        const sql = Array.isArray(query) ? query.join('') : String(query);
        if (sql.includes('"Branch"')) return [{ id: mockBranchId }];
        if (sql.includes('"SubscriberTicket"')) return [{ id: mockTicketId }];
        if (sql.includes('"InstallmentDue"')) {
          return [{ id: 'due-uuid-001', status: DueStatus.UNPAID, netPayableAmount: 4000n }];
        }
        if (sql.includes('"Receipt"')) {
          return [{ maxSeq: 415n }];
        }
        return [];
      });

      const result = await collectionService.recordCollection(
        {
          ticketId: mockTicketId,
          installmentMonth: 3,
          amount: 4000,
          paymentMethod: PaymentMethod.CASH,
        },
        mockMakerId,
        mockBranchId,
      );

      expect(result.receiptNumber).toBe('KC-REC-PRD-2026-00416');
      expect(prismaMock.receipt.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.receipt.findUnique).not.toHaveBeenCalled();
    });
  });
});
