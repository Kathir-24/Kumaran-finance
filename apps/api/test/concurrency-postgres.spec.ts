import { AuctionStatus, DueStatus, PaymentMethod, PrismaClient } from '@prisma/client';
import { AuctionService } from '../src/auction/auction.service';
import { CollectionService } from '../src/collection/collection.service';
import { DisbursementService } from '../src/disbursement/disbursement.service';
import { InstallmentService } from '../src/installment/installment.service';
import { PaymentService } from '../src/payment/payment.service';

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
  let disbursementService: DisbursementService;
  let collectionService: CollectionService;
  let installmentService: InstallmentService;
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
      disbursementService = new DisbursementService(prisma as any, null as any);
      collectionService = new CollectionService(prisma as any);
      installmentService = new InstallmentService(prisma as any);

      // Resolve Maker (Partner Admin 1) and Checker (Partner Admin 2)
      const maker = await prisma.user.findFirst({ where: { phone: '9876543210' } });
      const checker = await prisma.user.findFirst({ where: { phone: '9876543211' } });
      makerUserId = maker?.id || '';
      checkerUserId = checker?.id || '';

      // Resolve an active subscriber ticket that does not have an existing winning auction
      activeTicket = await prisma.subscriberTicket.findFirst({
        where: {
          status: 'ACTIVE',
          chitGroup: { status: 'ACTIVE' },
          winningAuction: null,
        },
        include: { chitGroup: true, customer: true },
      });
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

    const testMonth = 992;

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: testMonth,
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
            ticketId: activeTicket.id,
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
        console.error('CONCURR-INV-4 REJECTED REASONS:', rejected.map(r => (r as PromiseRejectedResult).reason));
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
      await prisma.auction.delete({ where: { id: testAuction.id } });
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

    const testMonth = 993;

    const testAuction = await prisma.auction.create({
      data: {
        chitGroupId: activeTicket.chitGroupId,
        installmentMonth: testMonth,
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
            ticketId: activeTicket.id,
            wasTieBreakWinner: false,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
            isSecurityRequired: false,
            agreementSigned: true,
            nomineeSigned: true,
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
            paymentReference: `CONCURR-PAYOUT-REF-${Date.now()}-${idx + 1}`,
            disbursedAt: new Date().toISOString(),
          },
          checkerUserId,
        ),
      );

      const results = await Promise.allSettled(releasePromises);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      if (fulfilled.length === 0) {
        console.error('CONCURR-INV-4 REJECTED REASONS:', rejected.map(r => (r as PromiseRejectedResult).reason));
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
      await prisma.auction.delete({ where: { id: testAuction.id } });
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
      await prisma.auditLog.deleteMany({
        where: {
          action: 'CASH_HANDOVER_ACKNOWLEDGED',
          entityId: makerUserId,
        },
      });
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
      await prisma.auditLog.deleteMany({
        where: {
          action: 'TICKET_SUBSCRIBER_SUBSTITUTED',
          entityId: removedTicket.id,
        },
      });
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

    const testMonth1 = 993;
    const testMonth2 = 994;

    const [due1, due2] = await Promise.all([
      prisma.installmentDue.create({
        data: {
          ticketId: activeTicket.id,
          chitGroupId: activeTicket.chitGroupId,
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
          ticketId: activeTicket.id,
          chitGroupId: activeTicket.chitGroupId,
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
            ticketId: activeTicket.id,
            installmentMonth: testMonth1,
            amount: 4000,
            paymentMethod: PaymentMethod.CASH,
            notes: 'Concurrent receipt test 1',
          },
          makerUserId,
        ),
        paymentService.recordPayment(
          {
            ticketId: activeTicket.id,
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
});
