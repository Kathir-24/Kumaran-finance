import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ChitStatus, DueStatus, Role } from '@prisma/client';
import { InstallmentService } from '../../src/installment/installment.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Module 5: Installment Dues, Passbook & Defaulter Removal Tests', () => {
  let installmentService: InstallmentService;
  let prismaMock: any;

  const mockChitGroupId = 'chit-group-uuid-001';
  const mockTicketId1 = 'ticket-uuid-001';
  const mockTicketId2 = 'ticket-uuid-002';
  const mockAdminId = 'admin-user-uuid-001';

  const mockActiveChit = {
    id: mockChitGroupId,
    groupCode: 'KCA-1L-20M-01',
    groupName: '₹1 Lakh 20 Months Group A',
    chitValue: 100000n,
    durationMonths: 20,
    totalTickets: 20,
    baseInstallment: 5000n, // 100,000 / 20
    status: ChitStatus.ACTIVE,
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    endDate: new Date('2028-06-30T00:00:00.000Z'),
    tickets: [
      { id: mockTicketId1, ticketNumber: 1, isPrized: false, status: 'ACTIVE' },
      { id: mockTicketId2, ticketNumber: 2, isPrized: true, status: 'ACTIVE' },
    ],
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findUnique: jest.fn(),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      auction: {
        findUnique: jest.fn(),
      },
      installmentDue: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: mockAdminId, isPartner: true }),
      },
      customer: {
        findUnique: jest.fn(),
      },
      paymentAllocation: {
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    installmentService = new InstallmentService(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('1. Universal Equal Dividend & Due Scheduling Invariants', () => {
    it('should generate Month 1 dues with ₹0 dividend for all members', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockActiveChit);
      prismaMock.installmentDue.findUnique.mockResolvedValue(null);
      prismaMock.installmentDue.create.mockImplementation(({ data }: any) => ({
        id: 'due-uuid-new',
        ...data,
      }));

      const result = await installmentService.generateMonthlyDues(
        mockChitGroupId,
        1,
      );

      expect(result.installmentMonth).toBe(1);
      expect(result.grossAmount).toBe(5000n);
      expect(result.dividendDeduction).toBe(0n); // Month 1 ₹0 dividend
      expect(result.netPayableAmount).toBe(5000n); // Base installment
      expect(prismaMock.installmentDue.create).toHaveBeenCalledTimes(2);
    });

    it('should generate Month 2 dues deducting universal dividend for ALL tickets (including prized winners)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockActiveChit);
      // Month 1 auction had winning discount 25,000 -> 4,000 comm -> 21,000 dividend / 20 = 1,050
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auction-m1',
        installmentMonth: 1,
        dividendPerTicket: 1050n,
      });
      prismaMock.installmentDue.findUnique.mockResolvedValue(null);
      prismaMock.installmentDue.create.mockImplementation(({ data }: any) => ({
        id: 'due-uuid-new',
        ...data,
      }));

      const result = await installmentService.generateMonthlyDues(
        mockChitGroupId,
        2,
      );

      expect(result.installmentMonth).toBe(2);
      expect(result.grossAmount).toBe(5000n);
      expect(result.dividendDeduction).toBe(1050n); // Universal dividend
      expect(result.netPayableAmount).toBe(3950n); // 5000 - 1050
      expect(prismaMock.installmentDue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installmentMonth: 2,
            grossAmount: 5000n,
            dividendDeduction: 1050n,
            netPayableAmount: 3950n,
            status: DueStatus.UNPAID,
          }),
        }),
      );
    });

    it('should reject due generation if chit group is in DRAFT status', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        ...mockActiveChit,
        status: ChitStatus.DRAFT,
      });

      await expect(
        installmentService.generateMonthlyDues(mockChitGroupId, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject due generation for Month 3 if Month 2 auction has not been finalized', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockActiveChit);
      prismaMock.auction.findUnique.mockResolvedValue(null); // No prior auction!

      await expect(
        installmentService.generateMonthlyDues(mockChitGroupId, 3),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Member Digital Passbook & Ledger Calculations', () => {
    it('should calculate cumulative passbook totals with mathematical conservation', async () => {
      const mockTicket = {
        id: mockTicketId1,
        ticketNumber: 3,
        status: 'ACTIVE',
        isPrized: false,
        consecutiveUnpaidMonths: 0,
        joiningDate: new Date('2026-11-01T00:00:00.000Z'),
        customer: {
          customerCode: 'KC-CUST-00003',
          fullName: 'Kandasamy S',
          fullNameTamil: 'கந்தசாமி',
          phone: '9842100003',
        },
        chitGroup: {
          groupCode: 'KCA-1L-20M-01',
          groupName: '₹1 Lakh 20 Months Group A',
          chitValue: 100000n,
          durationMonths: 20,
          baseInstallment: 5000n,
          startDate: new Date('2026-11-01T00:00:00.000Z'),
          endDate: new Date('2028-06-30T00:00:00.000Z'),
        },
        dues: [
          {
            installmentMonth: 1,
            dueDate: new Date('2026-11-10T00:00:00.000Z'),
            grossAmount: 5000n,
            dividendDeduction: 0n,
            netPayableAmount: 5000n,
            paidAmount: 5000n,
            status: DueStatus.PAID,
            allocations: [
              {
                payment: {
                  receiptNumber: 'KC-REC-00001',
                  paymentMethod: 'CASH',
                  paidAt: new Date('2026-11-05T00:00:00.000Z'),
                  paymentStatus: 'SUCCESS',
                },
              },
            ],
          },
          {
            installmentMonth: 2,
            dueDate: new Date('2026-12-10T00:00:00.000Z'),
            grossAmount: 5000n,
            dividendDeduction: 1050n,
            netPayableAmount: 3950n,
            paidAmount: 3950n,
            status: DueStatus.PAID,
            allocations: [
              {
                payment: {
                  receiptNumber: 'KC-REC-00025',
                  paymentMethod: 'UPI',
                  paidAt: new Date('2026-12-08T00:00:00.000Z'),
                  paymentStatus: 'SUCCESS',
                },
              },
            ],
          },
          {
            installmentMonth: 3,
            dueDate: new Date('2027-01-10T00:00:00.000Z'),
            grossAmount: 5000n,
            dividendDeduction: 800n,
            netPayableAmount: 4200n,
            paidAmount: 0n,
            status: DueStatus.UNPAID,
            allocations: [],
          },
        ],
      };

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicket);

      const passbook = await installmentService.getPassbook(mockTicketId1);

      expect(passbook.ticket.ticketNumber).toBe(3);
      expect(passbook.customer.customerCode).toBe('KC-CUST-00003');
      expect(passbook.summary.totalGrossDue).toBe(15000n); // 5000 * 3
      expect(passbook.summary.totalDividend).toBe(1850n);  // 0 + 1050 + 800
      expect(passbook.summary.totalNetDue).toBe(13150n);   // 5000 + 3950 + 4200
      expect(passbook.summary.totalPaid).toBe(8950n);      // 5000 + 3950
      expect(passbook.summary.outstandingBalance).toBe(4200n); // 13150 - 8950

      // Mathematical conservation invariant
      expect(
        passbook.summary.totalGrossDue - passbook.summary.totalDividend,
      ).toBe(passbook.summary.totalNetDue);
      expect(
        passbook.summary.totalNetDue - passbook.summary.totalPaid,
      ).toBe(passbook.summary.outstandingBalance);
    });

    it('should calculate 6-column physical passbook ledger matching real-world schema (₹3L / 30M)', async () => {
      const mockTicketReal = {
        id: 'ticket-real-passbook',
        ticketNumber: 5,
        status: 'ACTIVE',
        isPrized: false,
        consecutiveUnpaidMonths: 0,
        joiningDate: new Date('2022-11-22T00:00:00.000Z'),
        customer: {
          id: 'cust-real',
          customerCode: 'KC-CUST-REAL',
          fullName: 'Kathi Real',
          fullNameTamil: 'கதி',
          phone: '9842100005',
        },
        chitGroup: {
          id: 'chit-real-3L',
          groupCode: 'KC-3L-30M-01',
          groupName: '₹3 Lakh 30 Months Scheme',
          chitValue: 300000n,
          durationMonths: 30,
          baseInstallment: 10000n,
          startDate: new Date('2022-11-22T00:00:00.000Z'),
          endDate: new Date('2025-05-22T00:00:00.000Z'),
        },
        dues: [
          {
            installmentMonth: 1,
            cycleStartDate: new Date('2022-11-22T00:00:00.000Z'),
            cycleEndDate: new Date('2022-12-22T00:00:00.000Z'),
            dueDate: new Date('2022-12-22T00:00:00.000Z'),
            grossAmount: 10000n,
            dividendDeduction: 0n,
            netPayableAmount: 10000n,
            paidAmount: 10000n,
            status: DueStatus.PAID,
            allocations: [
              {
                payment: {
                  receiptNumber: 'KC-REC-00101',
                  paymentMethod: 'CASH',
                  createdAt: new Date('2022-12-15T00:00:00.000Z'),
                  paymentStatus: 'SUCCESS',
                  receipt: { receiptNumber: 'KC-REC-00101' },
                },
              },
            ],
          },
          {
            installmentMonth: 2,
            cycleStartDate: new Date('2022-12-22T00:00:00.000Z'),
            cycleEndDate: new Date('2023-01-22T00:00:00.000Z'),
            dueDate: new Date('2023-01-22T00:00:00.000Z'),
            grossAmount: 10000n,
            dividendDeduction: 2100n,
            netPayableAmount: 7900n,
            paidAmount: 7900n,
            status: DueStatus.PAID,
            allocations: [
              {
                payment: {
                  receiptNumber: 'KC-REC-00142',
                  paymentMethod: 'CASH',
                  createdAt: new Date('2023-01-04T00:00:00.000Z'),
                  paymentStatus: 'SUCCESS',
                  receipt: { receiptNumber: 'KC-REC-00142' },
                },
              },
            ],
          },
          {
            installmentMonth: 3,
            cycleStartDate: new Date('2023-01-22T00:00:00.000Z'),
            cycleEndDate: new Date('2023-02-22T00:00:00.000Z'),
            dueDate: new Date('2023-02-22T00:00:00.000Z'),
            grossAmount: 10000n,
            dividendDeduction: 2100n,
            netPayableAmount: 7900n,
            paidAmount: 7900n,
            status: DueStatus.PAID,
            allocations: [
              {
                payment: {
                  receiptNumber: 'KC-REC-00198',
                  paymentMethod: 'CASH',
                  createdAt: new Date('2023-02-01T00:00:00.000Z'),
                  paymentStatus: 'SUCCESS',
                  receipt: { receiptNumber: 'KC-REC-00198' },
                },
              },
            ],
          },
        ],
      };

      prismaMock.subscriberTicket.findUnique.mockResolvedValue(mockTicketReal);

      const passbook = await installmentService.getPassbook('ticket-real-passbook');

      expect(passbook.ledgerEntries).toHaveLength(3);

      // Month 1 assertions (Paid ₹10,000, Dividend ₹0 -> Total ₹10,000)
      expect(passbook.ledgerEntries[0].month).toBe(1);
      expect(passbook.ledgerEntries[0].amountPaid).toBe(10000n);
      expect(passbook.ledgerEntries[0].dividend).toBe(0n);
      expect(passbook.ledgerEntries[0].total).toBe(10000n);
      expect(passbook.ledgerEntries[0].amountPaid + passbook.ledgerEntries[0].dividend).toBe(
        passbook.ledgerEntries[0].total,
      );

      // Month 2 assertions (Paid ₹7,900, Dividend ₹2,100 -> Total ₹10,000)
      expect(passbook.ledgerEntries[1].month).toBe(2);
      expect(passbook.ledgerEntries[1].amountPaid).toBe(7900n);
      expect(passbook.ledgerEntries[1].dividend).toBe(2100n);
      expect(passbook.ledgerEntries[1].total).toBe(10000n);
      expect(passbook.ledgerEntries[1].amountPaid + passbook.ledgerEntries[1].dividend).toBe(
        passbook.ledgerEntries[1].total,
      );

      // Month 3 assertions (Paid ₹7,900, Dividend ₹2,100 -> Total ₹10,000)
      expect(passbook.ledgerEntries[2].month).toBe(3);
      expect(passbook.ledgerEntries[2].amountPaid).toBe(7900n);
      expect(passbook.ledgerEntries[2].dividend).toBe(2100n);
      expect(passbook.ledgerEntries[2].total).toBe(10000n);
      expect(passbook.ledgerEntries[2].amountPaid + passbook.ledgerEntries[2].dividend).toBe(
        passbook.ledgerEntries[2].total,
      );
    });

    it('should enforce customer isolation: subscriber can only view own passbook', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        customer: { phone: '9842100001' },
        dues: [],
      });
      // Authenticated customer has a different phone number!
      prismaMock.user.findUnique.mockResolvedValue({ phone: '9842199999' });

      await expect(
        installmentService.getPassbook(
          mockTicketId1,
          'user-diff-uuid',
          Role.CUSTOMER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Defaulter Tracking & 3-Month Removal Rights (ADR-07 & ADR-12)', () => {
    it('should list defaulters and highlight tickets with >= 3 consecutive missed months', async () => {
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: mockTicketId1,
          ticketNumber: 4,
          isPrized: false,
          status: 'DEFAULT_3_MONTHS',
          consecutiveUnpaidMonths: 3,
          customer: { fullName: 'Defaulter Subscriber' },
          chitGroup: { groupCode: 'KCA-1L-20M-01', branch: {} },
          dues: [
            { installmentMonth: 2, netPayableAmount: 3950n, status: DueStatus.OVERDUE },
            { installmentMonth: 3, netPayableAmount: 4000n, status: DueStatus.OVERDUE },
            { installmentMonth: 4, netPayableAmount: 4100n, status: DueStatus.OVERDUE },
          ],
        },
      ]);

      const defaulters = await installmentService.getDefaulters();
      if (!Array.isArray(defaulters)) throw new Error('Expected array');
      expect(defaulters).toHaveLength(1);
      expect(defaulters[0].consecutiveUnpaidMonths).toBe(3);
      expect(defaulters[0].eligibleForRemoval).toBe(true);
      expect(defaulters[0].totalOverdueAmount).toBe(12050n); // 3950 + 4000 + 4100
    });

    it('should strictly reject company removal rights if ticket has fewer than 3 consecutive unpaid months', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        consecutiveUnpaidMonths: 2, // Only 2 months unpaid!
        status: 'ACTIVE',
        customer: { fullName: 'Subscriber B' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      await expect(
        installmentService.removeDefaulter(mockTicketId1, mockAdminId, {
          reason: 'Attempting removal with only 2 unpaid months',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('SEC-B: should submit removal request (PENDING_REMOVAL_APPROVAL) when ticket has >= 3 consecutive missed months', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        consecutiveUnpaidMonths: 3,
        status: 'DEFAULT_3_MONTHS',
        customer: { fullName: 'Subscriber B' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        consecutiveUnpaidMonths: 3,
        status: 'PENDING_REMOVAL_APPROVAL',
        removalRequestedAt: new Date(),
        removalRequestedByUserId: mockAdminId,
        removalReason: 'Failed to pay installments for 3 consecutive months despite formal notice.',
        customer: { fullName: 'Subscriber B' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      const result = await installmentService.requestDefaulterRemoval(
        mockTicketId1,
        mockAdminId,
        {
          reason: 'Failed to pay installments for 3 consecutive months despite formal notice.',
        },
      );

      expect(result.success).toBe(true);
      expect(result.ticket.status).toBe('PENDING_REMOVAL_APPROVAL');
      expect(result.ticket.removalRequestedByUserId).toBe(mockAdminId);
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTicketId1 },
          data: expect.objectContaining({
            status: 'PENDING_REMOVAL_APPROVAL',
            removalRequestedByUserId: mockAdminId,
          }),
        }),
      );
    });

    it('SEC-B: should ENFORCE Maker != Checker on approveDefaulterRemoval when requesting partner attempts approval', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        consecutiveUnpaidMonths: 3,
        status: 'PENDING_REMOVAL_APPROVAL',
        removalRequestedByUserId: mockAdminId, // Requested by Partner A
        customer: { fullName: 'Subscriber B' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      // Partner A attempts to approve own removal request (Violation!)
      await expect(
        installmentService.approveDefaulterRemoval(mockTicketId1, mockAdminId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('SEC-B: should ALLOW independent Partner B to approve defaulter removal (REMOVED_DEF_3M)', async () => {
      const independentPartnerId = 'partner-b-uuid';
      prismaMock.user.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where?.id || independentPartnerId, isPartner: true }),
      );

      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        consecutiveUnpaidMonths: 3,
        status: 'PENDING_REMOVAL_APPROVAL',
        removalRequestedByUserId: mockAdminId, // Requested by Partner A
        customer: { fullName: 'Subscriber B' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        consecutiveUnpaidMonths: 3,
        status: 'REMOVED_DEF_3M',
        removedAt: new Date(),
        removedByUserId: independentPartnerId,
        removalReason: '3 consecutive unpaid months',
        customer: { fullName: 'Subscriber B' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      const result = await installmentService.approveDefaulterRemoval(
        mockTicketId1,
        independentPartnerId,
      );

      expect(result.success).toBe(true);
      expect(result.ticket.status).toBe('REMOVED_DEF_3M');
      expect(result.ticket.removedByUserId).toBe(independentPartnerId);
    });

    it('KFC-SEC-004: should reject defaulter removal if ticket is already prized (PRIZED_TICKET_IMMUTABLE)', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        consecutiveUnpaidMonths: 3,
        isPrized: true, // Already Prized!
        status: 'ACTIVE',
        customer: { fullName: 'Prized Winner Subscriber' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      await expect(
        installmentService.removeDefaulter(mockTicketId1, mockAdminId, {
          reason: 'Attempting removal on prized ticket',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('KFC-SEC-004: should reject subscriber substitution if ticket is prized (PRIZED_TICKET_IMMUTABLE)', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        isPrized: true, // Already Prized!
        status: 'REMOVED_DEF_3M',
        customer: { fullName: 'Prized Winner Subscriber' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      await expect(
        installmentService.substituteSubscriber(mockTicketId1, mockAdminId, {
          newCustomerId: 'new-cust-uuid',
          reason: 'Attempting substitution on prized ticket',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('SEC-A / DEF-04: should reject substituteSubscriber if caller is not a verified partner', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: mockAdminId, isPartner: false });

      await expect(
        installmentService.substituteSubscriber(mockTicketId1, mockAdminId, {
          newCustomerId: 'new-cust-uuid',
          reason: 'Substitution by non-partner admin',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('SEC-A / DEF-04: should allow verified partner to substitute subscriber on REMOVED_DEF_3M ticket', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: mockAdminId, isPartner: true });
      prismaMock.subscriberTicket.findUnique
        .mockResolvedValueOnce({
          id: mockTicketId1,
          ticketNumber: 5,
          isPrized: false,
          status: 'REMOVED_DEF_3M',
          customerId: 'old-cust-uuid',
          chitGroupId: mockChitGroupId,
          chitGroup: { id: mockChitGroupId, groupCode: 'KCA-1L-20M-01' },
          customer: { id: 'old-cust-uuid', fullName: 'Old Defaulted Customer' },
        })
        .mockResolvedValueOnce(null); // ADR-13 unique check
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'new-cust-uuid',
        fullName: 'New Validated Customer',
        isKycVerified: true,
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        customerId: 'new-cust-uuid',
        status: 'ACTIVE',
        consecutiveUnpaidMonths: 0,
        customer: { id: 'new-cust-uuid', fullName: 'New Validated Customer' },
      });

      const result = await installmentService.substituteSubscriber(
        mockTicketId1,
        mockAdminId,
        {
          newCustomerId: 'new-cust-uuid',
          reason: 'Legitimate substitution by verified partner',
        },
      );

      expect(result.success).toBe(true);
      expect(result.ticket.status).toBe('ACTIVE');
      expect(result.ticket.newCustomerId).toBe('new-cust-uuid');
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            consecutiveUnpaidMonths: 0,
            status: 'ACTIVE',
            customerId: 'new-cust-uuid',
          }),
        }),
      );
    });

    it('FIN-F / Q25: should FAIL CLOSED on settleRemoval with UNAPPROVED_SETTLEMENT_POLICY', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        isPrized: false,
        status: 'REMOVED_DEF_3M',
        removedByUserId: 'partner-a-uuid',
        customer: { fullName: 'Removed Subscriber' },
        chitGroup: { groupCode: 'KCA-1L-20M-01', chitValue: 100000n },
      });

      await expect(
        installmentService.settleRemoval(mockTicketId1, 'partner-b-uuid', {
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'UNAPPROVED_SETTLEMENT_POLICY: Early exit and defaulter settlement formula (Q25) is pending formal Partner Board resolution and statutory legal validation. Automated settlement payout execution is strictly locked fail-closed.',
        ),
      );
    });
  });

  describe('5. Native One-Tap UPI Intent URI Generator (NPCI Specification)', () => {
    const mockDueForUpi = {
      id: 'due-uuid-upi-001',
      ticketId: mockTicketId1,
      installmentMonth: 2,
      grossAmount: 5000n,
      dividendDeduction: 1050n,
      netPayableAmount: 3950n,
      paidAmount: 0n,
      status: DueStatus.UNPAID,
      ticket: {
        id: mockTicketId1,
        ticketNumber: 4,
        customerId: 'customer-uuid-001',
        customer: { id: 'customer-uuid-001', fullName: 'K. Kathirvel', phone: '9842100001' },
        chitGroup: { groupCode: 'KC-LIVE-20M-01', branchId: 'branch-001' },
      },
    };

    it('should generate a valid NPCI UPI Intent URI locking exact Inet amount and payee VPA', async () => {
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDueForUpi);

      const result = await installmentService.getUpiIntent('due-uuid-upi-001');

      expect(result.dueId).toBe('due-uuid-upi-001');
      expect(result.netPayableAmount).toBe(3950);
      expect(result.payeeVpa).toBe('kumaranfinance@kvb');
      expect(result.payeeName).toBe('Kumaran Finance');
      expect(result.transactionNote).toBe('KC-LIVE-20M-01 Ticket #4 Month 2');
      expect(result.upiUri).toContain('upi://pay?');
      expect(result.upiUri).toContain('pa=kumaranfinance%40kvb');
      expect(result.upiUri).toContain('am=3950');
      expect(result.upiUri).toContain('cu=INR');
    });

    it('should reject UPI intent generation if installment is already paid', async () => {
      prismaMock.installmentDue.findUnique.mockResolvedValue({
        ...mockDueForUpi,
        status: DueStatus.PAID,
      });

      await expect(
        installmentService.getUpiIntent('due-uuid-upi-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce Anti-BOLA: reject if Customer attempts to generate intent for another customer ticket', async () => {
      prismaMock.installmentDue.findUnique.mockResolvedValue(mockDueForUpi);
      prismaMock.customer.findUnique = jest.fn().mockResolvedValue({
        id: 'customer-other-uuid',
      });

      const customerUser = {
        sub: 'user-cust-002',
        phone: '9842199999',
        roles: [Role.CUSTOMER],
        branchId: null,
      };

      await expect(
        installmentService.getUpiIntent('due-uuid-upi-001', customerUser as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Module 5 Defense-in-Depth Hardening (DEF-15 & DEF-16)', () => {
    it('DEF-15: should fail closed on null user or deactivated partner across defaulter removal & substitution', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        installmentService.requestDefaulterRemoval(mockTicketId1, 'missing-partner', {
          reason: 'Missing user test',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        installmentService.approveDefaulterRemoval(mockTicketId1, 'missing-partner'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        installmentService.rejectDefaulterRemoval(mockTicketId1, 'missing-partner'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        installmentService.substituteSubscriber(mockTicketId1, 'missing-partner', {
          newCustomerId: 'new-cust-uuid',
          reason: 'Missing user test',
        }),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockAdminId,
        isPartner: true,
        isActive: false,
      });

      await expect(
        installmentService.approveDefaulterRemoval(mockTicketId1, mockAdminId),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        installmentService.substituteSubscriber(mockTicketId1, mockAdminId, {
          newCustomerId: 'new-cust-uuid',
          reason: 'Deactivated partner test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DEF-16: approveDefaulterRemoval MUST abort under SELECT FOR UPDATE if concurrent payment drops arrears below 3', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'partner-checker-02',
        isPartner: true,
        isActive: true,
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        status: 'PENDING_REMOVAL_APPROVAL',
        isPrized: false,
        consecutiveUnpaidMonths: 3,
        removalRequestedByUserId: 'partner-maker-01',
        customer: { fullName: 'M. Arumugam' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      // Simulate concurrent payment settling an overdue month before row lock is acquired
      prismaMock.$queryRaw = jest.fn().mockResolvedValue([
        {
          id: mockTicketId1,
          status: 'PENDING_REMOVAL_APPROVAL',
          isPrized: false,
          consecutiveUnpaidMonths: 2,
          removalRequestedByUserId: 'partner-maker-01',
        },
      ]);

      await expect(
        installmentService.approveDefaulterRemoval(mockTicketId1, 'partner-checker-02'),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.subscriberTicket.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('DEF-16: approveDefaulterRemoval MUST abort under SELECT FOR UPDATE if concurrent auction prized the ticket', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'partner-checker-02',
        isPartner: true,
        isActive: true,
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        status: 'PENDING_REMOVAL_APPROVAL',
        isPrized: false,
        consecutiveUnpaidMonths: 3,
        removalRequestedByUserId: 'partner-maker-01',
        customer: { fullName: 'M. Arumugam' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      prismaMock.$queryRaw = jest.fn().mockResolvedValue([
        {
          id: mockTicketId1,
          status: 'PENDING_REMOVAL_APPROVAL',
          isPrized: true,
          consecutiveUnpaidMonths: 3,
          removalRequestedByUserId: 'partner-maker-01',
        },
      ]);

      await expect(
        installmentService.approveDefaulterRemoval(mockTicketId1, 'partner-checker-02'),
      ).rejects.toThrow('PRIZED_TICKET_IMMUTABLE');

      expect(prismaMock.subscriberTicket.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('DEF-16: rejectDefaulterRemoval MUST abort under SELECT FOR UPDATE if concurrent approval already removed ticket', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'partner-checker-03',
        isPartner: true,
        isActive: true,
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        status: 'PENDING_REMOVAL_APPROVAL',
        isPrized: false,
        consecutiveUnpaidMonths: 3,
        removalRequestedByUserId: 'partner-maker-01',
        customer: { fullName: 'M. Arumugam' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      prismaMock.$queryRaw = jest.fn().mockResolvedValue([
        {
          id: mockTicketId1,
          status: 'REMOVED_DEF_3M',
          isPrized: false,
          consecutiveUnpaidMonths: 3,
          removalRequestedByUserId: 'partner-maker-01',
        },
      ]);

      await expect(
        installmentService.rejectDefaulterRemoval(mockTicketId1, 'partner-checker-03', 'Too late'),
      ).rejects.toThrow('NO_PENDING_REMOVAL');

      expect(prismaMock.subscriberTicket.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('DEF-16: requestDefaulterRemoval MUST reject duplicate request when locked row is already PENDING_REMOVAL_APPROVAL', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'partner-maker-02',
        isPartner: true,
        isActive: true,
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId1,
        ticketNumber: 5,
        status: 'DEFAULT_3_MONTHS',
        isPrized: false,
        consecutiveUnpaidMonths: 3,
        customer: { fullName: 'M. Arumugam' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      prismaMock.$queryRaw = jest.fn().mockResolvedValue([
        {
          id: mockTicketId1,
          status: 'PENDING_REMOVAL_APPROVAL',
          isPrized: false,
          consecutiveUnpaidMonths: 3,
          removalRequestedByUserId: 'partner-maker-01',
        },
      ]);

      await expect(
        installmentService.requestDefaulterRemoval(mockTicketId1, 'partner-maker-02', {
          reason: 'Duplicate request race',
        }),
      ).rejects.toThrow('REMOVAL_ALREADY_PENDING');

      expect(prismaMock.subscriberTicket.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
