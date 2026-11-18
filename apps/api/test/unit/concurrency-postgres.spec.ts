import {
  AuctionStatus,
  ChitStatus,
  DisbursementMode,
  DueStatus,
  InitializationMode,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  Role,
} from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuctionService } from '../../src/auction/auction.service';
import { ChitService } from '../../src/chit/chit.service';
import { CollectionService } from '../../src/collection/collection.service';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { InstallmentService } from '../../src/installment/installment.service';
import { ReconciliationService } from '../../src/jobs/services/reconciliation.service';
import { PaymentService } from '../../src/payment/payment.service';

/**
 * High-Concurrency Pessimistic Row Locking Integration Tests
 *
 * Verifies real PostgreSQL 17 row-level locking (SELECT ... FOR UPDATE)
 * under parallel asynchronous contention:
 * 1. Payment Recording: Prevents double-spending & duplicate allocations (ADR-07)
 * 2. Auction Finalization: Prevents duplicate finalization & double dividend minting
 * 3. Prize Disbursement: Prevents concurrent maker-checker double-payouts
 * 4. Vault Handover Acknowledgement: Prevents double-crediting branch vault balance
 * 5. Defaulter Ticket Substitution: Prevents concurrent subscriber overwrite on vacated tickets
 */
describe('PostgreSQL Row-Locking & Concurrency Integration Tests (Real DB)', () => {
  let prisma: PrismaClient;
  let paymentService: PaymentService;
  let auctionService: AuctionService;
  let chitService: ChitService;
  let disbursementService: DisbursementService;
  let collectionService: CollectionService;
  let installmentService: InstallmentService;
  let reconciliationService: ReconciliationService;
  let isDbConnected = false;

  let makerUserId: string;
  let checkerUserId: string;
  let activeTicket: any;

  beforeAll(async () => {
    const databaseUrl =
      process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public';

    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });

    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;

      paymentService = new PaymentService(prisma as any);
      auctionService = new AuctionService(prisma as any);
      chitService = new ChitService(prisma as any);
      disbursementService = new DisbursementService(prisma as any, null as any);
      collectionService = new CollectionService(prisma as any);
      installmentService = new InstallmentService(prisma as any);
      reconciliationService = new ReconciliationService(prisma as any);

      // Resolve Maker (Partner Admin 1) and Checker (Partner Admin 2)
      const maker = await prisma.user.findFirst({ where: { phone: '9876543210' } });
      const checker = await prisma.user.findFirst({ where: { phone: '9876543211' } });
      makerUserId = maker?.id || '';
      checkerUserId = checker?.id || '';

      // Resolve an active unprized subscriber ticket that does not have an existing winning auction
      activeTicket = await prisma.subscriberTicket.findFirst({
        where: {
          status: 'ACTIVE',
          isPrized: false,
          chitGroup: { status: 'ACTIVE' },
          winningAuction: null,
        },
        include: { chitGroup: true, customer: true },
      });

      if (activeTicket) {
        // Ensure activeTicket has no outstanding prior dues so synthetic concurrency test months can be evaluated sequentially
        await prisma.installmentDue.updateMany({
          where: {
            ticketId: activeTicket.id,
            status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
          },
          data: { status: DueStatus.PAID, paidAmount: 3750n },
        });
      }
    } catch {
      isDbConnected = false;
      console.warn(
        '⚠️ PostgreSQL 17 is not accessible. Skipping live concurrency row-locking tests in this isolated environment.',
      );
    }
  }, 15000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Double-Payment Stampede Contention (SELECT FOR UPDATE)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-1: 10 parallel workers racing to pay the exact same installment due MUST result in strictly 1 winner and 9 rejected (ADR-07)', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-1: DB or required seed data not present');
      return;
    }

    const testMonth = 991;

    // Create an isolated test due in UNPAID status
    const testDue = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicket.id,
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: testMonth,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        status: DueStatus.UNPAID,
      },
    });

    try {
      const concurrencyCount = 10;
      const paymentPromises = Array.from({ length: concurrencyCount }).map((_, idx) =>
        paymentService.recordPayment(
          {
            ticketId: activeTicket.id,
            installmentMonth: testMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `stampede-spec-${Date.now()}-${idx}`,
            notes: `Jest concurrency test thread #${idx + 1}`,
          },
          makerUserId,
          activeTicket.chitGroup.branchId,
        ),
      );

      const results = await Promise.allSettled(paymentPromises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      if (fulfilled.length === 0) {
        console.error('CONCURR-INV-4 REJECTED REASONS:', rejected.map(r => (r as PromiseRejectedResult).reason));
      }

      // CRITICAL ASSERTION: Exactly 1 transaction acquires the row lock and records payment
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(concurrencyCount - 1);

      // Verify all rejected workers threw INSTALLMENT_ALREADY_PAID
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toContain('INSTALLMENT_ALREADY_PAID');
        }
      }

      // Financial Ledger Verification
      const finalDue = await prisma.installmentDue.findUnique({ where: { id: testDue.id } });
      expect(finalDue?.status).toBe(DueStatus.PAID);
      expect(finalDue?.paidAmount).toBe(4000n);

      const allocations = await prisma.paymentAllocation.count({
        where: { installmentDueId: testDue.id },
      });
      expect(allocations).toBe(1);
    } finally {
      // Clean up test due & allocations
      const allocs = await prisma.paymentAllocation.findMany({
        where: { installmentDueId: testDue.id },
      });
      for (const a of allocs) {
        await prisma.receipt.deleteMany({ where: { paymentId: a.paymentId } });
        await prisma.paymentAllocation.delete({ where: { id: a.id } });
        await prisma.payment.delete({ where: { id: a.paymentId } });
      }
      await prisma.installmentDue.delete({ where: { id: testDue.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Auction Finalization Stampede Contention (SELECT FOR UPDATE)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-2: 5 parallel workers racing to finalize an auction MUST result in strictly 1 winner and 4 rejected', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-2: DB or required seed data not present');
      return;
    }

    const ts = Date.now();
    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        groupCode: `KC-INV2-${ts}`,
        groupName: 'Concurrency Finalization Stampede Scheme',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2027-08-31T00:00:00Z'),
      },
    });

    const tempTicket = await prisma.subscriberTicket.create({
      data: {
        chitGroupId: tempChit.id,
        customerId: activeTicket.customerId,
        ticketNumber: 2,
        isPrized: false,
        status: 'ACTIVE',
      },
    });

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: tempChit.id,
        installmentMonth: 2,
        auctionDate: new Date(),
        status: AuctionStatus.SCHEDULED,
        bidDiscount: 20000n,
        foremanCommissionRate: 4.0,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        conductedByUserId: makerUserId,
        winner: {
          create: {
            ticketId: tempTicket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'PENDING_VERIFICATION',
          },
        },
      },
      include: { winner: true },
    });

    try {
      const concurrencyCount = 5;
      const finalizePromises = Array.from({ length: concurrencyCount }).map((_, idx) =>
        auctionService.finalizeAuction(
          testAuction.id,
          checkerUserId,
          {
            subscribersPresent: 18,
            signedByForeman: true,
            notes: `Concurrent finalization race #${idx + 1}`,
          },
        ),
      );

      const results = await Promise.allSettled(finalizePromises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      if (fulfilled.length === 0) {
        console.error('CONCURR-INV-2 REJECTED REASONS:', rejected.map(r => (r as PromiseRejectedResult).reason));
      }

      // CRITICAL ASSERTION: Exactly 1 finalization commit
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(concurrencyCount - 1);

      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toContain('AUCTION_ALREADY_FINALIZED');
        }
      }

      // Statutory Records Verification
      const finalAuction = await prisma.auction.findUnique({ where: { id: testAuction.id } });
      expect(finalAuction?.status).toBe(AuctionStatus.COMPLETED);

      const minutesCount = await prisma.auctionMinutes.count({ where: { auctionId: testAuction.id } });
      expect(minutesCount).toBe(1);
    } finally {
      await prisma.auctionMinutes.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auctionWinner.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auction.deleteMany({ where: { id: testAuction.id } });
      await prisma.subscriberTicket.deleteMany({ where: { id: tempTicket.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Prize Disbursement Release Stampede Contention (SELECT FOR UPDATE)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-3: 5 parallel workers racing to release prize payout MUST result in strictly 1 winner and 4 rejected', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-3: DB or required seed data not present');
      return;
    }

    const ts = Date.now();
    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        groupCode: `KC-INV3-${ts}`,
        groupName: 'Concurrency Payout Release Stampede Scheme',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2027-08-31T00:00:00Z'),
      },
    });

    const tempTicket = await prisma.subscriberTicket.create({
      data: {
        chitGroupId: tempChit.id,
        customerId: activeTicket.customerId,
        ticketNumber: 2,
        isPrized: true,
        status: 'ACTIVE',
      },
    });

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: tempChit.id,
        installmentMonth: 2,
        auctionDate: new Date(),
        status: AuctionStatus.COMPLETED,
        bidDiscount: 20000n,
        foremanCommissionRate: 4.0,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        conductedByUserId: makerUserId,
        finalizedByUserId: checkerUserId,
        winner: {
          create: {
            ticketId: tempTicket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
            disbursedAmount: 80000n,
            isSecurityRequired: false,
            agreementSigned: true,
            nomineeSigned: true,
            verifiedByUserId: makerUserId,
            authorizedByUserId: checkerUserId,
          },
        },
      },
      include: { winner: true },
    });

    try {
      const concurrencyCount = 5;
      const releasePromises = Array.from({ length: concurrencyCount }).map((_, idx) =>
        disbursementService.releasePayout(
          testAuction.id,
          {
            paymentReference: `CONCURR-PAYOUT-REF-${ts}-${idx + 1}`,
            disbursedAt: new Date().toISOString(),
          },
          checkerUserId,
        ),
      );

      const results = await Promise.allSettled(releasePromises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      if (fulfilled.length === 0) {
        console.error('CONCURR-INV-3 REJECTED REASONS:', rejected.map(r => (r as PromiseRejectedResult).reason));
      }

      // CRITICAL ASSERTION: Exactly 1 payout release succeeds
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(concurrencyCount - 1);

      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toContain('PRIZE_ALREADY_DISBURSED');
        }
      }

      // Disbursement Status Verification
      const finalWinner = await prisma.auctionWinner.findUnique({
        where: { id: testAuction.winner!.id },
      });
      expect(finalWinner?.disbursementStatus).toBe('DISBURSED');
    } finally {
      await prisma.auctionWinner.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auction.deleteMany({ where: { id: testAuction.id } });
      await prisma.subscriberTicket.deleteMany({ where: { id: tempTicket.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Concurrent Desk Cash Handover Contention (SELECT FOR UPDATE)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-4: 5 parallel workers racing to acknowledge the exact same cash handover batch MUST result in strictly 1 winner and 4 rejected', async () => {
    if (!isDbConnected || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-4: DB or required seed data not present');
      return;
    }

    const testPayment = await prisma.payment.create({
      data: {
        branchId: activeTicket.customer.branchId,
        customerId: activeTicket.customerId,
        amount: 4000n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: 'SUCCESS',
        cashHandoverStatus: 'PENDING_HANDOVER',
        recordedByUserId: makerUserId,
      },
    });

    try {
      const concurrencyCount = 5;
      const handoverPromises = Array.from({ length: concurrencyCount }).map((_, idx) =>
        collectionService.acknowledgeHandover(
          {
            collectorUserId: makerUserId,
            acknowledgedAmount: 4000,
            paymentIds: [testPayment.id],
            notes: `Parallel handover attempt ${idx + 1}`,
          },
          checkerUserId,
        ),
      );

      const results = await Promise.allSettled(handoverPromises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // CRITICAL ASSERTION: Exactly 1 acknowledgment succeeds
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(concurrencyCount - 1);

      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toContain('already been acknowledged');
        }
      }

      // Final status check in DB
      const finalPayment = await prisma.payment.findUnique({
        where: { id: testPayment.id },
      });
      expect(finalPayment?.cashHandoverStatus).toBe('ACKNOWLEDGED');
      expect(finalPayment?.cashHandoverAcknowledgedByUserId).toBe(checkerUserId);
    } finally {
      await prisma.payment.delete({ where: { id: testPayment.id } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Concurrent Defaulter Ticket Substitution Race (SELECT FOR UPDATE)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-5: 5 parallel workers racing to substitute different customers into the same vacated ticket MUST result in strictly 1 winner and 4 rejected', async () => {
    if (!isDbConnected || !activeTicket || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-5: DB or required seed data not present');
      return;
    }

    // Resolve branch
    const branchId = activeTicket.customer.branchId;
    const timestamp = Date.now();

    // Create an isolated defaulter customer whose ticket was vacated
    const defaulterCustomer = await prisma.customer.create({
      data: {
        customerCode: `KC-CUST-DEF-${timestamp}`,
        fullName: 'Defaulter Subscriber To Vacate',
        phone: `91998${String(timestamp).slice(-5)}9`,
        addressLine1: 'Defaulter Street',
        city: 'Erode',
        pincode: '638052',
        isKycVerified: true,
        branchId,
      },
    });

    // Create an isolated test ticket in REMOVED_DEF_3M status
    const removedTicket = await prisma.subscriberTicket.create({
      data: {
        chitGroupId: activeTicket.chitGroupId,
        customerId: defaulterCustomer.id,
        ticketNumber: 9999,
        status: 'REMOVED_DEF_3M',
        consecutiveUnpaidMonths: 3,
        removedAt: new Date(),
        removedByUserId: checkerUserId,
      },
    });

    // Create 5 test replacement candidate customers with verified KYC
    const testCustomers = await Promise.all(
      Array.from({ length: 5 }).map((_, idx) =>
        prisma.customer.create({
          data: {
            customerCode: `KC-CUST-RACE-${timestamp}-${idx + 1}`,
            fullName: `Test Replacement Customer ${idx + 1}`,
            phone: `91999${String(timestamp).slice(-5)}${idx}`,
            addressLine1: 'Perundurai Road',
            city: 'Erode',
            pincode: '638052',
            isKycVerified: true,
            branchId,
          },
        }),
      ),
    );

    try {
      const concurrencyCount = 5;
      const substitutionPromises = testCustomers.map((cust, idx) =>
        installmentService.substituteSubscriber(
          removedTicket.id,
          checkerUserId,
          {
            newCustomerId: cust.id,
            reason: `Parallel substitution stress worker ${idx + 1}`,
          },
        ),
      );

      const results = await Promise.allSettled(substitutionPromises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // CRITICAL ASSERTION: Exactly 1 substitution succeeds
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(concurrencyCount - 1);

      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toContain('Subscriber substitution failed');
        }
      }

      // Verify that the ticket in DB is ACTIVE and assigned to the single winning customer
      const finalTicket = await prisma.subscriberTicket.findUnique({
        where: { id: removedTicket.id },
      });
      expect(finalTicket?.status).toBe('ACTIVE');
      expect(finalTicket?.consecutiveUnpaidMonths).toBe(0);
      const winningCustomerId = (fulfilled[0] as PromiseFulfilledResult<any>).value.ticket.newCustomerId;
      expect(finalTicket?.customerId).toBe(winningCustomerId);
    } finally {
      await prisma.subscriberTicket.delete({ where: { id: removedTicket.id } });
      await prisma.customer.deleteMany({
        where: { id: { in: [...testCustomers.map((c) => c.id), defaulterCustomer.id] } },
      });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Concurrent Receipt Sequencing & Branch Row-Locking
  // --------------------------------------------------------------------------
  it('CONCURR-INV-6: Concurrent payments in the same branch MUST acquire branch lock and issue collision-free, distinct receipt numbers', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-6: DB or required seed data not present');
      return;
    }

    const branchTickets = await prisma.subscriberTicket.findMany({
      where: {
        status: 'ACTIVE',
        chitGroupId: activeTicket.chitGroupId,
      },
      include: { chitGroup: true, customer: true },
      take: 2,
    });
    const ticket1 = branchTickets[0] || activeTicket;
    const ticket2 = branchTickets[1] || branchTickets[0];

    await prisma.installmentDue.updateMany({
      where: {
        ticketId: { in: [ticket1.id, ticket2.id] },
        status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
      },
      data: { status: DueStatus.PAID, paidAmount: 3750n },
    });

    const testMonth1 = 993;
    const testMonth2 = 994;

    const [due1, due2] = await Promise.all([
      prisma.installmentDue.create({
        data: {
          ticketId: ticket1.id,
          chitGroupId: ticket1.chitGroupId,
          installmentMonth: testMonth1,
          grossAmount: 5000n,
          dividendDeduction: 1000n,
          netPayableAmount: 4000n,
          dueDate: new Date(),
          status: DueStatus.UNPAID,
        },
      }),
      prisma.installmentDue.create({
        data: {
          ticketId: ticket2.id,
          chitGroupId: ticket2.chitGroupId,
          installmentMonth: testMonth2,
          grossAmount: 5000n,
          dividendDeduction: 1000n,
          netPayableAmount: 4000n,
          dueDate: new Date(),
          status: DueStatus.UNPAID,
        },
      }),
    ]);

    let payment1Id: string | undefined;
    let payment2Id: string | undefined;

    try {
      const [res1, res2] = await Promise.all([
        paymentService.recordPayment(
          {
            ticketId: ticket1.id,
            installmentMonth: testMonth1,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            notes: 'Concurrent receipt test 1',
          },
          makerUserId,
        ),
        paymentService.recordPayment(
          {
            ticketId: ticket2.id,
            installmentMonth: testMonth2,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            notes: 'Concurrent receipt test 2',
          },
          makerUserId,
        ),
      ]);

      payment1Id = res1.payment.id;
      payment2Id = res2.payment.id;

      // Critical assertions: Both payments must succeed with different receipt numbers
      expect(res1.payment.paymentStatus).toBe('SUCCESS');
      expect(res2.payment.paymentStatus).toBe('SUCCESS');
      expect(res1.receipt.receiptNumber).toBeDefined();
      expect(res2.receipt.receiptNumber).toBeDefined();
      expect(res1.receipt.receiptNumber).not.toEqual(res2.receipt.receiptNumber);
    } finally {
      if (payment1Id) {
        await prisma.paymentAllocation.deleteMany({ where: { paymentId: payment1Id } });
        await prisma.receipt.deleteMany({ where: { paymentId: payment1Id } });
        await prisma.payment.deleteMany({ where: { id: payment1Id } });
      }
      if (payment2Id) {
        await prisma.paymentAllocation.deleteMany({ where: { paymentId: payment2Id } });
        await prisma.receipt.deleteMany({ where: { paymentId: payment2Id } });
        await prisma.payment.deleteMany({ where: { id: payment2Id } });
      }
      await prisma.installmentDue.deleteMany({ where: { id: { in: [due1.id, due2.id] } } });
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Cross-Service Double-Payment Stampede (Collection vs Payment)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-7: parallel CollectionService + PaymentService workers racing on the exact same due MUST have 1 winner, 0 40P01 deadlocks, and 0 P2002 crashes', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-7: DB or required seed data not present');
      return;
    }

    const testMonth = 995;
    const testDue = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicket.id,
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: testMonth,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        status: DueStatus.UNPAID,
      },
    });

    try {
      const ts = Date.now();
      const workers = [
        collectionService.recordCollection(
          {
            ticketId: activeTicket.id,
            installmentMonth: testMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `defdb01-col-1-${ts}`,
          },
          makerUserId,
          activeTicket.chitGroup.branchId,
        ),
        paymentService.recordPayment(
          {
            ticketId: activeTicket.id,
            installmentMonth: testMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `defdb01-pay-1-${ts}`,
          },
          makerUserId,
          activeTicket.chitGroup.branchId,
        ),
        collectionService.recordCollection(
          {
            ticketId: activeTicket.id,
            installmentMonth: testMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `defdb01-col-2-${ts}`,
          },
          makerUserId,
          activeTicket.chitGroup.branchId,
        ),
        paymentService.recordPayment(
          {
            ticketId: activeTicket.id,
            installmentMonth: testMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `defdb01-pay-2-${ts}`,
          },
          makerUserId,
          activeTicket.chitGroup.branchId,
        ),
      ];

      const results = await Promise.allSettled(workers);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(3);

      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toContain('INSTALLMENT_ALREADY_PAID');
        }
      }

      const allocs = await prisma.paymentAllocation.findMany({
        where: { installmentDueId: testDue.id },
      });
      expect(allocs).toHaveLength(1);

      const finalDue = await prisma.installmentDue.findUnique({ where: { id: testDue.id } });
      expect(finalDue?.status).toBe(DueStatus.PAID);
    } finally {
      const allocs = await prisma.paymentAllocation.findMany({
        where: { installmentDueId: testDue.id },
      });
      const paymentIds = allocs.map((a) => a.paymentId);
      if (paymentIds.length > 0) {
        await prisma.receipt.deleteMany({ where: { paymentId: { in: paymentIds } } });
        await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      }
      await prisma.installmentDue.deleteMany({ where: { id: testDue.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 8: Cross-Service Same-Branch Parallel Receipt Sequencing Stampede
  // --------------------------------------------------------------------------
  it('CONCURR-INV-8: 6 parallel workers across Collection, Counter Payment, and UPI Verify in same branch MUST issue 6 unique sequential receipts with zero P2002', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-8: DB or required seed data not present');
      return;
    }

    const branchTickets = await prisma.subscriberTicket.findMany({
      where: {
        status: 'ACTIVE',
        chitGroupId: activeTicket.chitGroupId,
      },
      include: { chitGroup: true, customer: true },
      take: 6,
    });

    const branchTicketIds = branchTickets.map((t) => t.id);
    await prisma.installmentDue.updateMany({
      where: {
        ticketId: { in: branchTicketIds },
        status: { in: [DueStatus.UNPAID, DueStatus.OVERDUE] },
      },
      data: { status: DueStatus.PAID, paidAmount: 3750n },
    });

    const createdDueIds: string[] = [];
    const createdPreUpiPaymentIds: string[] = [];
    const ts = Date.now();

    try {
      const dues = [];
      for (let i = 0; i < 6; i++) {
        const targetTicket = branchTickets[i % branchTickets.length] || activeTicket;
        const due = await prisma.installmentDue.create({
          data: {
            ticketId: targetTicket.id,
            chitGroupId: targetTicket.chitGroupId,
            installmentMonth: 996 + i,
            grossAmount: 5000n,
            dividendDeduction: 1000n,
            netPayableAmount: 4000n,
            dueDate: new Date(),
            status: DueStatus.UNPAID,
          },
        });
        dues.push({ due, ticket: targetTicket });
        createdDueIds.push(due.id);
      }

      // Create 2 pending INITIATED UPI claims for workers 5 & 6
      const upiClaimIds: string[] = [];
      for (const idx of [4, 5]) {
        const item = dues[idx];
        const claim = await prisma.payment.create({
          data: {
            branchId: item.ticket.chitGroup.branchId,
            recordedByUserId: makerUserId,
            customerId: item.ticket.customerId,
            amount: 4000n,
            paymentMethod: PaymentMethod.UPI,
            paymentStatus: PaymentStatus.INITIATED,
            transactionRef: `UTR-INV8-${ts}-${idx}`,
            cashHandoverStatus: 'ACKNOWLEDGED',
          },
        });
        await prisma.paymentAllocation.create({
          data: {
            paymentId: claim.id,
            ticketId: item.ticket.id,
            installmentDueId: item.due.id,
            amountAllocated: 4000n,
          },
        });
        upiClaimIds.push(claim.id);
        createdPreUpiPaymentIds.push(claim.id);
      }

      const promises = [
        paymentService.recordPayment(
          {
            ticketId: dues[0].ticket.id,
            installmentMonth: dues[0].due.installmentMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `inv8-pay-0-${ts}`,
          },
          makerUserId,
          dues[0].ticket.chitGroup.branchId,
        ),
        collectionService.recordCollection(
          {
            ticketId: dues[1].ticket.id,
            installmentMonth: dues[1].due.installmentMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `inv8-col-1-${ts}`,
          },
          makerUserId,
          dues[1].ticket.chitGroup.branchId,
        ),
        paymentService.recordPayment(
          {
            ticketId: dues[2].ticket.id,
            installmentMonth: dues[2].due.installmentMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `inv8-pay-2-${ts}`,
          },
          makerUserId,
          dues[2].ticket.chitGroup.branchId,
        ),
        collectionService.recordCollection(
          {
            ticketId: dues[3].ticket.id,
            installmentMonth: dues[3].due.installmentMonth,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `inv8-col-3-${ts}`,
          },
          makerUserId,
          dues[3].ticket.chitGroup.branchId,
        ),
        paymentService.verifyUpiClaim(upiClaimIds[0], checkerUserId, [Role.SUPER_ADMIN]),
        paymentService.verifyUpiClaim(upiClaimIds[1], checkerUserId, [Role.SUPER_ADMIN]),
      ];

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      if (rejected.length > 0) {
        console.error(
          'CONCURR-INV-8 REJECTED REASONS:',
          rejected.map((r) => (r as PromiseRejectedResult).reason?.message || r),
        );
      }
      expect(fulfilled).toHaveLength(6);

      const receiptNumbers = fulfilled.map((r) => {
        const val: any = (r as PromiseFulfilledResult<any>).value;
        return val.receipt?.receiptNumber || val.receiptNumber;
      });
      expect(receiptNumbers.every((rn) => typeof rn === 'string' && rn.startsWith('KC-REC-'))).toBe(
        true,
      );
      expect(new Set(receiptNumbers).size).toBe(6);

      // Sequence numbers issued must form a clean contiguous block of 6
      const numericSeqs = receiptNumbers
        .map((rn: string) => parseInt(rn.split('-').pop() || '0', 10))
        .sort((a, b) => a - b);
      for (let i = 1; i < numericSeqs.length; i++) {
        expect(numericSeqs[i] - numericSeqs[i - 1]).toBe(1);
      }
    } finally {
      const allocs = await prisma.paymentAllocation.findMany({
        where: { installmentDueId: { in: createdDueIds } },
      });
      const paymentIds = [...new Set([...createdPreUpiPaymentIds, ...allocs.map((a) => a.paymentId)])];
      if (paymentIds.length > 0) {
        await prisma.receipt.deleteMany({ where: { paymentId: { in: paymentIds } } });
        await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      }
      await prisma.installmentDue.deleteMany({ where: { id: { in: createdDueIds } } });
    }
  }, 25000);

  // --------------------------------------------------------------------------
  // Scenario 9: Concurrent verifyUpiClaim Stampede & verifyUpiClaim vs Cash Race
  // --------------------------------------------------------------------------
  it('CONCURR-INV-9: simultaneous verifyUpiClaim checks and verifyUpiClaim vs recordCollection MUST allow strictly 1 settlement', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-9: DB or required seed data not present');
      return;
    }

    const ts = Date.now();
    const dueA = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicket.id,
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: 1002,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        status: DueStatus.UNPAID,
      },
    });
    const dueB = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicket.id,
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: 1003,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        status: DueStatus.UNPAID,
      },
    });

    const claimA = await prisma.payment.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        recordedByUserId: makerUserId,
        customerId: activeTicket.customerId,
        amount: 4000n,
        paymentMethod: PaymentMethod.UPI,
        paymentStatus: PaymentStatus.INITIATED,
        transactionRef: `UTR-INV9A-${ts}`,
        cashHandoverStatus: 'ACKNOWLEDGED',
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        paymentId: claimA.id,
        ticketId: activeTicket.id,
        installmentDueId: dueA.id,
        amountAllocated: 4000n,
      },
    });

    const claimB = await prisma.payment.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        recordedByUserId: makerUserId,
        customerId: activeTicket.customerId,
        amount: 4000n,
        paymentMethod: PaymentMethod.UPI,
        paymentStatus: PaymentStatus.INITIATED,
        transactionRef: `UTR-INV9B-${ts}`,
        cashHandoverStatus: 'ACKNOWLEDGED',
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        paymentId: claimB.id,
        ticketId: activeTicket.id,
        installmentDueId: dueB.id,
        amountAllocated: 4000n,
      },
    });

    try {
      // (a) 5 parallel verifyUpiClaim calls on claimA
      const verifyStampede = Array.from({ length: 5 }).map(() =>
        paymentService.verifyUpiClaim(claimA.id, checkerUserId, [Role.SUPER_ADMIN]),
      );
      const stampedeResults = await Promise.allSettled(verifyStampede);
      expect(stampedeResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(stampedeResults.filter((r) => r.status === 'rejected')).toHaveLength(4);
      expect(await prisma.receipt.count({ where: { paymentId: claimA.id } })).toBe(1);

      // (b) Simultaneous verifyUpiClaim(claimB) vs recordCollection(dueB)
      const raceResults = await Promise.allSettled([
        paymentService.verifyUpiClaim(claimB.id, checkerUserId, [Role.SUPER_ADMIN]),
        collectionService.recordCollection(
          {
            ticketId: activeTicket.id,
            installmentMonth: 1003,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            idempotencyKey: `inv9b-cash-${ts}`,
          },
          makerUserId,
          activeTicket.chitGroup.branchId,
        ),
      ]);
      expect(raceResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(raceResults.filter((r) => r.status === 'rejected')).toHaveLength(1);

      const finalReceiptsForDueB = await prisma.receipt.count({
        where: {
          payment: { allocations: { some: { installmentDueId: dueB.id } } },
        },
      });
      expect(finalReceiptsForDueB).toBe(1);
    } finally {
      const allocs = await prisma.paymentAllocation.findMany({
        where: { installmentDueId: { in: [dueA.id, dueB.id] } },
      });
      const paymentIds = [...new Set([claimA.id, claimB.id, ...allocs.map((a) => a.paymentId)])];
      await prisma.receipt.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await prisma.installmentDue.deleteMany({ where: { id: { in: [dueA.id, dueB.id] } } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 10: Concurrent ReconciliationService vs verifyUpiClaim Ghost Drop Race
  // --------------------------------------------------------------------------
  it('CONCURR-INV-10: concurrent ReconciliationService ghost-drop auto-resolution and verifyUpiClaim MUST mint strictly 1 receipt with 0 exceptions', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-10: DB or required seed data not present');
      return;
    }

    const ts = Date.now();
    const orderRef = `ORDER-INV10-${ts}`;
    const due = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicket.id,
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: 1004,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        status: DueStatus.UNPAID,
      },
    });

    const ghostPayment = await prisma.payment.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        recordedByUserId: makerUserId,
        customerId: activeTicket.customerId,
        amount: 4000n,
        paymentMethod: PaymentMethod.UPI,
        paymentStatus: PaymentStatus.INITIATED,
        transactionRef: orderRef,
        cashHandoverStatus: 'ACKNOWLEDGED',
      },
    });
    await prisma.paymentAllocation.create({
      data: {
        paymentId: ghostPayment.id,
        ticketId: activeTicket.id,
        installmentDueId: due.id,
        amountAllocated: 4000n,
      },
    });

    try {
      const [reconRes, verifyRes] = await Promise.allSettled([
        reconciliationService.reconcileSettlement([
          {
            gatewayOrderId: orderRef,
            gatewayPaymentId: `gw-${ts}`,
            amount: 4000n,
            status: 'SUCCESS',
            settledAt: new Date(),
          },
        ]),
        paymentService.verifyUpiClaim(ghostPayment.id, checkerUserId, [Role.SUPER_ADMIN]),
      ]);

      expect(reconRes.status).toBe('fulfilled');
      if (reconRes.status === 'fulfilled') {
        expect(reconRes.value.exceptionCount).toBe(0);
        // Either reconciliation resolved the ghost drop OR verifyUpiClaim settled it concurrently (matchedCount === 1)
        expect(reconRes.value.autoResolvedGhostDropsCount + reconRes.value.matchedCount).toBe(1);
        if (reconRes.value.matchedCount === 1) {
          expect(verifyRes.status).toBe('fulfilled');
        } else {
          expect(verifyRes.status).toBe('rejected');
        }
      }

      const dbPayment = await prisma.payment.findUnique({ where: { id: ghostPayment.id } });
      const dbReceiptCount = await prisma.receipt.count({ where: { paymentId: ghostPayment.id } });
      expect(dbPayment?.paymentStatus).toBe(PaymentStatus.SUCCESS);
      expect(dbReceiptCount).toBe(1);
    } finally {
      await prisma.receipt.deleteMany({ where: { paymentId: ghostPayment.id } });
      await prisma.paymentAllocation.deleteMany({ where: { paymentId: ghostPayment.id } });
      await prisma.payment.deleteMany({ where: { id: ghostPayment.id } });
      await prisma.installmentDue.deleteMany({ where: { id: due.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 11: Concurrent Safety Proof Verification Stampede (Disbursement)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-11: 5 parallel workers racing verifySafetyProof MUST result in strictly 1 VERIFIED_BY_MAKER and 4 rejected (DEF-DB-02)', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-11: DB or required seed data not present');
      return;
    }

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: 981,
        auctionDate: new Date(),
        status: AuctionStatus.COMPLETED,
        bidDiscount: 20000n,
        foremanCommissionRate: 4.0,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        conductedByUserId: makerUserId,
        finalizedByUserId: checkerUserId || makerUserId,
        winner: {
          create: {
            ticketId: activeTicket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'PENDING_VERIFICATION',
          },
        },
      },
      include: { winner: true },
    });

    try {
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        disbursementService.verifySafetyProof(
          testAuction.id,
          {
            isSecurityRequired: false,
            agreementSigned: true,
            nomineeSigned: true,
            notes: `Parallel safety verify #${idx + 1}`,
          },
          makerUserId,
        ),
      );

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);

      const dbWinner = await prisma.auctionWinner.findUnique({
        where: { id: testAuction.winner!.id },
      });
      expect(dbWinner?.disbursementStatus).toBe('VERIFIED_BY_MAKER');
    } finally {
      await prisma.auctionWinner.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auction.delete({ where: { id: testAuction.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 12: Concurrent Payout Authorization Stampede (Disbursement)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-12: 5 parallel Checkers racing authorizePayout MUST result in strictly 1 AUTHORIZED_BY_CHECKER and 4 rejected (DEF-DB-02)', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-12: DB or required seed data not present');
      return;
    }

    const ts = Date.now();
    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        groupCode: `KC-INV12-${ts}`,
        groupName: 'Concurrency Payout Authorization Stampede Scheme',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2027-08-31T00:00:00Z'),
      },
    });

    const tempTicket = await prisma.subscriberTicket.create({
      data: {
        chitGroupId: tempChit.id,
        customerId: activeTicket.customerId,
        ticketNumber: 2,
        isPrized: true,
        status: 'ACTIVE',
      },
    });

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: tempChit.id,
        installmentMonth: 2,
        auctionDate: new Date(),
        status: AuctionStatus.COMPLETED,
        bidDiscount: 20000n,
        foremanCommissionRate: 4.0,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        conductedByUserId: makerUserId,
        finalizedByUserId: checkerUserId,
        winner: {
          create: {
            ticketId: tempTicket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'VERIFIED_BY_MAKER',
            agreementSigned: true,
            nomineeSigned: true,
            verifiedByUserId: makerUserId,
          },
        },
      },
      include: { winner: true },
    });

    try {
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        disbursementService.authorizePayout(
          testAuction.id,
          {
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            notes: `Concurrent auth #${idx + 1}`,
          },
          checkerUserId,
          [Role.SUPER_ADMIN],
        ),
      );

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toMatch(/PRIZE_ALREADY_AUTHORIZED|VERIFIED_BY_MAKER/);
        }
      }

      const dbWinner = await prisma.auctionWinner.findUnique({
        where: { id: testAuction.winner!.id },
      });
      expect(dbWinner?.disbursementStatus).toBe('AUTHORIZED_BY_CHECKER');
    } finally {
      await prisma.auctionWinner.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auction.deleteMany({ where: { id: testAuction.id } });
      await prisma.subscriberTicket.deleteMany({ where: { id: tempTicket.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 13: Concurrent Final Month N Settlement Stampede (Disbursement)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-13: 3 parallel Super Admins racing settleFinalMonth MUST result in strictly 1 COMPLETED settlement and clean rejections', async () => {
    if (!isDbConnected || !activeTicket || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-13: DB or required seed data not present');
      return;
    }

    const ts = Date.now();
    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        groupCode: `KC-RACE-MN-${ts}`,
        groupName: 'Final Settlement Race Test Scheme',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        status: 'ACTIVE',
        startDate: new Date('2025-01-01T00:00:00Z'),
        endDate: new Date('2026-08-31T00:00:00Z'),
      },
    });

    const tempTicket = await prisma.subscriberTicket.create({
      data: {
        chitGroupId: tempChit.id,
        customerId: activeTicket.customerId,
        ticketNumber: 20,
        isPrized: false,
        status: 'ACTIVE',
      },
    });

    try {
      const promises = Array.from({ length: 3 }).map((_, idx) =>
        disbursementService.settleFinalMonth(
          tempChit.id,
          {
            ticketId: tempTicket.id,
            disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
            paymentReference: `MN-REF-${ts}-${idx + 1}`,
            makerUserId,
          },
          checkerUserId,
          [Role.SUPER_ADMIN],
        ),
      );

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason.message).toMatch(
            /FINAL_SETTLEMENT_ALREADY_EXECUTED|already prized|Final settlement can only be executed for ACTIVE/,
          );
        }
      }

      const finalChit = await prisma.chitGroup.findUnique({ where: { id: tempChit.id } });
      expect(finalChit?.status).toBe('COMPLETED');
      expect(await prisma.auction.count({ where: { chitGroupId: tempChit.id } })).toBe(1);
    } finally {
      await prisma.installmentDue.deleteMany({ where: { ticketId: tempTicket.id } });
      await prisma.auctionWinner.deleteMany({ where: { ticketId: tempTicket.id } });
      await prisma.auction.deleteMany({ where: { chitGroupId: tempChit.id } });
      await prisma.subscriberTicket.deleteMany({ where: { id: tempTicket.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 14: Concurrent Reversal Approve vs Reject Split-Brain Prevention
  // --------------------------------------------------------------------------
  it('CONCURR-INV-14: simultaneous approveReversal and rejectReversal MUST result in 1 winner, 1 rejection, and zero ledger split-brain', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-14: DB or required seed data not present');
      return;
    }

    const testDue = await prisma.installmentDue.create({
      data: {
        ticketId: activeTicket.id,
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: 983,
        grossAmount: 5000n,
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
        dueDate: new Date(),
        paidAmount: 4000n,
        status: DueStatus.PAID,
      },
    });

    const testPayment = await prisma.payment.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        recordedByUserId: makerUserId,
        customerId: activeTicket.customerId,
        amount: 4000n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.SUCCESS,
        cashHandoverStatus: 'ACKNOWLEDGED',
      },
    });

    await prisma.paymentAllocation.create({
      data: {
        paymentId: testPayment.id,
        ticketId: activeTicket.id,
        installmentDueId: testDue.id,
        amountAllocated: 4000n,
      },
    });

    await prisma.paymentReversal.create({
      data: {
        paymentId: testPayment.id,
        reason: 'CONCURR_SPLIT_BRAIN_TEST',
        status: 'REQUESTED',
        initiatedByUserId: makerUserId,
      },
    });

    try {
      const results = await Promise.allSettled([
        paymentService.approveReversal(
          testPayment.id,
          { notes: 'Approve race' },
          checkerUserId,
          [Role.SUPER_ADMIN],
        ),
        paymentService.rejectReversal(
          testPayment.id,
          { rejectionReason: 'Reject race' },
          checkerUserId,
          [Role.SUPER_ADMIN],
        ),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

      const finalPayment = await prisma.payment.findUnique({
        where: { id: testPayment.id },
        include: { reversal: true },
      });
      const finalDue = await prisma.installmentDue.findUnique({ where: { id: testDue.id } });

      // Atomic consistency invariant: no split-brain between Payment, PaymentReversal, and InstallmentDue!
      if (finalPayment?.paymentStatus === PaymentStatus.REVERSED) {
        expect(finalPayment.reversal?.status).toBe('APPROVED');
        expect(finalDue?.status).toBe(DueStatus.UNPAID);
        expect(finalDue?.paidAmount).toBe(0n);
      } else {
        expect(finalPayment?.paymentStatus).toBe(PaymentStatus.SUCCESS);
        expect(finalPayment?.reversal?.status).toBe('REJECTED');
        expect(finalDue?.status).toBe(DueStatus.PAID);
        expect(finalDue?.paidAmount).toBe(4000n);
      }
    } finally {
      await prisma.paymentReversal.deleteMany({ where: { paymentId: testPayment.id } });
      await prisma.paymentAllocation.deleteMany({ where: { paymentId: testPayment.id } });
      await prisma.payment.deleteMany({ where: { id: testPayment.id } });
      await prisma.installmentDue.deleteMany({ where: { id: testDue.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 15: ADR-13 Concurrent Duplicate-Customer Substitution Race
  // --------------------------------------------------------------------------
  it('CONCURR-INV-15: simultaneous substituteSubscriber onto 2 vacated tickets in the SAME chitGroup with the SAME customerId MUST reject 1 with ConflictException (ADR-13)', async () => {
    if (!isDbConnected || !activeTicket || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-15: DB or required seed data not present');
      return;
    }

    const branchId = activeTicket.customer.branchId;
    const ts = Date.now();

    const [def1, def2, candidate] = await Promise.all([
      prisma.customer.create({
        data: {
          customerCode: `KC-DEF1-${ts}`,
          fullName: 'Vacated One',
          phone: `91811${String(ts).slice(-5)}1`,
          addressLine1: 'Perundurai',
          city: 'Erode',
          pincode: '638052',
          isKycVerified: true,
          branchId,
        },
      }),
      prisma.customer.create({
        data: {
          customerCode: `KC-DEF2-${ts}`,
          fullName: 'Vacated Two',
          phone: `91812${String(ts).slice(-5)}2`,
          addressLine1: 'Perundurai',
          city: 'Erode',
          pincode: '638052',
          isKycVerified: true,
          branchId,
        },
      }),
      prisma.customer.create({
        data: {
          customerCode: `KC-CAND-${ts}`,
          fullName: 'Single Candidate Subscriber',
          phone: `91813${String(ts).slice(-5)}3`,
          addressLine1: 'Perundurai',
          city: 'Erode',
          pincode: '638052',
          isKycVerified: true,
          branchId,
        },
      }),
    ]);

    const [tkt1, tkt2] = await Promise.all([
      prisma.subscriberTicket.create({
        data: {
          chitGroupId: activeTicket.chitGroupId,
          customerId: def1.id,
          ticketNumber: 9997,
          status: 'REMOVED_DEF_3M',
          consecutiveUnpaidMonths: 3,
          removedAt: new Date(),
          removedByUserId: checkerUserId,
        },
      }),
      prisma.subscriberTicket.create({
        data: {
          chitGroupId: activeTicket.chitGroupId,
          customerId: def2.id,
          ticketNumber: 9998,
          status: 'REMOVED_DEF_3M',
          consecutiveUnpaidMonths: 3,
          removedAt: new Date(),
          removedByUserId: checkerUserId,
        },
      }),
    ]);

    try {
      const results = await Promise.allSettled([
        installmentService.substituteSubscriber(tkt1.id, checkerUserId, {
          newCustomerId: candidate.id,
          reason: 'Race sub 1',
        }),
        installmentService.substituteSubscriber(tkt2.id, checkerUserId, {
          newCustomerId: candidate.id,
          reason: 'Race sub 2',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (rejected[0]?.status === 'rejected') {
        expect(rejected[0].reason).toBeInstanceOf(ConflictException);
        expect(rejected[0].reason.message).toContain('ADR-13 Violation');
      }
    } finally {
      await prisma.subscriberTicket.deleteMany({ where: { id: { in: [tkt1.id, tkt2.id] } } });
      await prisma.customer.deleteMany({
        where: { id: { in: [def1.id, def2.id, candidate.id] } },
      });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 16: Cross-Method Auction Lock Alignment (finalizeAuction vs recordBid/recordTieBreak)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-16: simultaneous finalizeAuction, recordBid & recordTieBreak MUST never revert COMPLETED back to SCHEDULED (DEF-DB-02)', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-16: DB or required seed data not present');
      return;
    }

    const branchId = activeTicket.chitGroup.branchId;
    const ts = Date.now();
    const todayIso = new Date().toISOString().split('T')[0];

    const [cust1, cust2] = await Promise.all([
      prisma.customer.create({
        data: {
          customerCode: `KC-AUC1-${ts}`,
          fullName: 'Auction Race Member One',
          phone: `91821${String(ts).slice(-5)}1`,
          addressLine1: 'Perundurai',
          city: 'Erode',
          pincode: '638052',
          isKycVerified: true,
          branchId,
        },
      }),
      prisma.customer.create({
        data: {
          customerCode: `KC-AUC2-${ts}`,
          fullName: 'Auction Race Member Two',
          phone: `91822${String(ts).slice(-5)}2`,
          addressLine1: 'Perundurai',
          city: 'Erode',
          pincode: '638052',
          isKycVerified: true,
          branchId,
        },
      }),
    ]);

    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId,
        groupCode: `KC-RACE-AUC-${ts}`,
        groupName: 'Cross-Method Auction Race Scheme',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2027-08-31T00:00:00Z'),
      },
    });

    const [tkt1, tkt2] = await Promise.all([
      prisma.subscriberTicket.create({
        data: {
          chitGroupId: tempChit.id,
          customerId: cust1.id,
          ticketNumber: 1,
          isPrized: false,
          status: 'ACTIVE',
        },
      }),
      prisma.subscriberTicket.create({
        data: {
          chitGroupId: tempChit.id,
          customerId: cust2.id,
          ticketNumber: 2,
          isPrized: false,
          status: 'ACTIVE',
        },
      }),
    ]);

    const tempAuction = await prisma.auction.create({
      data: {
        chitGroupId: tempChit.id,
        installmentMonth: 2,
        auctionDate: new Date(),
        status: AuctionStatus.SCHEDULED,
        bidDiscount: 20000n,
        foremanCommissionRate: 4.0,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        conductedByUserId: makerUserId,
        winner: {
          create: {
            ticketId: tkt1.id,
            wasTieBreakWinner: false,
          },
        },
      },
    });

    try {
      const results = await Promise.allSettled([
        auctionService.finalizeAuction(tempAuction.id, checkerUserId, {
          subscribersPresent: 16,
          signedByForeman: true,
        }),
        auctionService.recordBid(
          tempChit.id,
          2,
          { ticketId: tkt2.id, bidDiscount: 22000, auctionDate: todayIso },
          makerUserId,
        ),
        auctionService.recordTieBreak(
          tempChit.id,
          2,
          {
            winningTicketId: tkt2.id,
            bidDiscount: 25000,
            auctionDate: todayIso,
            tiedTickets: [
              { ticketId: tkt1.id, tokenNumber: 1 },
              { ticketId: tkt2.id, tokenNumber: 2 },
            ],
          },
          makerUserId,
        ),
      ]);

      // Finalization MUST commit cleanly regardless of lock acquisition order
      expect(results[0].status).toBe('fulfilled');

      // Auction MUST remain strictly COMPLETED (zero COMPLETED -> SCHEDULED overwrite)
      const finalAuction = await prisma.auction.findUnique({
        where: { id: tempAuction.id },
        include: { winner: true, minutes: true },
      });
      expect(finalAuction?.status).toBe(AuctionStatus.COMPLETED);
      expect(finalAuction?.minutes).toBeTruthy();

      // Winner ticket prized flag and AUCTION_FINALIZED audit trail MUST match DB winner atomically
      const winningTicket = await prisma.subscriberTicket.findUnique({
        where: { id: finalAuction!.winner!.ticketId },
      });
      expect(winningTicket?.isPrized).toBe(true);
      expect(winningTicket?.prizedAuctionId).toBe(tempAuction.id);
    } finally {
      await prisma.auctionMinutes.deleteMany({ where: { auctionId: tempAuction.id } });
      await prisma.auctionTieBidder.deleteMany({ where: { auctionId: tempAuction.id } });
      await prisma.auctionWinner.deleteMany({ where: { auctionId: tempAuction.id } });
      await prisma.auction.deleteMany({ where: { id: tempAuction.id } });
      await prisma.subscriberTicket.deleteMany({ where: { chitGroupId: tempChit.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
      await prisma.customer.deleteMany({ where: { id: { in: [cust1.id, cust2.id] } } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 17: Concurrent Registrar Minutes Filing Stampede (Auction)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-17: 5 parallel workers racing markMinutesFiled MUST result in strictly 1 filing and 4 rejections (DEF-DB-02)', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId || !checkerUserId) {
      console.warn('Skipping CONCURR-INV-17: DB or required seed data not present');
      return;
    }

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: 984,
        auctionDate: new Date(),
        status: AuctionStatus.COMPLETED,
        bidDiscount: 20000n,
        foremanCommissionRate: 4.0,
        foremanCommissionAmount: 4000n,
        totalDividend: 16000n,
        dividendPerTicket: 800n,
        prizeMoney: 80000n,
        conductedByUserId: makerUserId,
        finalizedByUserId: checkerUserId,
        minutes: {
          create: {
            subscribersPresent: 14,
            minutesText: 'Minutes Stampede Proof',
            signedByForeman: true,
            filedAtRegistrar: false,
          },
        },
      },
      include: { minutes: true },
    });

    try {
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        auctionService.markMinutesFiled(
          testAuction.id,
          { filingReference: `ROC-RACE-${idx + 1}` },
          makerUserId,
        ),
      );

      const results = await Promise.allSettled(promises);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);

      const finalMinute = await prisma.auctionMinutes.findUnique({
        where: { auctionId: testAuction.id },
      });
      expect(finalMinute?.filedAtRegistrar).toBe(true);
    } finally {
      await prisma.auctionMinutes.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auction.deleteMany({ where: { id: testAuction.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 18: Concurrent Monthly Due Generation Serialization (Installment)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-18: 5 parallel workers calling generateMonthlyDues on a fresh month MUST serialize with zero P2002 crashes', async () => {
    if (!isDbConnected || !activeTicket) {
      console.warn('Skipping CONCURR-INV-18: DB or required seed data not present');
      return;
    }

    const branchId = activeTicket.chitGroup.branchId;
    const ts = Date.now();

    const [cust1, cust2] = await Promise.all([
      prisma.customer.create({
        data: {
          customerCode: `KC-DUE1-${ts}`,
          fullName: 'Dues Gen One',
          phone: `91831${String(ts).slice(-5)}1`,
          addressLine1: 'Perundurai',
          city: 'Erode',
          pincode: '638052',
          isKycVerified: true,
          branchId,
        },
      }),
      prisma.customer.create({
        data: {
          customerCode: `KC-DUE2-${ts}`,
          fullName: 'Dues Gen Two',
          phone: `91832${String(ts).slice(-5)}2`,
          addressLine1: 'Perundurai',
          city: 'Erode',
          pincode: '638052',
          isKycVerified: true,
          branchId,
        },
      }),
    ]);

    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId,
        groupCode: `KC-RACE-DUE-${ts}`,
        groupName: 'Concurrent Dues Generation Scheme',
        chitValue: 100000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 5000n,
        maxDiscountCeiling: 25000n,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2027-08-31T00:00:00Z'),
      },
    });

    await Promise.all([
      prisma.subscriberTicket.create({
        data: {
          chitGroupId: tempChit.id,
          customerId: cust1.id,
          ticketNumber: 1,
          status: 'ACTIVE',
        },
      }),
      prisma.subscriberTicket.create({
        data: {
          chitGroupId: tempChit.id,
          customerId: cust2.id,
          ticketNumber: 2,
          status: 'ACTIVE',
        },
      }),
    ]);

    try {
      const results = await Promise.allSettled(
        Array.from({ length: 5 }).map(() =>
          installmentService.generateMonthlyDues(tempChit.id, 1, {}),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);

      const dues = await prisma.installmentDue.findMany({
        where: { chitGroupId: tempChit.id, installmentMonth: 1 },
      });
      expect(dues).toHaveLength(2);
      expect(dues.every((d) => d.netPayableAmount === 5000n)).toBe(true);
    } finally {
      await prisma.installmentDue.deleteMany({ where: { chitGroupId: tempChit.id } });
      await prisma.subscriberTicket.deleteMany({ where: { chitGroupId: tempChit.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
      await prisma.customer.deleteMany({ where: { id: { in: [cust1.id, cust2.id] } } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 19: Concurrent Payment Reversal Request Stampede (Payment)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-19: 5 parallel Makers racing requestReversal on the same payment MUST create strictly 1 REQUESTED reversal and reject 4', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-19: DB or required seed data not present');
      return;
    }

    const testPayment = await prisma.payment.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        recordedByUserId: makerUserId,
        customerId: activeTicket.customerId,
        amount: 4000n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.SUCCESS,
        cashHandoverStatus: 'ACKNOWLEDGED',
      },
    });

    try {
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        paymentService.requestReversal(
          testPayment.id,
          { reason: `Concurrent reversal request #${idx + 1}` },
          makerUserId,
        ),
      );

      const results = await Promise.allSettled(promises);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);

      const reversals = await prisma.paymentReversal.findMany({
        where: { paymentId: testPayment.id },
      });
      expect(reversals).toHaveLength(1);
      expect(reversals[0].status).toBe('REQUESTED');
    } finally {
      await prisma.paymentReversal.deleteMany({ where: { paymentId: testPayment.id } });
      await prisma.payment.deleteMany({ where: { id: testPayment.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 20: DEF-DB-05 Live pg_indexes Catalog Verification
  // --------------------------------------------------------------------------
  it('CONCURR-INV-20: PostgreSQL pg_indexes MUST enforce all PaymentAllocation FK indexes and AuctionTieBidder unique/FK indexes (DEF-DB-05)', async () => {
    if (!isDbConnected) {
      console.warn('Skipping CONCURR-INV-20: DB not connected');
      return;
    }

    const rows = await prisma.$queryRaw<
      Array<{ tablename: string; indexname: string; indexdef: string }>
    >`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('PaymentAllocation', 'AuctionTieBidder')
      ORDER BY tablename, indexname;
    `;

    const indexMap = new Map(rows.map((r) => [r.indexname, r.indexdef]));

    expect(indexMap.get('AuctionTieBidder_auctionId_ticketId_key')).toContain(
      'CREATE UNIQUE INDEX',
    );
    expect(indexMap.get('AuctionTieBidder_ticketId_idx')).toContain('CREATE INDEX');
    expect(indexMap.get('AuctionTieBidder_ticketId_idx')).not.toContain('UNIQUE INDEX');

    expect(indexMap.get('PaymentAllocation_paymentId_idx')).toContain('CREATE INDEX');
    expect(indexMap.get('PaymentAllocation_paymentId_idx')).not.toContain('UNIQUE INDEX');
    expect(indexMap.get('PaymentAllocation_ticketId_idx')).toContain('CREATE INDEX');
    expect(indexMap.get('PaymentAllocation_ticketId_idx')).not.toContain('UNIQUE INDEX');
    expect(indexMap.get('PaymentAllocation_installmentDueId_idx')).toContain('CREATE INDEX');
    expect(indexMap.get('PaymentAllocation_installmentDueId_idx')).not.toContain('UNIQUE INDEX');
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 21: DEF-DB-05 AuctionTieBidder Duplicate Prevention (App + DB)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-21: AuctionTieBidder MUST block duplicate (auctionId, ticketId) at both service and PostgreSQL unique constraint levels', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-21: DB or required seed data not present');
      return;
    }

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: 983,
        auctionDate: new Date(),
        status: AuctionStatus.SCHEDULED,
        bidDiscount: 25000n,
        conductedByUserId: makerUserId,
      },
    });

    try {
      // 1. Service-level duplicate ticket check fails fast with BadRequestException
      await expect(
        auctionService.recordTieBreak(
          activeTicket.chitGroupId,
          983,
          {
            tiedTickets: [
              { ticketId: activeTicket.id, tokenNumber: 1 },
              { ticketId: activeTicket.id, tokenNumber: 2 },
            ],
            winningTicketId: activeTicket.id,
            bidDiscount: 25000,
            auctionDate: new Date().toISOString(),
          },
          makerUserId,
        ),
      ).rejects.toThrow(BadRequestException);

      // 2. Direct DB insert of same (auctionId, ticketId) fails with PostgreSQL P2002
      await prisma.auctionTieBidder.create({
        data: {
          auctionId: testAuction.id,
          ticketId: activeTicket.id,
          bidDiscount: 25000n,
          tokenNumber: 1,
          isWinner: true,
        },
      });

      await expect(
        prisma.auctionTieBidder.create({
          data: {
            auctionId: testAuction.id,
            ticketId: activeTicket.id,
            bidDiscount: 25000n,
            tokenNumber: 2,
            isWinner: false,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.auctionTieBidder.deleteMany({ where: { auctionId: testAuction.id } });
      await prisma.auction.deleteMany({ where: { id: testAuction.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 22: DEF-DB-05 PaymentAllocation Append-Only Multiplicity Invariant
  // --------------------------------------------------------------------------
  it('CONCURR-INV-22: PaymentAllocation non-unique indexes MUST permit multiple allocations per (ticketId, installmentDueId) across reversed + re-paid payments', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-22: DB or required seed data not present');
      return;
    }

    const tempDue = await prisma.installmentDue.create({
      data: {
        chitGroupId: activeTicket.chitGroupId,
        ticketId: activeTicket.id,
        installmentMonth: 982,
        dueDate: new Date(),
        grossAmount: 5000n,
        dividendDeduction: 0n,
        netPayableAmount: 5000n,
        paidAmount: 0n,
        status: DueStatus.UNPAID,
      },
    });

    const pmtReversed = await prisma.payment.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        recordedByUserId: makerUserId,
        customerId: activeTicket.customerId,
        amount: 5000n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.REVERSED,
      },
    });

    const pmtSettled = await prisma.payment.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        recordedByUserId: makerUserId,
        customerId: activeTicket.customerId,
        amount: 5000n,
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.SUCCESS,
      },
    });

    try {
      await prisma.paymentAllocation.create({
        data: {
          paymentId: pmtReversed.id,
          ticketId: activeTicket.id,
          installmentDueId: tempDue.id,
          amountAllocated: 5000n,
        },
      });

      await prisma.paymentAllocation.create({
        data: {
          paymentId: pmtSettled.id,
          ticketId: activeTicket.id,
          installmentDueId: tempDue.id,
          amountAllocated: 5000n,
        },
      });

      const allocations = await prisma.paymentAllocation.findMany({
        where: { ticketId: activeTicket.id, installmentDueId: tempDue.id },
      });
      expect(allocations).toHaveLength(2);
    } finally {
      await prisma.paymentAllocation.deleteMany({
        where: { paymentId: { in: [pmtReversed.id, pmtSettled.id] } },
      });
      await prisma.payment.deleteMany({
        where: { id: { in: [pmtReversed.id, pmtSettled.id] } },
      });
      await prisma.installmentDue.deleteMany({ where: { id: tempDue.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 23: DEF-DB-05 PostgreSQL Query Planner EXPLAIN Index Binding
  // --------------------------------------------------------------------------
  it('CONCURR-INV-23: PostgreSQL EXPLAIN planner MUST bind all 5 DEF-DB-05 indexes without requiring Seq Scan', async () => {
    if (!isDbConnected || !activeTicket) {
      console.warn('Skipping CONCURR-INV-23: DB not connected or seed missing');
      return;
    }

    const probeId = activeTicket.id;

    const plans = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return {
        byPayment: await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': any }>>(
          `EXPLAIN (FORMAT JSON) SELECT * FROM "PaymentAllocation" WHERE "paymentId" = '${probeId}'`,
        ),
        byTicket: await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': any }>>(
          `EXPLAIN (FORMAT JSON) SELECT * FROM "PaymentAllocation" WHERE "ticketId" = '${probeId}'`,
        ),
        byDue: await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': any }>>(
          `EXPLAIN (FORMAT JSON) SELECT * FROM "PaymentAllocation" WHERE "installmentDueId" = '${probeId}'`,
        ),
        tieByAuction: await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': any }>>(
          `EXPLAIN (FORMAT JSON) SELECT * FROM "AuctionTieBidder" WHERE "auctionId" = '${probeId}'`,
        ),
        tieByTicket: await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': any }>>(
          `EXPLAIN (FORMAT JSON) SELECT * FROM "AuctionTieBidder" WHERE "ticketId" = '${probeId}'`,
        ),
      };
    });

    expect(JSON.stringify(plans.byPayment)).toContain('PaymentAllocation_paymentId_idx');
    expect(JSON.stringify(plans.byTicket)).toContain('PaymentAllocation_ticketId_idx');
    expect(JSON.stringify(plans.byDue)).toContain('PaymentAllocation_installmentDueId_idx');
    expect(JSON.stringify(plans.tieByAuction)).toContain('AuctionTieBidder_auctionId_ticketId_key');
    expect(JSON.stringify(plans.tieByTicket)).toContain('AuctionTieBidder_ticketId_idx');
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 24: DEF-DB-07 Concurrent NEW_GROUP Chit Activation Stampede
  // --------------------------------------------------------------------------
  it('CONCURR-INV-24: 5 parallel Admins racing to activate same NEW_GROUP chit MUST yield strictly 1 ACTIVE winner, 4 BadRequestExceptions, and 1 Month-1 Auction (DEF-DB-07)', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-24: DB or required seed data not present');
      return;
    }

    const customers = await prisma.customer.findMany({ take: 2, orderBy: { id: 'asc' } });
    if (customers.length < 2) {
      console.warn('Skipping CONCURR-INV-24: fewer than 2 seeded customers present');
      return;
    }

    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        groupCode: `CONCURR-DB07-ACT-${Date.now()}`,
        groupName: 'Concurrency Activation Stampede Test',
        chitValue: 20000n,
        durationMonths: 2,
        totalTickets: 2,
        baseInstallment: 10000n,
        maxDiscountCeiling: 5000n,
        initMode: InitializationMode.NEW_GROUP,
        status: ChitStatus.DRAFT,
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
      },
    });

    try {
      await prisma.subscriberTicket.createMany({
        data: [
          { chitGroupId: tempChit.id, customerId: customers[0].id, ticketNumber: 1 },
          { chitGroupId: tempChit.id, customerId: customers[1].id, ticketNumber: 2 },
        ],
      });

      const results = await Promise.allSettled(
        Array.from({ length: 5 }).map(() => chitService.activate(tempChit.id, makerUserId)),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(4);
      for (const err of rejected) {
        expect(err.reason).toBeInstanceOf(BadRequestException);
      }

      const persistedChit = await prisma.chitGroup.findUnique({ where: { id: tempChit.id } });
      expect(persistedChit?.status).toBe(ChitStatus.ACTIVE);

      const month1Auctions = await prisma.auction.findMany({
        where: { chitGroupId: tempChit.id },
        include: { winner: true },
      });
      expect(month1Auctions).toHaveLength(1);
      expect(month1Auctions[0].installmentMonth).toBe(1);
      expect(month1Auctions[0].winner?.paymentReference).toBe('COMPANY_POOL_MONTH_1');
    } finally {
      await prisma.auctionWinner.deleteMany({ where: { auction: { chitGroupId: tempChit.id } } });
      await prisma.auction.deleteMany({ where: { chitGroupId: tempChit.id } });
      await prisma.subscriberTicket.deleteMany({ where: { chitGroupId: tempChit.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Scenario 25: DEF-DB-07 Cross-Method Contention (activate vs unassignTicket vs update)
  // --------------------------------------------------------------------------
  it('CONCURR-INV-25: concurrent activate + unassignTicket + update on same DRAFT chit MUST serialize with zero unhandled crashes and zero under-subscribed ACTIVE chits', async () => {
    if (!isDbConnected || !activeTicket || !makerUserId) {
      console.warn('Skipping CONCURR-INV-25: DB or required seed data not present');
      return;
    }

    const customers = await prisma.customer.findMany({ take: 2, orderBy: { id: 'asc' } });
    if (customers.length < 2) {
      console.warn('Skipping CONCURR-INV-25: fewer than 2 seeded customers present');
      return;
    }

    const tempChit = await prisma.chitGroup.create({
      data: {
        branchId: activeTicket.chitGroup.branchId,
        groupCode: `CONCURR-DB07-X-${Date.now()}`,
        groupName: 'Concurrency Cross-Method Test',
        chitValue: 20000n,
        durationMonths: 2,
        totalTickets: 2,
        baseInstallment: 10000n,
        maxDiscountCeiling: 5000n,
        initMode: InitializationMode.ONGOING_GROUP,
        onboardedAtMonth: 2,
        status: ChitStatus.DRAFT,
        startDate: new Date('2026-10-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
      },
    });

    try {
      await prisma.subscriberTicket.createMany({
        data: [
          { chitGroupId: tempChit.id, customerId: customers[0].id, ticketNumber: 1 },
          { chitGroupId: tempChit.id, customerId: customers[1].id, ticketNumber: 2 },
        ],
      });

      const results = await Promise.allSettled([
        chitService.activate(tempChit.id, makerUserId),
        chitService.activate(tempChit.id, checkerUserId || makerUserId),
        chitService.unassignTicket(tempChit.id, 2, makerUserId),
        chitService.update(tempChit.id, { groupName: 'Raced Rename' }, makerUserId),
      ]);

      // Every rejection must be a clean domain BadRequestException (never P2002/P2025/40P01)
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(BadRequestException);
        }
      }

      const persistedChit = await prisma.chitGroup.findUnique({
        where: { id: tempChit.id },
        include: { tickets: true },
      });

      // Fundamental lifecycle invariant: if ACTIVE, all N=2 tickets must still be present!
      if (persistedChit?.status === ChitStatus.ACTIVE) {
        expect(persistedChit.tickets).toHaveLength(2);
      } else {
        expect(persistedChit?.status).toBe(ChitStatus.DRAFT);
        expect(persistedChit?.tickets).toHaveLength(1);
      }

      // At most 1 activate() can succeed
      const activateFulfilled = [results[0], results[1]].filter((r) => r.status === 'fulfilled');
      expect(activateFulfilled.length).toBeLessThanOrEqual(1);
    } finally {
      await prisma.subscriberTicket.deleteMany({ where: { chitGroupId: tempChit.id } });
      await prisma.chitGroup.deleteMany({ where: { id: tempChit.id } });
    }
  }, 20000);

  it('CONCURR-INV-26: PostgreSQL triggers MUST enforce append-only immutability (permit INSERT/SELECT, block UPDATE/DELETE/TRUNCATE)', async () => {
    // 1. INSERT is allowed
    const testLog = await prisma.auditLog.create({
      data: {
        action: 'TEST_IMMUTABILITY_ACTION',
        entityType: 'TestEntity',
        entityId: 'test-immutability-001',
      },
    });
    expect(testLog.id).toBeDefined();

    // 2. SELECT is allowed
    const fetched = await prisma.auditLog.findUnique({
      where: { id: testLog.id },
    });
    expect(fetched?.action).toBe('TEST_IMMUTABILITY_ACTION');

    // 3. UPDATE is blocked
    await expect(
      prisma.auditLog.update({
        where: { id: testLog.id },
        data: { action: 'TAMPERED_ACTION' },
      }),
    ).rejects.toThrow(/AuditLog records are strictly append-only and cannot be updated/);

    // 4. DELETE is blocked
    await expect(
      prisma.auditLog.delete({
        where: { id: testLog.id },
      }),
    ).rejects.toThrow(/AuditLog records are strictly append-only and cannot be deleted/);

    // 5. TRUNCATE is blocked
    await expect(
      prisma.$executeRawUnsafe('TRUNCATE "AuditLog";'),
    ).rejects.toThrow(/AuditLog records are strictly append-only and cannot be truncated/);
  });
});
