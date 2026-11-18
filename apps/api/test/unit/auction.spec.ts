import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuctionStatus, ChitStatus, DueStatus, Role } from '@prisma/client';
import { AuctionService } from '../../src/auction/auction.service';
import { parseOptionalPositiveIntQuery } from '../../src/auction/helpers/auction-access.helper';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Module 4: In-Office Offline Auctions & Tie-Breakers Tests', () => {
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
    branchId: 'branch-prd-01',
    groupCode: 'KCA-1L-20M-01',
    groupName: '₹1 Lakh 20 Months Group A',
    chitValue: 100000n,
    durationMonths: 20,
    totalTickets: 20,
    baseInstallment: 5000n,
    maxDiscountCeiling: 25000n, // Exactly V / 4 (25%)
    foremanCommissionRate: 4.0,
    status: ChitStatus.ACTIVE,
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      auction: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      auctionWinner: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auctionTieBidder: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      auctionMinutes: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      installmentDue: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where?.id || 'usr-default', isPartner: true })),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    auctionService = new AuctionService(prismaMock as unknown as PrismaService);
  });

  describe('1. Pre-Auction Defaulter Guard (ADR-07)', () => {
    it('should return only active, non-prized subscribers with zero arrears', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: mockTicketId1,
          ticketNumber: 2,
          isPrized: false,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
          customer: { fullName: 'Muthusamy K', customerCode: 'KC-CUST-00002' },
        },
      ]);

      const eligible = await auctionService.getEligibleBidders(mockChitGroupId, 2);
      expect(eligible).toHaveLength(1);
      expect(prismaMock.subscriberTicket.findMany).toHaveBeenCalledWith({
        where: {
          chitGroupId: mockChitGroupId,
          isPrized: false,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
          dues: {
            none: {
              installmentMonth: { lte: 2 },
              status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
            },
          },
        },
        include: {
          customer: {
            select: {
              id: true,
              customerCode: true,
              fullName: true,
              fullNameTamil: true,
              phone: true,
            },
          },
        },
        orderBy: { ticketNumber: 'asc' },
      });
    });

    it('should reject auction bidding for Month 1 (Company takes full pool, no auction)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);

      await expect(
        auctionService.getEligibleBidders(mockChitGroupId, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject auction bidding for Month N (Month 20 settled directly, no auction)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);

      await expect(
        auctionService.getEligibleBidders(mockChitGroupId, 20),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Fixed 1/4 Discount Ceiling & Minimum Floor Math (ADR-06 & ADR-04)', () => {
    it('should record a valid in-branch auction bid with exact whole-rupee math', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        chitGroupId: mockChitGroupId,
        ticketNumber: 3,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        customer: { fullName: 'Palanisamy V' },
      });

      const upsertedAuction = {
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        bidDiscount: 20000n,
        foremanCommissionAmount: 4000n, // 4% of 100,000
        totalDividend: 16000n,          // 20,000 - 4,000
        dividendPerTicket: 800n,        // 16,000 / 20 tickets
        prizeMoney: 80000n,             // 100,000 - 20,000
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
      };

      prismaMock.auction.upsert.mockResolvedValue(upsertedAuction);
      prismaMock.auctionWinner.upsert.mockResolvedValue({});
      prismaMock.auction.findUnique.mockResolvedValue({
        ...upsertedAuction,
        winner: { ticket: { customer: { fullName: 'Palanisamy V' } } },
      });

      const result = await auctionService.recordBid(
        mockChitGroupId,
        2,
        {
          ticketId: mockTicketId1,
          bidDiscount: 20000,
          auctionDate: '2026-12-15T00:00:00.000Z',
        },
        mockMakerId,
      );

      expect(result).toBeDefined();
      expect(prismaMock.auction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            chitGroupId_installmentMonth: {
              chitGroupId: mockChitGroupId,
              installmentMonth: 2,
            },
          },
          update: expect.objectContaining({
            bidDiscount: 20000n,
            foremanCommissionAmount: 4000n,
            totalDividend: 16000n,
            dividendPerTicket: 800n,
            prizeMoney: 80000n,
            conductedByUserId: mockMakerId,
          }),
        }),
      );
    });

    it('should strictly reject bid discounts exceeding the fixed 1/4 ceiling (D > V / 4)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);

      // Max ceiling for ₹100,000 is ₹25,000. Bid of ₹26,000 must be rejected.
      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          {
            ticketId: mockTicketId1,
            bidDiscount: 26000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should strictly reject bid discounts below the 4.00% Foreman Commission floor (D < 4% of V)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);

      // 4% Commission for ₹100,000 is ₹4,000. Bid of ₹3,500 must be rejected.
      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          {
            ticketId: mockTicketId1,
            bidDiscount: 3500,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('KFC-FIN-002: should strictly reject bid producing non-divisible dividend remainder (e.g. ₹20,005 on 20-ticket group)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        chitGroupId: mockChitGroupId,
        ticketNumber: 3,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        customer: { fullName: 'S. Ramanathan' },
      });

      // (20,005 - 4,000) = 16,005. 16,005 % 20 = 5 != 0 -> Must throw
      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          {
            ticketId: mockTicketId1,
            bidDiscount: 20005,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/NON_DIVISIBLE_DIVIDEND/);
    });

    it('should reject a winning bid if ticket has unpaid arrears (ADR-07)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        chitGroupId: mockChitGroupId,
        ticketNumber: 4,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 1, // Has 1 month unpaid arrears
        customer: { fullName: 'Defaulter Subscriber' },
      });

      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          {
            ticketId: mockTicketId1,
            bidDiscount: 20000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a winning bid if ticket is already prized from a prior auction', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        chitGroupId: mockChitGroupId,
        ticketNumber: 5,
        isPrized: true, // Already prized!
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        customer: { fullName: 'Past Winner' },
      });

      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          3,
          {
            ticketId: mockTicketId1,
            bidDiscount: 20000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Option A: Physical Paper Token Tie-Break Protocol', () => {
    it('should record physical paper token lot draw when multiple members bid ceiling', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: mockTicketId1,
          chitGroupId: mockChitGroupId,
          ticketNumber: 3,
          isPrized: false,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
          customer: { fullName: 'M. Palanisamy' },
        },
        {
          id: mockTicketId2,
          chitGroupId: mockChitGroupId,
          ticketNumber: 4,
          isPrized: false,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
          customer: { fullName: 'S. Ramasamy' },
        },
      ]);

      const tiedAuction = {
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        bidDiscount: 25000n, // Exact 1/4 ceiling
        foremanCommissionAmount: 4000n,
        totalDividend: 21000n,
        dividendPerTicket: 1050n,
        prizeMoney: 75000n,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
      };

      prismaMock.auction.upsert.mockResolvedValue(tiedAuction);
      prismaMock.auctionTieBidder.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.auctionTieBidder.create.mockResolvedValue({});
      prismaMock.auctionWinner.upsert.mockResolvedValue({});
      prismaMock.auction.findUnique.mockResolvedValue({
        ...tiedAuction,
        winner: { ticketId: mockTicketId2, wasTieBreakWinner: true },
        tieBidders: [
          { ticketId: mockTicketId1, tokenNumber: 1, isWinner: false },
          { ticketId: mockTicketId2, tokenNumber: 2, isWinner: true },
        ],
      });

      const result = await auctionService.recordTieBreak(
        mockChitGroupId,
        2,
        {
          tiedTickets: [
            { ticketId: mockTicketId1, tokenNumber: 1 },
            { ticketId: mockTicketId2, tokenNumber: 2 },
          ],
          winningTicketId: mockTicketId2,
          bidDiscount: 25000,
          auctionDate: '2026-12-15T00:00:00.000Z',
        },
        mockMakerId,
      );

      expect(result).toBeDefined();
      expect(prismaMock.auctionTieBidder.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.auctionWinner.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            ticketId: mockTicketId2,
            wasTieBreakWinner: true,
          }),
        }),
      );
    });

    it('should reject tie-break if bid discount is not the exact 1/4 ceiling', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);

      await expect(
        auctionService.recordTieBreak(
          mockChitGroupId,
          2,
          {
            tiedTickets: [
              { ticketId: mockTicketId1, tokenNumber: 1 },
              { ticketId: mockTicketId2, tokenNumber: 2 },
            ],
            winningTicketId: mockTicketId2,
            bidDiscount: 20000, // Not 25,000 ceiling!
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject tie-break if drawn winning ticket is not in the tied list', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);

      await expect(
        auctionService.recordTieBreak(
          mockChitGroupId,
          2,
          {
            tiedTickets: [
              { ticketId: mockTicketId1, tokenNumber: 1 },
              { ticketId: mockTicketId2, tokenNumber: 2 },
            ],
            winningTicketId: 'external-ticket-uuid', // Not in list!
            bidDiscount: 25000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject tie-break when duplicate ticketId entries are submitted (N=2 and N=3)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);

      await expect(
        auctionService.recordTieBreak(
          mockChitGroupId,
          2,
          {
            tiedTickets: [
              { ticketId: mockTicketId1, tokenNumber: 1 },
              { ticketId: mockTicketId1, tokenNumber: 2 },
            ],
            winningTicketId: mockTicketId1,
            bidDiscount: 25000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        auctionService.recordTieBreak(
          mockChitGroupId,
          2,
          {
            tiedTickets: [
              { ticketId: mockTicketId1, tokenNumber: 1 },
              { ticketId: mockTicketId2, tokenNumber: 2 },
              { ticketId: mockTicketId1, tokenNumber: 3 },
            ],
            winningTicketId: mockTicketId2,
            bidDiscount: 25000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.auctionTieBidder.create).not.toHaveBeenCalled();
    });
  });

  describe('4. Maker-Checker Separation of Duties (ADR-08 & Architectural Rule 10)', () => {
    it('should strictly reject auction finalization if maker == checker', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        winner: { ticketId: mockTicketId1, ticket: { customer: { fullName: 'Member A' } } },
      });

      // Same user (mockMakerId) attempts to finalize!
      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockMakerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should finalize auction, update ticket isPrized = true, and generate statutory minutes when maker != checker', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        installmentMonth: 2,
        auctionDate: new Date('2026-12-15T00:00:00.000Z'),
        bidDiscount: 20000n,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId, // Maker is mockMakerId
        chitGroup: { groupName: 'Group A', groupCode: 'KCA-1L-20M-01' },
        winner: {
          ticketId: mockTicketId1,
          ticket: {
            ticketNumber: 3,
            customer: { fullName: 'Ramasamy K', customerCode: 'KC-CUST-00003' },
          },
        },
      });

      prismaMock.auction.update.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.COMPLETED,
        finalizedByUserId: mockCheckerId, // Checker is mockCheckerId
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({});
      prismaMock.auctionMinutes.upsert.mockResolvedValue({});

      const finalized = await auctionService.finalizeAuction(
        mockAuctionId,
        mockCheckerId, // Checker != Maker
        { subscribersPresent: 18, notes: 'Auction conducted peacefully.', signedByForeman: true },
      );

      expect(finalized).toBeDefined();
      expect(prismaMock.auction.update).toHaveBeenCalledWith({
        where: { id: mockAuctionId },
        data: {
          status: AuctionStatus.COMPLETED,
          finalizedByUserId: mockCheckerId,
        },
      });
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith({
        where: { id: mockTicketId1 },
        data: {
          isPrized: true,
          prizedAuctionId: mockAuctionId,
        },
      });
      expect(prismaMock.auctionMinutes.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            subscribersPresent: 18,
            signedByForeman: true,
          }),
        }),
      );
    });

    it('should reject auction finalization when subscribersPresent is missing or less than 1 (KC-02)', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        installmentMonth: 2,
        auctionDate: new Date('2026-12-15T00:00:00.000Z'),
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        winner: { ticketId: mockTicketId1, ticket: { ticketNumber: 3, customer: { fullName: 'Ramasamy' } } },
        chitGroup: { groupName: 'Group A', groupCode: 'KCA-1L-20M-01', baseInstallment: 5000n },
      });

      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId, {} as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId, { subscribersPresent: 0 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enqueue auction result broadcast to notification-queue upon finalization', async () => {
      const mockQueue = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'job-auc-res', status: 'ENQUEUED' }),
      };
      const queuedAuctionService = new AuctionService(
        prismaMock as unknown as PrismaService,
        mockQueue as any,
      );

      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        auctionDate: new Date('2026-12-15T00:00:00.000Z'),
        bidDiscount: 20000n,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        chitGroup: { groupName: 'Group A', groupCode: 'KCA-1L-20M-01', baseInstallment: 5000n },
        winner: {
          ticketId: mockTicketId1,
          ticket: {
            ticketNumber: 3,
            customer: { fullName: 'Ramasamy K', customerCode: 'KC-CUST-00003' },
          },
        },
      });

      prismaMock.auction.update.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.COMPLETED,
        finalizedByUserId: mockCheckerId,
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({});
      prismaMock.auctionMinutes.upsert.mockResolvedValue({});
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          customer: {
            fullName: 'Muthusamy K',
            phone: '9842100002',
            fcmToken: 'fcm-muthu-token',
          },
        },
      ]);

      const finalized = await queuedAuctionService.finalizeAuction(
        mockAuctionId,
        mockCheckerId,
        { subscribersPresent: 14 },
      );

      expect(finalized).toBeDefined();
      expect(mockQueue.addJob).toHaveBeenCalledWith(
        'notification-queue',
        'dispatch-auction-result',
        expect.objectContaining({
          chitGroupId: mockChitGroupId,
          chitCode: 'KCA-1L-20M-01',
          installmentMonth: 2,
          winningTicketNumber: 3,
          winningDiscountAmount: '20000',
          dividendPerTicket: '800',
          nextMonthNetPayable: '4200', // 5000 - 800
          subscribers: [
            {
              name: 'Muthusamy K',
              phone: '9842100002',
              fcmToken: 'fcm-muthu-token',
            },
          ],
        }),
        expect.objectContaining({
          jobId: `auction-result-${mockAuctionId}-m2`,
          priority: 5,
        }),
      );
    });

    it('should not fail auction finalization if queueProvider.addJob throws an error (fire-and-forget resilience)', async () => {
      const mockQueue = {
        addJob: jest.fn().mockRejectedValue(new Error('Redis broker offline')),
      };
      const queuedAuctionService = new AuctionService(
        prismaMock as unknown as PrismaService,
        mockQueue as any,
      );

      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        auctionDate: new Date('2026-12-15T00:00:00.000Z'),
        bidDiscount: 20000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        chitGroup: { groupName: 'Group A', groupCode: 'KCA-1L-20M-01', baseInstallment: 5000n },
        winner: {
          ticketId: mockTicketId1,
          ticket: {
            ticketNumber: 3,
            customer: { fullName: 'Ramasamy K', customerCode: 'KC-CUST-00003' },
          },
        },
      });

      prismaMock.auction.update.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.COMPLETED,
        finalizedByUserId: mockCheckerId,
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({});
      prismaMock.auctionMinutes.upsert.mockResolvedValue({});
      prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

      const finalized = await queuedAuctionService.finalizeAuction(
        mockAuctionId,
        mockCheckerId,
        { subscribersPresent: 14 },
      );

      expect(finalized).toBeDefined();
    });

    it('should proactively invalidate report dashboard and daybook cache upon finalization', async () => {
      const mockRedisClient = {
        del: jest.fn().mockResolvedValue(4),
      };
      const mockRedisProvider = {
        getClient: jest.fn().mockReturnValue(mockRedisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };
      const cachedAuctionService = new AuctionService(
        prismaMock as unknown as PrismaService,
        undefined,
        mockRedisProvider as any,
      );

      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        auctionDate: new Date('2026-12-15T00:00:00.000Z'),
        bidDiscount: 20000n,
        dividendPerTicket: 800n,
        foremanCommissionAmount: 4000n,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        chitGroup: {
          branchId: 'branch-prd-01',
          groupName: 'Group A',
          groupCode: 'KCA-1L-20M-01',
          baseInstallment: 5000n,
        },
        winner: {
          ticketId: mockTicketId1,
          ticket: {
            ticketNumber: 3,
            customer: { fullName: 'Muthusamy K', customerCode: 'KC-CUST-00003' },
          },
        },
      });

      prismaMock.auction.update.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.COMPLETED,
        finalizedByUserId: mockCheckerId,
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({});
      prismaMock.auctionMinutes.upsert.mockResolvedValue({});

      await cachedAuctionService.finalizeAuction(mockAuctionId, mockCheckerId, {
        subscribersPresent: 14,
      });

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        expect.stringContaining('report:daybook:ALL:'),
        expect.stringContaining('report:daybook:ALL_BRANCHES:'),
        'report:dashboard:ALL',
        'report:approvals:ALL',
        expect.stringContaining('report:daybook:branch-prd-01:'),
        'report:dashboard:branch-prd-01',
        'report:approvals:branch-prd-01',
      );
    });
  });

  describe('5. Statutory Auction Minutes & Scheme History', () => {
    it('should retrieve statutory auction minutes proceedings', async () => {
      prismaMock.auctionMinutes.findUnique.mockResolvedValue({
        id: 'minutes-uuid-001',
        auctionId: mockAuctionId,
        subscribersPresent: 15,
        minutesText: 'Statutory proceedings text...',
        signedByForeman: true,
      });

      const minutes = await auctionService.getAuctionMinutes(mockAuctionId);
      expect(minutes.subscribersPresent).toBe(15);
      expect(minutes.signedByForeman).toBe(true);
    });

    it('should throw NotFoundException if minutes do not exist', async () => {
      prismaMock.auctionMinutes.findUnique.mockResolvedValue(null);

      await expect(
        auctionService.getAuctionMinutes(mockAuctionId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return all auctions for a chit group ordered by month', async () => {
      prismaMock.auction.findMany.mockResolvedValue([
        { id: 'auc-m1', installmentMonth: 1, bidDiscount: 0n },
        { id: 'auc-m2', installmentMonth: 2, bidDiscount: 20000n },
      ]);

      const auctions = await auctionService.getGroupAuctions(mockChitGroupId);
      expect(auctions).toHaveLength(2);
      expect(prismaMock.auction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chitGroupId: mockChitGroupId },
          orderBy: { installmentMonth: 'asc' },
        }),
      );
    });
  });

  describe('6. Registrar Filing of Auction Minutes', () => {
    const mockCompletedAuctionWithMinutes = {
      id: mockAuctionId,
      chitGroupId: mockChitGroupId,
      installmentMonth: 2,
      status: AuctionStatus.COMPLETED,
      chitGroup: { groupCode: 'KCA-1L-20M-01' },
      minutes: {
        id: 'minutes-uuid-001',
        auctionId: mockAuctionId,
        subscribersPresent: 18,
        minutesText: 'Statutory proceedings...',
        signedByForeman: true,
        filedAtRegistrar: false,
      },
    };

    it('should throw NotFoundException if auction does not exist', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);

      await expect(
        auctionService.markMinutesFiled(
          'non-existent-auction-id',
          { filingReference: 'DRC/ERD/CHAL-001' },
          mockCheckerId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if auction is not COMPLETED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockCompletedAuctionWithMinutes,
        status: AuctionStatus.SCHEDULED,
      });

      await expect(
        auctionService.markMinutesFiled(
          mockAuctionId,
          { filingReference: 'DRC/ERD/CHAL-001' },
          mockCheckerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if minutes have not been generated', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockCompletedAuctionWithMinutes,
        minutes: null,
      });

      await expect(
        auctionService.markMinutesFiled(
          mockAuctionId,
          { filingReference: 'DRC/ERD/CHAL-001' },
          mockCheckerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should mark minutes as filed at Registrar with challan reference and date', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockCompletedAuctionWithMinutes);
      const filedDate = new Date('2026-10-25T11:00:00.000Z');

      prismaMock.auctionMinutes.update.mockResolvedValue({
        id: 'minutes-uuid-001',
        auctionId: mockAuctionId,
        subscribersPresent: 18,
        minutesText: 'Statutory proceedings...',
        signedByForeman: true,
        filedAtRegistrar: true,
        filedDate,
        filingReference: 'DRC/ERD/CHAL-2026-00412',
        filingNotes: 'Handed over by Partner A at Erode office',
      });

      const result = await auctionService.markMinutesFiled(
        mockAuctionId,
        {
          filingReference: 'DRC/ERD/CHAL-2026-00412',
          filedDate: '2026-10-25T11:00:00.000Z',
          notes: 'Handed over by Partner A at Erode office',
        },
        mockCheckerId,
      );

      expect(prismaMock.auctionMinutes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { auctionId: mockAuctionId },
          data: expect.objectContaining({
            filedAtRegistrar: true,
            filedDate,
            filingReference: 'DRC/ERD/CHAL-2026-00412',
            filingNotes: 'Handed over by Partner A at Erode office',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MINUTES_FILED_AT_REGISTRAR',
            userId: mockCheckerId,
            entityId: 'minutes-uuid-001',
          }),
        }),
      );
      expect(result.message).toBe('Auction minutes marked as filed with Registrar successfully.');
      expect(result.minutes.filedAtRegistrar).toBe(true);
      expect(result.minutes.filingReference).toBe('DRC/ERD/CHAL-2026-00412');
    });
  });

  describe('7. Finalized Auction Correction Workflow (KFC-FIN-005 & Q12)', () => {
    const mockFinalizedAuction = {
      id: mockAuctionId,
      chitGroupId: mockChitGroupId,
      chitGroup: mockChitScheme,
      installmentMonth: 3,
      status: AuctionStatus.COMPLETED,
      bidDiscount: 20000n,
      foremanCommissionAmount: 4000n,
      totalDividend: 16000n,
      dividendPerTicket: 800n,
      prizeMoney: 80000n,
      winner: {
        id: 'winner-001',
        ticketId: mockTicketId1,
        disbursementStatus: 'PENDING_VERIFICATION',
        ticket: { id: mockTicketId1, ticketNumber: 3 },
      },
    };

    it('KFC-FIN-005: should allow Partner A to request auction correction for a finalized auction', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockFinalizedAuction);
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-corr-req-1' });

      const result = await auctionService.requestAuctionCorrection(
        mockAuctionId,
        mockMakerId,
        {
          correctedBidDiscount: 24000,
          reason: 'Corrected bid discount entered incorrectly in branch ledger',
        },
        [Role.SUPER_ADMIN],
      );

      expect(result.success).toBe(true);
      expect(result.correctedMath.bidDiscount).toBe(24000);
      expect(result.correctedMath.foremanCommission).toBe(4000); // 4% of 100,000
      expect(result.correctedMath.dividendPerTicket).toBe(1000); // (24,000 - 4,000) / 20 = 1,000
      expect(result.correctedMath.prizeMoney).toBe(76000); // 100,000 - 24,000
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AUCTION_CORRECTION_REQUESTED',
            userId: mockMakerId,
          }),
        }),
      );
    });

    it('KFC-FIN-005: should strictly reject correction request if prize money has already been disbursed (DISBURSED_PRIZE_IMMUTABLE)', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockFinalizedAuction,
        winner: {
          ...mockFinalizedAuction.winner,
          disbursementStatus: 'DISBURSED', // Already Disbursed!
        },
      });

      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          {
            correctedBidDiscount: 24000,
            reason: 'Attempting correction after payout',
          },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('KFC-FIN-005: should strictly reject correction request with non-divisible dividend remainder (NON_DIVISIBLE_DIVIDEND)', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockFinalizedAuction);

      // 20,005 - 4,000 = 16,005. 16,005 % 20 != 0
      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          {
            correctedBidDiscount: 20005,
            reason: 'Non-divisible bid discount',
          },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('FIN-E: should FAIL CLOSED on requestAuctionCorrection when downstream Month N+1 dues are already PAID', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockFinalizedAuction);
      prismaMock.installmentDue.findMany.mockResolvedValueOnce([
        { id: 'due-m4-paid-1', status: 'PAID', installmentMonth: 4 },
      ]);

      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          {
            correctedBidDiscount: 24000,
            reason: 'Correction attempt after subscribers paid Month 4',
          },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'ALREADY_PAID_DUES_EXIST: Cannot request correction for Month 3 auction because 1 subscriber(s) have already paid dues for Month 4. Correction would invalidate settled financial history.',
        ),
      );
    });

    it('SEC-A: should reject non-partner Super Admin on finalizeAuction', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'non-partner-admin', isPartner: false });
      await expect(
        auctionService.finalizeAuction(
          mockAuctionId,
          'non-partner-admin',
          undefined,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to finalize and commit auctions.',
        ),
      );
    });

    it('KFC-FIN-005: should ENFORCE Maker != Checker: reject approval if requesting Partner attempts to approve own correction', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockFinalizedAuction);
      prismaMock.auditLog.findFirst.mockResolvedValue({
        id: 'audit-corr-req-1',
        userId: mockMakerId, // Requested by Partner A
        newValue: {
          correctedBidDiscount: '24000',
          correctedWinningTicketId: mockTicketId1,
        },
      });

      // Partner A attempts to approve own correction (Violation!)
      await expect(
        auctionService.approveAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          { notes: 'Self-approval attempt' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('KFC-FIN-005: should allow independent Partner B to approve auction correction, updating dividends and reconciling downstream dues', async () => {
      prismaMock.auditLog.findFirst.mockResolvedValue({
        id: 'audit-corr-req-1',
        userId: mockMakerId, // Requested by Partner A
        newValue: {
          correctedBidDiscount: '24000',
          correctedWinningTicketId: mockTicketId1,
        },
      });
      prismaMock.auction.findUnique.mockResolvedValue(mockFinalizedAuction);
      prismaMock.auction.update.mockResolvedValue({
        ...mockFinalizedAuction,
        bidDiscount: 24000n,
        foremanCommissionAmount: 4000n,
        totalDividend: 20000n,
        dividendPerTicket: 1000n,
        prizeMoney: 76000n,
      });
      prismaMock.installmentDue.findMany
        .mockResolvedValueOnce([]) // Check for already paid downstream dues -> 0 found
        .mockResolvedValueOnce([   // Downstream unpaid dues to adjust
          { id: 'due-m4-t1', grossAmount: 5000n, dividendDeduction: 800n, netPayableAmount: 4200n },
        ]);
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-corr-app-1' });

      const result = await auctionService.approveAuctionCorrection(
        mockAuctionId,
        mockCheckerId, // Independent Partner B approves
        { notes: 'Approved after verifying branch register' },
        [Role.SUPER_ADMIN],
      );

      expect(result.success).toBe(true);
      expect(prismaMock.auction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockAuctionId },
          data: expect.objectContaining({
            bidDiscount: 24000n,
            dividendPerTicket: 1000n,
            prizeMoney: 76000n,
          }),
        }),
      );
      expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'due-m4-t1' },
          data: expect.objectContaining({
            dividendDeduction: 1000n,
            netPayableAmount: 4000n, // 5000 - 1000
          }),
        }),
      );
    });
  });

  describe('8. Module 6 Forensic Audit Remediation Proofs (DEF-AUC-01 .. DEF-AUC-09)', () => {
    const mockFinalizedAuction = {
      id: mockAuctionId,
      chitGroupId: mockChitGroupId,
      chitGroup: mockChitScheme,
      installmentMonth: 3,
      auctionDate: new Date('2026-12-15T00:00:00.000Z'),
      status: AuctionStatus.COMPLETED,
      bidDiscount: 20000n,
      foremanCommissionRate: 4.0,
      foremanCommissionAmount: 4000n,
      totalDividend: 16000n,
      dividendPerTicket: 800n,
      prizeMoney: 80000n,
      winner: {
        id: 'winner-001',
        ticketId: mockTicketId1,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        ticket: {
          id: mockTicketId1,
          chitGroupId: mockChitGroupId,
          ticketNumber: 3,
          status: 'ACTIVE',
          isPrized: true,
          consecutiveUnpaidMonths: 0,
          customer: { fullName: 'M. Palanisamy' },
        },
      },
      minutes: {
        id: 'min-001',
        auctionId: mockAuctionId,
        subscribersPresent: 16,
        minutesText: 'Old proceedings...',
      },
    };

    it('DEF-AUC-01: uses frozen per-group foremanCommissionRate (e.g. 5.00%) instead of hardcoded 4.00%', async () => {
      const customRateScheme = {
        ...mockChitScheme,
        foremanCommissionRate: 5.0, // Frozen at 5.00% -> ₹5,000 commission on ₹1,00,000
      };
      prismaMock.chitGroup.findUnique.mockResolvedValue(customRateScheme);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        chitGroupId: mockChitGroupId,
        ticketNumber: 3,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        customer: { fullName: 'Palanisamy V' },
      });

      // Bid ₹4,500 is >= 4% (₹4,000) but BELOW frozen 5% (₹5,000) -> MUST be rejected!
      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          { ticketId: mockTicketId1, bidDiscount: 4500, auctionDate: '2026-12-15T00:00:00.000Z' },
          mockMakerId,
        ),
      ).rejects.toThrow(/5\.00% Foreman Commission/);

      // Bid ₹25,000 -> 5% commission = ₹5,000, totalDiv = ₹20,000, divPerTicket = ₹1,000
      prismaMock.auction.upsert.mockResolvedValue({ id: mockAuctionId });
      prismaMock.auctionWinner.upsert.mockResolvedValue({});
      prismaMock.auction.findUnique.mockResolvedValue({ id: mockAuctionId });

      await auctionService.recordBid(
        mockChitGroupId,
        2,
        { ticketId: mockTicketId1, bidDiscount: 25000, auctionDate: '2026-12-15T00:00:00.000Z' },
        mockMakerId,
      );

      expect(prismaMock.auction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            foremanCommissionAmount: 5000n,
            totalDividend: 20000n,
            dividendPerTicket: 1000n,
            prizeMoney: 75000n,
          }),
        }),
      );
    });

    it('DEF-AUC-02: recordTieBreak strictly rejects Month 1, Month N, non-ACTIVE scheme, prized tickets, and unpaid dues', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      const validDto = {
        tiedTickets: [
          { ticketId: mockTicketId1, tokenNumber: 1 },
          { ticketId: mockTicketId2, tokenNumber: 2 },
        ],
        winningTicketId: mockTicketId2,
        bidDiscount: 25000,
        auctionDate: '2026-12-15T00:00:00.000Z',
        witnessNames: ['K. Murugan'],
      };

      // Guardrail 5: Month 1 & Month N rejected
      await expect(
        auctionService.recordTieBreak(mockChitGroupId, 1, validDto, mockMakerId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        auctionService.recordTieBreak(mockChitGroupId, 20, validDto, mockMakerId),
      ).rejects.toThrow(BadRequestException);

      // Non-ACTIVE chit scheme rejected
      prismaMock.chitGroup.findUnique.mockResolvedValueOnce({
        ...mockChitScheme,
        status: ChitStatus.DRAFT,
      });
      await expect(
        auctionService.recordTieBreak(mockChitGroupId, 2, validDto, mockMakerId),
      ).rejects.toThrow(/must be ACTIVE/);

      // Already prized tied ticket rejected
      prismaMock.subscriberTicket.findMany.mockResolvedValueOnce([
        {
          id: mockTicketId1,
          chitGroupId: mockChitGroupId,
          ticketNumber: 3,
          isPrized: true,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
        },
        {
          id: mockTicketId2,
          chitGroupId: mockChitGroupId,
          ticketNumber: 4,
          isPrized: false,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
        },
      ]);
      await expect(
        auctionService.recordTieBreak(mockChitGroupId, 2, validDto, mockMakerId),
      ).rejects.toThrow(/TICKET_ALREADY_PRIZED/);

      // Tied ticket with UNPAID current/prior month due (even when consecutiveUnpaidMonths === 0) rejected
      prismaMock.subscriberTicket.findMany.mockResolvedValueOnce([
        {
          id: mockTicketId1,
          chitGroupId: mockChitGroupId,
          ticketNumber: 3,
          isPrized: false,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
          customer: { fullName: 'Unpaid Member' },
        },
        {
          id: mockTicketId2,
          chitGroupId: mockChitGroupId,
          ticketNumber: 4,
          isPrized: false,
          status: 'ACTIVE',
          consecutiveUnpaidMonths: 0,
          customer: { fullName: 'Paid Member' },
        },
      ]);
      prismaMock.installmentDue.findFirst.mockResolvedValueOnce({
        id: 'due-m1-unpaid',
        installmentMonth: 1,
        status: DueStatus.UNPAID,
      });
      await expect(
        auctionService.recordTieBreak(mockChitGroupId, 2, validDto, mockMakerId),
      ).rejects.toThrow(/ADR-07 Violation/);
    });

    it('DEF-AUC-03: recordBid & finalizeAuction block subscriber with UNPAID InstallmentDue (<= month) even when consecutiveUnpaidMonths === 0', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        chitGroupId: mockChitGroupId,
        ticketNumber: 13,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        customer: { fullName: 'Unpaid Month 1 Subscriber' },
      });
      prismaMock.installmentDue.findFirst.mockResolvedValueOnce({
        id: 'due-m1-13',
        installmentMonth: 1,
        status: DueStatus.UNPAID,
      });

      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          { ticketId: mockTicketId1, bidDiscount: 20000, auctionDate: '2026-12-15T00:00:00.000Z' },
          mockMakerId,
        ),
      ).rejects.toThrow(/ADR-07 Violation/);

      // TOCTOU in finalizeAuction: payment reversed after recordBid -> due now OVERDUE
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        auctionDate: new Date('2026-12-15T00:00:00.000Z'),
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        chitGroup: mockChitScheme,
        winner: {
          ticketId: mockTicketId1,
          ticket: {
            id: mockTicketId1,
            chitGroupId: mockChitGroupId,
            ticketNumber: 13,
            isPrized: false,
            status: 'ACTIVE',
            consecutiveUnpaidMonths: 0,
            customer: { fullName: 'Unpaid Subscriber' },
          },
        },
      });
      prismaMock.installmentDue.findFirst.mockResolvedValueOnce({
        id: 'due-m2-13',
        installmentMonth: 2,
        status: DueStatus.OVERDUE,
      });

      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId, { subscribersPresent: 14 }),
      ).rejects.toThrow(/ADR-07 Violation/);
    });

    it('DEF-AUC-04: markMinutesFiled atomically transitions Auction.status to MINUTES_FILED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        status: AuctionStatus.COMPLETED,
        chitGroup: mockChitScheme,
        minutes: { id: 'min-1', filedAtRegistrar: false },
      });
      prismaMock.auctionMinutes.update.mockResolvedValue({
        id: 'min-1',
        filedAtRegistrar: true,
        filingReference: 'ROC-2026-001',
      });

      await auctionService.markMinutesFiled(
        mockAuctionId,
        { filingReference: 'ROC-2026-001' },
        mockCheckerId,
      );

      expect(prismaMock.auction.update).toHaveBeenCalledWith({
        where: { id: mockAuctionId },
        data: { status: AuctionStatus.MINUTES_FILED },
      });
    });

    it('DEF-AUC-05: fail-closed isPartner blocks missing/null user record AND non-partner IT Super Admin as Maker', async () => {
      // Null user on finalizeAuction MUST fail closed (not fall through!)
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        auctionService.finalizeAuction(
          mockAuctionId,
          'deleted-user-id',
          { subscribersPresent: 12 },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/);

      // Deactivated partner (isPartner: true, isActive: false) MUST fail closed
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'deactivated-partner',
        isPartner: true,
        isActive: false,
      });
      await expect(
        auctionService.finalizeAuction(
          mockAuctionId,
          'deactivated-partner',
          { subscribersPresent: 12 },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/);

      // Non-partner IT SUPER_ADMIN (without BRANCH_MANAGER) attempting recordBid MUST fail closed
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'it-admin', isPartner: false });
      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          { ticketId: mockTicketId1, bidDiscount: 20000, auctionDate: '2026-12-15T00:00:00.000Z' },
          'it-admin',
          { sub: 'it-admin', phone: '9999999999', roles: [Role.SUPER_ADMIN], branchId: 'branch-prd-01' } as any,
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/);
    });

    it('DEF-AUC-06: correction workflow rejects >25% ceiling, <4% floor (negative dividend), Month 1/N, defaulter ticket, and replay double-approval, and resets AUTHORIZED_BY_CHECKER on discount change', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockFinalizedAuction);

      // 1. Over 1/4 ceiling (₹30,000 > ₹25,000) rejected
      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          { correctedBidDiscount: 30000, reason: 'Over ceiling test' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/exceeds maximum allowable 1\/4 ceiling/);

      // 2. Below 4% commission floor (₹2,000 < ₹4,000 -> negative dividend!) rejected
      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          { correctedBidDiscount: 2000, reason: 'Negative dividend test' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/Foreman Commission/);

      // 3. Month 1 correction rejected (Guardrail 5)
      prismaMock.auction.findUnique.mockResolvedValueOnce({
        ...mockFinalizedAuction,
        installmentMonth: 1,
      });
      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          { correctedBidDiscount: 24000, reason: 'Month 1 attempt' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/Guardrail 5 Violation/);

      // 4. Replay / double-approval blocked inside approveAuctionCorrection
      const reqTimestamp = new Date('2026-11-18T10:00:00.000Z');
      prismaMock.auditLog.findFirst
        .mockResolvedValueOnce({
          id: 'corr-req-1',
          userId: mockMakerId,
          timestamp: reqTimestamp,
          newValue: { correctedBidDiscount: '24000', correctedWinningTicketId: mockTicketId1 },
        })
        .mockResolvedValueOnce({
          id: 'corr-app-1',
          action: 'AUCTION_CORRECTION_APPROVED',
          timestamp: new Date('2026-11-18T10:05:00.000Z'),
          newValue: { correctionRequestId: 'corr-req-1' },
        });
      await expect(
        auctionService.approveAuctionCorrection(
          mockAuctionId,
          mockCheckerId,
          { notes: 'Replay attempt' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/NO_PENDING_CORRECTION/);

      // 5. Same-winner discount change resets AUTHORIZED_BY_CHECKER -> VERIFIED_BY_MAKER & updates minutesText
      prismaMock.auditLog.findFirst
        .mockResolvedValueOnce({
          id: 'corr-req-2',
          userId: mockMakerId,
          timestamp: new Date('2026-11-18T11:00:00.000Z'),
          newValue: {
            correctedBidDiscount: '24000',
            correctedWinningTicketId: mockTicketId1,
            reason: 'Ledger typo',
          },
        })
        .mockResolvedValueOnce(null); // No prior approval
      prismaMock.auction.update.mockResolvedValue({ ...mockFinalizedAuction, bidDiscount: 24000n });
      prismaMock.installmentDue.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prismaMock.auctionMinutes.update.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({ id: 'corr-app-2' });

      await auctionService.approveAuctionCorrection(
        mockAuctionId,
        mockCheckerId,
        { notes: 'Verified' },
        [Role.SUPER_ADMIN],
      );

      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith({
        where: { id: 'winner-001' },
        data: {
          disbursedAmount: null,
          disbursementMode: null,
          authorizedByUserId: null,
          disbursementStatus: 'VERIFIED_BY_MAKER',
        },
      });
      expect(prismaMock.auctionMinutes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { auctionId: mockAuctionId },
          data: expect.objectContaining({
            minutesText: expect.stringContaining('Winning Bid Discount: ₹24000'),
          }),
        }),
      );
    });

    it('DEF-AUC-06B: approveAuctionCorrection acquires SELECT FOR UPDATE locks in strict DAG order including Month N+1 InstallmentDue before FIN-E check', async () => {
      const lockOrder: string[] = [];
      prismaMock.$queryRaw = jest.fn().mockImplementation(async (q: any) => {
        const sql = Array.isArray(q) ? q.join('') : String(q);
        if (sql.includes('"ChitGroup"')) {
          lockOrder.push('ChitGroup');
          return [{ id: mockChitGroupId, status: ChitStatus.ACTIVE }];
        }
        if (sql.includes('"AuctionWinner"')) {
          lockOrder.push('AuctionWinner');
          return [{ id: 'winner-001', disbursementStatus: 'VERIFIED_BY_MAKER' }];
        }
        if (sql.includes('"Auction"')) {
          lockOrder.push('Auction');
          return [{ id: mockAuctionId, status: AuctionStatus.COMPLETED }];
        }
        if (sql.includes('"SubscriberTicket"')) {
          lockOrder.push('SubscriberTicket');
          return [{ id: mockTicketId1, status: 'ACTIVE', isPrized: true }];
        }
        if (sql.includes('"InstallmentDue"')) {
          lockOrder.push('InstallmentDue');
          return [{ id: 'due-m4-t1' }];
        }
        return [];
      });

      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockFinalizedAuction,
        winner: {
          ...mockFinalizedAuction.winner,
          disbursementStatus: 'VERIFIED_BY_MAKER',
        },
      });
      prismaMock.auditLog.findFirst
        .mockResolvedValueOnce({
          id: 'corr-req-lock-1',
          userId: mockMakerId,
          timestamp: new Date('2026-11-18T11:00:00.000Z'),
          newValue: {
            correctedBidDiscount: '24000',
            correctedWinningTicketId: mockTicketId1,
            reason: 'TOCTOU lock order check',
          },
        })
        .mockResolvedValueOnce(null);
      prismaMock.auction.update.mockResolvedValue({ ...mockFinalizedAuction, bidDiscount: 24000n });
      prismaMock.installmentDue.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { id: 'due-m4-t1', grossAmount: 5000n, dividendDeduction: 800n, netPayableAmount: 4200n },
      ]);
      prismaMock.installmentDue.update.mockResolvedValue({});
      prismaMock.auctionMinutes.update.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({ id: 'corr-app-lock-1' });

      await auctionService.approveAuctionCorrection(
        mockAuctionId,
        mockCheckerId,
        { notes: 'Lock order verified' },
        [Role.SUPER_ADMIN],
      );

      expect(lockOrder).toEqual([
        'ChitGroup',
        'Auction',
        'AuctionWinner',
        'SubscriberTicket',
        'InstallmentDue',
      ]);
    });

    it('DEF-AUC-07: enforces Anti-BOLA cross-branch isolation for BRANCH_MANAGER across auction endpoints', async () => {
      const otherBranchManager = {
        sub: 'bm-branch-2',
        phone: '9876540002',
        roles: [Role.BRANCH_MANAGER],
        branchId: 'branch-erode-02',
      } as any;

      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme); // branch-prd-01

      await expect(
        auctionService.getEligibleBidders(mockChitGroupId, 2, otherBranchManager),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        auctionService.recordBid(
          mockChitGroupId,
          2,
          { ticketId: mockTicketId1, bidDiscount: 20000, auctionDate: '2026-12-15T00:00:00.000Z' },
          otherBranchManager.sub,
          otherBranchManager,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        auctionService.recordTieBreak(
          mockChitGroupId,
          2,
          {
            tiedTickets: [
              { ticketId: mockTicketId1, tokenNumber: 1 },
              { ticketId: mockTicketId2, tokenNumber: 2 },
            ],
            winningTicketId: mockTicketId2,
            bidDiscount: 25000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          otherBranchManager.sub,
          otherBranchManager,
        ),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.auctionMinutes.findUnique.mockResolvedValue({
        id: 'min-1',
        auction: { chitGroup: mockChitScheme },
      });
      await expect(
        auctionService.getAuctionMinutes(mockAuctionId, otherBranchManager),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        status: AuctionStatus.COMPLETED,
        chitGroup: mockChitScheme,
        minutes: { id: 'min-1', filedAtRegistrar: false },
      });
      await expect(
        auctionService.markMinutesFiled(
          mockAuctionId,
          { filingReference: 'ROC-X' },
          otherBranchManager.sub,
          otherBranchManager,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DEF-AUC-09: parseOptionalPositiveIntQuery rejects malformed month query strings fail-closed', () => {
      expect(parseOptionalPositiveIntQuery(undefined)).toBeUndefined();
      expect(parseOptionalPositiveIntQuery('2')).toBe(2);
      expect(() => parseOptionalPositiveIntQuery('2.5')).toThrow(BadRequestException);
      expect(() => parseOptionalPositiveIntQuery('abc')).toThrow(BadRequestException);
      expect(() => parseOptionalPositiveIntQuery('2abc')).toThrow(BadRequestException);
      expect(() => parseOptionalPositiveIntQuery('-1')).toThrow(BadRequestException);
      expect(() => parseOptionalPositiveIntQuery('0')).toThrow(BadRequestException);
    });
  });

  describe('9. Round-3 Forensic Cross-Review Remediation Proofs (XR-AUC-01 .. XR-AUC-08 & XR-WM-02)', () => {
    const baseFinalizedAuction = {
      id: mockAuctionId,
      chitGroupId: mockChitGroupId,
      chitGroup: mockChitScheme,
      installmentMonth: 3,
      auctionDate: new Date('2026-12-15T00:00:00.000Z'),
      status: AuctionStatus.MINUTES_FILED,
      bidDiscount: 20000n,
      foremanCommissionRate: 4.0,
      foremanCommissionAmount: 4000n,
      totalDividend: 16000n,
      dividendPerTicket: 800n,
      prizeMoney: 80000n,
      winner: {
        id: 'winner-001',
        auctionId: mockAuctionId,
        ticketId: mockTicketId1,
        wasTieBreakWinner: true,
        isSecurityRequired: true,
        securityType: 'BLANK_CHEQUE',
        blankChequeDetails: 'KVB #998811 A/C Old Winner',
        agreementSigned: true,
        nomineeSigned: true,
        securityDocS3Key: 'safety-proof/auction-uuid-001/old-winner-cheque.pdf',
        paymentReference: 'PRE-REF-01',
        verifiedByUserId: mockMakerId,
        authorizedByUserId: mockCheckerId,
        disbursedAmount: 80000n,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        ticket: {
          id: mockTicketId1,
          chitGroupId: mockChitGroupId,
          ticketNumber: 3,
          customerId: 'cust-001',
          status: 'ACTIVE',
          isPrized: true,
          consecutiveUnpaidMonths: 0,
          customer: { id: 'cust-001', fullName: 'Old Winner', phone: '9842100001' },
        },
      },
      tieBidders: [
        { id: 'tb-1', ticketId: mockTicketId1, isWinner: true, tokenNumber: 1 },
        { id: 'tb-2', ticketId: mockTicketId2, isWinner: false, tokenNumber: 2 },
      ],
      minutes: {
        id: 'min-001',
        auctionId: mockAuctionId,
        subscribersPresent: 16,
        minutesText: 'Old proceedings...',
        filedAtRegistrar: true,
        filedDate: new Date('2026-12-20T00:00:00.000Z'),
        filingReference: 'ROC-OLD-001',
        filingNotes: 'Previously filed',
      },
    };

    it('XR-AUC-01: recordBid & recordTieBreak wipe stale safety proof/collateral fields when replacing an existing SCHEDULED winner with a different ticket', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId2,
        chitGroupId: mockChitGroupId,
        ticketNumber: 4,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
      });
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        status: AuctionStatus.SCHEDULED,
        winner: { id: 'winner-001', ticketId: mockTicketId1 },
      });
      prismaMock.auction.upsert.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        status: AuctionStatus.SCHEDULED,
      });

      await auctionService.recordBid(
        mockChitGroupId,
        2,
        { ticketId: mockTicketId2, bidDiscount: 20000, auctionDate: '2026-12-15T00:00:00.000Z' },
        mockMakerId,
      );

      expect(prismaMock.auctionWinner.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            ticketId: mockTicketId2,
            wasTieBreakWinner: false,
            isSecurityRequired: false,
            securityType: null,
            blankChequeDetails: null,
            agreementSigned: false,
            nomineeSigned: false,
            securityDocS3Key: null,
            paymentReference: null,
            disbursedAt: null,
            disbursedAmount: null,
            disbursementMode: null,
            verifiedByUserId: null,
            authorizedByUserId: null,
            disbursementStatus: 'PENDING_VERIFICATION',
          }),
        }),
      );

      prismaMock.auctionWinner.upsert.mockClear();
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        { id: mockTicketId1, chitGroupId: mockChitGroupId, ticketNumber: 3, isPrized: false, status: 'ACTIVE', consecutiveUnpaidMonths: 0 },
        { id: mockTicketId2, chitGroupId: mockChitGroupId, ticketNumber: 4, isPrized: false, status: 'ACTIVE', consecutiveUnpaidMonths: 0 },
      ]);
      prismaMock.auction.findUnique.mockResolvedValue({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 2,
        status: AuctionStatus.SCHEDULED,
        winner: { id: 'winner-001', ticketId: mockTicketId1 },
      });

      await auctionService.recordTieBreak(
        mockChitGroupId,
        2,
        {
          tiedTickets: [
            { ticketId: mockTicketId1, tokenNumber: 1 },
            { ticketId: mockTicketId2, tokenNumber: 2 },
          ],
          winningTicketId: mockTicketId2,
          bidDiscount: 25000,
          auctionDate: '2026-12-15T00:00:00.000Z',
        },
        mockMakerId,
      );

      expect(prismaMock.auctionWinner.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            ticketId: mockTicketId2,
            wasTieBreakWinner: true,
            isSecurityRequired: false,
            securityType: null,
            blankChequeDetails: null,
            agreementSigned: false,
            nomineeSigned: false,
            securityDocS3Key: null,
            paymentReference: null,
            disbursedAt: null,
            disbursedAmount: null,
            disbursementMode: null,
            verifiedByUserId: null,
            authorizedByUserId: null,
            disbursementStatus: 'PENDING_VERIFICATION',
          }),
        }),
      );
    });

    it('XR-AUC-01 & XR-AUC-03: approveAuctionCorrection clears ALL safety proof/collateral fields on winner swap, resyncs tieBidders, and resets MINUTES_FILED -> COMPLETED + filedAtRegistrar=false', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(baseFinalizedAuction);
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId2,
        chitGroupId: mockChitGroupId,
        ticketNumber: 4,
        isPrized: false,
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        customer: { fullName: 'New Winner' },
      });
      prismaMock.auditLog.findFirst
        .mockResolvedValueOnce({
          id: 'corr-req-swap-1',
          userId: mockMakerId,
          timestamp: new Date('2026-12-21T10:00:00.000Z'),
          oldValue: { ticketId: mockTicketId1 },
          newValue: {
            correctedBidDiscount: '24000',
            correctedWinningTicketId: mockTicketId2,
            correctedTicketNumber: 4,
            reason: 'Wrong token number transcribed',
          },
        })
        .mockResolvedValueOnce(null);
      prismaMock.auction.update.mockResolvedValue({
        ...baseFinalizedAuction,
        status: AuctionStatus.COMPLETED,
        bidDiscount: 24000n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prismaMock.auctionMinutes.update.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({ id: 'corr-app-swap-1' });

      await auctionService.approveAuctionCorrection(
        mockAuctionId,
        mockCheckerId,
        { notes: 'Swapped cleanly' },
        [Role.SUPER_ADMIN],
      );

      // XR-AUC-01: ALL safety proof & collateral fields MUST be wiped on winner swap
      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith({
        where: { id: 'winner-001' },
        data: expect.objectContaining({
          ticketId: mockTicketId2,
          wasTieBreakWinner: true,
          isSecurityRequired: false,
          securityType: null,
          blankChequeDetails: null,
          agreementSigned: false,
          nomineeSigned: false,
          securityDocS3Key: null,
          paymentReference: null,
          disbursedAt: null,
          disbursedAmount: null,
          disbursementMode: null,
          verifiedByUserId: null,
          authorizedByUserId: null,
          disbursementStatus: 'PENDING_VERIFICATION',
        }),
      });
      expect(prismaMock.auctionTieBidder.updateMany).toHaveBeenCalledWith({
        where: { auctionId: mockAuctionId },
        data: { isWinner: false },
      });
      expect(prismaMock.auctionTieBidder.updateMany).toHaveBeenCalledWith({
        where: { auctionId: mockAuctionId, ticketId: mockTicketId2 },
        data: { isWinner: true },
      });

      // XR-AUC-03: MINUTES_FILED reset to COMPLETED & filedAtRegistrar reset to false
      expect(prismaMock.auction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AuctionStatus.COMPLETED }),
        }),
      );
      expect(prismaMock.auctionMinutes.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            filedAtRegistrar: false,
            filedDate: null,
            filingReference: null,
            filingNotes: null,
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AUCTION_CORRECTION_APPROVED',
            oldValue: expect.objectContaining({
              previousAuctionStatus: AuctionStatus.MINUTES_FILED,
              previousFilingReference: 'ROC-OLD-001',
            }),
          }),
        }),
      );
    });

    it('XR-AUC-03: requestAuctionCorrection & approveAuctionCorrection reject COMPLETED/CLOSED chit schemes', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...baseFinalizedAuction,
        chitGroup: { ...mockChitScheme, status: ChitStatus.CLOSED },
      });

      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          { correctedBidDiscount: 24000, reason: 'Attempt on closed scheme' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/must be ACTIVE/);

      await expect(
        auctionService.approveAuctionCorrection(
          mockAuctionId,
          mockCheckerId,
          { notes: 'Attempt on closed scheme' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/must be ACTIVE/);
    });

    it('XR-AUC-02 & XR-WM-02: pure Role.CUSTOMER gets minutes=null, pendingCorrection=null, and zero fellow-winner collateral/PII; staff receives pendingCorrection', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(baseFinalizedAuction);
      prismaMock.subscriberTicket.findFirst.mockResolvedValue({ id: mockTicketId2 });

      const otherCustomer = {
        sub: 'cust-002',
        phone: '9842100002',
        roles: [Role.CUSTOMER],
      } as any;

      const customerView: any = await auctionService.findOne(mockAuctionId, otherCustomer);
      expect(customerView.minutes).toBeNull();
      expect(customerView.pendingCorrection).toBeNull();
      expect(customerView.winner.ticket.customer.phone).toBe('+91 ******0000');
      expect(customerView.winner.blankChequeDetails).toBeUndefined();
      expect(customerView.winner.securityDocS3Key).toBeUndefined();
      expect(customerView.winner.paymentReference).toBeUndefined();
      expect(customerView.winner.disbursedAmount).toBeUndefined();
      expect(customerView.winner.verifiedByUserId).toBeUndefined();
      expect(customerView.winner.authorizedByUserId).toBeUndefined();

      // getGroupAuctions also strips minutes and fellow-winner collateral for Customer
      prismaMock.auction.findMany.mockResolvedValue([baseFinalizedAuction]);
      const groupList: any = await auctionService.getGroupAuctions(mockChitGroupId, otherCustomer);
      expect(groupList[0].minutes).toBeNull();
      expect(groupList[0].winner.blankChequeDetails).toBeUndefined();
      expect(groupList[0].winner.securityDocS3Key).toBeUndefined();

      // Staff receives pendingCorrection metadata for Maker != Checker UI hydration (XR-WM-02)
      const reqTs = new Date('2026-12-22T09:00:00.000Z');
      prismaMock.auditLog.findFirst
        .mockResolvedValueOnce({
          id: 'corr-req-ui-1',
          userId: mockMakerId,
          timestamp: reqTs,
          newValue: {
            correctedBidDiscount: '24000',
            correctedWinningTicketId: mockTicketId2,
            correctedTicketNumber: 4,
            reason: 'Token correction',
            notes: 'Per register',
          },
        })
        .mockResolvedValueOnce(null);

      const staffView: any = await auctionService.findOne(mockAuctionId, {
        sub: mockCheckerId,
        phone: '9876543211',
        roles: [Role.SUPER_ADMIN],
      } as any);
      expect(staffView.pendingCorrection).toEqual({
        requestId: 'corr-req-ui-1',
        requestedByUserId: mockMakerId,
        correctedBidDiscount: 24000,
        correctedWinningTicketId: mockTicketId2,
        correctedTicketNumber: 4,
        reason: 'Token correction',
        notes: 'Per register',
        requestedAt: reqTs.toISOString(),
      });
    });

    it('XR-AUC-04: recordTieBreak strictly rejects duplicate physical paper token numbers', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitScheme);
      await expect(
        auctionService.recordTieBreak(
          mockChitGroupId,
          2,
          {
            tiedTickets: [
              { ticketId: mockTicketId1, tokenNumber: 2 },
              { ticketId: mockTicketId2, tokenNumber: 2 },
            ],
            winningTicketId: mockTicketId1,
            bidDiscount: 25000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/DUPLICATE_TOKEN_NUMBER/);
    });

    it('XR-AUC-05: markMinutesFiled rejects non-partner IT Super Admin (isPartner: false) fail-closed', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'it-admin',
        isPartner: false,
        isActive: true,
      });

      await expect(
        auctionService.markMinutesFiled(
          mockAuctionId,
          { filingReference: 'ROC-IT-001' },
          'it-admin',
          { sub: 'it-admin', phone: '9999999999', roles: [Role.SUPER_ADMIN] } as any,
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/);
    });

    it('XR-AUC-06: finalizeAuction rejects installmentMonth > durationMonths AND null/zero prizeMoney or bidDiscount', async () => {
      // Month > durationMonths (e.g. Month 25 on 20-month chit)
      prismaMock.auction.findUnique.mockResolvedValueOnce({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 25,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        chitGroup: mockChitScheme,
        winner: { ticketId: mockTicketId1 },
      });
      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId, { subscribersPresent: 10 }),
      ).rejects.toThrow(/Guardrail 5 Violation/);

      // Null bidDiscount / prizeMoney inside TX
      prismaMock.auction.findUnique.mockResolvedValueOnce({
        id: mockAuctionId,
        chitGroupId: mockChitGroupId,
        installmentMonth: 3,
        auctionDate: new Date('2026-12-15T00:00:00.000Z'),
        status: AuctionStatus.SCHEDULED,
        bidDiscount: null,
        prizeMoney: null,
        conductedByUserId: mockMakerId,
        chitGroup: mockChitScheme,
        winner: {
          ticketId: mockTicketId1,
          ticket: {
            id: mockTicketId1,
            chitGroupId: mockChitGroupId,
            ticketNumber: 3,
            status: 'ACTIVE',
            isPrized: false,
            consecutiveUnpaidMonths: 0,
            customer: { fullName: 'Subscriber' },
          },
        },
      });
      await expect(
        auctionService.finalizeAuction(mockAuctionId, mockCheckerId, { subscribersPresent: 10 }),
      ).rejects.toThrow(/INVALID_AUCTION_FINANCIALS/);
    });

    it('XR-AUC-07: getEligibleBiddersForIdentifier fails closed when ChitGroup UUID omits ?month=', async () => {
      prismaMock.auction.findUnique.mockResolvedValueOnce(null);
      prismaMock.chitGroup.findUnique.mockResolvedValueOnce(mockChitScheme);

      await expect(
        auctionService.getEligibleBiddersForIdentifier(mockChitGroupId, undefined),
      ).rejects.toThrow(/Installment month is required/);
    });

    it('XR-AUC-08: requestAuctionCorrection rejects whitespace-only reason', async () => {
      await expect(
        auctionService.requestAuctionCorrection(
          mockAuctionId,
          mockMakerId,
          { correctedBidDiscount: 24000, reason: '   \t\n  ' },
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/CORRECTION_REASON_REQUIRED/);
    });
  });
});
