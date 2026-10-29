import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuctionStatus } from '@prisma/client';
import { AuctionService } from '../src/auction/auction.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auction State Machine & Lifecycle Exhaustion Tests', () => {
  let auctionService: AuctionService;
  let prismaMock: any;

  const mockChitGroupId = 'chit-group-uuid-001';
  const mockAuctionId = 'auction-uuid-001';
  const mockMakerId = 'staff-maker-uuid-001';
  const mockCheckerId = 'partner-checker-uuid-002';
  const mockTicketId1 = 'ticket-uuid-001';
  const mockTicketId2 = 'ticket-uuid-002';

  const mockChitScheme = {
    id: mockChitGroupId,
    groupCode: 'KCA-1L-20M-01',
    groupName: '₹1 Lakh 20 Months Group A',
    chitValue: 100000n,
    durationMonths: 20,
    totalTickets: 20,
    baseInstallment: 5000n,
    maxDiscountCeiling: 25000n,
    foremanCommissionRate: 4.0,
  };

  const mockActiveTicket = {
    id: mockTicketId1,
    ticketNumber: 3,
    chitGroupId: mockChitGroupId,
    isPrized: false,
    consecutiveUnpaidMonths: 0,
    status: 'ACTIVE',
    customer: { fullName: 'M. Palanisamy', customerCode: 'KC-CUST-00003' },
  };

  const mockActiveTicket2 = {
    id: mockTicketId2,
    ticketNumber: 4,
    chitGroupId: mockChitGroupId,
    isPrized: false,
    consecutiveUnpaidMonths: 0,
    status: 'ACTIVE',
    customer: { fullName: 'S. Ramasamy', customerCode: 'KC-CUST-00004' },
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findUnique: jest.fn().mockResolvedValue(mockChitScheme),
      },
      subscriberTicket: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockTicketId1) return Promise.resolve(mockActiveTicket);
          if (where.id === mockTicketId2) return Promise.resolve(mockActiveTicket2);
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([mockActiveTicket, mockActiveTicket2]),
        update: jest.fn().mockResolvedValue({ id: mockTicketId1, isPrized: true }),
      },
      auction: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockImplementation((args) => ({
          id: mockAuctionId,
          chitGroupId: mockChitGroupId,
          installmentMonth: 5,
          status: AuctionStatus.SCHEDULED,
          ...args.create,
        })),
        update: jest.fn().mockResolvedValue({
          id: mockAuctionId,
          status: AuctionStatus.COMPLETED,
          finalizedByUserId: mockCheckerId,
        }),
      },
      auctionWinner: {
        upsert: jest.fn().mockResolvedValue({ id: 'winner-001' }),
      },
      auctionTieBidder: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn().mockResolvedValue({ id: 'tie-001' }),
      },
      auctionMinutes: {
        upsert: jest.fn().mockResolvedValue({ id: 'min-001' }),
        update: jest.fn().mockResolvedValue({ id: 'min-001', filedAtRegistrar: true }),
      },
      installmentDue: {
        createMany: jest.fn().mockResolvedValue({ count: 20 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
      },
      $transaction: jest.fn(async (callback) => callback(prismaMock)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: mockAuctionId, status: AuctionStatus.SCHEDULED }]),
    };

    auctionService = new AuctionService(prismaMock as unknown as PrismaService, null as any);
  });

  // =========================================================================
  // 1. Negative State Transitions on recordBid
  // =========================================================================
  describe('1. recordBid State Machine Guards', () => {
    it('STATE-INV-1: should strictly REJECT recording a bid if auction is already COMPLETED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.COMPLETED,
      });

      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          5,
          { ticketId: mockTicketId1, bidDiscount: 20000, auctionDate: '2026-10-15' },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.auction.upsert).not.toHaveBeenCalled();
    });

    it('STATE-INV-2: should strictly REJECT recording a bid if auction is already MINUTES_FILED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.MINUTES_FILED,
      });

      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          5,
          { ticketId: mockTicketId1, bidDiscount: 20000, auctionDate: '2026-10-15' },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.auction.upsert).not.toHaveBeenCalled();
    });

    it('STATE-INV-3: should ALLOW recording a bid when auction is SCHEDULED or uninitialized', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);

      const res = await auctionService.recordBid(
        mockChitGroupId,
        5,
        { ticketId: mockTicketId1, bidDiscount: 20000, auctionDate: '2026-10-15' },
        mockMakerId,
      );

      expect(res).toBeDefined();
      expect(prismaMock.auction.upsert).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Negative State Transitions on recordTieBreak
  // =========================================================================
  describe('2. recordTieBreak State Machine Guards', () => {
    const tieBreakPayload = {
      winningTicketId: mockTicketId1,
      bidDiscount: 25000,
      auctionDate: '2026-10-15',
      tiedTickets: [
        { ticketId: mockTicketId1, tokenNumber: 1 },
        { ticketId: mockTicketId2, tokenNumber: 2 },
      ],
    };

    it('STATE-INV-4: should strictly REJECT tie-break draw if auction is already COMPLETED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.COMPLETED,
      });

      await expect(
        auctionService.recordTieBreak(mockChitGroupId, 5, tieBreakPayload, mockMakerId),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.auction.upsert).not.toHaveBeenCalled();
    });

    it('STATE-INV-5: should strictly REJECT tie-break draw if auction is already MINUTES_FILED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.MINUTES_FILED,
      });

      await expect(
        auctionService.recordTieBreak(mockChitGroupId, 5, tieBreakPayload, mockMakerId),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.auction.upsert).not.toHaveBeenCalled();
    });

    it('STATE-INV-6: should ALLOW tie-break draw when auction is in open SCHEDULED state', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.SCHEDULED,
      });

      const res = await auctionService.recordTieBreak(mockChitGroupId, 5, tieBreakPayload, mockMakerId);
      expect(res).toBeDefined();
      expect(prismaMock.auction.upsert).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Negative State Transitions on finalizeAuction
  // =========================================================================
  describe('3. finalizeAuction State Machine Guards', () => {
    it('STATE-INV-7: should strictly REJECT finalization if auction is already COMPLETED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.COMPLETED,
        winner: { id: 'win-1' },
        conductedByUserId: mockMakerId,
      });

      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('STATE-INV-8: should strictly REJECT finalization if auction is already MINUTES_FILED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.MINUTES_FILED,
        winner: { id: 'win-1' },
        conductedByUserId: mockMakerId,
      });

      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('STATE-INV-9: should strictly REJECT finalization if no winner ticket is recorded', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.SCHEDULED,
        winner: null,
        conductedByUserId: mockMakerId,
      });

      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('STATE-INV-10: should enforce Maker != Checker separation of duties', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 5,
        status: AuctionStatus.SCHEDULED,
        winner: { id: 'win-1' },
        conductedByUserId: mockMakerId,
      });

      // Same user attempts to check their own auction entry
      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockMakerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 4. Negative State Transitions on markMinutesFiled
  // =========================================================================
  describe('4. markMinutesFiled State Machine Guards', () => {
    it('STATE-INV-11: should strictly REJECT marking minutes filed if auction is not yet finalized (SCHEDULED)', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.SCHEDULED,
        minutes: { id: 'min-1' },
        chitGroup: mockChitScheme,
      });

      await expect(
        auctionService.markMinutesFiled(mockAuctionId, { filingReference: 'ROC/001' }, mockMakerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('STATE-INV-12: should strictly REJECT marking minutes filed if already MINUTES_FILED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.MINUTES_FILED,
        minutes: { id: 'min-1', filedAtRegistrar: true },
        chitGroup: mockChitScheme,
      });

      await expect(
        auctionService.markMinutesFiled(mockAuctionId, { filingReference: 'ROC/001' }, mockMakerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('STATE-INV-13: should strictly REJECT marking minutes filed if minutes document is missing', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.COMPLETED,
        minutes: null,
        chitGroup: mockChitScheme,
      });

      await expect(
        auctionService.markMinutesFiled(mockAuctionId, { filingReference: 'ROC/001' }, mockMakerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('STATE-INV-14: should ALLOW marking minutes filed when status is COMPLETED and minutes exist', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.COMPLETED,
        minutes: { id: 'min-1', filedAtRegistrar: false },
        chitGroup: mockChitScheme,
      });

      const res = await auctionService.markMinutesFiled(
        mockAuctionId,
        { filingReference: 'ROC/ERD/CHAL-2026-00412', notes: 'Filed in person' },
        mockMakerId,
      );

      expect(res).toBeDefined();
      expect(prismaMock.auctionMinutes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            filedAtRegistrar: true,
            filingReference: 'ROC/ERD/CHAL-2026-00412',
          }),
        }),
      );
    });
  });
});
