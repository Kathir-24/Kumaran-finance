import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { firstValueFrom } from 'rxjs';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { BYPASS_ENVELOPE_KEY } from '../../src/common/decorators/bypass-envelope.decorator';
import { REDIS_RELEASE_LOCK_LUA } from '../../src/common/utils/redis-lock.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import { QueryAuditLogsDto } from '../../src/report/dto/query-audit-logs.dto';
import { QueryDefaultersReportDto } from '../../src/report/dto/query-defaulters-report.dto';
import { ReportController } from '../../src/report/report.controller';
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
      expect(ticketLedger.monthlySchedule[0].paymentMethod).toBe('CASH');
      expect(ticketLedger.monthlySchedule[0].receiptNumber).toBe('KC-REC-PRD-2026-00001');
      expect(ticketLedger.monthlySchedule[0].paymentDate).toEqual(new Date('2026-01-15'));
      expect(ticketLedger.monthlySchedule[1].paymentMethod).toBeNull();
      expect(ticketLedger.monthlySchedule[1].receiptNumber).toBeNull();
      expect(ticketLedger.monthlySchedule[1].paymentDate).toBeNull();
    });

    it('should correctly distinguish verified prize arrears offset from direct adjustments and unallocated settlements (KC-09)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);

      const offsetTimestamp = new Date('2026-11-14T19:42:47.365Z');
      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          entityId: 'due-002',
          timestamp: offsetTimestamp,
          action: 'PRIZE_ARREARS_OFFSET_ALLOCATED',
          newValue: {
            offsetAmount: '3950',
            auctionWinnerId: 'win-001',
          },
        },
      ]);

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tick-002',
          ticketNumber: 2,
          isPrized: true,
          consecutiveUnpaidMonths: 0,
          status: 'ACTIVE',
          winningAuction: {
            paymentReference: 'SYNTHETIC-CHQ-UAT-2026-002',
            disbursedAt: offsetTimestamp,
          },
          customer: {
            id: 'c2',
            customerCode: 'KC-CUST-00126',
            fullName: 'Ramasamy K',
            fullNameTamil: 'ராமசாமி',
            phone: '9842100003',
          },
          dues: [
            // Due 1: Normal Payment with allocation
            {
              id: 'due-001',
              installmentMonth: 1,
              dueDate: new Date('2026-10-10'),
              grossAmount: 5000n,
              dividendDeduction: 0n,
              netPayableAmount: 5000n,
              paidAmount: 5000n,
              status: 'PAID',
              allocations: [
                {
                  payment: {
                    createdAt: new Date('2026-10-12T10:00:00Z'),
                    paymentMethod: 'CASH',
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-00430' },
                  },
                },
              ],
            },
            // Due 2: Paid via Prize Arrears Offset (proven by audit log)
            {
              id: 'due-002',
              installmentMonth: 2,
              dueDate: new Date('2026-11-10'),
              grossAmount: 5000n,
              dividendDeduction: 1050n,
              netPayableAmount: 3950n,
              paidAmount: 3950n,
              status: 'PAID',
              allocations: [],
            },
            // Due 3: Paid with no allocation and no offset log (e.g. direct adjustment)
            {
              id: 'due-003',
              installmentMonth: 3,
              dueDate: new Date('2026-12-10'),
              grossAmount: 5000n,
              dividendDeduction: 1050n,
              netPayableAmount: 3950n,
              paidAmount: 3950n,
              status: 'PAID',
              allocations: [],
            },
            // Due 4: Unpaid
            {
              id: 'due-004',
              installmentMonth: 4,
              dueDate: new Date('2027-01-10'),
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
        { chitGroupId: mockChitGroupId, ticketNumber: 2 },
        superAdminUser,
      );

      const schedule = ledger.ledgers[0].monthlySchedule;
      expect(schedule).toHaveLength(4);

      // Due 1: Normal payment
      expect(schedule[0].status).toBe('PAID');
      expect(schedule[0].paymentMethod).toBe('CASH');
      expect(schedule[0].receiptNumber).toBe('KC-REC-PRD-2026-00430');
      expect(schedule[0].paymentDate).toEqual(new Date('2026-10-12T10:00:00Z'));

      // Due 2: Verified Prize Arrears Offset (exact settlement timestamp, voucher ref, zero due-date substitution)
      expect(schedule[1].status).toBe('PAID');
      expect(schedule[1].paymentMethod).toBe('PRIZE_ARREARS_OFFSET');
      expect(schedule[1].receiptNumber).toBe('OFFSET-SYNTHETIC-CHQ-UAT-2026-002');
      expect(schedule[1].paymentDate).toEqual(offsetTimestamp);
      expect(schedule[1].paymentDate).not.toEqual(new Date('2026-11-10')); // NOT the due date!

      // Due 3: Paid due without allocation or offset log
      expect(schedule[2].status).toBe('PAID');
      expect(schedule[2].paymentMethod).toBe('DIRECT_ADJUSTMENT');
      expect(schedule[2].receiptNumber).toBeNull();
      expect(schedule[2].paymentDate).toBeNull(); // Never fabricate due date

      // Due 4: Unpaid
      expect(schedule[3].status).toBe('UNPAID');
      expect(schedule[3].paymentMethod).toBeNull();
      expect(schedule[3].receiptNumber).toBeNull();
      expect(schedule[3].paymentDate).toBeNull();
    });

    it('KC-09: should handle multiple arrears offsets and missing or ambiguous provenance without inventing dates', async () => {
      const offsetTimestamp1 = new Date('2026-11-14T19:40:00.000Z');
      const offsetTimestamp2 = new Date('2026-12-15T11:20:00.000Z');

      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);

      // Audit logs for two distinct due offsets
      prismaMock.auditLog.findMany.mockResolvedValue([
        {
          entityId: 'due-multi-002',
          timestamp: offsetTimestamp1,
          newValue: { offsetAmount: '3950', dueMonth: 2 },
        },
        {
          entityId: 'due-multi-003',
          timestamp: offsetTimestamp2,
          newValue: { offsetAmount: '3950', dueMonth: 3 },
        },
      ]);

      // Ticket with two offset-settled dues, one with missing voucher reference
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-multi-01',
          ticketNumber: 5,
          status: 'ACTIVE',
          winningAuction: null, // Ambiguous/missing voucher reference
          customer: {
            id: 'c5',
            customerCode: 'KC-CUST-00129',
            fullName: 'Murugesan V',
            fullNameTamil: 'முருகேசன்',
            phone: '9842100005',
          },
          dues: [
            {
              id: 'due-multi-002',
              installmentMonth: 2,
              dueDate: new Date('2026-11-10'),
              grossAmount: 5000n,
              dividendDeduction: 1050n,
              netPayableAmount: 3950n,
              paidAmount: 3950n,
              status: 'PAID',
              allocations: [],
            },
            {
              id: 'due-multi-003',
              installmentMonth: 3,
              dueDate: new Date('2026-12-10'),
              grossAmount: 5000n,
              dividendDeduction: 1050n,
              netPayableAmount: 3950n,
              paidAmount: 3950n,
              status: 'PAID',
              allocations: [],
            },
            {
              id: 'due-multi-004-unproven',
              installmentMonth: 4,
              dueDate: new Date('2027-01-10'),
              grossAmount: 5000n,
              dividendDeduction: 1050n,
              netPayableAmount: 3950n,
              paidAmount: 3950n,
              status: 'PAID',
              allocations: [], // PAID but no allocation and no matching audit log
            },
          ],
        },
      ]);

      const ledger = await reportService.getSubscriberLedgerFormXxi(
        { chitGroupId: mockChitGroupId, ticketNumber: 5 },
        superAdminUser,
      );

      const schedule = ledger.ledgers[0].monthlySchedule;
      expect(schedule).toHaveLength(3);

      // Multiple offset 1: fallback to PRIZE-OFFSET when voucher reference is null
      expect(schedule[0].status).toBe('PAID');
      expect(schedule[0].paymentMethod).toBe('PRIZE_ARREARS_OFFSET');
      expect(schedule[0].receiptNumber).toBe('PRIZE-OFFSET');
      expect(schedule[0].paymentDate).toEqual(offsetTimestamp1);

      // Multiple offset 2: exact second timestamp
      expect(schedule[1].status).toBe('PAID');
      expect(schedule[1].paymentMethod).toBe('PRIZE_ARREARS_OFFSET');
      expect(schedule[1].receiptNumber).toBe('PRIZE-OFFSET');
      expect(schedule[1].paymentDate).toEqual(offsetTimestamp2);

      // Unproven / ambiguous provenance: never invent date, flag as DIRECT_ADJUSTMENT
      expect(schedule[2].status).toBe('PAID');
      expect(schedule[2].paymentMethod).toBe('DIRECT_ADJUSTMENT');
      expect(schedule[2].receiptNumber).toBeNull();
      expect(schedule[2].paymentDate).toBeNull();
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

  describe('10. Module 7 Forensic Audit Remediations (Security, IST, BigInt, Statutory & 8-Queue Approvals)', () => {
    const branchManagerNoBranch: JwtPayload = {
      sub: 'user-bm-orphan',
      phone: '9842100099',
      roles: [Role.BRANCH_MANAGER],
      branchId: null,
      tokenType: 'access',
    };

    const collectionAgentNoBranch: JwtPayload = {
      sub: 'user-agent-orphan',
      phone: '9842100098',
      roles: [Role.COLLECTION_AGENT],
      branchId: null,
      tokenType: 'access',
    };

    const partnerAUser: JwtPayload = {
      sub: 'partner-a-001',
      phone: '9842100011',
      roles: [Role.PARTNER],
      branchId: null,
      tokenType: 'access',
    };

    const partnerBUser: JwtPayload = {
      sub: 'partner-b-002',
      phone: '9842100012',
      roles: [Role.PARTNER],
      branchId: null,
      tokenType: 'access',
    };

    const itSuperAdminUser: JwtPayload = {
      sub: 'it-admin-001',
      phone: '9842100013',
      roles: [Role.SUPER_ADMIN],
      branchId: null,
      tokenType: 'access',
    };

    describe('DEF-RPT-01: Fail-Closed Anti-BOLA Branch Scoping', () => {
      it('rejects BRANCH_MANAGER with null/empty branchId across all 7 report endpoints (never fails open)', async () => {
        prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);

        await expect(
          reportService.getExecutiveDashboard({}, branchManagerNoBranch),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          reportService.getDayBook({ date: '2026-10-18' }, branchManagerNoBranch),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          reportService.getCashBookFormXxii({ date: '2026-10-18' }, branchManagerNoBranch),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          reportService.getAuctionMinutesFormXvii(
            { chitGroupId: mockChitGroupId },
            branchManagerNoBranch,
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          reportService.getSubscriberLedgerFormXxi(
            { chitGroupId: mockChitGroupId },
            branchManagerNoBranch,
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          reportService.getDefaultersAgingReport({ page: 1, limit: 20 }, branchManagerNoBranch),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          reportService.getPendingApprovals(branchManagerNoBranch),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects COLLECTION_AGENT with null branchId on defaulters and blocks cross-branch query tampering', async () => {
        await expect(
          reportService.getDefaultersAgingReport({ page: 1, limit: 20 }, collectionAgentNoBranch),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getDefaultersAgingReport(
            { branchId: 'foreign-branch-999', page: 1, limit: 20 },
            collectionAgentUser,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getExecutiveDashboard(
            { branchId: 'foreign-branch-999' },
            branchManagerUser,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getDayBook(
            { date: '2026-10-18', branchId: 'foreign-branch-999' },
            branchManagerUser,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getCashBookFormXxii(
            { date: '2026-10-18', branchId: 'foreign-branch-999' },
            branchManagerUser,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getPendingApprovals(branchManagerUser, {
            branchId: 'foreign-branch-999',
          }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects COLLECTION_AGENT calling Form XXI or Dashboard directly at service layer', async () => {
        prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);
        await expect(
          reportService.getSubscriberLedgerFormXxi(
            { chitGroupId: mockChitGroupId },
            collectionAgentUser,
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          reportService.getExecutiveDashboard({}, collectionAgentUser),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('DEF-RPT-02: Form XXI Customer Fail-Closed Isolation, Reversed Allocation Filtering & >20 Tickets', () => {
      it('fails closed when CUSTOMER has empty sub and empty phone (never returns all tickets)', async () => {
        prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);
        const brokenCustomer: JwtPayload = {
          sub: '',
          phone: '',
          roles: [Role.CUSTOMER],
          branchId: null,
          tokenType: 'access',
        };

        await expect(
          reportService.getSubscriberLedgerFormXxi(
            { chitGroupId: mockChitGroupId },
            brokenCustomer,
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(prismaMock.subscriberTicket.findMany).not.toHaveBeenCalled();
      });

      it('filters out REVERSED/FAILED allocations and supports ticketNumber > 20 in 30-month schemes', async () => {
        const thirtyMonthChit = {
          ...mockChitGroup,
          durationMonths: 30,
          totalTickets: 30,
          foremanCommissionRate: '5.00',
        };
        prismaMock.chitGroup.findUnique.mockResolvedValue(thirtyMonthChit);
        prismaMock.subscriberTicket.findMany.mockResolvedValue([
          {
            id: 'tick-28',
            ticketNumber: 28,
            isPrized: false,
            consecutiveUnpaidMonths: 1,
            status: 'ACTIVE',
            customer: {
              id: 'c28',
              customerCode: 'KC-CUST-00028',
              fullName: 'K. Velu',
              fullNameTamil: 'வேலு',
              phone: '9842100028',
            },
            dues: [
              {
                id: 'due-rev-01',
                installmentMonth: 1,
                dueDate: new Date('2026-01-18'),
                grossAmount: 5000n,
                dividendDeduction: 0n,
                netPayableAmount: 5000n,
                paidAmount: 0n,
                status: 'UNPAID',
                allocations: [
                  {
                    payment: {
                      createdAt: new Date('2026-01-15'),
                      paymentMethod: 'CASH',
                      paymentStatus: 'REVERSED',
                      receipt: { receiptNumber: 'KC-REC-REVERSED-01' },
                    },
                  },
                ],
              },
              {
                id: 'due-repaid-02',
                installmentMonth: 2,
                dueDate: new Date('2026-02-18'),
                grossAmount: 5000n,
                dividendDeduction: 1000n,
                netPayableAmount: 4000n,
                paidAmount: 4000n,
                status: 'PAID',
                allocations: [
                  {
                    payment: {
                      createdAt: new Date('2026-02-10'),
                      paymentMethod: 'CASH',
                      paymentStatus: 'REVERSED',
                      receipt: { receiptNumber: 'KC-REC-REVERSED-02' },
                    },
                  },
                  {
                    payment: {
                      createdAt: new Date('2026-02-12'),
                      paymentMethod: 'UPI',
                      paymentStatus: 'SUCCESS',
                      receipt: { receiptNumber: 'KC-REC-VALID-02' },
                    },
                  },
                ],
              },
            ],
          },
        ]);

        const ledger = await reportService.getSubscriberLedgerFormXxi(
          { chitGroupId: mockChitGroupId, ticketNumber: 28 },
          superAdminUser,
        );

        expect(ledger.chitGroup.foremanCommissionRate).toBe('5.00%');
        const schedule = ledger.ledgers[0].monthlySchedule;
        // Reversed payment on UNPAID due MUST NOT leak receipt/date/method
        expect(schedule[0].receiptNumber).toBeNull();
        expect(schedule[0].paymentDate).toBeNull();
        expect(schedule[0].paymentMethod).toBeNull();
        // Re-paid due MUST show the SUCCESS payment, never the REVERSED one
        expect(schedule[1].receiptNumber).toBe('KC-REC-VALID-02');
        expect(schedule[1].paymentMethod).toBe('UPI');

        // Ticket #31 exceeds 30-month scheme limit -> 400 Bad Request
        await expect(
          reportService.getSubscriberLedgerFormXxi(
            { chitGroupId: mockChitGroupId, ticketNumber: 31 },
            superAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('DEF-RPT-03: Strict Asia/Kolkata (IST) Day Boundaries & Date Validation', () => {
      it('queries exact IST boundaries (2026-10-17T18:30:00.000Z to 2026-10-18T18:29:59.999Z) for Day Book & Form XXII', async () => {
        prismaMock.payment.findMany.mockResolvedValue([]);
        prismaMock.auctionWinner.findMany.mockResolvedValue([]);
        prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0n } });
        prismaMock.auctionWinner.aggregate.mockResolvedValue({
          _sum: { disbursedAmount: 0n },
        });

        await reportService.getDayBook({ date: '2026-10-18' }, superAdminUser);
        expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              createdAt: {
                gte: new Date('2026-10-17T18:30:00.000Z'),
                lte: new Date('2026-10-18T18:29:59.999Z'),
              },
            }),
          }),
        );

        await reportService.getCashBookFormXxii({ date: '2026-10-18' }, superAdminUser);
        expect(prismaMock.payment.aggregate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              createdAt: { lt: new Date('2026-10-17T18:30:00.000Z') },
            }),
          }),
        );
      });

      it('rejects calendar-overflow dates and inverted fromDate > toDate ranges with 400 Bad Request', async () => {
        await expect(
          reportService.getDayBook({ date: '2026-02-30' }, superAdminUser),
        ).rejects.toThrow(BadRequestException);

        await expect(
          reportService.getCashBookFormXxii({ date: 'not-a-date' }, superAdminUser),
        ).rejects.toThrow(BadRequestException);

        await expect(
          reportService.getAuditLogs(
            {
              fromDate: '2026-10-31',
              toDate: '2026-10-01',
              page: 1,
              limit: 50,
            },
            superAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);

        prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);
        await expect(
          reportService.getAuctionMinutesFormXvii(
            {
              chitGroupId: mockChitGroupId,
              fromDate: '2026-12-01T00:00:00.000Z',
              toDate: '2026-01-01T00:00:00.000Z',
            },
            superAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('invalidateReportCache deletes IST date key even between 00:00 and 05:29 IST', async () => {
        const delMock = jest.fn().mockResolvedValue(1);
        const redisProvider = {
          getClient: () => ({ del: delMock }),
          getIsConnected: () => true,
        } as any;
        const svc = new ReportService(
          prismaMock as unknown as PrismaService,
          statutoryReportService,
          redisProvider,
        );

        // 2026-10-18T20:00:00Z is 2026-10-19 01:30:00 IST
        await svc.invalidateReportCache('branch-prd-001', new Date('2026-10-18T20:00:00.000Z'));

        expect(delMock).toHaveBeenCalledWith(
          expect.stringContaining('report:dashboard:ALL'),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
        const deletedKeys = delMock.mock.calls[0];
        expect(deletedKeys).toContain('report:daybook:ALL:2026-10-19');
        expect(deletedKeys).toContain('report:daybook:branch-prd-001:2026-10-19');
      });
    });

    describe('DEF-RPT-04: Audit Logs Strict SUPER_ADMIN RBAC, Secret Redaction & Pagination Bounds', () => {
      it('strictly blocks ALL non-SUPER_ADMIN roles (AUDITOR, BRANCH_MANAGER, ACCOUNTANT, COLLECTION_AGENT, CUSTOMER)', async () => {
        for (const nonSuperAdmin of [
          auditorUser,
          branchManagerUser,
          accountantUser,
          collectionAgentUser,
          customerUser,
        ]) {
          await expect(
            reportService.getAuditLogs({ page: 1, limit: 50 }, nonSuperAdmin),
          ).rejects.toThrow(ForbiddenException);
        }
      });

      it('recursively redacts secrets/tokens/raw PAN/Aadhaar in oldValue & newValue while preserving domain fields', async () => {
        prismaMock.auditLog.count.mockResolvedValue(1);
        prismaMock.auditLog.findMany.mockResolvedValue([
          {
            id: 'log-sec-1',
            action: 'USER_UPDATED',
            entityType: 'User',
            entityId: 'u-001',
            timestamp: new Date('2026-10-18T10:00:00Z'),
            ipAddress: '10.0.0.1',
            user: { id: 'u1', name: 'Partner A', roles: [Role.SUPER_ADMIN] },
            oldValue: {
              passwordHash: '$2b$10$secretHashValue',
              totpSecret: 'JBSWY3DPEHPK3PXP',
              refreshTokenHash: 'sha256-refresh-hash',
              fcmToken: 'firebase-device-token',
              panNumber: 'ABCDE1234F',
              aadhaarNumber: '123456789012',
              aadhaarLast4: '9012',
              nested: {
                temporaryPassword: 'Temp#1234',
                mpinHash: '$2b$10$mpin',
                isSecurityRequired: true,
                tokenNumber: 3,
              },
            },
            newValue: {
              isActive: true,
              securityType: 'BLANK_CHEQUE',
              userPasswordHash: 'new-hash',
            },
          },
        ]);

        const res = await reportService.getAuditLogs(
          { page: 1, limit: 50 },
          superAdminUser,
        );
        const oldVal = res.logs[0].oldValue as any;
        const newVal = res.logs[0].newValue as any;

        expect(oldVal.passwordHash).toBe('[REDACTED]');
        expect(oldVal.totpSecret).toBe('[REDACTED]');
        expect(oldVal.refreshTokenHash).toBe('[REDACTED]');
        expect(oldVal.fcmToken).toBe('[REDACTED]');
        expect(oldVal.panNumber).toBe('ABXXXXX34F');
        expect(oldVal.aadhaarNumber).toBe('XXXXXXXX9012');
        expect(oldVal.aadhaarLast4).toBe('9012');
        expect(oldVal.nested.temporaryPassword).toBe('[REDACTED]');
        expect(oldVal.nested.mpinHash).toBe('[REDACTED]');
        expect(oldVal.nested.isSecurityRequired).toBe(true);
        expect(oldVal.nested.tokenNumber).toBe(3);
        expect(newVal.isActive).toBe(true);
        expect(newVal.securityType).toBe('BLANK_CHEQUE');
        expect(newVal.userPasswordHash).toBe('[REDACTED]');
      });

      it('rejects limit > 100 or page < 1 on audit-logs and defaulters', async () => {
        await expect(
          reportService.getAuditLogs({ page: 1, limit: 101 }, superAdminUser),
        ).rejects.toThrow(BadRequestException);
        await expect(
          reportService.getAuditLogs({ page: 0, limit: 50 }, superAdminUser),
        ).rejects.toThrow(BadRequestException);
        await expect(
          reportService.getDefaultersAgingReport({ page: 1, limit: 150 }, superAdminUser),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('DEF-RPT-05: 8-Queue Pending Approvals Hub, Partner/Maker-Checker Filtering & Zero Cross-User Cache Poisoning', () => {
      it('aggregates all 8 queues, separates Month N settlements, prevents cross-branch collector merge, and isolates caller permissions post-cache', async () => {
        const store = new Map<string, string>();
        const redisClient = {
          get: jest.fn(async (k: string) => store.get(k) ?? null),
          set: jest.fn(async (k: string, v: string, _px?: string, _ttl?: number, nx?: string) => {
            if (nx === 'NX' && store.has(k)) return null;
            store.set(k, v);
            return 'OK';
          }),
          setex: jest.fn(async (k: string, _ttl: number, v: string) => {
            store.set(k, v);
            return 'OK';
          }),
          eval: jest.fn(async (_lua: string, _n: number, k: string, token: string) => {
            if (store.get(k) === token) {
              store.delete(k);
              return 1;
            }
            return 0;
          }),
        };
        const redisProvider = {
          getClient: () => redisClient,
          getIsConnected: () => true,
        } as any;

        const cachedReportService = new ReportService(
          prismaMock as unknown as PrismaService,
          statutoryReportService,
          redisProvider,
        );

        // 1. Cash handovers from same collector in TWO different branches -> must NOT merge!
        prismaMock.payment.findMany.mockResolvedValue([
          {
            id: 'pmt-b1',
            branchId: 'branch-1',
            recordedByUserId: 'agent-01',
            amount: 4000n,
            createdAt: new Date('2026-10-21T09:00:00Z'),
            recordedByUser: { id: 'agent-01', name: 'Agent One', phone: '9842111111' },
          },
          {
            id: 'pmt-b2',
            branchId: 'branch-2',
            recordedByUserId: 'agent-01',
            amount: 5000n,
            createdAt: new Date('2026-10-21T10:00:00Z'),
            recordedByUser: { id: 'agent-01', name: 'Agent One', phone: '9842111111' },
          },
        ]);

        // 2 & 8. VERIFIED_BY_MAKER containing 1 regular payout + 1 Month N prepared settlement
        prismaMock.auctionWinner.findMany
          .mockResolvedValueOnce([
            {
              id: 'win-regular',
              auctionId: 'auc-reg',
              disbursementStatus: 'VERIFIED_BY_MAKER',
              disbursedAmount: 75000n,
              disbursementMode: 'BANK_TRANSFER_NEFT',
              verifiedByUserId: partnerAUser.sub,
              agreementSigned: true,
              nomineeSigned: true,
              securityDocS3Key: 'safety-proof/auc-reg/doc.pdf',
              auction: {
                status: 'COMPLETED',
                installmentMonth: 5,
                auctionDate: new Date('2026-10-20T10:00:00Z'),
                chitGroup: {
                  id: 'cg-1',
                  groupCode: 'KCA-1',
                  groupName: 'Group 1',
                  branchId: 'branch-1',
                  durationMonths: 20,
                },
              },
              ticket: {
                ticketNumber: 5,
                customer: { customerCode: 'C5', fullName: 'Winner 5', phone: '9000000005' },
              },
            },
            {
              id: 'win-month-n',
              auctionId: 'auc-month-20',
              disbursementStatus: 'VERIFIED_BY_MAKER',
              disbursedAmount: 91000n,
              disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
              paymentReference: 'FINAL_SETTLEMENT_PREPARED',
              verifiedByUserId: partnerAUser.sub,
              agreementSigned: false,
              nomineeSigned: false,
              securityDocS3Key: null,
              auction: {
                status: 'SCHEDULED',
                installmentMonth: 20,
                conductedByUserId: partnerAUser.sub,
                auctionDate: new Date('2026-10-21T10:00:00Z'),
                chitGroup: {
                  id: 'cg-1',
                  groupCode: 'KCA-1',
                  groupName: 'Group 1',
                  branchId: 'branch-1',
                  durationMonths: 20,
                },
              },
              ticket: {
                ticketNumber: 20,
                customer: { customerCode: 'C20', fullName: 'Final Winner', phone: '9000000020' },
              },
            },
          ])
          // 4. Safety proof verification (finalized auction)
          .mockResolvedValueOnce([]);

        // 3. Payment reversal initiated by Partner A
        prismaMock.paymentReversal.findMany.mockResolvedValue([
          {
            id: 'rev-a1',
            paymentId: 'pmt-rev-1',
            reason: 'Wrong amount',
            notes: null,
            initiatedByUserId: partnerAUser.sub,
            createdAt: new Date('2026-10-21T08:00:00Z'),
            payment: {
              amount: 3950n,
              receipt: { receiptNumber: 'KC-REC-100' },
              allocations: [],
            },
          },
        ]);

        // 5. Pending auction finalization (Month 6) + Month 20 (must be excluded from auctionFinalizations!)
        prismaMock.auction.findMany
          .mockResolvedValueOnce([
            {
              id: 'auc-pending-6',
              chitGroupId: 'cg-1',
              installmentMonth: 6,
              auctionDate: new Date('2026-10-21T11:00:00Z'),
              bidDiscount: 20000n,
              prizeMoney: 80000n,
              dividendPerTicket: 800n,
              conductedByUserId: partnerAUser.sub,
              chitGroup: { id: 'cg-1', groupCode: 'KCA-1', groupName: 'Group 1', durationMonths: 20 },
              winner: {
                ticket: {
                  ticketNumber: 6,
                  customer: { customerCode: 'C6', fullName: 'Bidder 6' },
                },
              },
            },
            {
              id: 'auc-month-20',
              chitGroupId: 'cg-1',
              installmentMonth: 20,
              auctionDate: new Date('2026-10-21T10:00:00Z'),
              bidDiscount: 4000n,
              prizeMoney: 96000n,
              dividendPerTicket: 0n,
              conductedByUserId: partnerAUser.sub,
              chitGroup: { id: 'cg-1', groupCode: 'KCA-1', groupName: 'Group 1', durationMonths: 20 },
              winner: { ticket: { ticketNumber: 20, customer: { customerCode: 'C20', fullName: 'Final' } } },
            },
          ])
          // Second auction.findMany call resolves auction metadata for pending correction logs
          .mockResolvedValueOnce([
            {
              id: 'auc-corr-3',
              chitGroupId: 'cg-1',
              installmentMonth: 3,
              bidDiscount: 22000n,
              chitGroup: { id: 'cg-1', groupCode: 'KCA-1', groupName: 'Group 1' },
            },
          ]);

        // 6. Pending auction correction (1 unapproved + 1 already approved -> only 1 returned!)
        prismaMock.auditLog.findMany.mockResolvedValue([
          {
            id: 'corr-req-1',
            entityId: 'auc-corr-3',
            action: 'AUCTION_CORRECTION_REQUESTED',
            userId: partnerAUser.sub,
            timestamp: new Date('2026-10-21T12:00:00Z'),
            newValue: {
              correctedBidDiscount: '24000',
              correctedTicketNumber: 9,
              reason: 'Typo in discount',
            },
          },
          {
            id: 'corr-app-2',
            entityId: 'auc-corr-resolved',
            action: 'AUCTION_CORRECTION_APPROVED',
            userId: partnerBUser.sub,
            timestamp: new Date('2026-10-21T13:00:00Z'),
            newValue: { correctionRequestId: 'corr-req-2' },
          },
          {
            id: 'corr-req-2',
            entityId: 'auc-corr-resolved',
            action: 'AUCTION_CORRECTION_REQUESTED',
            userId: partnerAUser.sub,
            timestamp: new Date('2026-10-21T11:00:00Z'),
            newValue: { correctedBidDiscount: '20000', reason: 'Resolved' },
          },
        ]);

        // 7. Pending defaulter removal requested by Partner A
        prismaMock.subscriberTicket.findMany.mockResolvedValue([
          {
            id: 'tick-rem-1',
            chitGroupId: 'cg-1',
            ticketNumber: 14,
            consecutiveUnpaidMonths: 3,
            removalReason: '3 consecutive unpaid installments',
            removalRequestedByUserId: partnerAUser.sub,
            removalRequestedAt: new Date('2026-10-21T07:00:00Z'),
            chitGroup: { id: 'cg-1', groupCode: 'KCA-1', groupName: 'Group 1' },
            customer: { customerCode: 'C14', fullName: 'Defaulter 14', phone: '9000000014' },
            dues: [
              { netPayableAmount: 5000n, paidAmount: 0n },
              { netPayableAmount: 4000n, paidAmount: 0n },
              { netPayableAmount: 4000n, paidAmount: 0n },
            ],
          },
        ]);

        // Call 1: Partner A (the Maker on all 6 partner-checker items, NOT the collector on 2 cash handovers)
        const resA = await cachedReportService.getPendingApprovals(partnerAUser);
        expect(resA.summary.cashHandoversCount).toBe(2); // Separate per branch!
        expect(resA.summary.disbursementAuthorizationsCount).toBe(1);
        expect(resA.summary.paymentReversalsCount).toBe(1);
        expect(resA.summary.auctionFinalizationsCount).toBe(1);
        expect(resA.summary.auctionCorrectionsCount).toBe(1);
        expect(resA.summary.defaulterRemovalsCount).toBe(1);
        expect(resA.summary.finalMonthSettlementsCount).toBe(1);
        expect(resA.summary.finalMonthSettlementsTotalAmount).toBe('91000');
        expect(resA.summary.totalPendingCount).toBe(8);
        // Partner A can only approve the 2 agent cash handovers (NOT their own 6 requests!)
        expect(resA.summary.actionableByCurrentUserCount).toBe(2);
        expect(resA.paymentReversals[0].isOwnRequest).toBe(true);
        expect(resA.paymentReversals[0].canCurrentUserApprove).toBe(false);
        expect(resA.defaulterRemovals[0].totalArrearsAmount).toBe('13000');
        expect(resA.defaulterRemovals[0].canCurrentUserApprove).toBe(false);

        // Call 2 (CACHE HIT): Partner B (independent Checker!) must see ALL 8 items actionable!
        const resB = await cachedReportService.getPendingApprovals(partnerBUser);
        expect(prismaMock.payment.findMany).toHaveBeenCalledTimes(1); // Served from Redis cache!
        expect(resB.summary.actionableByCurrentUserCount).toBe(8);
        expect(resB.paymentReversals[0].isOwnRequest).toBe(false);
        expect(resB.paymentReversals[0].canCurrentUserApprove).toBe(true);
        expect(resB.finalMonthSettlements[0].canCurrentUserApprove).toBe(true);

        // Call 3 (CACHE HIT): Non-partner IT Super Admin (isPartner: false) -> 0 actionable!
        const resIt = await cachedReportService.getPendingApprovals(itSuperAdminUser, {
          actionableOnly: true,
        });
        expect(resIt.summary.totalPendingCount).toBe(0);
        expect(resIt.summary.actionableByCurrentUserCount).toBe(0);

        // Call 4 (CACHE HIT): Auditor -> full visibility, 0 actionable!
        const resAud = await cachedReportService.getPendingApprovals(auditorUser);
        expect(resAud.summary.totalPendingCount).toBe(8);
        expect(resAud.summary.actionableByCurrentUserCount).toBe(0);
      });
    });

    describe('DEF-RPT-06: Form XVII Dynamic Frozen Commission Rate, Month 2..N-1 & 21-Day Registrar Countdown', () => {
      it('uses dynamic frozen commission rate (no hardcoded 4%), filters Months 2..N-1, and computes 21-day countdown', async () => {
        const customRateChit = {
          ...mockChitGroup,
          foremanCommissionRate: '5.00',
        };
        prismaMock.chitGroup.findUnique.mockResolvedValue(customRateChit);

        const now = Date.now();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);

        prismaMock.auction.findMany.mockResolvedValue([
          {
            id: 'auc-m2-overdue',
            installmentMonth: 2,
            auctionDate: thirtyDaysAgo,
            bidDiscount: 25000n,
            foremanCommissionRate: '5.00',
            foremanCommissionAmount: 5000n,
            totalDividend: 20000n,
            dividendPerTicket: 1000n,
            prizeMoney: 75000n,
            conductedByUserId: 'p1',
            finalizedByUserId: 'p2',
            winner: null,
            tieBidders: [],
            minutes: {
              subscribersPresent: 18,
              minutesText: 'Overdue unfiled minutes',
              signedByForeman: true,
              filedAtRegistrar: false,
              filedDate: null,
            },
          },
          {
            id: 'auc-m3-pending',
            installmentMonth: 3,
            auctionDate: fiveDaysAgo,
            bidDiscount: 25000n,
            foremanCommissionRate: null, // Falls back to chitGroup.foremanCommissionRate ('5.00')
            foremanCommissionAmount: 5000n,
            totalDividend: 20000n,
            dividendPerTicket: 1000n,
            prizeMoney: 75000n,
            conductedByUserId: 'p1',
            finalizedByUserId: 'p2',
            winner: null,
            tieBidders: [],
            minutes: {
              subscribersPresent: 19,
              minutesText: 'Recent minutes',
              signedByForeman: true,
              filedAtRegistrar: false,
              filedDate: null,
            },
          },
        ]);

        const res = await reportService.getAuctionMinutesFormXvii(
          { chitGroupId: mockChitGroupId },
          superAdminUser,
        );

        // Verify Guardrail 5 Month 2..N-1 filter applied in Prisma query
        expect(prismaMock.auction.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              installmentMonth: { gte: 2, lt: 20 },
            }),
          }),
        );

        expect(res.chitGroup.foremanCommissionRate).toBe('5.00%');
        expect(res.auctions[0].foremanCommissionRate).toBe('5.00%');
        expect(res.auctions[1].foremanCommissionRate).toBe('5.00%');
        expect(res.auctions[0].isFilingOverdue).toBe(true);
        expect(res.auctions[0].filingStatus).toBe('OVERDUE');
        expect(res.auctions[0].filingDaysRemaining!).toBeLessThan(0);
        expect(res.auctions[1].isFilingOverdue).toBe(false);
        expect(res.auctions[1].filingStatus).toBe('PENDING');
        expect(res.auctions[1].filingDaysRemaining!).toBeGreaterThan(0);
        expect(res.filingSummary).toEqual({
          totalAuctions: 2,
          filedCount: 0,
          pendingCount: 1,
          overdueCount: 1,
        });
      });
    });

    describe('DEF-RPT-07: Pure 64-Bit BigInt Precision Above Number.MAX_SAFE_INTEGER', () => {
      it('preserves exact single-rupee BigInt precision > 2^53 - 1 across DayBook calculation and Redis cache round-trip', async () => {
        const store = new Map<string, string>();
        const redisClient = {
          get: jest.fn(async (k: string) => store.get(k) ?? null),
          set: jest.fn(async () => 'OK'),
          setex: jest.fn(async (k: string, _ttl: number, v: string) => {
            store.set(k, v);
            return 'OK';
          }),
          eval: jest.fn(async () => 1),
        };
        const svc = new ReportService(
          prismaMock as unknown as PrismaService,
          statutoryReportService,
          { getClient: () => redisClient, getIsConnected: () => true } as any,
        );

        // 9007199254740993n > Number.MAX_SAFE_INTEGER (9007199254740991)
        prismaMock.payment.findMany.mockResolvedValue([
          {
            id: 'big-1',
            amount: 9007199254740993n,
            paymentMethod: 'BANK_TRANSFER',
            transactionRef: 'UTR-BIG-1',
            createdAt: new Date('2026-10-18T10:00:00Z'),
            receipt: { receiptNumber: 'KC-BIG-1' },
            recordedByUser: { name: 'Partner A' },
            allocations: [],
          },
          {
            id: 'big-2',
            amount: 2n,
            paymentMethod: 'BANK_TRANSFER',
            transactionRef: 'UTR-BIG-2',
            createdAt: new Date('2026-10-18T11:00:00Z'),
            receipt: { receiptNumber: 'KC-BIG-2' },
            recordedByUser: { name: 'Partner A' },
            allocations: [],
          },
        ]);
        prismaMock.auctionWinner.findMany.mockResolvedValue([]);

        const first = await svc.getDayBook({ date: '2026-10-18' }, superAdminUser);
        expect(first.summary.totalInflows).toBe(9007199254740995n);
        expect(first.summary.inflowByMethod.bankTransfer).toBe(9007199254740995n);

        // Second call hits Redis cache -> must revive exact BigInt without precision loss!
        const cached = await svc.getDayBook({ date: '2026-10-18' }, superAdminUser);
        expect(cached.summary.totalInflows).toBe(9007199254740995n);
        expect(typeof cached.summary.totalInflows).toBe('bigint');
      });
    });

    describe('DEF-RPT-08: SSE assertStreamAuthorization Role Alignment & Session Binding', () => {
      it('permits ACCOUNTANT and AUDITOR on approvals-stream while rejecting revoked Session sid and branchless BRANCH_MANAGER', async () => {
        prismaMock.user = {
          findUnique: jest.fn(),
        };
        prismaMock.session = {
          findUnique: jest.fn(),
        };

        // 1. ACCOUNTANT passes
        prismaMock.user.findUnique.mockResolvedValueOnce({
          isActive: true,
          tokenRevokedBefore: null,
          roles: [Role.ACCOUNTANT],
          branchId: mockBranchId,
        });
        await expect(
          reportService.assertStreamAuthorization(accountantUser),
        ).resolves.toBeUndefined();

        // 2. AUDITOR passes
        prismaMock.user.findUnique.mockResolvedValueOnce({
          isActive: true,
          tokenRevokedBefore: null,
          roles: [Role.AUDITOR],
          branchId: null,
        });
        await expect(
          reportService.assertStreamAuthorization(auditorUser),
        ).resolves.toBeUndefined();

        // 3. BRANCH_MANAGER with null branchId fails closed
        prismaMock.user.findUnique.mockResolvedValueOnce({
          isActive: true,
          tokenRevokedBefore: null,
          roles: [Role.BRANCH_MANAGER],
          branchId: null,
        });
        await expect(
          reportService.assertStreamAuthorization(branchManagerNoBranch),
        ).rejects.toThrow(ForbiddenException);

        // 4. Revoked persisted session sid terminates stream with UnauthorizedException
        prismaMock.user.findUnique.mockResolvedValueOnce({
          isActive: true,
          tokenRevokedBefore: null,
          roles: [Role.SUPER_ADMIN],
          branchId: null,
        });
        prismaMock.session.findUnique.mockResolvedValueOnce({
          id: 'different-session-id',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        });
        await expect(
          reportService.assertStreamAuthorization({
            ...superAdminUser,
            sid: 'old-session-id',
            clientType: 'WEB',
          }),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('Round-2 Verifier Remediations (Short PAN Redaction, Ghost Corrections/Scheduled Payouts, Mid-Stream Branch Reassignment & Anti-Oracle Precheck)', () => {
      it('redacts 5-character PAN values completely (never leaves unmasked 5-char PAN)', async () => {
        prismaMock.auditLog.count.mockResolvedValue(1);
        prismaMock.auditLog.findMany.mockResolvedValue([
          {
            id: 'log-short-pan',
            action: 'CUSTOMER_UPDATED',
            entityType: 'Customer',
            entityId: 'c-1',
            timestamp: new Date('2026-10-18T10:00:00Z'),
            ipAddress: '10.0.0.1',
            user: { id: 'u1', name: 'Partner A', roles: [Role.SUPER_ADMIN] },
            oldValue: { panNumber: 'ABCDE' },
            newValue: { panNumber: 'ABCDEF' },
          },
        ]);

        const res = await reportService.getAuditLogs({ page: 1, limit: 50 }, superAdminUser);
        expect((res.logs[0].oldValue as any).panNumber).toBe('[REDACTED]');
        expect((res.logs[0].newValue as any).panNumber).toBe('ABXDEF');
      });

      it('excludes DISBURSED/non-ACTIVE ghost auction corrections and SCHEDULED non-Month-N disbursementAuthorizations', async () => {
        prismaMock.payment.findMany.mockResolvedValue([]);
        prismaMock.paymentReversal.findMany.mockResolvedValue([]);
        prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

        // Non-Month-N SCHEDULED row in VERIFIED_BY_MAKER must be skipped (CR-DISB-01)
        prismaMock.auctionWinner.findMany
          .mockResolvedValueOnce([
            {
              id: 'win-unfinalized',
              auctionId: 'auc-sched-m4',
              disbursementStatus: 'VERIFIED_BY_MAKER',
              disbursedAmount: 75000n,
              disbursementMode: 'CASH',
              verifiedByUserId: partnerAUser.sub,
              agreementSigned: true,
              nomineeSigned: true,
              securityDocS3Key: null,
              auction: {
                status: 'SCHEDULED',
                installmentMonth: 4,
                auctionDate: new Date('2026-10-20T10:00:00Z'),
                chitGroup: {
                  id: 'cg-1',
                  groupCode: 'KCA-1',
                  groupName: 'Group 1',
                  branchId: 'branch-1',
                  durationMonths: 20,
                },
              },
              ticket: {
                ticketNumber: 4,
                customer: { customerCode: 'C4', fullName: 'Tentative', phone: '9000000004' },
              },
            },
          ])
          .mockResolvedValueOnce([]);

        // First auction.findMany (auctionFinalizations) -> empty
        // Second auction.findMany (auctionCorrections) -> returns DISBURSED + COMPLETED-group ghosts that must be filtered out
        prismaMock.auction.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'auc-ghost-disbursed',
              chitGroupId: 'cg-1',
              installmentMonth: 3,
              bidDiscount: 22000n,
              chitGroup: { id: 'cg-1', groupCode: 'KCA-1', groupName: 'Group 1', status: 'ACTIVE' },
              winner: { disbursementStatus: 'DISBURSED' },
            },
            {
              id: 'auc-ghost-closed',
              chitGroupId: 'cg-closed',
              installmentMonth: 4,
              bidDiscount: 20000n,
              chitGroup: { id: 'cg-closed', groupCode: 'KCA-OLD', groupName: 'Old Group', status: 'COMPLETED' },
              winner: { disbursementStatus: 'PENDING_VERIFICATION' },
            },
          ]);

        prismaMock.auditLog.findMany.mockResolvedValue([
          {
            id: 'corr-ghost-1',
            entityId: 'auc-ghost-disbursed',
            action: 'AUCTION_CORRECTION_REQUESTED',
            userId: partnerAUser.sub,
            timestamp: new Date('2026-10-21T12:00:00Z'),
            newValue: { correctedBidDiscount: '24000', reason: 'Already disbursed' },
          },
          {
            id: 'corr-ghost-2',
            entityId: 'auc-ghost-closed',
            action: 'AUCTION_CORRECTION_REQUESTED',
            userId: partnerAUser.sub,
            timestamp: new Date('2026-10-21T12:00:00Z'),
            newValue: { correctedBidDiscount: '21000', reason: 'Scheme completed' },
          },
        ]);

        const res = await reportService.getPendingApprovals(partnerBUser);
        expect(res.disbursementAuthorizations).toHaveLength(0);
        expect(res.auctionCorrections).toHaveLength(0);
        expect(res.summary.totalPendingCount).toBe(0);
      });

      it('disconnects BRANCH_MANAGER SSE stream immediately if reassigned to another branch mid-stream', async () => {
        prismaMock.user = {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            tokenRevokedBefore: null,
            roles: [Role.BRANCH_MANAGER],
            branchId: 'branch-reassigned-002', // Differs from JWT's mockBranchId!
          }),
        };

        await expect(
          reportService.assertStreamAuthorization(branchManagerUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects disallowed roles & branchless BRANCH_MANAGER BEFORE prisma.chitGroup.findUnique (closes 404 vs 403 oracle)', async () => {
        prismaMock.chitGroup.findUnique.mockResolvedValue(null);

        await expect(
          reportService.getAuctionMinutesFormXvii(
            { chitGroupId: 'non-existent-uuid' },
            collectionAgentUser,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getAuctionMinutesFormXvii(
            { chitGroupId: 'non-existent-uuid' },
            branchManagerNoBranch,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getSubscriberLedgerFormXxi(
            { chitGroupId: 'non-existent-uuid' },
            collectionAgentUser,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          reportService.getSubscriberLedgerFormXxi(
            { chitGroupId: 'non-existent-uuid' },
            branchManagerNoBranch,
          ),
        ).rejects.toThrow(ForbiddenException);

        expect(prismaMock.chitGroup.findUnique).not.toHaveBeenCalled();
      });
    });

    describe('Round-3 Cross-Review Remediations (XR-M7-RPT-01..05)', () => {
      it('XR-M7-RPT-01: resolveLiveStreamUser returns live DB roles/branchId and ReportController passes refreshed user into getPendingApprovals', async () => {
        prismaMock.user = {
          findUnique: jest.fn().mockResolvedValue({
            isActive: true,
            tokenRevokedBefore: null,
            roles: [Role.BRANCH_MANAGER],
            branchId: 'branch-A',
          }),
        };

        // Initial JWT claimed SUPER_ADMIN, but DB demoted user to BRANCH_MANAGER (branch-A)
        const stalePartnerJwt: JwtPayload = {
          sub: 'demoted-partner-1',
          phone: '9842100077',
          roles: [Role.SUPER_ADMIN],
          branchId: 'branch-A',
          tokenType: 'access',
        };

        const effectiveUser =
          await reportService.resolveLiveStreamUser(stalePartnerJwt);
        expect(effectiveUser.roles).toEqual([Role.BRANCH_MANAGER]);
        expect(effectiveUser.branchId).toBe('branch-A');

        // Passing refreshed effectiveUser into getPendingApprovals with foreign branch-B immediately fails closed (403)
        await expect(
          reportService.getPendingApprovals(effectiveUser, {
            branchId: 'branch-B',
          }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('XR-M7-RPT-02: redacts bankAccountNo, chequeNumber, authKey, mpin/otp/totpUri/jwt variants and masks all PAN/Aadhaar variants while preserving aadhaarLast4', async () => {
        prismaMock.auditLog.count.mockResolvedValue(1);
        prismaMock.auditLog.findMany.mockResolvedValue([
          {
            id: 'log-xr-pii',
            action: 'CUSTOMER_BANK_UPDATED',
            entityType: 'Customer',
            entityId: 'cust-1',
            timestamp: new Date('2026-10-18T10:00:00Z'),
            ipAddress: '10.0.0.1',
            user: { id: 'u1', name: 'Partner A', roles: [Role.SUPER_ADMIN] },
            oldValue: {
              bankAccountNo: '123456789012',
              bankAccountNumber: '987654321098',
              chequeNumber: 'CHQ-001122',
              authKey: 'msg91-live-key',
              oldMpin: '123456',
              otpCode: '654321',
              totpUri: 'otpauth://totp/Kumaran?secret=XYZ',
              jwt: 'eyJhbGciOiJIUzI1NiJ9.abc.def',
              oldPan: 'ABCDE1234F',
              customerPan: 'PQRST5678K',
              oldAadhaar: '123456789012',
              aadhaarNo: '999988887777',
              aadhaarLast4: '9012',
            },
            newValue: {
              newMpin: '654321',
              loginOtp: '111222',
              otpauthUrl: 'otpauth://totp/Kumaran?secret=NEW',
              recoveryCode: 'RCV-9999',
              newPan: 'LMNOP9012Q',
              panNo: 'UVWXY3456Z',
              newAadhaar: '444455556666',
              aadhaarLast4: '6666',
              paymentReference: 'UTR-SAFE-REF',
            },
          },
        ]);

        const res = await reportService.getAuditLogs(
          { page: 1, limit: 50 },
          superAdminUser,
        );
        const oldVal = res.logs[0].oldValue as any;
        const newVal = res.logs[0].newValue as any;

        expect(oldVal.bankAccountNo).toBe('[REDACTED]');
        expect(oldVal.bankAccountNumber).toBe('[REDACTED]');
        expect(oldVal.chequeNumber).toBe('[REDACTED]');
        expect(oldVal.authKey).toBe('[REDACTED]');
        expect(oldVal.oldMpin).toBe('[REDACTED]');
        expect(oldVal.otpCode).toBe('[REDACTED]');
        expect(oldVal.totpUri).toBe('[REDACTED]');
        expect(oldVal.jwt).toBe('[REDACTED]');
        expect(oldVal.oldPan).toBe('ABXXXXX34F');
        expect(oldVal.customerPan).toBe('PQXXXXX78K');
        expect(oldVal.oldAadhaar).toBe('XXXXXXXX9012');
        expect(oldVal.aadhaarNo).toBe('XXXXXXXX7777');
        expect(oldVal.aadhaarLast4).toBe('9012');

        expect(newVal.newMpin).toBe('[REDACTED]');
        expect(newVal.loginOtp).toBe('[REDACTED]');
        expect(newVal.otpauthUrl).toBe('[REDACTED]');
        expect(newVal.recoveryCode).toBe('[REDACTED]');
        expect(newVal.newPan).toBe('LMXXXXX12Q');
        expect(newVal.panNo).toBe('UVXXXXX56Z');
        expect(newVal.newAadhaar).toBe('XXXXXXXX6666');
        expect(newVal.aadhaarLast4).toBe('6666');
        expect(newVal.paymentReference).toBe('UTR-SAFE-REF');
      });

      it('XR-M7-RPT-04: CUSTOMER probing Form XXI with ticketNumber > maxTickets gets 403 Forbidden (not 400 scheme-size oracle)', async () => {
        prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup); // durationMonths = 20
        prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

        await expect(
          reportService.getSubscriberLedgerFormXxi(
            { chitGroupId: mockChitGroupId, ticketNumber: 99 },
            customerUser,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('XR-M7-RPT-05: anchors timezone-less ISO datetimes explicitly to IST (+05:30) rather than host local TZ', async () => {
        prismaMock.auditLog.count.mockResolvedValue(0);
        prismaMock.auditLog.findMany.mockResolvedValue([]);

        await reportService.getAuditLogs(
          {
            fromDate: '2026-10-18T00:00:00',
            toDate: '2026-10-18T23:59:59.999',
            page: 1,
            limit: 50,
          },
          superAdminUser,
        );

        expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              timestamp: {
                gte: new Date('2026-10-17T18:30:00.000Z'),
                lte: new Date('2026-10-18T18:29:59.999Z'),
              },
            }),
          }),
        );
      });
    });

    describe('11. Module 10 Forensic Audit Remediations (DEF-M10-SSE-01..02, PERF-01, DEF-01, DTO-01)', () => {
      it('DEF-M10-SSE-01: applies @BypassEnvelope() metadata on @Sse("approvals-stream") to prevent response envelope wrapping', () => {
        const bypassMeta = Reflect.getMetadata(
          BYPASS_ENVELOPE_KEY,
          ReportController.prototype.streamPendingApprovals,
        );
        expect(bypassMeta).toBe(true);
      });

      it('DEF-M10-SSE-02: emits HEARTBEAT on transient DB errors in resolveLiveStreamUser while terminating stream fail-closed on auth errors', async () => {
        const controller = new ReportController(reportService);

        // 1. Transient DB error during resolveLiveStreamUser -> emits HEARTBEAT instead of killing SSE stream
        jest
          .spyOn(reportService, 'resolveLiveStreamUser')
          .mockRejectedValueOnce(new Error('ETIMEDOUT: Postgres pool temporarily busy'));

        const event = await firstValueFrom(
          controller.streamPendingApprovals({}, superAdminUser),
        );
        expect((event.data as any).type).toBe('HEARTBEAT');
        expect((event.data as any).timestamp).toBeDefined();

        // 2. UnauthorizedException during resolveLiveStreamUser -> fails closed and terminates SSE stream
        jest
          .spyOn(reportService, 'resolveLiveStreamUser')
          .mockRejectedValueOnce(new UnauthorizedException('Session revoked'));

        await expect(
          firstValueFrom(controller.streamPendingApprovals({}, superAdminUser)),
        ).rejects.toThrow(UnauthorizedException);

        // 3. ForbiddenException during resolveLiveStreamUser -> fails closed and terminates SSE stream
        jest
          .spyOn(reportService, 'resolveLiveStreamUser')
          .mockRejectedValueOnce(new ForbiddenException('Branch scope changed'));

        await expect(
          firstValueFrom(controller.streamPendingApprovals({}, branchManagerUser)),
        ).rejects.toThrow(ForbiddenException);
      });

      it('DEF-M10-PERF-01: bounds Queue 6 auction correction auditLog scan with take: 200', async () => {
        prismaMock.payment.findMany.mockResolvedValue([]);
        prismaMock.auctionWinner.findMany.mockResolvedValue([]);
        prismaMock.paymentReversal.findMany.mockResolvedValue([]);
        prismaMock.auction.findMany.mockResolvedValue([]);
        prismaMock.auditLog.findMany.mockResolvedValue([]);
        prismaMock.subscriberTicket.findMany.mockResolvedValue([]);

        await reportService.getPendingApprovals(superAdminUser);

        expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 200,
            orderBy: { timestamp: 'desc' },
          }),
        );
      });

      it('DEF-M10-DEF-01: excludes both REMOVED_DEF_3M and SURRENDERED tickets in dashboard arrears and defaulters aging reports', async () => {
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

        await reportService.getExecutiveDashboard({}, superAdminUser);
        expect(prismaMock.subscriberTicket.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              status: { notIn: ['REMOVED_DEF_3M', 'SURRENDERED'] },
            }),
          }),
        );

        prismaMock.subscriberTicket.findMany.mockClear();
        prismaMock.subscriberTicket.count.mockResolvedValue(0);
        await reportService.getDefaultersAgingReport({ page: 1, limit: 20 }, superAdminUser);
        expect(prismaMock.subscriberTicket.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              status: { notIn: ['REMOVED_DEF_3M', 'SURRENDERED'] },
            }),
          }),
        );
      });

      it('DEF-M10-DTO-01: enforces @MaxLength(100) on audit string filters and @Max(10000) page bounds at DTO and service layers', async () => {
        const longStr = 'A'.repeat(101);
        const invalidAuditDto = plainToInstance(QueryAuditLogsDto, {
          entityType: longStr,
          action: longStr,
          page: 10001,
          limit: 50,
        });
        const auditErrors = await validate(invalidAuditDto);
        const auditProps = auditErrors.map((e) => e.property);
        expect(auditProps).toContain('entityType');
        expect(auditProps).toContain('action');
        expect(auditProps).toContain('page');

        const invalidDefaultersDto = plainToInstance(QueryDefaultersReportDto, {
          page: 10001,
          limit: 20,
        });
        const defaultersErrors = await validate(invalidDefaultersDto);
        expect(defaultersErrors.map((e) => e.property)).toContain('page');

        // Service-level validatePagination guard against page > 10000
        await expect(
          reportService.getAuditLogs({ page: 10001, limit: 50 }, superAdminUser),
        ).rejects.toThrow(BadRequestException);
        await expect(
          reportService.getDefaultersAgingReport({ page: 10001, limit: 20 }, superAdminUser),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
