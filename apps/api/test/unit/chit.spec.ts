import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ChitStatus, InitializationMode, Prisma, Role } from '@prisma/client';
import { ChitService } from '../../src/chit/chit.service';
import { InstallmentService } from '../../src/installment/installment.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Module 4: Chit Groups & Mid-Cycle Intake Tests', () => {
  let chitService: ChitService;
  let installmentService: InstallmentService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockChitGroupId = 'chit-group-uuid-001';
  const mockCustomerId1 = 'cust-uuid-001';
  const mockCustomerId2 = 'cust-uuid-002';
  const mockAdminId = 'admin-uuid-001';
  const mockPartnerCheckerId = 'partner-checker-uuid-002';

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
        createMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ isPartner: true }),
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
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    chitService = new ChitService(prismaMock as unknown as PrismaService);
    installmentService = new InstallmentService(prismaMock as unknown as PrismaService);
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

  describe('3. Mid-Cycle Physical Notebook Intake & Historical Invariants', () => {
    it('should onboard an ongoing chit with full roster and auto-create Month 1 company pool auction', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);
      prismaMock.branch.findFirst.mockResolvedValue({ id: mockBranchId });

      const ongoingChit = {
        id: 'ongoing-uuid-001',
        groupCode: 'KCA-ONGOING-03',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        initMode: InitializationMode.ONGOING_GROUP,
        onboardedAtMonth: 3,
        status: ChitStatus.DRAFT,
        createdByUserId: mockAdminId,
      };

      prismaMock.chitGroup.create.mockResolvedValue(ongoingChit);
      prismaMock.subscriberTicket.createMany.mockResolvedValue({ count: 20 });
      prismaMock.subscriberTicket.findMany.mockImplementation(() => {
        return Array.from({ length: 20 }, (_, i) => ({
          id: `ticket-${i + 1}`,
          ticketNumber: i + 1,
        }));
      });
      prismaMock.subscriberTicket.create.mockImplementation((args: any) => ({
        id: `ticket-${args.data.ticketNumber}`,
        ...args.data,
      }));
      prismaMock.auction.create.mockResolvedValue({ id: 'auction-created' });
      prismaMock.auctionWinner.create.mockResolvedValue({});
      prismaMock.subscriberTicket.update.mockResolvedValue({});

      const memberAllocations = Array.from({ length: 20 }, (_, i) => ({
        ticketNumber: i + 1,
        customerId: `cust-uuid-${i + 1}`,
        openingBalance: 0,
      }));

      const result = await chitService.onboardOngoing(
        {
          groupCode: 'KCA-ONGOING-03',
          groupName: '₹1L Ongoing Group',
          chitValue: 100000,
          durationMonths: 20,
          totalTickets: 20,
          onboardedAtMonth: 3,
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
          memberAllocations,
        },
        mockAdminId,
        mockBranchId,
      );

      expect(result.initMode).toBe(InitializationMode.ONGOING_GROUP);
      expect(result.onboardedAtMonth).toBe(3);
      // Auto-created Month 1 company pool auction must be called
      expect(prismaMock.auction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installmentMonth: 1,
            isHistoricalEntry: true,
            bidDiscount: 0n,
            prizeMoney: 100000n,
            totalDividend: 0n,
          }),
        }),
      );
      // Winner for Ticket 1 must be created
      expect(prismaMock.auctionWinner.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 'ticket-1',
            isHistoricalEntry: true,
            disbursementStatus: 'DISBURSED',
            disbursedAmount: 100000n,
          }),
        }),
      );
      // Ticket 1 must be updated to prized
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-1' },
          data: expect.objectContaining({
            isPrized: true,
          }),
        }),
      );
    });

    it('should reject historical bid discount exceeding 1/4 ceiling ($D > V/4)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      const memberAllocations = Array.from({ length: 20 }, (_, i) => ({
        ticketNumber: i + 1,
        customerId: `cust-uuid-${i + 1}`,
      }));

      await expect(
        chitService.onboardOngoing(
          {
            groupCode: 'KCA-BAD-CEILING',
            groupName: 'Bad Ceiling Group',
            chitValue: 100000, // 1/4 ceiling is ₹25,000
            durationMonths: 20,
            totalTickets: 20,
            onboardedAtMonth: 3,
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
            memberAllocations,
          },
          mockAdminId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject historical bid discount below 4% commission floor ($D < Cf)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      const memberAllocations = Array.from({ length: 20 }, (_, i) => ({
        ticketNumber: i + 1,
        customerId: `cust-uuid-${i + 1}`,
      }));

      // On ₹1,00,000 chit, 4% commission floor is ₹4,000. Bid discount of ₹3,000 violates floor.
      await expect(
        chitService.onboardOngoing(
          {
            groupCode: 'KCA-BAD-FLOOR',
            groupName: 'Bad Floor Group',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 20,
            onboardedAtMonth: 3,
            startDate: '2026-04-01T00:00:00.000Z',
            endDate: '2027-11-30T00:00:00.000Z',
            historicalWinners: [
              {
                month: 2,
                ticketNumber: 3,
                bidDiscount: 3000, // Below ₹4,000 floor!
                auctionDate: '2026-05-15T00:00:00.000Z',
              },
            ],
            memberAllocations,
          },
          mockAdminId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject historical auction with indivisible dividend ((D - Cf) % N !== 0)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      const memberAllocations = Array.from({ length: 20 }, (_, i) => ({
        ticketNumber: i + 1,
        customerId: `cust-uuid-${i + 1}`,
      }));

      // On ₹1,00,000 chit (20 tickets), Cf = 4000. If D = 20005, dividend = 16005, which is not divisible by 20.
      await expect(
        chitService.onboardOngoing(
          {
            groupCode: 'KCA-BAD-DIVISIBILITY',
            groupName: 'Bad Divisibility Group',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 20,
            onboardedAtMonth: 3,
            startDate: '2026-04-01T00:00:00.000Z',
            endDate: '2027-11-30T00:00:00.000Z',
            historicalWinners: [
              {
                month: 2,
                ticketNumber: 3,
                bidDiscount: 20005, // (20005 - 4000) % 20 !== 0
                auctionDate: '2026-05-15T00:00:00.000Z',
              },
            ],
            memberAllocations,
          },
          mockAdminId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject ongoing intake if member roster is incomplete (memberAllocations.length !== totalTickets)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      // Only 19 tickets on a 20-ticket chit
      const incompleteAllocations = Array.from({ length: 19 }, (_, i) => ({
        ticketNumber: i + 1,
        customerId: `cust-uuid-${i + 1}`,
      }));

      await expect(
        chitService.onboardOngoing(
          {
            groupCode: 'KCA-INCOMPLETE-ROSTER',
            groupName: 'Incomplete Roster Group',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 20,
            onboardedAtMonth: 3,
            startDate: '2026-04-01T00:00:00.000Z',
            endDate: '2027-11-30T00:00:00.000Z',
            historicalWinners: [
              {
                month: 2,
                ticketNumber: 3,
                bidDiscount: 22000,
                auctionDate: '2026-05-15T00:00:00.000Z',
              },
            ],
            memberAllocations: incompleteAllocations,
          },
          mockAdminId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject ongoing intake if historical winners have gaps (missing months)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      const memberAllocations = Array.from({ length: 20 }, (_, i) => ({
        ticketNumber: i + 1,
        customerId: `cust-uuid-${i + 1}`,
      }));

      // Intake at Month 4 requires historical auctions for Month 2 AND Month 3.
      // Providing only Month 2 must be rejected.
      await expect(
        chitService.onboardOngoing(
          {
            groupCode: 'KCA-GAP-WINNERS',
            groupName: 'Gap Winners Group',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 20,
            onboardedAtMonth: 4, // Expects 2 auctions: Month 2 and Month 3
            startDate: '2026-04-01T00:00:00.000Z',
            endDate: '2027-11-30T00:00:00.000Z',
            historicalWinners: [
              {
                month: 2,
                ticketNumber: 3,
                bidDiscount: 22000,
                auctionDate: '2026-05-15T00:00:00.000Z',
              },
              // Missing Month 3!
            ],
            memberAllocations,
          },
          mockAdminId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject ongoing intake if duplicate winner tickets exist in historical winners', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(null);

      const memberAllocations = Array.from({ length: 20 }, (_, i) => ({
        ticketNumber: i + 1,
        customerId: `cust-uuid-${i + 1}`,
      }));

      // Ticket 3 wins Month 2 AND Month 3 - forbidden!
      await expect(
        chitService.onboardOngoing(
          {
            groupCode: 'KCA-DUP-WINNERS',
            groupName: 'Duplicate Winners Group',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 20,
            onboardedAtMonth: 4,
            startDate: '2026-04-01T00:00:00.000Z',
            endDate: '2027-11-30T00:00:00.000Z',
            historicalWinners: [
              {
                month: 2,
                ticketNumber: 3,
                bidDiscount: 22000,
                auctionDate: '2026-05-15T00:00:00.000Z',
              },
              {
                month: 3,
                ticketNumber: 3, // Same ticket!
                bidDiscount: 20000,
                auctionDate: '2026-06-15T00:00:00.000Z',
              },
            ],
            memberAllocations,
          },
          mockAdminId,
          mockBranchId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Scheme Activation, Dual Control & Partner Identity', () => {
    it('should activate scheme and execute Month 1 rule when all tickets are filled by independent Partner checker', async () => {
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
        createdByUserId: mockAdminId, // Creator is mockAdminId
      });

      prismaMock.user.findUnique.mockResolvedValue({ isPartner: true });
      prismaMock.auction.create.mockResolvedValue({ id: 'm1-auction' });
      prismaMock.auctionWinner.create.mockResolvedValue({});
      prismaMock.subscriberTicket.update.mockResolvedValue({});
      prismaMock.chitGroup.update.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.ACTIVE,
        foremanCommissionRate: 4.0,
        activatedByUserId: mockPartnerCheckerId,
      });

      const result = await chitService.activate(mockChitGroupId, mockPartnerCheckerId);

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
      expect(prismaMock.chitGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ChitStatus.ACTIVE,
            activatedByUserId: mockPartnerCheckerId,
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
        chitService.activate(mockChitGroupId, mockPartnerCheckerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should ENFORCE Maker != Checker: reject activation when creatorUserId === checkerUserId (403 Forbidden)', async () => {
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
        createdByUserId: mockAdminId, // Creator is mockAdminId
      });
      prismaMock.user.findUnique.mockResolvedValue({ isPartner: true });

      // Attempt self-activation where checker is also mockAdminId
      await expect(
        chitService.activate(mockChitGroupId, mockAdminId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should ENFORCE Partner Identity: reject activation when checker isPartner is false (403 Forbidden)', async () => {
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
        createdByUserId: 'creator-uuid-001',
      });

      // Checker is an IT admin, NOT a partner
      prismaMock.user.findUnique.mockResolvedValue({ isPartner: false });

      await expect(
        chitService.activate(mockChitGroupId, mockPartnerCheckerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should ENFORCE Maker != Checker: reject activation when creatorUserId equals checkerUserId with whitespace or mixed casing', async () => {
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
        createdByUserId: 'partner-user-001',
      });
      prismaMock.user.findUnique.mockResolvedValue({ isPartner: true });

      // Attempt self-activation with uppercase and padded spaces
      await expect(
        chitService.activate(mockChitGroupId, '  PARTNER-USER-001  '),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should ENFORCE Partner Identity: reject activation when checker user record is not found in DB', async () => {
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
        createdByUserId: 'creator-uuid-001',
      });

      // Checker user not found in DB (null)
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        chitService.activate(mockChitGroupId, mockPartnerCheckerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. Scheme Member Privacy & DPDP Scoping (findOne)', () => {
    it('should mask fellow members PII when accessed by Role.CUSTOMER', async () => {
      const customerAId = 'cust-uuid-aaa';
      const customerBId = 'cust-uuid-bbb';

      const mockChit = {
        id: 'chit-group-privacy-test',
        groupCode: 'KCA-PRIVACY-01',
        tickets: [
          {
            id: 'ticket-1',
            ticketNumber: 1,
            customerId: customerAId,
            customer: {
              id: customerAId,
              customerCode: 'KC-CUST-AAA',
              fullName: 'K. Customer A',
              phone: '9876500001',
            },
          },
          {
            id: 'ticket-2',
            ticketNumber: 2,
            customerId: customerBId,
            customer: {
              id: customerBId,
              customerCode: 'KC-CUST-BBB',
              fullName: 'R. Customer B',
              phone: '9876500002',
            },
          },
        ],
        auctions: [],
      };

      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChit);

      // Customer A requesting details
      const customerAPayload = {
        sub: customerAId,
        phone: '9876500001',
        roles: [Role.CUSTOMER],
        branchId: 'branch-1',
        tokenType: 'access' as const,
      };

      const result = await chitService.findOne('chit-group-privacy-test', customerAPayload);
      expect(result).not.toBeNull();

      // Customer A's own ticket must be fully visible
      expect(result!.tickets[0].customer!.fullName).toBe('K. Customer A');
      expect(result!.tickets[0].customer!.phone).toBe('9876500001');

      // Customer B's ticket must be masked
      expect(result!.tickets[1].customer!.fullName).toBe('Subscriber (Ticket #2)');
      expect(result!.tickets[1].customer!.phone).toBe('+91 ******0000');
      expect(result!.tickets[1].customer!.customerCode).toBe('KC-CUST-RESERVED');
    });

    it('should provide unmasked member roster to privileged staff', async () => {
      const mockChit = {
        id: 'chit-group-privacy-test',
        groupCode: 'KCA-PRIVACY-01',
        tickets: [
          {
            id: 'ticket-1',
            ticketNumber: 1,
            customerId: 'cust-uuid-aaa',
            customer: {
              id: 'cust-uuid-aaa',
              customerCode: 'KC-CUST-AAA',
              fullName: 'K. Customer A',
              phone: '9876500001',
            },
          },
        ],
        auctions: [],
      };

      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChit);

      const staffPayload = {
        sub: 'staff-uuid-001',
        phone: '9876543210',
        roles: [Role.SUPER_ADMIN],
        branchId: 'branch-1',
        tokenType: 'access' as const,
      };

      const result = await chitService.findOne('chit-group-privacy-test', staffPayload);
      expect(result).not.toBeNull();
      expect(result!.tickets[0].customer!.fullName).toBe('K. Customer A');
      expect(result!.tickets[0].customer!.phone).toBe('9876500001');
    });
  });

  describe('6. State Machine Lifecycle Transitions (register, cancel, close)', () => {
    it('should register a draft chit scheme (DRAFT -> REGISTERED)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.DRAFT,
        sanctionOrderNumber: 'TN/ERD/2026/011',
        sanctionDate: new Date('2026-11-10'),
      });
      prismaMock.chitGroup.update.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.REGISTERED,
      });

      const result = await chitService.register(mockChitGroupId, mockAdminId);
      expect(result.status).toBe(ChitStatus.REGISTERED);
      expect(prismaMock.chitGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockChitGroupId },
          data: { status: ChitStatus.REGISTERED },
        }),
      );
    });

    it('should reject registering a scheme if sanctionOrderNumber is missing', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.DRAFT,
        sanctionOrderNumber: null,
        sanctionDate: new Date('2026-11-10'),
      });

      await expect(
        chitService.register(mockChitGroupId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject registering a scheme if sanctionDate is missing', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.DRAFT,
        sanctionOrderNumber: 'TN/ERD/2026/011',
        sanctionDate: null,
      });

      await expect(
        chitService.register(mockChitGroupId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject registering a scheme if not in DRAFT status', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.ACTIVE,
        sanctionOrderNumber: 'TN/ERD/2026/011',
        sanctionDate: new Date('2026-11-10'),
      });

      await expect(
        chitService.register(mockChitGroupId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should cancel an unactivated draft scheme (DRAFT -> CANCELLED)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.DRAFT,
      });
      prismaMock.chitGroup.update.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.CANCELLED,
      });

      const result = await chitService.cancel(mockChitGroupId, mockAdminId);
      expect(result.status).toBe(ChitStatus.CANCELLED);
      expect(prismaMock.chitGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockChitGroupId },
          data: { status: ChitStatus.CANCELLED },
        }),
      );
    });

    it('should reject cancelling a scheme if not in DRAFT status', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.ACTIVE,
      });

      await expect(
        chitService.cancel(mockChitGroupId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should close a completed chit scheme (COMPLETED -> CLOSED)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.COMPLETED,
      });
      prismaMock.chitGroup.update.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.CLOSED,
      });

      const result = await chitService.close(mockChitGroupId, mockAdminId);
      expect(result.status).toBe(ChitStatus.CLOSED);
      expect(prismaMock.chitGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockChitGroupId },
          data: { status: ChitStatus.CLOSED },
        }),
      );
    });

    it('should reject closing a scheme if not in COMPLETED status', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: mockChitGroupId,
        status: ChitStatus.ACTIVE,
      });

      await expect(
        chitService.close(mockChitGroupId, mockAdminId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('7. Member Passbook Opening Balance Integration', () => {
    it('should incorporate ticket openingBalance from physical notebook into passbook ledger and outstandingBalance', async () => {
      const mockTicket = {
        id: 'ticket-ledger-01',
        ticketNumber: 4,
        status: 'ACTIVE',
        isPrized: false,
        consecutiveUnpaidMonths: 1,
        joiningDate: new Date('2026-01-01'),
        openingBalance: 15000n, // Transcribed ₹15,000 arrears from paper notebook
        customerId: 'cust-uuid-ledger-01',
        customer: {
          id: 'cust-uuid-ledger-01',
          customerCode: 'KC-CUST-LEDGER',
          fullName: 'S. Ramanathan',
          fullNameTamil: 'எஸ். ராமநாதன்',
          phone: '9842711223',
        },
        chitGroup: {
          id: 'group-001',
          groupCode: 'KCA-1L-20M',
          groupName: '₹1L 20M Group',
          chitValue: 100000n,
          durationMonths: 20,
          baseInstallment: 5000n,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2027-08-01'),
        },
        dues: [
          {
            installmentMonth: 1,
            dueDate: new Date('2026-01-10'),
            cycleStartDate: new Date('2026-01-01'),
            cycleEndDate: new Date('2026-01-31'),
            grossAmount: 5000n,
            dividendDeduction: 0n,
            netPayableAmount: 5000n,
            paidAmount: 5000n, // Paid
            status: 'PAID',
            allocations: [],
          },
          {
            installmentMonth: 2,
            dueDate: new Date('2026-02-10'),
            cycleStartDate: new Date('2026-02-01'),
            cycleEndDate: new Date('2026-02-28'),
            grossAmount: 5000n,
            dividendDeduction: 900n,
            netPayableAmount: 4100n,
            paidAmount: 0n, // Unpaid
            status: 'UNPAID',
            allocations: [],
          },
        ],
      };

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);

      const passbook = await installmentService.getPassbook(
        'ticket-ledger-01',
        'cust-uuid-ledger-01',
        Role.CUSTOMER,
      );

      // totalNetDue = 5000n + 4100n = 9100n
      // totalPaid = 5000n
      // openingBalance = 15000n
      // outstandingBalance = 9100n + 15000n - 5000n = 19100n
      expect(passbook.ticket.openingBalance).toBe(15000n);
      expect(passbook.summary.openingBalance).toBe(15000n);
      expect(passbook.summary.totalNetDue).toBe(9100n);
      expect(passbook.summary.totalPaid).toBe(5000n);
      expect(passbook.summary.outstandingBalance).toBe(19100n);
    });
  });

  describe('8. Decimal Serialization & Redis Catalog Cache Consistency', () => {
    it('serializes foremanCommissionRate as finite JS number on cache miss and coerces cached strings on cache hit', async () => {
      const redisMock = {
        get: jest.fn().mockResolvedValueOnce(null),
        set: jest.fn().mockResolvedValue('OK'),
      };
      const redisProviderMock = {
        getClient: jest.fn().mockReturnValue(redisMock),
        getIsConnected: jest.fn().mockReturnValue(true),
      };
      const cachedChitService = new ChitService(
        prismaMock as unknown as PrismaService,
        redisProviderMock as any,
      );

      prismaMock.chitGroup.findMany.mockResolvedValue([
        {
          id: 'chit-1',
          groupCode: 'KCA-1L-20M-01',
          chitValue: 100000n,
          baseInstallment: 5000n,
          maxDiscountCeiling: 25000n,
          foremanCommissionRate: new Prisma.Decimal('4.00'),
        },
      ]);
      prismaMock.chitGroup.count.mockResolvedValue(1);

      const missResult = await cachedChitService.findAll({});
      expect(typeof missResult.data[0].chitValue).toBe('bigint');
      expect(missResult.data[0].chitValue).toBe(100000n);
      expect(missResult.data[0].baseInstallment).toBe(5000n);
      expect(missResult.data[0].maxDiscountCeiling).toBe(25000n);
      expect(typeof missResult.data[0].foremanCommissionRate).toBe('number');
      expect(missResult.data[0].foremanCommissionRate).toBe(4);
      expect(redisMock.set).toHaveBeenCalledTimes(1);
      const cachedJson = JSON.parse(redisMock.set.mock.calls[0][1]);
      expect(cachedJson.data[0].chitValue).toBe('100000');
      expect(cachedJson.data[0].baseInstallment).toBe('5000');
      expect(cachedJson.data[0].maxDiscountCeiling).toBe('25000');
      expect(typeof cachedJson.data[0].foremanCommissionRate).toBe('number');
      expect(cachedJson.data[0].foremanCommissionRate).toBe(4);

      // Simulate legacy Redis entry where Decimal was string "4" and BigInts were plain numbers
      redisMock.get.mockResolvedValueOnce(
        JSON.stringify({
          data: [
            {
              id: 'chit-1',
              groupCode: 'KCA-1L-20M-01',
              chitValue: 100000,
              baseInstallment: 5000,
              maxDiscountCeiling: 25000,
              foremanCommissionRate: '4',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );

      const hitResult = await cachedChitService.findAll({});
      expect(typeof hitResult.data[0].chitValue).toBe('bigint');
      expect(hitResult.data[0].chitValue).toBe(100000n);
      expect(hitResult.data[0].baseInstallment).toBe(5000n);
      expect(hitResult.data[0].maxDiscountCeiling).toBe(25000n);
      expect(typeof hitResult.data[0].foremanCommissionRate).toBe('number');
      expect(hitResult.data[0].foremanCommissionRate).toBe(4);
    });
  });
});
