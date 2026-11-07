import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuctionStatus } from '@prisma/client';
import { AuctionService } from '../src/auction/auction.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
    groupCode: 'KCA-1L-20M-01',
    groupName: '₹1 Lakh 20 Months Group A',
    chitValue: 100000n,
    durationMonths: 20,
    totalTickets: 20,
    baseInstallment: 5000n,
    maxDiscountCeiling: 25000n, // Exactly V / 4 (25%)
    foremanCommissionRate: 4.0,
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
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
      },
      auctionTieBidder: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      auctionMinutes: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
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
        { subscribersPresent: 18, notes: 'Auction conducted peacefully.' },
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
          jobId: `auction-result:${mockAuctionId}:m2`,
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

      await cachedAuctionService.finalizeAuction(mockAuctionId, mockCheckerId);

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
});
