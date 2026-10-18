import { BadRequestException, ConflictException } from '@nestjs/common';
import { ChitStatus, InitializationMode } from '@prisma/client';
import { ChitService } from '../src/chit/chit.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Module 3: Chit Groups & Mid-Cycle Intake Tests', () => {
  let chitService: ChitService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockChitGroupId = 'chit-group-uuid-001';
  const mockCustomerId1 = 'cust-uuid-001';
  const mockCustomerId2 = 'cust-uuid-002';
  const mockAdminId = 'admin-uuid-001';

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
      },
      auction: {
        create: jest.fn(),
      },
      auctionWinner: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    chitService = new ChitService(prismaMock as unknown as PrismaService);
  });

  describe('1. Scheme Creation & Whole Rupee Math Invariants', () => {
    it('should create a fresh chit group with whole-rupee math and 4% commission lock', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);
      prismaMock.branch.findFirst.mockResolvedValue({ id: mockBranchId });

      const createdScheme = {
        id: mockChitGroupId,
        branchId: mockBranchId,
        groupCode: 'KCA-1L-20M-01',
        groupName: '₹1 Lakh 20 Months Group A',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n, // Exactly V / 4
        foremanCommissionRate: 4.0,
        status: ChitStatus.DRAFT,
        initMode: InitializationMode.NEW_GROUP,
        onboardedAtMonth: 1,
      };

      prismaMock.chitGroup.create.mockResolvedValue(createdScheme);

      const result = await chitService.create(
        {
          groupCode: 'KCA-1L-20M-01',
          groupName: '₹1 Lakh 20 Months Group A',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-11-01T00:00:00.000Z',
          endDate: '2028-06-30T00:00:00.000Z',
        },
        mockBranchId,
      );

      expect(result.chitValue).toBe(100000n);
      expect(result.baseInstallment).toBe(5000n);
      expect(result.maxDiscountCeiling).toBe(25000n); // 1/4 ceiling invariant
      expect(result.status).toBe(ChitStatus.DRAFT);
      expect(prismaMock.chitGroup.create).toHaveBeenCalled();
    });

    it('should reject scheme creation if chit value cannot be divided evenly into whole rupees', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      // ₹100,003 / 20 = ₹5000.15 (fractional paise - strictly forbidden)
      await expect(
        chitService.create(
          {
            groupCode: 'KCA-ODD-20M',
            groupName: 'Odd Value Group',
            chitValue: 100003,
            durationMonths: 20,
            totalTickets: 20,
            startDate: '2026-11-01T00:00:00.000Z',
            endDate: '2028-06-30T00:00:00.000Z',
          },
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject scheme if duration does not match total tickets', async () => {
      await expect(
        chitService.create(
          {
            groupCode: 'KCA-MISMATCH',
            groupName: 'Mismatch Group',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 25,
            startDate: '2026-11-01T00:00:00.000Z',
            endDate: '2028-06-30T00:00:00.000Z',
          },
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Ticket Limit Constraint (ADR-13)', () => {
    it('should allocate ticket to customer successfully', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        totalTickets: 20,
        status: ChitStatus.DRAFT,
        tickets: [],
      });
      prismaMock.customer.findUnique.mockResolvedValue({ id: mockCustomerId1 });

      const allocatedTicket = {
        id: 'ticket-001',
        chitGroupId: mockChitGroupId,
        customerId: mockCustomerId1,
        ticketNumber: 4,
        openingBalance: 0n,
        customer: { id: mockCustomerId1, customerCode: 'KC-CUST-00001', fullName: 'Sundaram S' },
      };
      prismaMock.subscriberTicket.create.mockResolvedValue(allocatedTicket);

      const result = await chitService.assignTicket(mockChitGroupId, {
        ticketNumber: 4,
        customerId: mockCustomerId1,
      });

      expect(result.ticketNumber).toBe(4);
      expect(result.customerId).toBe(mockCustomerId1);
      expect(prismaMock.subscriberTicket.create).toHaveBeenCalled();
    });

    it('should reject allocating second ticket to same customer in same group (ADR-13 Violation)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        totalTickets: 20,
        status: ChitStatus.DRAFT,
        tickets: [
          { id: 'ticket-001', ticketNumber: 4, customerId: mockCustomerId1 },
        ],
      });

      await expect(
        chitService.assignTicket(mockChitGroupId, {
          ticketNumber: 9,
          customerId: mockCustomerId1, // Same customer attempting second ticket
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject allocating an already taken ticket number', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        totalTickets: 20,
        status: ChitStatus.DRAFT,
        tickets: [
          { id: 'ticket-001', ticketNumber: 4, customerId: mockCustomerId1 },
        ],
      });

      await expect(
        chitService.assignTicket(mockChitGroupId, {
          ticketNumber: 4, // Already taken
          customerId: mockCustomerId2,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Mid-Cycle Physical Notebook Intake', () => {
    it('should onboard an ongoing chit with historical winners and member roster', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);
      prismaMock.branch.findFirst.mockResolvedValue({ id: mockBranchId });

      const ongoingChit = {
        id: 'ongoing-uuid-001',
        groupCode: 'KCA-ONGOING-07',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        initMode: InitializationMode.ONGOING_GROUP,
        onboardedAtMonth: 7,
        status: ChitStatus.DRAFT,
      };

      prismaMock.chitGroup.create.mockResolvedValue(ongoingChit);
      prismaMock.subscriberTicket.create.mockImplementation((args: any) => ({
        id: `ticket-${args.data.ticketNumber}`,
        ...args.data,
      }));
      prismaMock.auction.create.mockResolvedValue({ id: 'auction-m2' });
      prismaMock.auctionWinner.create.mockResolvedValue({});
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      const result = await chitService.onboardOngoing(
        {
          groupCode: 'KCA-ONGOING-07',
          groupName: '₹1L Ongoing Group',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 7,
          startDate: '2026-04-01T00:00:00.000Z',
          endDate: '2027-11-30T00:00:00.000Z',
          historicalWinners: [
            {
              month: 2,
              ticketNumber: 5,
              bidDiscount: 22000,
              auctionDate: '2026-05-15T00:00:00.000Z',
            },
          ],
          memberAllocations: [
            { ticketNumber: 1, customerId: 'cust-1' },
            { ticketNumber: 5, customerId: 'cust-5' },
          ],
        },
        mockAdminId,
        mockBranchId,
      );

      expect(result.initMode).toBe(InitializationMode.ONGOING_GROUP);
      expect(result.onboardedAtMonth).toBe(7);
      expect(prismaMock.auction.create).toHaveBeenCalled();
    });

    it('should reject historical bid discount exceeding 1/4 ceiling ($D > V/4)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      await expect(
        chitService.onboardOngoing(
          {
            groupCode: 'KCA-BAD-CEILING',
            groupName: 'Bad Ceiling Group',
            chitValue: 100000, // 1/4 ceiling is ₹25,000
            durationMonths: 20,
            totalTickets: 20,
            onboardedAtMonth: 5,
            startDate: '2026-04-01T00:00:00.000Z',
            endDate: '2027-11-30T00:00:00.000Z',
            historicalWinners: [
              {
                month: 2,
                ticketNumber: 3,
                bidDiscount: 28000, // Exceeds 25,000!
                auctionDate: '2026-05-15T00:00:00.000Z',
              },
            ],
            memberAllocations: [
              { ticketNumber: 3, customerId: 'cust-3' },
            ],
          },
          mockAdminId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Scheme Activation & Month 1 Rules', () => {
    it('should activate scheme and execute Month 1 rule when all tickets are filled', async () => {
      // 2-ticket test scheme for simplicity
      const fullTickets = [
        { id: 't-1', ticketNumber: 1, customerId: mockCustomerId1 },
        { id: 't-2', ticketNumber: 2, customerId: mockCustomerId2 },
      ];

      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        totalTickets: 2,
        chitValue: 100000n,
        startDate: new Date(),
        status: ChitStatus.DRAFT,
        initMode: InitializationMode.NEW_GROUP,
        tickets: fullTickets,
      });

      prismaMock.auction.create.mockResolvedValue({ id: 'm1-auction' });
      prismaMock.auctionWinner.create.mockResolvedValue({});
      prismaMock.subscriberTicket.update.mockResolvedValue({});
      prismaMock.chitGroup.update.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.ACTIVE,
        foremanCommissionRate: 4.0,
      });

      const result = await chitService.activate(mockChitGroupId, mockAdminId);

      expect(result.status).toBe(ChitStatus.ACTIVE);
      // Month 1 auction must be created for Ticket #1
      expect(prismaMock.auction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installmentMonth: 1,
            bidDiscount: 0n,
            dividendPerTicket: 0n,
          }),
        }),
      );
    });

    it('should reject activation if not all N tickets are filled', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        totalTickets: 20,
        status: ChitStatus.DRAFT,
        tickets: [
          { id: 't-1', ticketNumber: 1, customerId: mockCustomerId1 },
        ], // Only 1 of 20 assigned!
      });

      await expect(
        chitService.activate(mockChitGroupId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
