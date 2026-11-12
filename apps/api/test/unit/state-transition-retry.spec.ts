// ==============================================================================
// Kumaran Chits — State Transition Deadlock Retry & Split-Brain Guards (DEF-DB-02)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: PostgreSQL 17 40P01 / 40001 / P2034 Recovery & Acyclic Locking
// ==============================================================================

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuctionStatus,
  ChitStatus,
  DisbursementMode,
  InitializationMode,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '@prisma/client';
import { AuctionService } from '../../src/auction/auction.service';
import { ChitService } from '../../src/chit/chit.service';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { InstallmentService } from '../../src/installment/installment.service';
import { PaymentService } from '../../src/payment/payment.service';
import { PrismaService } from '../../src/prisma/prisma.service';

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

    it('DEF-DB-02: finalizeAuction acquires ChitGroup -> Auction locks in order and fails fast on domain validation errors', async () => {
      const lockOrder: string[] = [];
      prismaMock.$queryRaw.mockImplementation(async (q: any) => {
        const sql = Array.isArray(q) ? q.join('') : String(q);
        if (sql.includes('"ChitGroup"')) {
          lockOrder.push('ChitGroup');
          return [{ id: 'chit-001', status: ChitStatus.ACTIVE }];
        }
        if (sql.includes('"Auction"')) {
          lockOrder.push('Auction');
          return [{ id: 'auc-001', status: AuctionStatus.COMPLETED }];
        }
        return [];
      });
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));

      await expect(
        auctionService.finalizeAuction('auc-001', 'checker-002', { subscribersPresent: 20 }),
      ).rejects.toThrow('AUCTION_ALREADY_FINALIZED');
      expect(lockOrder).toEqual(['ChitGroup', 'Auction']);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('DEF-DB-02: recordBid, recordTieBreak & markMinutesFiled recover from 40P01/40001/P2034 deadlocks cleanly', async () => {
      prismaMock.$transaction = createTransientThenSucceedTx('40P01');
      await auctionService.recordBid(
        'chit-001',
        3,
        { ticketId: 'tkt-001', bidDiscount: 20000, auctionDate: '2026-10-15' },
        'maker-001',
      );
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);

      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'tkt-001',
        chitGroupId: 'chit-001',
        ticketNumber: 5,
        isPrized: false,
        consecutiveUnpaidMonths: 0,
        status: 'ACTIVE',
        customer: { fullName: 'M. Palanisamy' },
      });
      prismaMock.$transaction = createTransientThenSucceedTx('40001');
      await auctionService.recordTieBreak(
        'chit-001',
        3,
        {
          winningTicketId: 'tkt-001',
          bidDiscount: 25000,
          auctionDate: '2026-10-15',
          tiedTickets: [
            { ticketId: 'tkt-001', tokenNumber: 1 },
            { ticketId: 'tkt-002', tokenNumber: 2 },
          ],
        },
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
      disbursementService = new DisbursementService(prismaMock as unknown as PrismaService, {} as any);
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

    it('DEF-DB-02: generateMonthlyDues & substituteSubscriber recover from transient 40P01 deadlocks and lock ChitGroup first', async () => {
      const dueOrder: string[] = [];
      prismaMock.$queryRaw.mockImplementation(async (q: any) => {
        const sql = Array.isArray(q) ? q.join('') : String(q);
        if (sql.includes('"ChitGroup"')) dueOrder.push('lock:ChitGroup');
        return [{ id: 'chit-001', status: ChitStatus.ACTIVE }];
      });
      prismaMock.installmentDue.findMany.mockImplementation(async () => {
        dueOrder.push('read:installmentDue');
        return [];
      });
      prismaMock.$transaction = createTransientThenSucceedTx('40P01');
      const duesRes = await installmentService.generateMonthlyDues('chit-001', 2, {});
      expect(duesRes.totalDuesScheduled).toBe(1);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      expect(dueOrder).toEqual(['lock:ChitGroup', 'read:installmentDue']);

      prismaMock.$queryRaw.mockResolvedValue([
        { id: 'tkt-vacated', status: 'REMOVED_DEF_3M', isPrized: false },
      ]);
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

  describe('5. ChitService Lifecycle Row Locks & Transient Deadlock Recovery (DEF-DB-07)', () => {
    let chitService: ChitService;
    let prismaMock: any;
    let redisMock: any;

    const fullDraftChit = {
      id: 'chit-defdb07-1',
      branchId: 'branch-prd-001',
      groupCode: 'KCA-LOCK-01',
      totalTickets: 2,
      durationMonths: 2,
      chitValue: 100000n,
      startDate: new Date('2026-11-01T00:00:00Z'),
      status: ChitStatus.DRAFT,
      initMode: InitializationMode.NEW_GROUP,
      tickets: [
        {
          id: 'tkt-1',
          ticketNumber: 1,
          customerId: 'cust-1',
          customer: { id: 'cust-1', fullName: 'Company Pool' },
        },
        {
          id: 'tkt-2',
          ticketNumber: 2,
          customerId: 'cust-2',
          customer: { id: 'cust-2', fullName: 'Subscriber Two' },
        },
      ],
    };

    beforeEach(() => {
      redisMock = {
        getIsConnected: jest.fn().mockReturnValue(true),
        getClient: jest.fn().mockReturnValue({
          del: jest.fn().mockResolvedValue(1),
        }),
      };

      prismaMock = {
        chitGroup: {
          findUnique: jest.fn().mockResolvedValue(fullDraftChit),
          update: jest.fn().mockResolvedValue({
            id: fullDraftChit.id,
            status: ChitStatus.ACTIVE,
            foremanCommissionRate: 4.0,
          }),
        },
        subscriberTicket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tkt-2',
            ticketNumber: 2,
            customerId: 'cust-2',
            customer: { fullName: 'Subscriber Two' },
          }),
          create: jest.fn().mockResolvedValue({ id: 'tkt-new', ticketNumber: 2 }),
          update: jest.fn().mockResolvedValue({ id: 'tkt-1', isPrized: true }),
          delete: jest.fn().mockResolvedValue({ id: 'tkt-2' }),
        },
        customer: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cust-3', fullName: 'Third Customer' }),
        },
        auction: {
          create: jest.fn().mockResolvedValue({ id: 'm1-auc-001' }),
        },
        auctionWinner: {
          create: jest.fn().mockResolvedValue({ id: 'm1-win-001' }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-chit-1' }),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ id: fullDraftChit.id, status: ChitStatus.DRAFT }]),
        $transaction: jest.fn(),
      };
      prismaMockRef.current = prismaMock;
      chitService = new ChitService(prismaMock as unknown as PrismaService, redisMock);
    });

    it.each(transientCodes)(
      'N1: activate recovers automatically across transient %s and locks ChitGroup before writes',
      async (code) => {
        const execOrder: string[] = [];
        prismaMock.$queryRaw.mockImplementation(async (q: any) => {
          const sql = Array.isArray(q) ? q.join('') : String(q);
          if (sql.includes('"ChitGroup"') && sql.includes('FOR UPDATE')) {
            execOrder.push('lock:ChitGroup');
          }
          return [{ id: fullDraftChit.id, status: ChitStatus.DRAFT }];
        });
        prismaMock.auction.create.mockImplementation(async () => {
          execOrder.push('create:Month1Auction');
          return { id: 'm1-auc-001' };
        });
        prismaMock.chitGroup.update.mockImplementation(async () => {
          execOrder.push('update:ChitGroupACTIVE');
          return { id: fullDraftChit.id, status: ChitStatus.ACTIVE };
        });
        prismaMock.$transaction = createTransientThenSucceedTx(code);

        const res = await chitService.activate(fullDraftChit.id, 'checker-admin-1');

        expect(res.status).toBe(ChitStatus.ACTIVE);
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
        expect(execOrder).toEqual([
          'lock:ChitGroup',
          'create:Month1Auction',
          'update:ChitGroupACTIVE',
        ]);
        expect(redisMock.getClient().del).toHaveBeenCalledTimes(1);
      },
    );

    it('N2: activate rejects stale pre-check split-brain when locked row is already ACTIVE, missing, or under-subscribed', async () => {
      // 2a. Locked row flipped to ACTIVE concurrently -> fail fast with 400 (zero retries, zero writes)
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.$queryRaw.mockResolvedValue([{ id: fullDraftChit.id, status: ChitStatus.ACTIVE }]);

      await expect(
        chitService.activate(fullDraftChit.id, 'checker-admin-2'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.auction.create).not.toHaveBeenCalled();
      expect(prismaMock.chitGroup.update).not.toHaveBeenCalled();
      expect(redisMock.getClient().del).not.toHaveBeenCalled();

      // 2b. Locked row missing concurrently -> NotFoundException
      prismaMock.$queryRaw.mockResolvedValue([]);
      await expect(
        chitService.activate(fullDraftChit.id, 'checker-admin-2'),
      ).rejects.toThrow(NotFoundException);

      // 2c. Outer read saw 2/2 tickets, but concurrent unassignTicket removed 1 before lock -> BadRequestException
      prismaMock.$queryRaw.mockResolvedValue([{ id: fullDraftChit.id, status: ChitStatus.DRAFT }]);
      prismaMock.chitGroup.findUnique
        .mockResolvedValueOnce(fullDraftChit)
        .mockResolvedValueOnce({
          ...fullDraftChit,
          tickets: [fullDraftChit.tickets[0]],
        });

      await expect(
        chitService.activate(fullDraftChit.id, 'checker-admin-2'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.auction.create).not.toHaveBeenCalled();
    });

    it('N3: assignTicket, unassignTicket, and update serialize via ChitGroup lock and map P2002 ADR-13 races', async () => {
      // 3a. Concurrent activation flipped locked ChitGroup to ACTIVE before unassignTicket/update/assignTicket
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.$queryRaw.mockResolvedValue([{ id: fullDraftChit.id, status: ChitStatus.ACTIVE }]);

      await expect(
        chitService.unassignTicket(fullDraftChit.id, 2, 'staff-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.subscriberTicket.delete).not.toHaveBeenCalled();

      await expect(
        chitService.update(fullDraftChit.id, { groupName: 'Late Rename' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.chitGroup.update).not.toHaveBeenCalled();

      prismaMock.chitGroup.findUnique.mockResolvedValue({
        ...fullDraftChit,
        totalTickets: 3,
      });
      await expect(
        chitService.assignTicket(fullDraftChit.id, {
          ticketNumber: 3,
          customerId: 'cust-3',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.subscriberTicket.create).not.toHaveBeenCalled();

      // 3b. P2002 fallback on assignTicket maps cleanly to ConflictException without retry
      prismaMock.$queryRaw.mockResolvedValue([{ id: fullDraftChit.id, status: ChitStatus.DRAFT }]);
      const p2002Customer: any = new Error('Unique constraint on chitGroupId_customerId');
      p2002Customer.code = 'P2002';
      p2002Customer.meta = { target: ['chitGroupId', 'customerId'] };
      prismaMock.subscriberTicket.create.mockRejectedValueOnce(p2002Customer);

      await expect(
        chitService.assignTicket(fullDraftChit.id, {
          ticketNumber: 3,
          customerId: 'cust-3',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(4);

      // 3c. Transient 40P01 recovers transparently in unassignTicket
      prismaMock.$transaction = createTransientThenSucceedTx('40P01');
      const unassignRes = await chitService.unassignTicket(fullDraftChit.id, 2, 'staff-1');
      expect(unassignRes.success).toBe(true);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
