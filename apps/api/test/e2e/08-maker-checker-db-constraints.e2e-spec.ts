import { PrismaService } from '../../src/prisma/prisma.service';
import { PaymentMethod, PaymentStatus, AuctionStatus, DisbursementMode } from '@prisma/client';

describe('Real PostgreSQL 17 Maker-Checker DB Constraints (F12 remediation)', () => {
  let prisma: PrismaService;
  let branchId: string;
  let makerUserId: string;
  let checkerUserId: string;
  let customerId: string;
  let chitGroupId: string;
  let ticketId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ||
      'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public';

    prisma = new PrismaService();
    await prisma.$connect();

    // Clean up any existing test records
    const testBranch = await prisma.branch.upsert({
      where: { code: 'TST' },
      update: {},
      create: {
        name: 'Test Branch',
        code: 'TST',
        address: 'Test Address',
        phone: '9842100000',
      },
    });
    branchId = testBranch.id;

    // Create Maker user
    const maker = await prisma.user.upsert({
      where: { phone: '9842100091' },
      update: { branchId },
      create: {
        phone: '9842100091',
        name: 'Test Maker Staff',
        roles: ['BRANCH_MANAGER'],
        branchId,
        passwordHash: '$2b$12$DummyHashForTestingOnly12345678901234567890',
      },
    });
    makerUserId = maker.id;

    // Create Checker user
    const checker = await prisma.user.upsert({
      where: { phone: '9842100092' },
      update: { branchId, isPartner: true },
      create: {
        phone: '9842100092',
        name: 'Test Checker Partner',
        roles: ['SUPER_ADMIN'],
        isPartner: true,
        branchId,
        passwordHash: '$2b$12$DummyHashForTestingOnly12345678901234567890',
      },
    });
    checkerUserId = checker.id;

    // Create Customer
    const customer = await prisma.customer.upsert({
      where: { phone: '9842100093' },
      update: { branchId },
      create: {
        customerCode: 'CUST-TST-093',
        fullName: 'Test Subscriber',
        phone: '9842100093',
        branchId,
        addressLine1: '123 Main Road',
        city: 'Perundurai',
        pincode: '638052',
      },
    });
    customerId = customer.id;

    // Create Chit Group
    const group = await prisma.chitGroup.upsert({
      where: { groupCode: 'GRP-TST-F12' },
      update: {},
      create: {
        groupCode: 'GRP-TST-F12',
        groupName: 'Test Chit 1L-20M',
        chitValue: 100000n,
        durationMonths: 20,
        baseInstallment: 5000n,
        totalTickets: 20,
        maxDiscountCeiling: 25000n,
        branchId,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 20 * 30 * 24 * 60 * 60 * 1000),
      },
    });
    chitGroupId = group.id;

    // Create Ticket
    const ticket = await prisma.subscriberTicket.upsert({
      where: { chitGroupId_ticketNumber: { chitGroupId, ticketNumber: 2 } },
      update: {},
      create: {
        chitGroupId,
        ticketNumber: 2,
        customerId,
      },
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await prisma.paymentReversal.deleteMany({
        where: { payment: { branchId } },
      });
      await prisma.paymentAllocation.deleteMany({
        where: { ticket: { chitGroupId } },
      });
      await prisma.payment.deleteMany({
        where: { branchId },
      });
      await prisma.auctionWinner.deleteMany({
        where: { auction: { chitGroupId } },
      });
      await prisma.auction.deleteMany({
        where: { chitGroupId },
      });
      await prisma.subscriberTicket.deleteMany({
        where: { chitGroupId },
      });
      await prisma.chitGroup.deleteMany({
        where: { id: chitGroupId },
      });
      await prisma.customer.deleteMany({
        where: { id: customerId },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [makerUserId, checkerUserId] } },
      });
      await prisma.branch.deleteMany({
        where: { id: branchId },
      });
    } catch {
      // Ignore cleanup errors
    }
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. Payment Cash Handover Constraint (chk_payment_cash_handover_maker_checker)
  // ============================================================================
  describe('chk_payment_cash_handover_maker_checker', () => {
    it('rejects cash handover where recordedByUserId === cashHandoverAcknowledgedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.payment.create({
          data: {
            branchId,
            customerId,
            amount: 5000n,
            paymentMethod: PaymentMethod.CASH,
            paymentStatus: PaymentStatus.SUCCESS,
            cashHandoverStatus: 'ACKNOWLEDGED',
            recordedByUserId: makerUserId,
            cashHandoverAcknowledgedByUserId: makerUserId, // VIOLATION: Same user!
          },
        }),
      ).rejects.toThrow(/chk_payment_cash_handover_maker_checker/i);
    });

    it('accepts cash handover where recordedByUserId !== cashHandoverAcknowledgedByUserId', async () => {
      const payment = await prisma.payment.create({
        data: {
          branchId,
          customerId,
          amount: 5000n,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.SUCCESS,
          cashHandoverStatus: 'ACKNOWLEDGED',
          recordedByUserId: makerUserId,
          cashHandoverAcknowledgedByUserId: checkerUserId, // Dual control
        },
      });

      expect(payment.id).toBeDefined();
      expect(payment.cashHandoverAcknowledgedByUserId).toBe(checkerUserId);
      await prisma.payment.delete({ where: { id: payment.id } });
    });
  });

  // ============================================================================
  // 2. Auction Maker-Checker Constraint (chk_auction_maker_checker)
  // ============================================================================
  describe('chk_auction_maker_checker', () => {
    it('rejects auction where conductedByUserId === finalizedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auction.create({
          data: {
            chitGroupId,
            installmentMonth: 2,
            auctionDate: new Date(),
            status: AuctionStatus.COMPLETED,
            conductedByUserId: makerUserId,
            finalizedByUserId: makerUserId, // VIOLATION: Same user!
          },
        }),
      ).rejects.toThrow(/chk_auction_maker_checker/i);
    });

    it('rejects COMPLETED non-historical operational auction without conductedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auction.create({
          data: {
            chitGroupId,
            installmentMonth: 2,
            auctionDate: new Date(),
            status: AuctionStatus.COMPLETED,
            conductedByUserId: null, // VIOLATION: Maker missing on completed operational auction!
            finalizedByUserId: checkerUserId,
          },
        }),
      ).rejects.toThrow(/chk_auction_maker_checker/i);
    });

    it('rejects COMPLETED non-historical operational auction without finalizedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auction.create({
          data: {
            chitGroupId,
            installmentMonth: 2,
            auctionDate: new Date(),
            status: AuctionStatus.COMPLETED,
            conductedByUserId: makerUserId,
            finalizedByUserId: null, // VIOLATION: Checker missing on completed operational auction!
          },
        }),
      ).rejects.toThrow(/chk_auction_maker_checker/i);
    });

    it('accepts Month 1 statutory company pool auction with conductedByUserId = NULL and finalizedByUserId NOT NULL', async () => {
      const month1 = await prisma.auction.create({
        data: {
          chitGroupId,
          installmentMonth: 1,
          auctionDate: new Date(),
          status: AuctionStatus.COMPLETED,
          conductedByUserId: null, // Statutory pool: no auction conducted
          finalizedByUserId: checkerUserId,
        },
      });

      expect(month1.id).toBeDefined();
      await prisma.auction.delete({ where: { id: month1.id } });
    });

    it('accepts COMPLETED operational auction where conductedByUserId !== finalizedByUserId', async () => {
      const auction = await prisma.auction.create({
        data: {
          chitGroupId,
          installmentMonth: 3,
          auctionDate: new Date(),
          status: AuctionStatus.COMPLETED,
          conductedByUserId: makerUserId,
          finalizedByUserId: checkerUserId, // Dual control
        },
      });

      expect(auction.id).toBeDefined();
      await prisma.auction.delete({ where: { id: auction.id } });
    });

    it('rejects MINUTES_FILED operational auction missing conductedByUserId or finalizedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auction.create({
          data: {
            chitGroupId,
            installmentMonth: 5,
            auctionDate: new Date(),
            status: AuctionStatus.MINUTES_FILED,
            conductedByUserId: null, // VIOLATION: Maker missing on MINUTES_FILED!
            finalizedByUserId: checkerUserId,
          },
        }),
      ).rejects.toThrow(/chk_auction_maker_checker/i);

      await expect(
        prisma.auction.create({
          data: {
            chitGroupId,
            installmentMonth: 5,
            auctionDate: new Date(),
            status: AuctionStatus.MINUTES_FILED,
            conductedByUserId: makerUserId,
            finalizedByUserId: null, // VIOLATION: Checker missing on MINUTES_FILED!
          },
        }),
      ).rejects.toThrow(/chk_auction_maker_checker/i);
    });

    it('rejects negative financial snapshots on Auction (chk_auction_non_negative_amounts, Postgres 23514)', async () => {
      await expect(
        prisma.auction.create({
          data: {
            chitGroupId,
            installmentMonth: 6,
            auctionDate: new Date(),
            status: AuctionStatus.SCHEDULED,
            bidDiscount: -1000n,
          },
        }),
      ).rejects.toThrow(/chk_auction_non_negative_amounts/i);
    });

    it('rejects AuctionMinutes with subscribersPresent < 1 (chk_auction_minutes_attendees, Postgres 23514)', async () => {
      const auc = await prisma.auction.create({
        data: {
          chitGroupId,
          installmentMonth: 7,
          auctionDate: new Date(),
          status: AuctionStatus.COMPLETED,
          conductedByUserId: makerUserId,
          finalizedByUserId: checkerUserId,
        },
      });

      try {
        await expect(
          prisma.auctionMinutes.create({
            data: {
              auctionId: auc.id,
              subscribersPresent: 0, // VIOLATION!
              minutesText: 'Invalid zero-attendee minutes',
            },
          }),
        ).rejects.toThrow(/chk_auction_minutes_attendees/i);
      } finally {
        await prisma.auction.delete({ where: { id: auc.id } });
      }
    });
  });

  // ============================================================================
  // 3. AuctionWinner Maker-Checker Constraint (chk_winner_maker_checker)
  // ============================================================================
  describe('chk_winner_maker_checker', () => {
    let testAuctionId: string;

    beforeEach(async () => {
      const auc = await prisma.auction.create({
        data: {
          chitGroupId,
          installmentMonth: 4,
          auctionDate: new Date(),
          status: AuctionStatus.COMPLETED,
          conductedByUserId: makerUserId,
          finalizedByUserId: checkerUserId,
        },
      });
      testAuctionId = auc.id;
    });

    afterEach(async () => {
      await prisma.auctionWinner.deleteMany({ where: { auctionId: testAuctionId } });
      await prisma.auction.deleteMany({ where: { id: testAuctionId } });
    });

    it('rejects winner where verifiedByUserId === authorizedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'DISBURSED',
            disbursedAmount: 75000n,
            verifiedByUserId: makerUserId,
            authorizedByUserId: makerUserId, // VIOLATION: Same user!
          },
        }),
      ).rejects.toThrow(/chk_winner_maker_checker/i);
    });

    it('rejects DISBURSED operational winner without verifiedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'DISBURSED',
            disbursedAmount: 75000n,
            verifiedByUserId: null, // VIOLATION: Maker missing!
            authorizedByUserId: checkerUserId,
          },
        }),
      ).rejects.toThrow(/chk_winner_maker_checker/i);
    });

    it('rejects DISBURSED operational winner without authorizedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'DISBURSED',
            disbursedAmount: 75000n,
            verifiedByUserId: makerUserId,
            authorizedByUserId: null, // VIOLATION: Checker missing!
          },
        }),
      ).rejects.toThrow(/chk_winner_maker_checker/i);
    });

    it('accepts DISBURSED Month 1 statutory company pool with verifiedByUserId = NULL and authorizedByUserId NOT NULL', async () => {
      const winner = await prisma.auctionWinner.create({
        data: {
          auctionId: testAuctionId,
          ticketId,
          disbursementStatus: 'DISBURSED',
          disbursedAmount: 100000n,
          paymentReference: 'COMPANY_POOL_MONTH_1',
          verifiedByUserId: null,
          authorizedByUserId: checkerUserId,
        },
      });

      expect(winner.id).toBeDefined();
    });

    it('accepts DISBURSED operational winner where verifiedByUserId !== authorizedByUserId', async () => {
      const winner = await prisma.auctionWinner.create({
        data: {
          auctionId: testAuctionId,
          ticketId,
          disbursementStatus: 'DISBURSED',
          disbursedAmount: 75000n,
          verifiedByUserId: makerUserId,
          authorizedByUserId: checkerUserId, // Dual control
        },
      });

      expect(winner.id).toBeDefined();
    });

    it('rejects VERIFIED_BY_MAKER operational winner without verifiedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'VERIFIED_BY_MAKER',
            verifiedByUserId: null, // VIOLATION!
          },
        }),
      ).rejects.toThrow(/chk_winner_maker_checker/i);
    });

    it('rejects AUTHORIZED_BY_CHECKER operational winner missing verifiedByUserId or authorizedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
            disbursedAmount: 75000n,
            verifiedByUserId: null,
            authorizedByUserId: checkerUserId,
          },
        }),
      ).rejects.toThrow(/chk_winner_maker_checker/i);

      await expect(
        prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
            disbursedAmount: 75000n,
            verifiedByUserId: makerUserId,
            authorizedByUserId: null,
          },
        }),
      ).rejects.toThrow(/chk_winner_maker_checker/i);
    });

    it('rejects non-positive disbursedAmount on AuctionWinner (chk_winner_positive_disbursed_amount, Postgres 23514)', async () => {
      await expect(
        prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
            disbursedAmount: 0n, // VIOLATION!
            verifiedByUserId: makerUserId,
            authorizedByUserId: checkerUserId,
          },
        }),
      ).rejects.toThrow(/chk_winner_positive_disbursed_amount/i);
    });

    it('rejects duplicate non-cash Bank UTR / Cheque paymentReference across DISBURSED winners (uq_auction_winner_non_cash_payment_ref, Postgres 23505)', async () => {
      const sharedRef = `NEFT-DB-UNIQUE-${Date.now()}`;
      const secondCustomer = await prisma.customer.upsert({
        where: { phone: '9842100094' },
        update: { branchId },
        create: {
          customerCode: 'CUST-TST-094',
          fullName: 'Second Test Subscriber',
          phone: '9842100094',
          branchId,
          addressLine1: '124 Main Road',
          city: 'Perundurai',
          pincode: '638052',
        },
      });
      const secondTicket = await prisma.subscriberTicket.upsert({
        where: { chitGroupId_ticketNumber: { chitGroupId, ticketNumber: 3 } },
        update: {},
        create: {
          chitGroupId,
          ticketNumber: 3,
          customerId: secondCustomer.id,
        },
      });
      const secondAuction = await prisma.auction.create({
        data: {
          chitGroupId,
          installmentMonth: 8,
          auctionDate: new Date(),
          status: AuctionStatus.COMPLETED,
          conductedByUserId: makerUserId,
          finalizedByUserId: checkerUserId,
        },
      });

      try {
        await prisma.auctionWinner.create({
          data: {
            auctionId: testAuctionId,
            ticketId,
            disbursementStatus: 'DISBURSED',
            disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
            disbursedAmount: 75000n,
            paymentReference: sharedRef,
            verifiedByUserId: makerUserId,
            authorizedByUserId: checkerUserId,
          },
        });

        await expect(
          prisma.auctionWinner.create({
            data: {
              auctionId: secondAuction.id,
              ticketId: secondTicket.id,
              disbursementStatus: 'DISBURSED',
              disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
              disbursedAmount: 75000n,
              paymentReference: sharedRef, // VIOLATION: Exact duplicate bank UTR!
              verifiedByUserId: makerUserId,
              authorizedByUserId: checkerUserId,
            },
          }),
        ).rejects.toThrow(/uq_auction_winner_non_cash_payment_ref|Unique constraint/i);

        // CR-DISB-05: Case-insensitive & whitespace-padded duplicate MUST also fail at Postgres engine level!
        await expect(
          prisma.auctionWinner.create({
            data: {
              auctionId: secondAuction.id,
              ticketId: secondTicket.id,
              disbursementStatus: 'DISBURSED',
              disbursementMode: DisbursementMode.BANK_TRANSFER_RTGS,
              disbursedAmount: 75000n,
              paymentReference: `  ${sharedRef.toLowerCase()}  `,
              verifiedByUserId: makerUserId,
              authorizedByUserId: checkerUserId,
            },
          }),
        ).rejects.toThrow(/uq_auction_winner_non_cash_payment_ref|Unique constraint/i);
      } finally {
        await prisma.auctionWinner.deleteMany({ where: { auctionId: secondAuction.id } });
        await prisma.auction.deleteMany({ where: { id: secondAuction.id } });
        await prisma.subscriberTicket.deleteMany({ where: { id: secondTicket.id } });
        await prisma.customer.deleteMany({ where: { id: secondCustomer.id } });
      }
    });
  });

  // ============================================================================
  // 4. PaymentReversal Maker-Checker Constraint (chk_reversal_maker_checker)
  // ============================================================================
  describe('chk_reversal_maker_checker', () => {
    let testPaymentId: string;

    beforeEach(async () => {
      const payment = await prisma.payment.create({
        data: {
          branchId,
          customerId,
          amount: 5000n,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.SUCCESS,
          recordedByUserId: makerUserId,
        },
      });
      testPaymentId = payment.id;
    });

    afterEach(async () => {
      await prisma.paymentReversal.deleteMany({ where: { paymentId: testPaymentId } });
      await prisma.receipt.deleteMany({ where: { paymentId: testPaymentId } });
      await prisma.paymentAllocation.deleteMany({ where: { paymentId: testPaymentId } });
      await prisma.payment.deleteMany({ where: { id: testPaymentId } });
    });

    it('rejects reversal where initiatedByUserId === approvedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.paymentReversal.create({
          data: {
            paymentId: testPaymentId,
            reason: 'Test reversal duplicate payment',
            status: 'APPROVED',
            initiatedByUserId: makerUserId,
            approvedByUserId: makerUserId, // VIOLATION: Same user!
          },
        }),
      ).rejects.toThrow(/chk_reversal_maker_checker/i);
    });

    it('rejects APPROVED reversal without approvedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.paymentReversal.create({
          data: {
            paymentId: testPaymentId,
            reason: 'Test reversal duplicate payment',
            status: 'APPROVED',
            initiatedByUserId: makerUserId,
            approvedByUserId: null, // VIOLATION: Approved without checker!
          },
        }),
      ).rejects.toThrow(/chk_reversal_maker_checker/i);
    });

    it('accepts APPROVED reversal where initiatedByUserId !== approvedByUserId', async () => {
      const reversal = await prisma.paymentReversal.create({
        data: {
          paymentId: testPaymentId,
          reason: 'Test reversal duplicate payment',
          status: 'APPROVED',
          initiatedByUserId: makerUserId,
          approvedByUserId: checkerUserId, // Dual control
        },
      });

      expect(reversal.id).toBeDefined();
    });
  });

  // ============================================================================
  // 5. Subscriber Ticket Defaulter Removal Constraint (chk_ticket_removal_maker_checker)
  // ============================================================================
  describe('chk_ticket_removal_maker_checker', () => {
    afterEach(async () => {
      await prisma.subscriberTicket.update({
        where: { id: ticketId },
        data: {
          removalRequestedByUserId: null,
          removedByUserId: null,
          status: 'ACTIVE',
        },
      });
    });

    it('rejects subscriber ticket removal where removalRequestedByUserId === removedByUserId (Postgres 23514)', async () => {
      await expect(
        prisma.subscriberTicket.update({
          where: { id: ticketId },
          data: {
            status: 'REMOVED_DEF_3M',
            removalRequestedByUserId: makerUserId,
            removedByUserId: makerUserId, // VIOLATION: Same user (self-approval)!
          },
        }),
      ).rejects.toThrow(/chk_ticket_removal_maker_checker/i);
    });

    it('accepts subscriber ticket removal request where removedByUserId IS NULL', async () => {
      const updated = await prisma.subscriberTicket.update({
        where: { id: ticketId },
        data: {
          status: 'PENDING_REMOVAL_APPROVAL',
          removalRequestedByUserId: makerUserId,
          removedByUserId: null,
        },
      });

      expect(updated.id).toBe(ticketId);
      expect(updated.removalRequestedByUserId).toBe(makerUserId);
      expect(updated.removedByUserId).toBeNull();
    });

    it('accepts subscriber ticket removal approval where removalRequestedByUserId !== removedByUserId', async () => {
      const updated = await prisma.subscriberTicket.update({
        where: { id: ticketId },
        data: {
          status: 'REMOVED_DEF_3M',
          removalRequestedByUserId: makerUserId,
          removedByUserId: checkerUserId, // Dual control: Independent checker
        },
      });

      expect(updated.id).toBe(ticketId);
      expect(updated.removalRequestedByUserId).toBe(makerUserId);
      expect(updated.removedByUserId).toBe(checkerUserId);
    });
  });
});
