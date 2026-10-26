import { BadRequestException } from '@nestjs/common';
import { AuctionStatus, DueStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { AuctionService } from '../src/auction/auction.service';
import { DisbursementService } from '../src/disbursement/disbursement.service';
import { PaymentService } from '../src/payment/payment.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Module 12: High-Concurrency Pessimistic Row Locking (SELECT FOR UPDATE) Tests', () => {
  let paymentService: PaymentService;
  let auctionService: AuctionService;
  let disbursementService: DisbursementService;
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
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation((args) => ({
          id: 'payment-uuid-101',
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
  });

  describe('1. Payment Pessimistic Locking & Zero Double Payment (ADR-07)', () => {
    it('should reject concurrent payment when locked row reveals status is already PAID', async () => {
      // Mock $queryRaw FOR UPDATE returning locked row that was just paid by parallel request
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'due-uuid-001', status: DueStatus.PAID, netPayableAmount: 4000n },
      ]);

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
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'due-uuid-001', status: DueStatus.UNPAID, netPayableAmount: 4000n },
      ]);

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
    it('should reject duplicate auction finalization when locked row reveals COMPLETED status', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: mockAuctionId, status: AuctionStatus.COMPLETED },
      ]);

      await expect(
        auctionService.finalizeAuction(
          mockAuctionId,
          { subscribersPresent: 5, signedByForeman: true },
          mockCheckerId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
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
});
