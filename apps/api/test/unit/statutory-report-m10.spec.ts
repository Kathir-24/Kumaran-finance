import { Role } from '@prisma/client';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StatutoryReportService } from '../../src/report/statutory-report.service';

describe('Module 10: Statutory Reports Forensic Remediations (DEF-M10-STAT-01..04)', () => {
  let service: StatutoryReportService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockChitGroupId = 'chit-group-m10-001';

  const superAdminUser: JwtPayload = {
    sub: 'partner-001',
    phone: '9842100001',
    roles: [Role.SUPER_ADMIN],
    branchId: null,
    tokenType: 'access',
  };

  const mockChitGroup = {
    id: mockChitGroupId,
    groupCode: 'KCA-1L-20M-M10',
    groupName: 'Perundurai 1 Lakh M10 Scheme',
    chitValue: 100000n,
    durationMonths: 20,
    totalTickets: 20,
    baseInstallment: 5000n,
    foremanCommissionRate: '4.00',
    branchId: mockBranchId,
    branch: {
      id: mockBranchId,
      name: 'Head Office - Perundurai',
      nameTamil: 'தலைமை கிளை, பெருந்துறை',
    },
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: { findUnique: jest.fn() },
      payment: { aggregate: jest.fn(), findMany: jest.fn() },
      auctionWinner: { aggregate: jest.fn(), findMany: jest.fn() },
      paymentReversal: { findMany: jest.fn() },
      auction: { findMany: jest.fn() },
      subscriberTicket: { findMany: jest.fn() },
      auditLog: { findMany: jest.fn() },
    };
    service = new StatutoryReportService(prismaMock as unknown as PrismaService);
  });

  describe('DEF-M10-STAT-01: Form XXII Approved Cash Payment Reversals as Physical Cash Outflows', () => {
    it('subtracts prior approved cash reversals from opening safe cash and records same-day cash reversals as CASH_PAYMENT_REVERSAL outflows', async () => {
      // Prior inflows: 50,000; Prior cash disbursements: 10,000; Prior approved cash reversals: 5,000
      // => Opening Safe Cash = 50,000 - 10,000 - 5,000 = 35,000
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 50000n } });
      prismaMock.auctionWinner.aggregate.mockResolvedValue({
        _sum: { disbursedAmount: 10000n },
      });

      prismaMock.paymentReversal.findMany
        // 1st call: priorCashReversals
        .mockResolvedValueOnce([{ payment: { amount: 5000n } }])
        // 2nd call: todayCashReversals
        .mockResolvedValueOnce([
          {
            id: 'rev-cash-001',
            paymentId: 'pay-cash-099',
            reason: 'Duplicate receipt correction',
            reversedAt: new Date('2026-10-18T11:30:00.000Z'),
            payment: {
              id: 'pay-cash-099',
              amount: 3950n,
              receipt: { receiptNumber: 'KC-REC-PRD-2026-00099' },
              allocations: [
                {
                  ticket: {
                    ticketNumber: 7,
                    chitGroup: { groupCode: 'KCA-1L-20M-M10' },
                    customer: {
                      customerCode: 'KC-CUST-00007',
                      fullName: 'K. Karthik',
                    },
                  },
                  due: { installmentMonth: 3 },
                },
              ],
            },
          },
        ]);

      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pay-cash-101',
          amount: 10000n,
          paymentMethod: 'CASH',
          cashHandoverStatus: null,
          cashHandoverAcknowledgedAt: null,
          createdAt: new Date('2026-10-18T05:00:00.000Z'),
          receipt: { receiptNumber: 'KC-REC-PRD-2026-00101' },
          recordedByUser: { id: 'u1', name: 'Desk Cashier' },
          allocations: [
            {
              ticket: {
                ticketNumber: 2,
                chitGroup: { groupCode: 'KCA-1L-20M-M10' },
                customer: { customerCode: 'KC-CUST-00002', fullName: 'B. Babu' },
              },
            },
          ],
        },
      ]);

      prismaMock.auctionWinner.findMany.mockResolvedValue([
        {
          id: 'win-cash-001',
          disbursedAmount: 20000n,
          disbursementMode: 'CASH',
          paymentReference: 'KC-VOU-PRD-2026-00009',
          disbursedAt: new Date('2026-10-18T09:00:00.000Z'),
          auction: {
            installmentMonth: 2,
            chitGroup: { groupCode: 'KCA-1L-20M-M10', chitValue: 100000n },
          },
          ticket: {
            ticketNumber: 4,
            customer: { customerCode: 'KC-CUST-00004', fullName: 'D. Durai' },
          },
        },
      ]);

      const cashBook = await service.getCashBookFormXxii(
        { date: '2026-10-18' },
        superAdminUser,
      );

      // Verify strict Cash-only separation in Prisma queries
      expect(prismaMock.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentMethod: 'CASH',
            paymentStatus: { in: ['SUCCESS', 'REVERSED'] },
          }),
        }),
      );
      expect(prismaMock.paymentReversal.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APPROVED',
            payment: expect.objectContaining({ paymentMethod: 'CASH' }),
          }),
        }),
      );

      // Reconciliation invariant: 35,000 + 10,000 - (20,000 + 3,950) = 21,050
      expect(cashBook.reconciliation.openingCashInSafe).toBe(35000n);
      expect(cashBook.reconciliation.todayCashInflows).toBe(10000n);
      expect(cashBook.reconciliation.todayCashOutflows).toBe(23950n);
      expect(cashBook.reconciliation.closingCashInSafe).toBe(21050n);

      // Outflows sorted chronologically: 09:00 prize disbursement then 11:30 reversal refund
      expect(cashBook.outflows).toHaveLength(2);
      expect(cashBook.outflows[0].outflowType).toBe('PRIZE_DISBURSEMENT');
      expect(cashBook.outflows[0].amount).toBe(20000n);
      expect(cashBook.outflows[1].outflowType).toBe('CASH_PAYMENT_REVERSAL');
      expect(cashBook.outflows[1].amount).toBe(3950n);
      expect(cashBook.outflows[1].voucherNumber).toBe('REV-KC-REC-PRD-2026-00099');
    });
  });

  describe('DEF-M10-STAT-02: Form XXII Vault Arrival Timing (cashHandoverAcknowledgedAt ?? createdAt)', () => {
    it('attributes field cash collected on Day 1 and acknowledged on Day 2 to Day 2 inflows and uses acknowledgedAt as vault entry time', async () => {
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0n } });
      prismaMock.auctionWinner.aggregate.mockResolvedValue({
        _sum: { disbursedAmount: 0n },
      });
      prismaMock.paymentReversal.findMany.mockResolvedValue([]);
      prismaMock.auctionWinner.findMany.mockResolvedValue([]);

      const collectedOnDay1 = new Date('2026-10-17T14:30:00.000Z'); // Oct 17 8:00 PM IST
      const acknowledgedOnDay2 = new Date('2026-10-18T04:00:00.000Z'); // Oct 18 9:30 AM IST

      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: 'pay-field-nextday',
          amount: 5000n,
          paymentMethod: 'CASH',
          cashHandoverStatus: 'ACKNOWLEDGED',
          cashHandoverAcknowledgedAt: acknowledgedOnDay2,
          createdAt: collectedOnDay1,
          receipt: { receiptNumber: 'KC-REC-PRD-2026-00200' },
          recordedByUser: { id: 'agent-1', name: 'Field Agent Murugan' },
          allocations: [
            {
              ticket: {
                ticketNumber: 10,
                chitGroup: { groupCode: 'KCA-1L-20M-M10' },
                customer: { customerCode: 'KC-CUST-00010', fullName: 'S. Siva' },
              },
            },
          ],
        },
      ]);

      const cashBookDay2 = await service.getCashBookFormXxii(
        { date: '2026-10-18' },
        superAdminUser,
      );

      // Verify priorCashInflows query partitions ACKNOWLEDGED handovers by cashHandoverAcknowledgedAt < startOfDay
      expect(prismaMock.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                cashHandoverStatus: 'ACKNOWLEDGED',
                cashHandoverAcknowledgedAt: {
                  lt: new Date('2026-10-17T18:30:00.000Z'),
                },
              }),
            ]),
          }),
        }),
      );

      // Verify todayPayments query matches ACKNOWLEDGED handovers by cashHandoverAcknowledgedAt in [startOfDay, endOfDay]
      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                cashHandoverStatus: 'ACKNOWLEDGED',
                cashHandoverAcknowledgedAt: {
                  gte: new Date('2026-10-17T18:30:00.000Z'),
                  lte: new Date('2026-10-18T18:29:59.999Z'),
                },
              }),
            ]),
          }),
        }),
      );

      expect(cashBookDay2.inflows).toHaveLength(1);
      expect(cashBookDay2.inflows[0].source).toBe('FIELD_HANDOVER');
      expect(cashBookDay2.inflows[0].time).toEqual(acknowledgedOnDay2);
      expect(cashBookDay2.inflows[0].collectedAt).toEqual(collectedOnDay1);
      expect(cashBookDay2.inflows[0].acknowledgedAt).toEqual(acknowledgedOnDay2);
      expect(cashBookDay2.reconciliation.closingCashInSafe).toBe(5000n);
    });
  });

  describe('DEF-M10-STAT-03: Form XXI Running Cumulative Whole-Rupee Totals & Contiguous 1..N Schedule', () => {
    it('computes exact running cumulative BigInt totals per row and builds contiguous 1..20 passbook schedule', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);
      prismaMock.auditLog.findMany.mockResolvedValue([]);
      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'tkt-005',
          ticketNumber: 5,
          isPrized: false,
          consecutiveUnpaidMonths: 1,
          status: 'ACTIVE',
          customer: {
            id: 'cust-5',
            customerCode: 'KC-CUST-00005',
            fullName: 'E. Elango',
            fullNameTamil: 'இளங்கோ',
            phone: '9842100005',
          },
          winningAuction: null,
          dues: [
            {
              id: 'due-m1',
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
                    paymentStatus: 'SUCCESS',
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-00001' },
                  },
                },
              ],
            },
            {
              id: 'due-m2',
              installmentMonth: 2,
              dueDate: new Date('2026-02-18'),
              grossAmount: 5000n,
              dividendDeduction: 1050n,
              netPayableAmount: 3950n,
              paidAmount: 3950n,
              status: 'PAID',
              allocations: [
                {
                  payment: {
                    createdAt: new Date('2026-02-16'),
                    paymentMethod: 'UPI',
                    paymentStatus: 'SUCCESS',
                    receipt: { receiptNumber: 'KC-REC-PRD-2026-00025' },
                  },
                },
              ],
            },
            {
              id: 'due-m3',
              installmentMonth: 3,
              dueDate: new Date('2026-03-18'),
              grossAmount: 5000n,
              dividendDeduction: 900n,
              netPayableAmount: 4100n,
              paidAmount: 0n,
              status: 'OVERDUE',
              allocations: [],
            },
          ],
        },
      ]);

      const formXxi = await service.getSubscriberLedgerFormXxi(
        { chitGroupId: mockChitGroupId, ticketNumber: 5 },
        superAdminUser,
      );

      const ledger = formXxi.ledgers[0];
      expect(ledger.monthlySchedule).toHaveLength(3);

      // Month 1 running cumulatives
      expect(ledger.monthlySchedule[0].cumulativeGrossDue).toBe(5000n);
      expect(ledger.monthlySchedule[0].cumulativeDividendCredit).toBe(0n);
      expect(ledger.monthlySchedule[0].cumulativeNetPayable).toBe(5000n);
      expect(ledger.monthlySchedule[0].cumulativePaid).toBe(5000n);
      expect(ledger.monthlySchedule[0].runningBalance).toBe(0n);

      // Month 2 running cumulatives
      expect(ledger.monthlySchedule[1].cumulativeGrossDue).toBe(10000n);
      expect(ledger.monthlySchedule[1].cumulativeDividendCredit).toBe(1050n);
      expect(ledger.monthlySchedule[1].cumulativeNetPayable).toBe(8950n);
      expect(ledger.monthlySchedule[1].cumulativePaid).toBe(8950n);
      expect(ledger.monthlySchedule[1].runningBalance).toBe(0n);

      // Month 3 running cumulatives (unpaid 4,100)
      expect(ledger.monthlySchedule[2].cumulativeGrossDue).toBe(15000n);
      expect(ledger.monthlySchedule[2].cumulativeDividendCredit).toBe(1950n);
      expect(ledger.monthlySchedule[2].cumulativeNetPayable).toBe(13050n);
      expect(ledger.monthlySchedule[2].cumulativePaid).toBe(8950n);
      expect(ledger.monthlySchedule[2].runningBalance).toBe(4100n);

      // Contiguous 1..20 passbook print readiness
      expect(ledger.passbookPrintMeta).toEqual({
        totalDurationMonths: 20,
        scheduledMonthsCount: 3,
        isContiguous: true,
      });
      expect(ledger.contiguousSchedule).toHaveLength(20);
      expect(ledger.contiguousSchedule.map((r) => r.installmentMonth)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
      expect(ledger.contiguousSchedule[3].status).toBe('SCHEDULED');
      expect(ledger.contiguousSchedule[3].grossAmount).toBe(5000n);
      expect(ledger.contiguousSchedule[3].runningBalance).toBe(4100n);
    });
  });

  describe('DEF-M10-STAT-04: Form XVII Option A Tie-Break winningTokenNumber & tiedDiscountAmount', () => {
    it('exposes winningTokenNumber, tiedDiscountAmount, and per-bidder bidDiscount on tie-break auctions', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChitGroup);
      prismaMock.auction.findMany.mockResolvedValue([
        {
          id: 'auc-m2-tie',
          installmentMonth: 2,
          auctionDate: new Date('2026-11-01T05:00:00.000Z'),
          status: 'MINUTES_FILED',
          bidDiscount: 25000n,
          foremanCommissionRate: '4.00',
          foremanCommissionAmount: 4000n,
          totalDividend: 21000n,
          dividendPerTicket: 1050n,
          prizeMoney: 75000n,
          conductedByUserId: 'partner-maker',
          finalizedByUserId: 'partner-checker',
          winner: {
            wasTieBreakWinner: true,
            ticket: {
              ticketNumber: 8,
              customer: {
                id: 'cust-8',
                customerCode: 'KC-CUST-00008',
                fullName: 'H. Hari',
                fullNameTamil: 'ஹரி',
                phone: '9842100008',
              },
            },
          },
          tieBidders: [
            {
              bidDiscount: 25000n,
              tokenNumber: 1,
              isWinner: false,
              ticket: {
                ticketNumber: 4,
                customer: { customerCode: 'KC-CUST-00004', fullName: 'D. Durai' },
              },
            },
            {
              bidDiscount: 25000n,
              tokenNumber: 2,
              isWinner: true,
              ticket: {
                ticketNumber: 8,
                customer: { customerCode: 'KC-CUST-00008', fullName: 'H. Hari' },
              },
            },
          ],
          minutes: {
            subscribersPresent: 16,
            minutesText: 'Option A physical paper token draw held at Perundurai HO.',
            signedByForeman: true,
            filedAtRegistrar: false,
            filedDate: null,
          },
        },
        {
          id: 'auc-m3-direct',
          installmentMonth: 3,
          auctionDate: new Date('2026-12-01T05:00:00.000Z'),
          status: 'COMPLETED',
          bidDiscount: 18000n,
          foremanCommissionRate: '4.00',
          foremanCommissionAmount: 4000n,
          totalDividend: 14000n,
          dividendPerTicket: 700n,
          prizeMoney: 82000n,
          conductedByUserId: 'partner-maker',
          finalizedByUserId: 'partner-checker',
          winner: {
            wasTieBreakWinner: false,
            ticket: {
              ticketNumber: 12,
              customer: {
                id: 'cust-12',
                customerCode: 'KC-CUST-00012',
                fullName: 'R. Ravi',
                fullNameTamil: 'ரவி',
                phone: '9842100012',
              },
            },
          },
          tieBidders: [],
          minutes: null,
        },
      ]);

      const formXvii = await service.getAuctionMinutesFormXvii(
        { chitGroupId: mockChitGroupId },
        superAdminUser,
      );

      expect(formXvii.auctions).toHaveLength(2);

      // Tie-break auction
      const tieAuction = formXvii.auctions[0];
      expect(tieAuction.foremanCommissionRate).toBe('4.00%');
      expect(tieAuction.winningTokenNumber).toBe(2);
      expect(tieAuction.tiedDiscountAmount).toBe(25000n);
      expect(tieAuction.tiedBiddersCount).toBe(2);
      expect(tieAuction.tiedBidders[0].bidDiscount).toBe(25000n);
      expect(tieAuction.tiedBidders[1].tokenNumberDrawn).toBe(2);
      expect(tieAuction.tiedBidders[1].isWinner).toBe(true);
      expect(tieAuction.filingDeadlineDate).toBe('2026-11-22');

      // Non-tie auction
      const directAuction = formXvii.auctions[1];
      expect(directAuction.winningTokenNumber).toBeNull();
      expect(directAuction.tiedDiscountAmount).toBeNull();
    });
  });
});
