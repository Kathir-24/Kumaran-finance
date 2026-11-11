// ==============================================================================
// Kumaran Chits — State Transition Deadlock Retry & Split-Brain Guards (DEF-DB-02)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: PostgreSQL 17 40P01 / 40001 / P2034 Recovery & Acyclic Locking
// ==============================================================================

import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AuctionStatus,
  ChitStatus,
  DisbursementMode,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '@prisma/client';
import { AuctionService } from '../src/auction/auction.service';
import { DisbursementService } from '../src/disbursement/disbursement.service';
import { InstallmentService } from '../src/installment/installment.service';
import { PaymentService } from '../src/payment/payment.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('DEF-DB-02: State Transition Transient Deadlock Retries & Concurrency Guards', () => {
  const transientCodes = ['40P01', '40001', 'P2034'] as const;

  const createTransientThenSucceedTx = (errorCode: string) => {
    let attempt = 0;
    return jest.fn(async (cb: (tx: any) => Promise<any>) => {
      attempt++;
      if (attempt === 1) {
        const err: any = new Error(`Transient conflict (${errorCode})`);
        err.code = errorCode;
        throw err;
      }
      return cb(prismaMockRef.current);
    });
  };

  const prismaMockRef: { current: any } = { current: null };

  describe('1. AuctionService Transient Deadlock Recovery & Row Locks', () => {
    let auctionService: AuctionService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        auction: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'auc-001',
            chitGroupId: 'chit-001',
            installmentMonth: 3,
            auctionDate: new Date('2026-10-15T00:00:00Z'),
            status: AuctionStatus.SCHEDULED,
            bidDiscount: 20000n,
            foremanCommissionAmount: 4000n,
            dividendPerTicket: 800n,
            prizeMoney: 80000n,
            conductedByUserId: 'maker-001',
            chitGroup: {
              id: 'chit-001',
              groupName: 'Group A',
              groupCode: 'KCA-1L-20M-01',
              chitValue: 100000n,
              baseInstallment: 5000n,
              maxDiscountCeiling: 25000n,
              totalTickets: 20,
              durationMonths: 20,
              status: ChitStatus.ACTIVE,
              branchId: 'branch-prd-001',
            },
            winner: {
              id: 'win-001',
              ticketId: 'tkt-001',
              ticket: {
                ticketNumber: 5,
                customer: { fullName: 'M. Palanisamy', customerCode: 'KC-005' },
              },
            },
            minutes: { id: 'min-001', filedAtRegistrar: false },
          }),
          update: jest.fn().mockResolvedValue({ id: 'auc-001', status: AuctionStatus.COMPLETED }),
          upsert: jest.fn().mockResolvedValue({ id: 'auc-001', status: AuctionStatus.SCHEDULED }),
        },
        chitGroup: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'chit-001',
            status: ChitStatus.ACTIVE,
            chitValue: 100000n,
            maxDiscountCeiling: 25000n,
            totalTickets: 20,
            durationMonths: 20,
          }),
        },
        subscriberTicket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tkt-001',
            chitGroupId: 'chit-001',
            ticketNumber: 5,
            isPrized: false,
            consecutiveUnpaidMonths: 0,
            status: 'ACTIVE',
            customer: { fullName: 'M. Palanisamy' },
          }),
          update: jest.fn().mockResolvedValue({ id: 'tkt-001', isPrized: true }),
        },
        installmentDue: {
          findUnique: jest.fn().mockResolvedValue({ status: 'PAID' }),
        },
        auctionWinner: {
          upsert: jest.fn().mockResolvedValue({ id: 'win-001' }),
        },
        auctionTieBidder: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 'tie-001' }),
        },
        auctionMinutes: {
          upsert: jest.fn().mockResolvedValue({ id: 'min-001' }),
          update: jest.fn().mockResolvedValue({ id: 'min-001', filedAtRegistrar: true }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'auc-001', status: AuctionStatus.SCHEDULED }]),
        $transaction: jest.fn(),
      };
      prismaMockRef.current = prismaMock;
      auctionService = new AuctionService(prismaMock as unknown as PrismaService);
    });

    it.each(transientCodes)(
      'DEF-DB-02: finalizeAuction automatically retries and recovers from transient %s',
      async (code) => {
        prismaMock.$transaction = createTransientThenSucceedTx(code);

        const res = await auctionService.finalizeAuction(
          'auc-001',
          'checker-002',
          { subscribersPresent: 18, signedByForeman: true },
        );

        expect(res).toBeDefined();
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      },
    );

    it('DEF-DB-02: finalizeAuction fails fast in 1 attempt on domain validation errors', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'auc-001', status: AuctionStatus.COMPLETED }]);
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));

      await expect(
        auctionService.finalizeAuction('auc-001', 'checker-002', {}),
      ).rejects.toThrow('AUCTION_ALREADY_FINALIZED');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('DEF-DB-02: recordBid & markMinutesFiled recover from 40P01 deadlocks cleanly', async () => {
      prismaMock.$transaction = createTransientThenSucceedTx('40P01');
      await auctionService.recordBid(
        'chit-001',
        3,
        { ticketId: 'tkt-001', bidDiscount: 20000, auctionDate: '2026-10-15' },
        'maker-001',
      );
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);

      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        installmentMonth: 3,
        status: AuctionStatus.COMPLETED,
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
        minutes: { id: 'min-001', filedAtRegistrar: false },
      });
      prismaMock.$transaction = createTransientThenSucceedTx('P2034');
      await auctionService.markMinutesFiled('auc-001', { filingReference: 'ROC-01' }, 'maker-001');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    });

    it('DEF-DB-02: markMinutesFiled rejects duplicate filing when locked AuctionMinutes reveals filedAtRegistrar=true', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        installmentMonth: 3,
        status: AuctionStatus.COMPLETED,
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
        minutes: { id: 'min-001', filedAtRegistrar: false },
      });
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'min-001', filedAtRegistrar: true }]);
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));

      await expect(
        auctionService.markMinutesFiled('auc-001', { filingReference: 'ROC-02' }, 'maker-001'),
      ).rejects.toThrow('MINUTES_ALREADY_FILED');
    });
  });

  describe('2. DisbursementService Transient Recovery & Row Locks', () => {
    let disbursementService: DisbursementService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        auction: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'auc-001',
            status: AuctionStatus.COMPLETED,
            prizeMoney: 80000n,
            chitGroup: { id: 'chit-001', branchId: 'branch-prd-001', groupCode: 'KCA-1L-20M-01' },
            winner: {
              id: 'win-001',
              ticketId: 'tkt-001',
              verifiedByUserId: 'maker-001',
              disbursementStatus: 'VERIFIED_BY_MAKER',
              ticket: { ticketNumber: 5, customer: { fullName: 'M. Palanisamy' } },
            },
          }),
          create: jest.fn().mockResolvedValue({ id: 'auc-final-20' }),
        },
        auctionWinner: {
          update: jest.fn().mockResolvedValue({ id: 'win-001' }),
          create: jest.fn().mockResolvedValue({ id: 'win-final-20' }),
        },
        chitGroup: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'chit-001',
            branchId: 'branch-prd-001',
            status: 'ACTIVE',
            chitValue: 100000n,
            durationMonths: 20,
            tickets: [{ id: 'tkt-20' }],
          }),
          update: jest.fn().mockResolvedValue({ id: 'chit-001', status: 'COMPLETED' }),
        },
        subscriberTicket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tkt-20',
            chitGroupId: 'chit-001',
            ticketNumber: 20,
            isPrized: false,
            customer: { fullName: 'S. Subramani' },
          }),
          count: jest.fn().mockResolvedValue(1),
          update: jest.fn().mockResolvedValue({ id: 'tkt-20', isPrized: true }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
        },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
      };
      prismaMockRef.current = prismaMock;
      disbursementService = new DisbursementService(prismaMock as unknown as PrismaService);
    });

    it('DEF-DB-02: verifySafetyProof recovers from 40P01 and blocks concurrent double verification via FOR UPDATE', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        status: AuctionStatus.COMPLETED,
        prizeMoney: 80000n,
        chitGroup: { id: 'chit-001', branchId: 'branch-prd-001', groupCode: 'KCA-1L-20M-01' },
        winner: {
          id: 'win-001',
          disbursementStatus: 'PENDING_VERIFICATION',
          ticket: { ticketNumber: 5, customer: { fullName: 'M. Palanisamy' } },
        },
      });
      prismaMock.$queryRaw.mockResolvedValue([
        { id: 'win-001', disbursementStatus: 'PENDING_VERIFICATION' },
      ]);
      prismaMock.$transaction = createTransientThenSucceedTx('40P01');

      const res = await disbursementService.verifySafetyProof(
        'auc-001',
        { isSecurityRequired: false, agreementSigned: true, nomineeSigned: true },
        'maker-001',
      );
      expect(res.winner).toBeDefined();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);

      // Concurrent caller reads locked VERIFIED_BY_MAKER status inside TX
      prismaMock.$queryRaw.mockResolvedValue([
        { id: 'win-001', disbursementStatus: 'VERIFIED_BY_MAKER' },
      ]);
      prismaMock.$transaction = jest.fn(async (cb: any) => cb(prismaMock));
      await expect(
        disbursementService.verifySafetyProof(
          'auc-001',
          { isSecurityRequired: false, agreementSigned: true, nomineeSigned: true },
          'maker-002',
        ),
      ).rejects.toThrow('SAFETY_PROOF_ALREADY_VERIFIED');
    });

    it.each(transientCodes)(
      'DEF-DB-02: authorizePayout recovers cleanly from transient %s',
      async (code) => {
        prismaMock.$queryRaw.mockResolvedValue([
          { id: 'win-001', disbursementStatus: 'VERIFIED_BY_MAKER' },
        ]);
        prismaMock.$transaction = createTransientThenSucceedTx(code);

        const res = await disbursementService.authorizePayout(
          'auc-001',
          { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
          'checker-002',
          [Role.SUPER_ADMIN],
        );
        expect(res.winner).toBeDefined();
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      },
    );

    it('DEF-DB-02: releasePayout recovers from 40001 serialization failure', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        status: AuctionStatus.COMPLETED,
        prizeMoney: 80000n,
        chitGroup: { id: 'chit-001', branchId: 'branch-prd-001' },
        winner: { id: 'win-001', disbursementStatus: 'AUTHORIZED_BY_CHECKER' },
      });
      prismaMock.$queryRaw.mockResolvedValue([
        { id: 'win-001', disbursementStatus: 'AUTHORIZED_BY_CHECKER' },
      ]);
      prismaMock.$transaction = createTransientThenSucceedTx('40001');

      const res = await disbursementService.releasePayout(
        'auc-001',
        { paymentReference: 'CHQ-1001' },
        'checker-002',
      );
      expect(res.winner).toBeDefined();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    });

    it('DEF-DB-02: settleFinalMonth retries P2034 and rejects locked COMPLETED chitGroup', async () => {
      prismaMock.$queryRaw.mockImplementation(async (q: any) => {
        const sql = Array.isArray(q) ? q.join('') : String(q);
        if (sql.includes('"ChitGroup"')) return [{ id: 'chit-001', status: 'ACTIVE' }];
        if (sql.includes('"SubscriberTicket"')) return [{ id: 'tkt-20', status: 'ACTIVE', isPrized: false }];
        return [];
      });
      prismaMock.$transaction = createTransientThenSucceedTx('P2034');

      const res = await disbursementService.settleFinalMonth(
        'chit-001',
        { ticketId: 'tkt-20', disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT },
        'checker-002',
        [Role.SUPER_ADMIN],
      );
      expect(res.settlement.auctionId).toBe('auc-final-20');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);

      // Concurrent duplicate click sees locked COMPLETED ChitGroup
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'chit-001', status: 'COMPLETED' }]);
      prismaMock.$transaction = jest.fn(async (cb: any) => cb(prismaMock));
      await expect(
        disbursementService.settleFinalMonth(
          'chit-001',
          { ticketId: 'tkt-20', disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT },
          'checker-002',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow('FINAL_SETTLEMENT_ALREADY_EXECUTED');
    });
  });

  describe('3. InstallmentService Recovery & ADR-13 Concurrent Substitution Guard', () => {
    let installmentService: InstallmentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        auction: {
          findUnique: jest.fn().mockResolvedValue({
            status: AuctionStatus.COMPLETED,
            dividendPerTicket: 1000n,
          }),
        },
        chitGroup: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'chit-001',
            status: 'ACTIVE',
            durationMonths: 20,
            baseInstallment: 5000n,
            startDate: new Date('2026-01-01T00:00:00Z'),
            tickets: [{ id: 'tkt-1' }],
            auctions: [{ status: AuctionStatus.COMPLETED, dividendPerTicket: 1000n }],
          }),
        },
        installmentDue: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'due-1', netPayableAmount: 4000n }),
        },
        subscriberTicket: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'tkt-vacated',
              ticketNumber: 9,
              status: 'REMOVED_DEF_3M',
              customerId: 'cust-old',
              chitGroupId: 'chit-001',
              customer: { fullName: 'Old Subscriber' },
              chitGroup: { id: 'chit-001', groupCode: 'KCA-1L-20M-01' },
            })
            .mockResolvedValueOnce(null),
          update: jest.fn().mockResolvedValue({
            id: 'tkt-vacated',
            ticketNumber: 9,
            status: 'ACTIVE',
            customer: { id: 'cust-new', fullName: 'New Subscriber' },
            chitGroup: { groupCode: 'KCA-1L-20M-01' },
          }),
        },
        customer: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'cust-new',
            fullName: 'New Subscriber',
            isKycVerified: true,
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'tkt-vacated', status: 'REMOVED_DEF_3M', isPrized: false }]),
        $transaction: jest.fn(),
      };
      prismaMockRef.current = prismaMock;
      installmentService = new InstallmentService(prismaMock as unknown as PrismaService);
    });

    it('DEF-DB-02: generateMonthlyDues & substituteSubscriber recover from transient 40P01 deadlocks', async () => {
      prismaMock.$transaction = createTransientThenSucceedTx('40P01');
      const duesRes = await installmentService.generateMonthlyDues('chit-001', 2, {});
      expect(duesRes.totalDuesScheduled).toBe(1);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);

      prismaMock.$transaction = createTransientThenSucceedTx('40001');
      const subRes = await installmentService.substituteSubscriber('tkt-vacated', 'admin-001', {
        newCustomerId: 'cust-new',
        reason: 'Vacated slot replacement',
      });
      expect(subRes.success).toBe(true);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    });

    it('DEF-DB-02: substituteSubscriber maps concurrent P2002 (chitGroupId, customerId) race cleanly to ConflictException without retry', async () => {
      const p2002Err: any = new Error('Unique constraint failed on (`chitGroupId`, `customerId`)');
      p2002Err.code = 'P2002';
      p2002Err.meta = { target: ['chitGroupId', 'customerId'] };
      prismaMock.$transaction.mockRejectedValue(p2002Err);

      await expect(
        installmentService.substituteSubscriber('tkt-vacated', 'admin-001', {
          newCustomerId: 'cust-new',
          reason: 'Concurrent race',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. PaymentService Reversal State Locks & Transient Recovery', () => {
    let paymentService: PaymentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'pay-001',
            branchId: 'branch-prd-001',
            amount: 4000n,
            paymentMethod: PaymentMethod.CASH,
            paymentStatus: PaymentStatus.SUCCESS,
            createdAt: new Date(),
            reversal: {
              id: 'rev-001',
              status: 'REQUESTED',
              notes: 'Wrong ticket',
              initiatedByUserId: 'maker-001',
            },
            allocations: [
              {
                ticketId: 'tkt-001',
                installmentDueId: 'due-001',
                due: { installmentMonth: 3 },
              },
            ],
          }),
          update: jest.fn().mockResolvedValue({ id: 'pay-001', paymentStatus: PaymentStatus.REVERSED }),
        },
        paymentReversal: {
          create: jest.fn().mockResolvedValue({ id: 'rev-001', status: 'REQUESTED' }),
          update: jest.fn().mockResolvedValue({ id: 'rev-001', status: 'REJECTED' }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
        },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
      };
      prismaMockRef.current = prismaMock;
      paymentService = new PaymentService(prismaMock as unknown as PrismaService);
    });

    it('DEF-DB-02: requestReversal & rejectReversal retry on 40P01 and block split-brain via locked PaymentReversal', async () => {
      prismaMock.$queryRaw.mockImplementation(async (q: any) => {
        const sql = Array.isArray(q) ? q.join('') : String(q);
        if (sql.includes('"PaymentReversal"')) return [{ id: 'rev-001', status: 'APPROVED' }];
        if (sql.includes('"Payment"')) return [{ id: 'pay-001', paymentStatus: PaymentStatus.SUCCESS }];
        return [];
      });

      // rejectReversal racing right after approveReversal committed must fail closed inside TX!
      prismaMock.$transaction = jest.fn(async (cb: any) => cb(prismaMock));
      await expect(
        paymentService.rejectReversal(
          'pay-001',
          { rejectionReason: 'Split brain probe' },
          'checker-002',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.paymentReversal.update).not.toHaveBeenCalled();

      // When locked reversal IS REQUESTED, transient 40P01 recovers transparently
      prismaMock.$queryRaw.mockImplementation(async (q: any) => {
        const sql = Array.isArray(q) ? q.join('') : String(q);
        if (sql.includes('"PaymentReversal"')) return [{ id: 'rev-001', status: 'REQUESTED' }];
        if (sql.includes('"Payment"')) return [{ id: 'pay-001', paymentStatus: PaymentStatus.SUCCESS }];
        return [];
      });
      prismaMock.$transaction = createTransientThenSucceedTx('40P01');

      const rejectRes = await paymentService.rejectReversal(
        'pay-001',
        { rejectionReason: 'Verified cleared' },
        'checker-002',
        [Role.SUPER_ADMIN],
      );
      expect(rejectRes.reversal.status).toBe('REJECTED');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
