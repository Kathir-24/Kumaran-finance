import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { REDIS_RELEASE_LOCK_LUA } from '../../src/common/utils/redis-lock.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ReportService } from '../../src/report/report.service';
import { StatutoryReportService } from '../../src/report/statutory-report.service';

describe('Module 9: Dashboards & Statutory Reports Tests', () => {
  let reportService: ReportService;
  let statutoryReportService: StatutoryReportService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockChitGroupId = 'chit-group-uuid-001';

  const superAdminUser: JwtPayload = {
    sub: 'user-partner-001',
    phone: '9842100001',
    roles: [Role.SUPER_ADMIN],
    branchId: null,
    tokenType: 'access',
  };

  const branchManagerUser: JwtPayload = {
    sub: 'user-bm-001',
    phone: '9842100002',
    roles: [Role.BRANCH_MANAGER],
    branchId: mockBranchId,
    tokenType: 'access',
  };

  const accountantUser: JwtPayload = {
    sub: 'user-acc-001',
    phone: '9842100003',
    roles: [Role.ACCOUNTANT],
    branchId: mockBranchId,
    tokenType: 'access',
  };

  const collectionAgentUser: JwtPayload = {
    sub: 'user-agent-001',
    phone: '9842100004',
    roles: [Role.COLLECTION_AGENT],
    branchId: mockBranchId,
    tokenType: 'access',
  };

  const customerUser: JwtPayload = {
    sub: 'user-cust-001',
    phone: '9842143210',
    roles: [Role.CUSTOMER],
    branchId: null,
    tokenType: 'access',
  };

  const auditorUser: JwtPayload = {
    sub: 'user-auditor-001',
    phone: '9842100005',
    roles: [Role.AUDITOR],
    branchId: null,
    tokenType: 'access',
  };

  const mockBranch = {
    id: mockBranchId,
    code: 'PRD',
    name: 'Head Office - Perundurai',
    nameTamil: 'தலைமை கிளை, பெருந்துறை',
  };

  const mockChitGroup = {
    id: mockChitGroupId,
    groupCode: 'KCA-1L-20M-01',
    groupName: 'Perundurai 1 Lakh Scheme',
    chitValue: 100000n,
    durationMonths: 20,
    baseInstallment: 5000n,
    branchId: mockBranchId,
    branch: mockBranch,
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      customer: {
        count: jest.fn(),
      },
      subscriberTicket: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      payment: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
      },
      auctionWinner: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
      },
      auction: {
        findMany: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      paymentReversal: {
        findMany: jest.fn(),
      },
    };

    statutoryReportService = new StatutoryReportService(
      prismaMock as unknown as PrismaService,
    );
    reportService = new ReportService(
      prismaMock as unknown as PrismaService,
      statutoryReportService,
    );
  });

  describe('1. Executive Dashboard (`/reports/dashboard`)', () => {
    it('should aggregate active chits, collections by mode, vault cash, pending actions, and arrears aging', async () => {
      prismaMock.chitGroup.count.mockResolvedValue(3);
      prismaMock.customer.count.mockResolvedValue(60);
      prismaMock.subscriberTicket.count.mockResolvedValue(60);

      // Collections today
      prismaMock.payment.findMany.mockResolvedValue([
        { amount: 5000n, paymentMethod: 'CASH' },
        { amount: 4500n, paymentMethod: 'UPI' },
        { amount: 5000n, paymentMethod: 'BANK_TRANSFER' },
        { amount: 5000n, paymentMethod: 'CHEQUE' },
      ]);

      // Disbursements today
      prismaMock.auctionWinner.findMany.mockResolvedValue([
        { disbursedAmount: 75000n },
      ]);

      // Vault cash inflows and outflows
      prismaMock.payment.aggregate.mockResolvedValue({
        _sum: { amount: 250000n },
      });
      prismaMock.auctionWinner.aggregate.mockResolvedValue({
        _sum: { disbursedAmount: 150000n },
      });

      // Pending actions
      prismaMock.payment.count.mockResolvedValue(2); // Pending cash handovers
      prismaMock.auctionWinner.count
        .mockResolvedValueOnce(1) // Pending safety proof
        .mockResolvedValueOnce(0) // Pending disbursement auth
        .mockResolvedValueOnce(1); // Authorized awaiting release

      // Arrears aging
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          consecutiveUnpaidMonths: 1,
          dues: [{ netPayableAmount: 4200n, paidAmount: 0n }],
        },
        {
          consecutiveUnpaidMonths: 2,
          dues: [
            { netPayableAmount: 4200n, paidAmount: 0n },
            { netPayableAmount: 4000n, paidAmount: 0n },
          ],
        },
        {
          consecutiveUnpaidMonths: 3,
          dues: [
            { netPayableAmount: 5000n, paidAmount: 0n },
            { netPayableAmount: 4200n, paidAmount: 0n },
            { netPayableAmount: 4000n, paidAmount: 0n },
          ],
        },
      ]);

      const dashboard = await reportService.getExecutiveDashboard(
        {},
        superAdminUser,
      );

      expect(dashboard.activeChitsCount).toBe(3);
      expect(dashboard.totalSubscribersCount).toBe(60);
      expect(dashboard.todayCollections.total).toBe(19500n);
      expect(dashboard.todayCollections.cash).toBe(5000n);
      expect(dashboard.todayCollections.upi).toBe(4500n);
      expect(dashboard.todayDisbursements.total).toBe(75000n);
      expect(dashboard.branchVault.currentCashInSafe).toBe(100000n); // 250000 - 150000
      expect(dashboard.pendingActions.cashHandoversPendingSignoff).toBe(2);
      expect(dashboard.arrearsAging.bucket1Month.count).toBe(1);
      expect(dashboard.arrearsAging.bucket1Month.totalAmount).toBe(4200n);
      expect(dashboard.arrearsAging.bucket2Months.count).toBe(1);
      expect(dashboard.arrearsAging.bucket2Months.totalAmount).toBe(8200n);
      expect(dashboard.arrearsAging.bucket3MonthsAndAbove.count).toBe(1);
      expect(dashboard.arrearsAging.bucket3MonthsAndAbove.totalAmount).toBe(13200n);
    });
  });

  describe('2. Day Book Register (`/reports/day-book`)', () => {
    it('should aggregate all incoming payment modes and outgoing prize disbursements for target date', async () => {
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pay-001',
          amount: 5000n,
          paymentMethod: 'CASH',
          transactionRef: null,
          createdAt: new Date('2026-10-18T10:30:00Z'),
          receipt: { receiptNumber: 'KC-REC-PRD-2026-00001' },
          recordedByUser: { name: 'M. Kathiresan' },
          allocations: [
            {
              ticket: {
                ticketNumber: 1,
                chitGroup: { groupCode: 'KCA-1L-20M-01' },
                customer: { customerCode: 'KC-CUST-00001', fullName: 'A. Arumugam' },
              },
            },
          ],
        },
        {
          id: 'pay-002',
          amount: 4500n,
          paymentMethod: 'UPI',
          transactionRef: 'UPI-REF-998877',
          createdAt: new Date('2026-10-18T11:00:00Z'),
          receipt: { receiptNumber: 'KC-REC-PRD-2026-00002' },
          recordedByUser: { name: 'M. Kathiresan' },
          allocations: [
            {
              ticket: {
                ticketNumber: 2,
                chitGroup: { groupCode: 'KCA-1L-20M-01' },
                customer: { customerCode: 'KC-CUST-00002', fullName: 'B. Balan' },
              },
            },
          ],
        },
      ]);

      prismaMock.auctionWinner.findMany.mockResolvedValue([
        {
          id: 'win-001',
          disbursedAmount: 75000n,
          disbursementMode: 'BANK_TRANSFER_NEFT',
          paymentReference: 'NEFT-AXIS-20261018-001',
          disbursedAt: new Date('2026-10-18T14:00:00Z'),
          auction: {
            installmentMonth: 3,
            chitGroup: { groupCode: 'KCA-1L-20M-01' },
          },
          ticket: {
            ticketNumber: 7,
            customer: { customerCode: 'KC-CUST-00007', fullName: 'S. Sundaram' },
          },
        },
      ]);

      const dayBook = await reportService.getDayBook(
        { date: '2026-10-18' },
        accountantUser,
      );

      expect(dayBook.summary.totalInflows).toBe(9500n);
      expect(dayBook.summary.totalOutflows).toBe(75000n);
      expect(dayBook.summary.netCashFlow).toBe(-65500n); // Inflows - Outflows
      expect(dayBook.summary.inflowByMethod.cash).toBe(5000n);
      expect(dayBook.summary.inflowByMethod.upi).toBe(4500n);
      expect(dayBook.inflows.length).toBe(2);
      expect(dayBook.outflows.length).toBe(1);
    });
  });

  describe('3. Form XXII: Cash Book Register (`/reports/form-xxii`) [UNVERIFIED-LEGAL]', () => {
    it('should calculate Opening Safe Cash + Cash In - Cash Out = Closing Safe Cash and include statutory status', async () => {
      // Prior cash balance (Opening Cash)
      prismaMock.payment.aggregate.mockResolvedValue({
        _sum: { amount: 50000n },
      });
      prismaMock.auctionWinner.aggregate.mockResolvedValue({
        _sum: { disbursedAmount: 20000n },
      });
      // Opening Cash = 50,000 - 20,000 = 30,000

      // Today's Cash Inflows
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pay-cash-01',
          amount: 5000n,
          paymentMethod: 'CASH',
          cashHandoverStatus: null, // Counter cash
          createdAt: new Date('2026-10-18T09:00:00Z'),
          receipt: { receiptNumber: 'KC-REC-PRD-2026-00010' },
          recordedByUser: { id: 'u1', name: 'Cashier', phone: '9842100010' },
          allocations: [
            {
              ticket: {
                ticketNumber: 3,
                chitGroup: { groupCode: 'KCA-1L-20M-01' },
                customer: { customerCode: 'KC-CUST-00003', fullName: 'C. Chandran' },
              },
            },
          ],
        },
      ]);

      // Today's Cash Outflows
      prismaMock.auctionWinner.findMany.mockResolvedValue([
        {
          id: 'win-cash-01',
          disbursedAmount: 10000n,
          disbursementMode: 'CASH',
          paymentReference: 'KC-VOU-PRD-2026-00001',
          disbursedAt: new Date('2026-10-18T16:00:00Z'),
          auction: {
            installmentMonth: 2,
            chitGroup: { groupCode: 'KCA-1L-20M-01', chitValue: 100000n },
          },
          ticket: {
            ticketNumber: 5,
            customer: { customerCode: 'KC-CUST-00005', fullName: 'E. Elango' },
          },
        },
      ]);

      const cashBook = await reportService.getCashBookFormXxii(
        { date: '2026-10-18' },
        superAdminUser,
      );

      expect(cashBook.statutoryStatus).toBe('UNVERIFIED-LEGAL');
      expect(cashBook.registerName).toBe('Form XXII: Cash Book Register');
      expect(cashBook.reconciliation.openingCashInSafe).toBe(30000n);
      expect(cashBook.reconciliation.todayCashInflows).toBe(5000n);
      expect(cashBook.reconciliation.todayCashOutflows).toBe(10000n);
      // Invariant: Closing = Opening + Inflows - Outflows
      expect(cashBook.reconciliation.closingCashInSafe).toBe(25000n);
      expect(cashBook.inflows[0].source).toBe('COUNTER_CASH');
    });
  });

  describe('4. Form XVII: Consolidated Auction Minutes Register (`/reports/form-xvii`) [UNVERIFIED-LEGAL]', () => {
    it('should aggregate chronological auctions with discount, dividend, and tie-break details', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);

      prismaMock.auction.findMany.mockResolvedValue([
        {
          id: 'auc-002',
          installmentMonth: 2,
          auctionDate: new Date('2026-02-18T10:00:00Z'),
          status: 'MINUTES_FILED',
          bidDiscount: 25000n,
          foremanCommissionAmount: 4000n,
          foremanCommissionRate: '4.00',
          totalDividend: 21000n,
          dividendPerTicket: 1050n,
          prizeMoney: 75000n,
          conductedByUserId: 'maker-01',
          finalizedByUserId: 'checker-02',
          winner: {
            wasTieBreakWinner: true,
            ticket: {
              ticketNumber: 4,
              customer: {
                id: 'c4',
                customerCode: 'KC-CUST-00004',
                fullName: 'D. Durai',
                fullNameTamil: 'துரை',
                phone: '9842100004',
              },
            },
          },
          tieBidders: [
            {
              ticket: {
                ticketNumber: 4,
                customer: { customerCode: 'KC-CUST-00004', fullName: 'D. Durai' },
              },
              tokenNumber: 1,
              isWinner: true,
            },
            {
              ticket: {
                ticketNumber: 8,
                customer: { customerCode: 'KC-CUST-00008', fullName: 'H. Hari' },
              },
              tokenNumber: 2,
              isWinner: false,
            },
          ],
          minutes: {
            subscribersPresent: 18,
            minutesText: 'Auction conducted at branch premises.',
            signedByForeman: true,
            filedAtRegistrar: true,
          },
        },
      ]);

      const formXvii = await reportService.getAuctionMinutesFormXvii(
        { chitGroupId: mockChitGroupId },
        auditorUser,
      );

      expect(formXvii.statutoryStatus).toBe('UNVERIFIED-LEGAL');
      expect(formXvii.totalAuctionsFinalized).toBe(1);
      const auctionRecord = formXvii.auctions[0];
      expect(auctionRecord.bidDiscount).toBe(25000n);
      expect(auctionRecord.foremanCommissionAmount).toBe(4000n);
      expect(auctionRecord.totalDividend).toBe(21000n);
      expect(auctionRecord.dividendPerTicket).toBe(1050n);
      expect(auctionRecord.nextMonthNetInstallment).toBe(3950n); // 5000 - 1050
      expect(auctionRecord.winner?.wasTieBreakWinner).toBe(true);
      expect(auctionRecord.tiedBiddersCount).toBe(2);
      expect(auctionRecord.signedByForeman).toBe(true);
    });
  });

  describe('5. Form XXI: Subscriber Ledger Register (`/reports/form-xxi`) [UNVERIFIED-LEGAL]', () => {
    it('should return continuous 20-month schedule with paid amounts and arrears', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tick-001',
          ticketNumber: 1,
          isPrized: false,
          consecutiveUnpaidMonths: 0,
          status: 'ACTIVE',
          customer: {
            id: 'c1',
            customerCode: 'KC-CUST-00001',
            fullName: 'A. Arumugam',
            fullNameTamil: 'ஆறுமுகம்',
            phone: '9842143210',
          },
          dues: [
            {
              installmentMonth: 1,
              dueDate: new Date('2026-01-18'),
              grossAmount: 5000n,
              dividendDeduction: 0n,
              netPayableAmount: 5000n,
              paidAmount: 5000n,
              status: 'PAID',
              allocations: [
                {
                  payment: {
                    createdAt: new Date('2026-01-15'),
                    paymentMethod: 'CASH',
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-00001' },
                  },
                },
              ],
            },
            {
              installmentMonth: 2,
              dueDate: new Date('2026-02-18'),
              grossAmount: 5000n,
              dividendDeduction: 1050n,
              netPayableAmount: 3950n,
              paidAmount: 0n,
              status: 'UNPAID',
              allocations: [],
            },
          ],
        },
      ]);

      const ledger = await reportService.getSubscriberLedgerFormXxi(
        { chitGroupId: mockChitGroupId },
        superAdminUser,
      );

      expect(ledger.statutoryStatus).toBe('UNVERIFIED-LEGAL');
      expect(ledger.totalTicketsReturned).toBe(1);
      const ticketLedger = ledger.ledgers[0];
      expect(ticketLedger.summary.totalGrossDue).toBe(10000n);
      expect(ticketLedger.summary.totalDividendCredit).toBe(1050n);
      expect(ticketLedger.summary.totalNetPayable).toBe(8950n);
      expect(ticketLedger.summary.totalPaid).toBe(5000n);
      expect(ticketLedger.summary.totalOutstandingArrears).toBe(3950n);
    });

    it('should restrict Customer persona to viewing their own ticket statement only', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

      await expect(
        reportService.getSubscriberLedgerFormXxi(
          { chitGroupId: mockChitGroupId, ticketNumber: 9 },
          customerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Defaulters & Arrears Aging Register (`/reports/defaulters`)', () => {
    it('should categorize 1M, 2M, and 3M arrears and flag removal rights under ADR-07', async () => {
      prismaMock.subscriberTicket.count.mockResolvedValue(2);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tick-def-3m',
          ticketNumber: 12,
          consecutiveUnpaidMonths: 3,
          chitGroup: {
            groupCode: 'KCA-1L-20M-01',
            groupName: 'Perundurai 1 Lakh',
            baseInstallment: 5000n,
          },
          customer: {
            customerCode: 'KC-CUST-00012',
            fullName: 'L. Loganathan',
            fullNameTamil: 'லோகநாதன்',
            phone: '9842100012',
          },
          dues: [
            {
              installmentMonth: 1,
              dueDate: new Date('2026-01-18'),
              netPayableAmount: 5000n,
              paidAmount: 0n,
              status: 'OVERDUE',
            },
            {
              installmentMonth: 2,
              dueDate: new Date('2026-02-18'),
              netPayableAmount: 4000n,
              paidAmount: 0n,
              status: 'OVERDUE',
            },
            {
              installmentMonth: 3,
              dueDate: new Date('2026-03-18'),
              netPayableAmount: 4000n,
              paidAmount: 0n,
              status: 'OVERDUE',
            },
          ],
        },
      ]);

      const defaulters = await reportService.getDefaultersAgingReport(
        { minArrearsMonths: 3, page: 1, limit: 20 },
        superAdminUser,
      );

      expect(defaulters.defaulters.length).toBe(1);
      const defaulter = defaulters.defaulters[0];
      expect(defaulter.consecutiveUnpaidMonths).toBe(3);
      expect(defaulter.riskCategory).toBe('HIGH_RISK_3M_REMOVAL');
      expect(defaulter.eligibleForRemovalRights).toBe(true);
      expect(defaulter.totalArrearsAmount).toBe(13000n);
    });

    it('should allow Collection Agent to view branch-scoped defaulters for field recovery rounds', async () => {
      prismaMock.subscriberTicket.count.mockResolvedValue(1);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tick-def-1m',
          ticketNumber: 5,
          consecutiveUnpaidMonths: 1,
          chitGroup: {
            groupCode: 'KCA-1L-20M-01',
            groupName: 'Perundurai 1 Lakh',
            baseInstallment: 5000n,
          },
          customer: {
            customerCode: 'KC-CUST-00005',
            fullName: 'E. Elango',
            fullNameTamil: 'இளங்கோ',
            phone: '9842100005',
          },
          dues: [
            {
              installmentMonth: 2,
              dueDate: new Date('2026-02-18'),
              netPayableAmount: 4000n,
              paidAmount: 0n,
              status: 'OVERDUE',
            },
          ],
        },
      ]);

      const report = await reportService.getDefaultersAgingReport(
        { page: 1, limit: 20 },
        collectionAgentUser,
      );

      expect(report.scope).toBe(`BRANCH_${mockBranchId}`);
      expect(report.defaulters.length).toBe(1);
      expect(report.defaulters[0].riskCategory).toBe('ATTENTION_1M');
    });
  });

  describe('7. Immutable Audit Trail Register (`/reports/audit-logs`)', () => {
    it('should retrieve immutable audit logs with entity and action filters', async () => {
      prismaMock.auditLog.count.mockResolvedValue(1);
      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-001',
          action: 'PAYMENT_REVERSED',
          entityType: 'Payment',
          entityId: 'pay-001',
          timestamp: new Date('2026-10-18T15:00:00Z'),
          ipAddress: '127.0.0.1',
          user: {
            id: 'u1',
            name: 'Partner A',
            phone: '9842100001',
            roles: [Role.SUPER_ADMIN],
          },
          oldValue: { status: 'SUCCESS' },
          newValue: { status: 'REVERSED' },
        },
      ]);

      const audit = await reportService.getAuditLogs(
        { action: 'PAYMENT_REVERSED', page: 1, limit: 50 },
        superAdminUser,
      );

      expect(audit.pagination.totalRecords).toBe(1);
      expect(audit.logs[0].action).toBe('PAYMENT_REVERSED');
      expect(audit.logs[0].performedBy?.name).toBe('Partner A');
    });

    it('should reject non-Super Admin (Auditor, Customer) attempting to view audit logs (403 Forbidden)', async () => {
      await expect(
        reportService.getAuditLogs({ page: 1, limit: 50 }, auditorUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        reportService.getAuditLogs({ page: 1, limit: 50 }, customerUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('8. Branch Scoping Boundaries', () => {
    it('should restrict Branch Manager to data belonging strictly to their assigned branch', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        ...mockChitGroup,
        branchId: 'other-branch-002',
      });

      await expect(
        reportService.getAuctionMinutesFormXvii(
          { chitGroupId: mockChitGroupId },
          branchManagerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('9. Unified Maker-Checker Approvals Queue (`/reports/pending-approvals`)', () => {
    it('should aggregate pending cash handovers, disbursement authorizations, reversals, and safety proofs', async () => {
      // 1. Mock pending cash payments
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pmt-handover-1',
          branchId: mockBranchId,
          recordedByUserId: 'collector-agent-1',
          amount: 3950n,
          paymentMethod: 'CASH',
          cashHandoverStatus: 'PENDING_HANDOVER',
          createdAt: new Date('2026-10-21T09:00:00Z'),
          recordedByUser: {
            id: 'collector-agent-1',
            name: 'K. Senthil',
            phone: '9842111111',
          },
        },
        {
          id: 'pmt-handover-2',
          branchId: mockBranchId,
          recordedByUserId: 'collector-agent-1',
          amount: 3950n,
          paymentMethod: 'CASH',
          cashHandoverStatus: 'PENDING_HANDOVER',
          createdAt: new Date('2026-10-21T09:30:00Z'),
          recordedByUser: {
            id: 'collector-agent-1',
            name: 'K. Senthil',
            phone: '9842111111',
          },
        },
      ]);

      // 2. Mock pending disbursement authorizations
      prismaMock.auctionWinner.findMany
        .mockResolvedValueOnce([
          {
            id: 'winner-auth-1',
            auctionId: 'auc-01',
            disbursementStatus: 'VERIFIED_BY_MAKER',
            disbursedAmount: 75000n,
            disbursementMode: 'NEFT',
            verifiedByUserId: 'staff-maker-1',
            agreementSigned: true,
            nomineeSigned: true,
            securityDocS3Key: 'docs/winner-agreement.pdf',
            auction: {
              installmentMonth: 4,
              auctionDate: new Date('2026-10-20T10:00:00Z'),
              chitGroup: {
                groupCode: 'KCA-1L-20M-01',
                groupName: 'Perundurai 1L Scheme',
                branchId: mockBranchId,
              },
            },
            ticket: {
              ticketNumber: 5,
              customer: {
                customerCode: 'KC-CUST-00005',
                fullName: 'M. Duraisamy',
                phone: '9842155555',
              },
            },
          },
        ]) // 4. Mock pending safety proof verifications
        .mockResolvedValueOnce([
          {
            id: 'winner-verify-1',
            auctionId: 'auc-02',
            disbursementStatus: 'PENDING_VERIFICATION',
            disbursedAmount: null,
            auction: {
              installmentMonth: 5,
              prizeMoney: 80000n,
              auctionDate: new Date('2026-10-21T11:00:00Z'),
              chitGroup: {
                groupCode: 'KCA-1L-20M-02',
                groupName: 'Perundurai 1L Scheme 2',
              },
            },
            ticket: {
              ticketNumber: 8,
              customer: {
                customerCode: 'KC-CUST-00008',
                fullName: 'P. Shanmugam',
                phone: '9842188888',
              },
            },
          },
        ]);

      // 3. Mock pending payment reversals
      prismaMock.paymentReversal.findMany.mockResolvedValue([
        {
          id: 'rev-01',
          paymentId: 'pmt-wrong-01',
          reason: 'Duplicate entry by field agent',
          notes: 'Customer already paid in office',
          initiatedByUserId: 'agent-maker-01',
          createdAt: new Date('2026-10-21T08:00:00Z'),
          payment: {
            amount: 3950n,
            branchId: mockBranchId,
            receipt: { receiptNumber: 'KC-REC-PRD-2026-00010' },
            allocations: [
              {
                ticket: {
                  customer: {
                    customerCode: 'KC-CUST-00003',
                    fullName: 'Ramasamy K',
                  },
                },
              },
            ],
          },
        },
      ]);

      const res = await reportService.getPendingApprovals(superAdminUser);

      // Verify Summary Counts & Amounts
      expect(res.summary.totalPendingCount).toBe(4);
      expect(res.summary.cashHandoversCount).toBe(1); // Grouped by agent
      expect(res.summary.disbursementAuthorizationsCount).toBe(1);
      expect(res.summary.paymentReversalsCount).toBe(1);
      expect(res.summary.safetyProofVerificationsCount).toBe(1);
      expect(res.summary.cashHandoversTotalAmount).toBe('7900');
      expect(res.summary.disbursementsTotalAmount).toBe('75000');
      expect(res.summary.reversalsTotalAmount).toBe('3950');

      // Verify Cash Handover Details
      expect(res.cashHandovers[0].collectorName).toBe('K. Senthil');
      expect(res.cashHandovers[0].paymentCount).toBe(2);
      expect(res.cashHandovers[0].totalAmount).toBe('7900');

      // Verify Disbursement Details
      expect(res.disbursementAuthorizations[0].customerName).toBe('M. Duraisamy');
      expect(res.disbursementAuthorizations[0].netPayableAmount).toBe('75000');
      expect(res.disbursementAuthorizations[0].hasSecurityDoc).toBe(true);

      // Verify Reversal Details
      expect(res.paymentReversals[0].receiptNumber).toBe('KC-REC-PRD-2026-00010');
      expect(res.paymentReversals[0].amount).toBe('3950');
      expect(res.paymentReversals[0].customerName).toBe('Ramasamy K');
    });

    it('should restrict Branch Manager to pending approvals strictly belonging to their branch', async () => {
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.auctionWinner.findMany.mockResolvedValue([]);
      prismaMock.paymentReversal.findMany.mockResolvedValue([]);

      await reportService.getPendingApprovals(branchManagerUser);

      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: mockBranchId }),
        }),
      );
      expect(prismaMock.paymentReversal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            payment: { branchId: mockBranchId },
          }),
        }),
      );
    });
  });

  describe('7. Distributed Mutex Fallback & Exception-Safe Cleanup (DEF-DB-04)', () => {
    const createInMemoryRedisMock = () => {
      const store = new Map<string, string>();
      const client = {
        get: jest.fn().mockImplementation((k: string) => Promise.resolve(store.get(k) ?? null)),
        set: jest.fn().mockImplementation((k: string, v: string, _px?: string, _ttl?: number, nx?: string) => {
          if (nx === 'NX' && store.has(k)) return Promise.resolve(null);
          store.set(k, v);
          return Promise.resolve('OK');
        }),
        setex: jest.fn().mockImplementation((k: string, _ttl: number, v: string) => {
          store.set(k, v);
          return Promise.resolve('OK');
        }),
        del: jest.fn().mockImplementation((...keys: string[]) => {
          let count = 0;
          for (const k of keys) {
            if (store.delete(k)) count += 1;
          }
          return Promise.resolve(count);
        }),
        eval: jest.fn().mockImplementation((_lua: string, _numKeys: number, key: string, token: string) => {
          if (store.get(key) === token) {
            store.delete(key);
            return Promise.resolve(1);
          }
          return Promise.resolve(0);
        }),
      };
      return { store, client };
    };

    const seedDashboardPrismaMocks = () => {
      prismaMock.chitGroup.count.mockResolvedValue(1);
      prismaMock.customer.count.mockResolvedValue(20);
      prismaMock.subscriberTicket.count.mockResolvedValue(20);
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.auctionWinner.findMany.mockResolvedValue([]);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0n } });
      prismaMock.auctionWinner.aggregate.mockResolvedValue({ _sum: { disbursedAmount: 0n } });
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.auctionWinner.count.mockResolvedValue(0);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([]);
    };

    it('DEF-DB-04-N1: Dashboard & DayBook fallback acquires UUID token (never "1") and unlocks strictly via Lua eval (never del)', async () => {
      const { store, client } = createInMemoryRedisMock();
      const redisProvider = {
        getClient: () => client,
        getIsConnected: () => true,
      } as any;

      // Instantiate ReportService WITHOUT DistributedLockService to exercise fallback lock path
      const fallbackService = new ReportService(
        prismaMock as unknown as PrismaService,
        statutoryReportService,
        redisProvider,
        undefined,
      );

      seedDashboardPrismaMocks();
      await fallbackService.getExecutiveDashboard({}, superAdminUser);

      expect(client.set).toHaveBeenCalledWith(
        'lock:report:dashboard:ALL',
        expect.stringMatching(/^[0-9a-f-]{36}$/i),
        'PX',
        4000,
        'NX',
      );
      expect(client.del).not.toHaveBeenCalled();
      const dashToken = client.set.mock.calls[0][1];
      expect(dashToken).not.toBe('1');
      expect(client.eval).toHaveBeenCalledWith(REDIS_RELEASE_LOCK_LUA, 1, 'lock:report:dashboard:ALL', dashToken);
      expect(store.has('lock:report:dashboard:ALL')).toBe(false);

      // Verify DayBook identically uses tokenized Lua unlock
      client.set.mockClear();
      client.eval.mockClear();
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.auctionWinner.findMany.mockResolvedValue([]);
      await fallbackService.getDayBook({ date: '2026-11-12' }, superAdminUser);

      expect(client.set).toHaveBeenCalledWith(
        'lock:report:daybook:ALL:2026-11-12',
        expect.stringMatching(/^[0-9a-f-]{36}$/i),
        'PX',
        4000,
        'NX',
      );
      expect(client.del).not.toHaveBeenCalled();
      const dayToken = client.set.mock.calls[0][1];
      expect(client.eval).toHaveBeenCalledWith(
        REDIS_RELEASE_LOCK_LUA,
        1,
        'lock:report:daybook:ALL:2026-11-12',
        dayToken,
      );
    });

    it('DEF-DB-04-N2: Slow >4s Dashboard query preserves foreign worker lock on expiry instead of deleting it', async () => {
      const { store, client } = createInMemoryRedisMock();
      const redisProvider = {
        getClient: () => client,
        getIsConnected: () => true,
      } as any;

      const fallbackService = new ReportService(
        prismaMock as unknown as PrismaService,
        statutoryReportService,
        redisProvider,
        undefined,
      );

      seedDashboardPrismaMocks();
      // Simulate TTL expiry and foreign worker taking over the lock during slow Prisma query
      prismaMock.chitGroup.count.mockImplementationOnce(async () => {
        store.set('lock:report:dashboard:ALL', 'foreign-worker-uuid-2');
        return 1;
      });

      await fallbackService.getExecutiveDashboard({}, superAdminUser);

      expect(client.del).not.toHaveBeenCalled();
      expect(store.get('lock:report:dashboard:ALL')).toBe('foreign-worker-uuid-2');
    });

    it('DEF-DB-04-N3: Concurrent caller coalesces on cached report without querying PostgreSQL when lock held', async () => {
      const { store, client } = createInMemoryRedisMock();
      store.set('lock:report:dashboard:ALL', 'other-worker-token');
      // On second redis.get after 250ms backoff wait, return fresh cached payload
      client.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ scope: 'COMPANY_WIDE', activeChitsCount: 5 }));

      const redisProvider = {
        getClient: () => client,
        getIsConnected: () => true,
      } as any;

      const fallbackService = new ReportService(
        prismaMock as unknown as PrismaService,
        statutoryReportService,
        redisProvider,
        undefined,
      );

      const res = await fallbackService.getExecutiveDashboard({}, superAdminUser);
      expect(res.activeChitsCount).toBe(5);
      expect(prismaMock.chitGroup.count).not.toHaveBeenCalled();
      expect(client.eval).not.toHaveBeenCalled();
      expect(store.get('lock:report:dashboard:ALL')).toBe('other-worker-token');
    });

    it('DEF-DB-04-N4: Mid-query DB exceptions release Redis lock and never leak fail-open bulkhead slots', async () => {
      const { store, client } = createInMemoryRedisMock();
      const redisProvider = {
        getClient: () => client,
        getIsConnected: () => true,
      } as any;

      const fallbackService = new ReportService(
        prismaMock as unknown as PrismaService,
        statutoryReportService,
        redisProvider,
        undefined,
      );

      prismaMock.chitGroup.count.mockRejectedValueOnce(new Error('DB statement_timeout'));
      await expect(fallbackService.getExecutiveDashboard({}, superAdminUser)).rejects.toThrow('DB statement_timeout');
      expect(client.eval).toHaveBeenCalledTimes(1);
      expect(store.has('lock:report:dashboard:ALL')).toBe(false);

      client.eval.mockClear();
      prismaMock.payment.findMany.mockRejectedValueOnce(new Error('DayBook query failure'));
      await expect(fallbackService.getDayBook({ date: '2026-11-12' }, superAdminUser)).rejects.toThrow(
        'DayBook query failure',
      );
      expect(client.eval).toHaveBeenCalledTimes(1);
      expect(store.has('lock:report:daybook:ALL:2026-11-12')).toBe(false);

      // Redis-offline fallback mode: trigger 4 sequential DB failures (> MAX_CONCURRENT_FALLBACK_QUERIES=3)
      const offlineService = new ReportService(
        prismaMock as unknown as PrismaService,
        statutoryReportService,
      );
      for (let i = 0; i < 4; i += 1) {
        prismaMock.chitGroup.count.mockRejectedValueOnce(new Error(`Offline DB blip ${i}`));
        await expect(offlineService.getExecutiveDashboard({}, superAdminUser)).rejects.toThrow(`Offline DB blip ${i}`);
      }
      expect((offlineService as any).activeFallbackDashboardQueries).toBe(0);

      seedDashboardPrismaMocks();
      const healthy = await offlineService.getExecutiveDashboard({}, superAdminUser);
      expect(healthy.activeChitsCount).toBe(1);
    });
  });
});
