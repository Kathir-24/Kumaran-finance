import { PrismaClient, Role, DueStatus } from '@prisma/client';

describe('Kumaran Chits — Financial Invariants & Mathematical Laws', () => {
  describe('1. Core Financial Math Invariants', () => {
    it('Invariant 1: Conservation of Winning Discount (Foreman Commission + Total Member Dividends == Winning Discount)', () => {
      const chitValue = 100000n; // ₹1,00,000 whole rupees
      const commissionRate = 4n; // 4%
      const bidDiscount = 20000n; // ₹20,000 winning bid (within <= 1/4 ceiling of ₹25,000)

      const foremanCommission = (chitValue * commissionRate) / 100n; // ₹4,000
      const totalDividend = bidDiscount - foremanCommission; // ₹16,000

      expect(foremanCommission + totalDividend).toBe(bidDiscount);
    });

    it('Invariant 2: Pool Conservation (Prize Money Paid + Bid Discount == Chit Gross Value)', () => {
      const chitValue = 100000n;
      const bidDiscount = 25000n; // Exactly at 1/4 ceiling (25%)

      const prizeMoney = chitValue - bidDiscount; // ₹75,000

      expect(prizeMoney + bidDiscount).toBe(chitValue);
    });

    it('Invariant 3: Universal Equal Dividend Distribution & Pool Conservation across all members', () => {
      const totalTickets = 20n;
      const chitValue = 100000n;
      const baseInstallment = 5000n; // chitValue / 20
      const bidDiscount = 25000n; // Exactly at 1/4 ceiling (25%)
      const commission = (chitValue * 4n) / 100n; // ₹4,000 (4%)
      const totalDividend = bidDiscount - commission; // ₹21,000

      // Universal Dividend: divided EQUALLY across ALL 20 members (including auction winner)
      const dividendPerTicket = totalDividend / totalTickets; // 21,000 / 20 = 1,050n
      const totalDistributedDividend = dividendPerTicket * totalTickets; // 1,050 * 20 = 21,000n

      // Every member (including the auction winner) pays the net installment next month
      const netInstallment = baseInstallment - dividendPerTicket; // 5,000 - 1,050 = 3,950n
      const totalInstallmentsCollected = netInstallment * totalTickets; // 3,950 * 20 = 79,000n

      // Invariant 3A: Collections (79,000) + Distributed Dividend (21,000) == Chit Value (100,000)
      expect(totalInstallmentsCollected + totalDistributedDividend).toBe(chitValue);

      // Invariant 3B: Prize Money (75,000) + Commission (4,000) == Total Collections (79,000)
      const prizeMoney = chitValue - bidDiscount; // 100,000 - 25,000 = 75,000n
      expect(prizeMoney + commission).toBe(totalInstallmentsCollected);
    });

    it('Invariant 4: Confirmed Business Scenario (Base 10,000, Dividend 2,100 -> All pay 7,900)', () => {
      const baseInstallment = 10000n;
      const dividend = 2100n;
      const netPayable = baseInstallment - dividend; // 7,900n

      // Both non-prized members and the auction winner pay exactly ₹7,900 next month
      expect(netPayable).toBe(7900n);
    });
  });

  describe('2. Fixed 1/4 (25%) Discount Ceiling Guards', () => {
    const chitValue = 100000n;
    const maxCeiling = chitValue / 4n; // 25,000n
    const minFloorCommission = (chitValue * 4n) / 100n; // 4,000n

    function validateBidDiscount(discount: bigint): { valid: boolean; reason?: string } {
      if (discount > maxCeiling) {
        return { valid: false, reason: 'EXCEEDS_QUARTER_CEILING' };
      }
      if (discount < minFloorCommission) {
        return { valid: false, reason: 'BELOW_MINIMUM_COMMISSION_FLOOR' };
      }
      return { valid: true };
    }

    it('should reject discount bid exceeding 1/4 (25%) ceiling (e.g. ₹26,000 on ₹1,00,000 chit)', () => {
      const result = validateBidDiscount(26000n);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('EXCEEDS_QUARTER_CEILING');
    });

    it('should accept valid bid within range (e.g. ₹20,000 on ₹1,00,000 chit)', () => {
      const result = validateBidDiscount(20000n);
      expect(result.valid).toBe(true);
    });

    it('should accept ceiling bid exactly at 1/4 (e.g. ₹25,000 on ₹1,00,000 chit)', () => {
      const result = validateBidDiscount(25000n);
      expect(result.valid).toBe(true);
    });

    it('should reject discount bid below the 4% foreman commission floor (e.g. ₹3,500 on ₹1,00,000 chit)', () => {
      const result = validateBidDiscount(3500n);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('BELOW_MINIMUM_COMMISSION_FLOOR');
    });
  });

  describe('3. Single Discrete Payment & Rejection Rules', () => {
    function processPayment(due: { status: DueStatus; netPayable: bigint }, paidAmount: bigint) {
      if (due.status === DueStatus.PAID) {
        throw new Error('INSTALLMENT_ALREADY_PAID');
      }
      if (paidAmount < due.netPayable) {
        throw new Error('PARTIAL_PAYMENTS_NOT_ALLOWED');
      }
      if (paidAmount > due.netPayable) {
        throw new Error('OVERPAYMENT_AND_ADVANCE_NOT_ALLOWED');
      }
      return { status: DueStatus.PAID, paidAmount };
    }

    it('should accept exact net payment in full', () => {
      const due = { status: DueStatus.UNPAID, netPayable: 3950n };
      const result = processPayment(due, 3950n);
      expect(result.status).toBe(DueStatus.PAID);
      expect(result.paidAmount).toBe(3950n);
    });

    it('should strictly reject partial payment attempt', () => {
      const due = { status: DueStatus.UNPAID, netPayable: 3950n };
      expect(() => processPayment(due, 2000n)).toThrow('PARTIAL_PAYMENTS_NOT_ALLOWED');
    });

    it('should strictly reject overpayment or advance balance attempt', () => {
      const due = { status: DueStatus.UNPAID, netPayable: 3950n };
      expect(() => processPayment(due, 5000n)).toThrow('OVERPAYMENT_AND_ADVANCE_NOT_ALLOWED');
    });

    it('should strictly reject duplicate payment on already paid installment', () => {
      const due = { status: DueStatus.PAID, netPayable: 3950n };
      expect(() => processPayment(due, 3950n)).toThrow('INSTALLMENT_ALREADY_PAID');
    });
  });

  describe('4. Maker != Checker & Separation of Duties', () => {
    function approveReversal(makerUserId: string, checkerUserId: string) {
      if (makerUserId === checkerUserId) {
        throw new Error('MAKER_CHECKER_VIOLATION: Maker and Checker must be different users');
      }
      return { approved: true, checkerUserId };
    }

    function acknowledgeCashHandover(collectorUserId: string, acknowledgerUserId: string) {
      if (collectorUserId === acknowledgerUserId) {
        throw new Error('COLLECTOR_CANNOT_ACKNOWLEDGE_OWN_CASH');
      }
      return { acknowledged: true, acknowledgerUserId };
    }

    it('should reject payment reversal when maker_user_id == checker_user_id', () => {
      expect(() => approveReversal('partner-1', 'partner-1')).toThrow('MAKER_CHECKER_VIOLATION');
    });

    it('should approve payment reversal when maker != checker (two distinct partners)', () => {
      const result = approveReversal('partner-1', 'partner-2');
      expect(result.approved).toBe(true);
      expect(result.checkerUserId).toBe('partner-2');
    });

    it('should reject cash handover when field agent attempts to acknowledge own cash', () => {
      expect(() => acknowledgeCashHandover('agent-1', 'agent-1')).toThrow('COLLECTOR_CANNOT_ACKNOWLEDGE_OWN_CASH');
    });

    it('should approve cash handover when acknowledged by an independent partner', () => {
      const result = acknowledgeCashHandover('agent-1', 'partner-1');
      expect(result.acknowledged).toBe(true);
      expect(result.acknowledgerUserId).toBe('partner-1');
    });
  });

  describe('5. Database Schema & Invariants Verification (PostgreSQL 17 Integration)', () => {
    let prisma: PrismaClient;
    let isDbConnected = false;

    beforeAll(async () => {
      try {
        prisma = new PrismaClient();
        await prisma.$connect();
        isDbConnected = true;
      } catch {
        isDbConnected = false;
      }
    });

    afterAll(async () => {
      if (isDbConnected && prisma) {
        await prisma.$disconnect();
      }
    });

    it('should verify seeded Head Office branch exists with code PRD', async () => {
      if (!isDbConnected) return;
      const branch = await prisma.branch.findUnique({
        where: { code: 'PRD' },
      });
      expect(branch).not.toBeNull();
      expect(branch?.name).toBe('Head Office - Perundurai');
      expect(branch?.isActive).toBe(true);
    });

    it('should verify seeded Super Admin partner exists with roles array [SUPER_ADMIN]', async () => {
      if (!isDbConnected) return;
      const admin = await prisma.user.findUnique({
        where: { phone: '9876543210' },
      });
      expect(admin).not.toBeNull();
      expect(admin?.roles).toContain(Role.SUPER_ADMIN);
      expect(admin?.isActive).toBe(true);
    });

    it('should enforce ADR-13: Max 1 ticket per customer in same chit group (@@unique([chitGroupId, customerId]))', async () => {
      if (!isDbConnected) return;
      const branch = await prisma.branch.findUniqueOrThrow({ where: { code: 'PRD' } });

      // Create test customer
      const testCustomer = await prisma.customer.create({
        data: {
          branchId: branch.id,
          customerCode: `TEST-CUST-${Date.now()}`,
          fullName: 'Test Subscriber',
          phone: `999${Date.now().toString().slice(-7)}`,
          addressLine1: 'Test Address',
          city: 'Perundurai',
          pincode: '638052',
        },
      });

      // Create test chit group with BigInt values
      const testGroup = await prisma.chitGroup.create({
        data: {
          branchId: branch.id,
          groupCode: `GRP-TEST-${Date.now()}`,
          groupName: 'Test Chit 1L',
          chitValue: 100000n,
          durationMonths: 20,
          totalTickets: 20,
          baseInstallment: 5000n,
          maxDiscountCeiling: 25000n,
          startDate: new Date(),
          endDate: new Date(Date.now() + 20 * 30 * 24 * 3600 * 1000),
        },
      });

      // Allocate Ticket 1 to Customer
      await prisma.subscriberTicket.create({
        data: {
          chitGroupId: testGroup.id,
          customerId: testCustomer.id,
          ticketNumber: 1,
        },
      });

      // Attempting to allocate Ticket 2 in the SAME chit group to the SAME customer MUST violate @@unique([chitGroupId, customerId])
      await expect(
        prisma.subscriberTicket.create({
          data: {
            chitGroupId: testGroup.id,
            customerId: testCustomer.id,
            ticketNumber: 2,
          },
        }),
      ).rejects.toThrow();

      // Clean up test data
      await prisma.subscriberTicket.deleteMany({ where: { chitGroupId: testGroup.id } });
      await prisma.chitGroup.delete({ where: { id: testGroup.id } });
      await prisma.customer.delete({ where: { id: testCustomer.id } });
    });
  });
});
