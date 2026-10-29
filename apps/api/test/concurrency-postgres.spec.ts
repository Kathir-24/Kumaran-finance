import { AuctionStatus, DueStatus, PaymentMethod, PrismaClient } from '@prisma/client';
import { AuctionService } from '../src/auction/auction.service';
import { DisbursementService } from '../src/disbursement/disbursement.service';
import { PaymentService } from '../src/payment/payment.service';

/**
 * High-Concurrency Pessimistic Row Locking Integration Tests
 *
 * Verifies real PostgreSQL 17 row-level locking (SELECT ... FOR UPDATE)
 * under parallel asynchronous contention:
 * 1. Payment Recording: Prevents double-spending & duplicate allocations (ADR-07)
 * 2. Auction Finalization: Prevents duplicate finalization & double dividend minting
 * 3. Prize Disbursement: Prevents concurrent maker-checker double-payouts
 */
describe('PostgreSQL Row-Locking & Concurrency Integration Tests (Real DB)', () => {
  let prisma: PrismaClient;
  let paymentService: PaymentService;
  let auctionService: AuctionService;
  let disbursementService: DisbursementService;
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

      // Resolve Maker (Partner Admin 1) and Checker (Partner Admin 2)
      const maker = await prisma.user.findFirst({ where: { phone: '9876543210' } });
      const checker = await prisma.user.findFirst({ where: { phone: '9876543211' } });
      makerUserId = maker?.id || '';
      checkerUserId = checker?.id || '';

      // Resolve an active subscriber ticket
      activeTicket = await prisma.subscriberTicket.findFirst({
        where: { status: 'ACTIVE' },
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
});
