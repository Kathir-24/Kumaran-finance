import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DisbursementMode, PaymentMethod, Role } from '@prisma/client';
import { RecordBidDto } from '../src/auction/dto/record-bid.dto';
import { RecordTieBreakDto } from '../src/auction/dto/record-tie-break.dto';
import { AuctionService } from '../src/auction/auction.service';
import { AssignTicketDto } from '../src/chit/dto/assign-ticket.dto';
import { CreateChitGroupDto } from '../src/chit/dto/create-chit-group.dto';
import { OnboardOngoingChitDto } from '../src/chit/dto/onboard-ongoing-chit.dto';
import { ChitService } from '../src/chit/chit.service';
import { AcknowledgeHandoverDto } from '../src/collection/dto/acknowledge-handover.dto';
import { RecordCollectionDto } from '../src/collection/dto/record-collection.dto';
import { SyncOfflineQueueDto } from '../src/collection/dto/sync-offline-collection.dto';
import { CollectionService } from '../src/collection/collection.service';
import {
  MAX_SAFE_WHOLE_RUPEE,
  toWholeRupeeBigInt,
} from '../src/common/utils/whole-rupee.util';
import { AuthorizePayoutDto } from '../src/disbursement/dto/authorize-payout.dto';
import { DisbursementService } from '../src/disbursement/disbursement.service';
import { ReconcileSettlementDto } from '../src/jobs/dto/reconcile-settlement.dto';
import { JobsController } from '../src/jobs/jobs.controller';
import { CreatePaymentDto } from '../src/payment/dto/create-payment.dto';
import { PaymentService } from '../src/payment/payment.service';

/**
 * ==============================================================================
 * Full Financial Boundary & Negative Fuzzing Suite (Zero-Paise Enforcement)
 * Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
 * Compliance: Rule 2 in AGENTS.md (Pure Whole Rupee Math, Zero Paise, BigInt)
 * ==============================================================================
 */
describe('Financial Boundary & Negative Fuzzing Suite (Zero-Paise Enforcement)', () => {
  let validationPipe: ValidationPipe;

  beforeAll(() => {
    // Exact pipeline options configured in apps/api/src/main.ts
    validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  // ----------------------------------------------------------------------------
  // CATEGORY 1: Negative Monetary Value Attacks (Must Fail Closed with HTTP 400)
  // ----------------------------------------------------------------------------
  describe('Category 1: Negative Monetary Inputs (Must Fail Closed)', () => {
    it('[CreatePaymentDto] should reject negative payment amounts (-5000, -1)', async () => {
      const negativeAmounts = [-5000, -1, -100000];
      for (const amount of negativeAmounts) {
        await expect(
          validationPipe.transform(
            {
              ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
              installmentMonth: 4,
              amount,
              paymentMethod: PaymentMethod.CASH,
            },
            { type: 'body', metatype: CreatePaymentDto },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('[RecordCollectionDto] should reject negative field collection amounts (-3950)', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: -3950,
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: RecordCollectionDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[AcknowledgeHandoverDto] should reject negative vault handover amount (-45000)', async () => {
      await expect(
        validationPipe.transform(
          {
            collectorUserId: '550e8400-e29b-41d4-a716-446655440000',
            acknowledgedAmount: -45000,
            paymentIds: ['d7b68e74-2794-4366-a6fb-6dbf8615951c'],
          },
          { type: 'body', metatype: AcknowledgeHandoverDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[RecordBidDto] should reject negative auction discount bid (-1, -20000)', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            bidDiscount: -20000,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          { type: 'body', metatype: RecordBidDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[CreateChitGroupDto] should reject negative chit pool value (-100000)', async () => {
      await expect(
        validationPipe.transform(
          {
            groupCode: 'KCA-NEG-01',
            groupName: 'Negative Chit Test',
            chitValue: -100000,
            durationMonths: 20,
            totalTickets: 20,
            startDate: '2026-11-01T00:00:00.000Z',
            endDate: '2028-06-30T00:00:00.000Z',
          },
          { type: 'body', metatype: CreateChitGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ----------------------------------------------------------------------------
  // CATEGORY 2: Zero Amount Attacks on Positive-Only Fields (Must Fail Closed)
  // ----------------------------------------------------------------------------
  describe('Category 2: Zero Amount Payments & Sub-Floor Violations (Must Fail Closed)', () => {
    it('[CreatePaymentDto] should strictly reject ₹0 payment attempt', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: 0,
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: CreatePaymentDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[RecordCollectionDto] should strictly reject ₹0 collection attempt', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: 0,
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: RecordCollectionDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[AcknowledgeHandoverDto] should strictly reject ₹0 vault signoff attempt', async () => {
      await expect(
        validationPipe.transform(
          {
            collectorUserId: '550e8400-e29b-41d4-a716-446655440000',
            acknowledgedAmount: 0,
            paymentIds: ['d7b68e74-2794-4366-a6fb-6dbf8615951c'],
          },
          { type: 'body', metatype: AcknowledgeHandoverDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[RecordBidDto] should strictly reject ₹0 auction bid discount', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            bidDiscount: 0,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          { type: 'body', metatype: RecordBidDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[CreateChitGroupDto] should strictly reject ₹0 chit pool value', async () => {
      await expect(
        validationPipe.transform(
          {
            groupCode: 'KCA-ZERO-01',
            groupName: 'Zero Chit Test',
            chitValue: 0,
            durationMonths: 20,
            totalTickets: 20,
            startDate: '2026-11-01T00:00:00.000Z',
            endDate: '2028-06-30T00:00:00.000Z',
          },
          { type: 'body', metatype: CreateChitGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ----------------------------------------------------------------------------
  // CATEGORY 3: Decimal & Paise Injections (IEEE-754 Floats - Must Fail Closed)
  // Rule 2 in AGENTS.md: Pure Whole Rupee Math, Zero Paise, Zero Floats
  // ----------------------------------------------------------------------------
  describe('Category 3: Decimal Fractions & Paise Injections (Must Fail Closed via @IsInt)', () => {
    it('[CreatePaymentDto] should reject fractional paise amounts (3950.50, 3950.25, 0.99)', async () => {
      const fractionalPaise = [3950.5, 3950.25, 3950.01, 0.99, 100.0001];
      for (const amount of fractionalPaise) {
        await expect(
          validationPipe.transform(
            {
              ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
              installmentMonth: 4,
              amount,
              paymentMethod: PaymentMethod.CASH,
            },
            { type: 'body', metatype: CreatePaymentDto },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('[RecordCollectionDto] should reject fractional paise collection amounts (3950.75)', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: 3950.75,
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: RecordCollectionDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[AcknowledgeHandoverDto] should reject fractional paise vault handover amounts (45000.50)', async () => {
      await expect(
        validationPipe.transform(
          {
            collectorUserId: '550e8400-e29b-41d4-a716-446655440000',
            acknowledgedAmount: 45000.5,
            paymentIds: ['d7b68e74-2794-4366-a6fb-6dbf8615951c'],
          },
          { type: 'body', metatype: AcknowledgeHandoverDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[RecordBidDto] should reject fractional paise auction bid discount (22000.25)', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            bidDiscount: 22000.25,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          { type: 'body', metatype: RecordBidDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[RecordTieBreakDto] should reject fractional paise ceiling tie-break discount (25000.50)', async () => {
      await expect(
        validationPipe.transform(
          {
            tiedTickets: [{ ticketId: 'ticket-001', tokenNumber: 1 }, { ticketId: 'ticket-002', tokenNumber: 2 }],
            winningTicketId: 'ticket-001',
            bidDiscount: 25000.5,
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          { type: 'body', metatype: RecordTieBreakDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[CreateChitGroupDto] should reject fractional paise chit pool values (100000.50)', async () => {
      await expect(
        validationPipe.transform(
          {
            groupCode: 'KCA-FLOAT-01',
            groupName: 'Float Chit Test',
            chitValue: 100000.5,
            durationMonths: 20,
            totalTickets: 20,
            startDate: '2026-11-01T00:00:00.000Z',
            endDate: '2028-06-30T00:00:00.000Z',
          },
          { type: 'body', metatype: CreateChitGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[OnboardOngoingChitDto] should reject fractional paise chitValue and fractional/negative memberAllocations openingBalance', async () => {
      await expect(
        validationPipe.transform(
          {
            groupCode: 'KCA-FLOAT-ONGOING',
            groupName: 'Float Ongoing Test',
            chitValue: 100000.75,
            durationMonths: 20,
            totalTickets: 20,
            startDate: '2026-01-01T00:00:00.000Z',
            endDate: '2027-08-31T00:00:00.000Z',
            onboardedAtMonth: 5,
            historicalWinners: [],
            memberAllocations: [
              { ticketNumber: 1, customerId: 'cust-001', openingBalance: 0 },
            ],
          },
          { type: 'body', metatype: OnboardOngoingChitDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validationPipe.transform(
          {
            groupCode: 'KCA-FLOAT-BAL',
            groupName: 'Float Balance Test',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 20,
            startDate: '2026-01-01T00:00:00.000Z',
            endDate: '2027-08-31T00:00:00.000Z',
            onboardedAtMonth: 5,
            historicalWinners: [],
            memberAllocations: [
              { ticketNumber: 1, customerId: 'cust-001', openingBalance: 5000.5 },
            ],
          },
          { type: 'body', metatype: OnboardOngoingChitDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validationPipe.transform(
          {
            groupCode: 'KCA-NEG-BAL',
            groupName: 'Negative Balance Test',
            chitValue: 100000,
            durationMonths: 20,
            totalTickets: 20,
            startDate: '2026-01-01T00:00:00.000Z',
            endDate: '2027-08-31T00:00:00.000Z',
            onboardedAtMonth: 5,
            historicalWinners: [],
            memberAllocations: [
              { ticketNumber: 1, customerId: 'cust-001', openingBalance: -500 },
            ],
          },
          { type: 'body', metatype: OnboardOngoingChitDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[DEF-BE-01: AuthorizePayoutDto] should reject fractional, zero, negative, boolean, and unsafe amounts while preserving optional null/undefined', async () => {
      for (const badAmount of [75000.5, '75000.25', 0, -75000, true, false, '', 1e25]) {
        await expect(
          validationPipe.transform(
            {
              disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
              disbursedAmount: badAmount,
            },
            { type: 'body', metatype: AuthorizePayoutDto },
          ),
        ).rejects.toThrow(BadRequestException);
      }

      const validInt = await validationPipe.transform(
        {
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          disbursedAmount: 75000,
        },
        { type: 'body', metatype: AuthorizePayoutDto },
      );
      expect(validInt.disbursedAmount).toBe(75000);

      // Mobile Dart toJson() compatibility: omitted or explicit null optional disbursedAmount
      const omitted = await validationPipe.transform(
        { disbursementMode: DisbursementMode.CASH },
        { type: 'body', metatype: AuthorizePayoutDto },
      );
      expect(omitted.disbursedAmount).toBeUndefined();

      const explicitNull = await validationPipe.transform(
        { disbursementMode: DisbursementMode.CASH, disbursedAmount: null },
        { type: 'body', metatype: AuthorizePayoutDto },
      );
      expect(explicitNull.disbursedAmount).toBeNull();
    });

    it('[DEF-BE-01: SyncOfflineQueueDto] should reject fractional, zero, negative, boolean, and unsafe nested item amounts', async () => {
      const baseItem = {
        idempotencyKey: 'd9b2d63d-a232-4e45-814a-5f0962858b29',
        ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
        installmentMonth: 4,
        paymentMethod: PaymentMethod.CASH,
        collectedAt: '2026-10-21T09:30:00.000Z',
      };

      for (const badAmount of [3950.75, '3950.5', 0, -3950, true, '', 1e25]) {
        await expect(
          validationPipe.transform(
            {
              items: [{ ...baseItem, amount: badAmount }],
            },
            { type: 'body', metatype: SyncOfflineQueueDto },
          ),
        ).rejects.toThrow(BadRequestException);
      }

      // Mixed valid + invalid batch item MUST fail closed at boundary
      await expect(
        validationPipe.transform(
          {
            items: [
              { ...baseItem, amount: 3950 },
              {
                ...baseItem,
                idempotencyKey: 'e9b2d63d-a232-4e45-814a-5f0962858b30',
                amount: 3950.25,
              },
            ],
          },
          { type: 'body', metatype: SyncOfflineQueueDto },
        ),
      ).rejects.toThrow(BadRequestException);

      const validBatch = await validationPipe.transform(
        { items: [{ ...baseItem, amount: 3950 }] },
        { type: 'body', metatype: SyncOfflineQueueDto },
      );
      expect(validBatch.items[0].amount).toBe(3950);
    });

    it('[DEF-BE-01: AssignTicketDto] should reject fractional, negative, boolean, empty-string, and unsafe openingBalance while allowing 0/null/undefined', async () => {
      const basePayload = {
        ticketNumber: 4,
        customerId: '76e354a9-31d0-4bbd-94e4-27c66e50b3bb',
      };

      for (const badBalance of [5000.5, '5000.25', -500, -1, true, false, '', '   ', 1e25]) {
        await expect(
          validationPipe.transform(
            { ...basePayload, openingBalance: badBalance },
            { type: 'body', metatype: AssignTicketDto },
          ),
        ).rejects.toThrow(BadRequestException);
      }

      for (const okBalance of [0, 2500, null, undefined]) {
        const out = await validationPipe.transform(
          okBalance === undefined ? basePayload : { ...basePayload, openingBalance: okBalance },
          { type: 'body', metatype: AssignTicketDto },
        );
        expect(out).toBeDefined();
      }
    });

    it('[DEF-BE-01: ReconcileSettlementDto] should reject fractional, zero, negative, boolean, and unsafe settlement record amounts', async () => {
      const baseRecord = {
        gatewayOrderId: 'ORD_20261021_001',
        gatewayPaymentId: 'pay_1234567890',
        status: 'SUCCESS',
        settledAt: '2026-10-21T10:00:00.000Z',
      };

      for (const badAmount of [3750.5, '3750.25', 0, -3750, true, '', 1e25]) {
        await expect(
          validationPipe.transform(
            { records: [{ ...baseRecord, amount: badAmount }] },
            { type: 'body', metatype: ReconcileSettlementDto },
          ),
        ).rejects.toThrow(BadRequestException);
      }

      const valid = await validationPipe.transform(
        { records: [{ ...baseRecord, amount: 3750 }] },
        { type: 'body', metatype: ReconcileSettlementDto },
      );
      expect(valid.records[0].amount).toBe(3750);
    });
  });

  // ----------------------------------------------------------------------------
  // CATEGORY 4: Mathematical Ceiling, Floor & Precision Boundary Enforcement
  // ----------------------------------------------------------------------------
  describe('Category 4: Ceiling Violations, Sub-Floor & Service Boundary Logic', () => {
    let auctionService: AuctionService;
    let paymentService: PaymentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        chitGroup: { findUnique: jest.fn() },
        subscriberTicket: { findUnique: jest.fn() },
        installmentDue: { findFirst: jest.fn(), findUnique: jest.fn() },
        auction: { findUnique: jest.fn(), upsert: jest.fn() },
        payment: { findUnique: jest.fn(), create: jest.fn() },
        paymentAllocation: { create: jest.fn() },
        receipt: { findFirst: jest.fn(), create: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      auctionService = new AuctionService(prismaMock, {} as any);
      paymentService = new PaymentService(prismaMock, {} as any, {} as any);
    });

    it('[AuctionService.recordBid] MUST reject discount below 4.00% Foreman Commission floor', async () => {
      // 1 Lakh chit -> 4% commission is ₹4,000. Bidding ₹3,000 must be rejected.
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'chit-001',
        chitValue: 100000n,
        totalTickets: 20,
        durationMonths: 20,
        maxDiscountCeiling: 25000n,
      });

      await expect(
        auctionService.recordBid(
          'chit-001',
          5,
          {
            ticketId: 'ticket-001',
            bidDiscount: 3000, // Below 4% floor of 4000
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          'staff-001',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[AuctionService.recordBid] MUST reject discount exceeding statutory 1/4 ceiling (ADR-06)', async () => {
      // 1 Lakh chit -> Max allowable 1/4 ceiling is ₹25,000. Bidding ₹25,001 must be rejected.
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'chit-001',
        chitValue: 100000n,
        totalTickets: 20,
        durationMonths: 20,
        maxDiscountCeiling: 25000n,
      });

      await expect(
        auctionService.recordBid(
          'chit-001',
          5,
          {
            ticketId: 'ticket-001',
            bidDiscount: 25001, // Exceeds 25000
            auctionDate: '2026-12-15T00:00:00.000Z',
          },
          'staff-001',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[PaymentService.recordPayment] MUST reject payment amount that mismatches discrete net due (ADR-07)', async () => {
      // Due is ₹3,950. Submitting ₹3,900 or ₹4,000 must be rejected (Zero Partial / Zero Advance).
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-001',
        status: 'ACTIVE',
        chitGroup: { status: 'ACTIVE' },
        customer: { fullName: 'Test' },
      });
      prismaMock.installmentDue.findUnique.mockResolvedValue({
        id: 'due-001',
        status: 'UNPAID',
        netPayableAmount: 3950n,
        ticket: { id: 'ticket-001', status: 'ACTIVE' },
      });
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'due-001', status: 'UNPAID', netPayableAmount: 3950n }]);

      // Attempt underpayment
      await expect(
        paymentService.recordPayment(
          {
            ticketId: 'ticket-001',
            dueId: 'due-001',
            amount: 3900, // Underpayment
            paymentMethod: PaymentMethod.CASH,
          },
          'staff-001',
        ),
      ).rejects.toThrow(BadRequestException);

      // Attempt overpayment
      await expect(
        paymentService.recordPayment(
          {
            ticketId: 'ticket-001',
            dueId: 'due-001',
            amount: 4000, // Overpayment
            paymentMethod: PaymentMethod.CASH,
          },
          'staff-001',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ----------------------------------------------------------------------------
  // CATEGORY 5: Type Confusion, NaN, Infinity & String Injections
  // ----------------------------------------------------------------------------
  describe('Category 5: Type Confusion, NaN, Infinity & Malformed Input Attacks', () => {
    it('[CreatePaymentDto] should reject NaN and Infinity', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: NaN,
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: CreatePaymentDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: Infinity,
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: CreatePaymentDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[CreatePaymentDto] should reject non-numeric string injection in amount ("three thousand")', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: 'three thousand',
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: CreatePaymentDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[CreatePaymentDto] should reject SQL injection payload in amount field', async () => {
      await expect(
        validationPipe.transform(
          {
            ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
            installmentMonth: 4,
            amount: '3950; DROP TABLE "Payment";',
            paymentMethod: PaymentMethod.CASH,
          },
          { type: 'body', metatype: CreatePaymentDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('[CreatePaymentDto] should reject null, undefined, boolean, empty-string, and unsafe-integer amount', async () => {
      for (const malformedAmount of [null, undefined, true, false, '', '   ', MAX_SAFE_WHOLE_RUPEE + 1, 1e25]) {
        await expect(
          validationPipe.transform(
            {
              ticketId: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
              installmentMonth: 4,
              amount: malformedAmount,
              paymentMethod: PaymentMethod.CASH,
            },
            { type: 'body', metatype: CreatePaymentDto },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // ----------------------------------------------------------------------------
  // CATEGORY 6: Service-Layer & Controller Fail-Closed Guards (Zero Math.floor)
  // ----------------------------------------------------------------------------
  describe('Category 6: Direct Service-Layer Zero-Paise Guards (No Silent Math.floor)', () => {
    it('[toWholeRupeeBigInt] rejects decimals, non-finite numbers, unsafe integers, and lower-bound breaches', () => {
      expect(() => toWholeRupeeBigInt(3950.5, 'amount', { min: 1n })).toThrow(BadRequestException);
      expect(() => toWholeRupeeBigInt(NaN, 'amount')).toThrow(BadRequestException);
      expect(() => toWholeRupeeBigInt(1e25, 'amount')).toThrow(BadRequestException);
      expect(() => toWholeRupeeBigInt(-1, 'openingBalance', { min: 0n })).toThrow(BadRequestException);
      expect(() => toWholeRupeeBigInt(0, 'amount', { min: 1n })).toThrow(BadRequestException);
      expect(toWholeRupeeBigInt(0, 'openingBalance', { min: 0n })).toBe(0n);
      expect(toWholeRupeeBigInt(5000000, 'chitValue', { min: 1n })).toBe(5000000n);
    });

    it('[Services & JobsController] MUST fail closed with BadRequestException on direct fractional calls instead of silently truncating via Math.floor()', async () => {
      const prismaMock: any = {
        branch: { findFirst: jest.fn().mockResolvedValue({ id: 'br-1' }) },
        chitGroup: {
          findUnique: jest.fn().mockImplementation(async (args: any) => {
            if (args?.where?.groupCode) return null;
            return {
              id: 'chit-001',
              groupCode: 'KCA-1L-20M-01',
              status: 'DRAFT',
              chitValue: 100000n,
              totalTickets: 20,
              durationMonths: 20,
              maxDiscountCeiling: 25000n,
              tickets: [],
            };
          }),
        },
        customer: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-001' }) },
        subscriberTicket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tkt-001',
            ticketNumber: 1,
            status: 'ACTIVE',
            isPrized: false,
            chitGroupId: 'chit-001',
            chitGroup: { status: 'ACTIVE', branchId: 'br-1', branch: { code: 'PRD' } },
            customer: { fullName: 'Test Customer' },
          }),
        },
        installmentDue: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'due-001',
            status: 'UNPAID',
            netPayableAmount: 3950n,
          }),
        },
        payment: {
          findUnique: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'pay-001',
              recordedByUserId: 'collector-1',
              paymentMethod: PaymentMethod.CASH,
              cashHandoverStatus: 'PENDING_HANDOVER',
              amount: 45000n,
            },
          ]),
        },
        auction: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'auc-001',
            prizeMoney: 75000n,
            winner: {
              id: 'win-001',
              disbursementStatus: 'VERIFIED_BY_MAKER',
              verifiedByUserId: 'maker-1',
            },
            chitGroup: { id: 'chit-001', branchId: 'br-1' },
          }),
        },
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };

      const auctionService = new AuctionService(prismaMock);
      const chitService = new ChitService(prismaMock);
      const paymentService = new PaymentService(prismaMock);
      const collectionService = new CollectionService(prismaMock);
      const disbursementService = new DisbursementService(prismaMock);
      const jobsController = new JobsController(
        {} as any,
        {} as any,
        { reconcileSettlement: jest.fn() } as any,
        {} as any,
        { addJob: jest.fn() } as any,
      );

      await expect(
        auctionService.recordBid(
          'chit-001',
          2,
          { ticketId: 'tkt-001', bidDiscount: 22000.5, auctionDate: '2026-12-15' },
          'staff-1',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        chitService.create({
          groupCode: 'KCA-FRAC-1',
          groupName: 'Frac Chit',
          chitValue: 100000.5,
          durationMonths: 20,
          totalTickets: 20,
          startDate: '2026-01-01',
          endDate: '2027-08-31',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        chitService.assignTicket('chit-001', {
          ticketNumber: 1,
          customerId: 'cust-001',
          openingBalance: 500.5,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        paymentService.recordPayment(
          {
            ticketId: 'tkt-001',
            installmentMonth: 4,
            amount: 3950.5,
            paymentMethod: PaymentMethod.CASH,
          },
          'staff-1',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        collectionService.recordCollection(
          {
            ticketId: 'tkt-001',
            installmentMonth: 4,
            amount: 3950.5,
            paymentMethod: PaymentMethod.CASH,
          },
          'collector-1',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        collectionService.acknowledgeHandover(
          {
            collectorUserId: 'collector-1',
            acknowledgedAmount: 45000.5,
            paymentIds: ['pay-001'],
          },
          'checker-2',
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        disbursementService.authorizePayout(
          'auc-001',
          { disbursementMode: DisbursementMode.CASH, disbursedAmount: 75000.5 },
          'checker-2',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        disbursementService.authorizePayout(
          'auc-001',
          { disbursementMode: DisbursementMode.CASH, disbursedAmount: 0 },
          'checker-2',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        jobsController.runReconciliation({
          records: [
            {
              gatewayOrderId: 'ORD-1',
              gatewayPaymentId: 'PAY-1',
              amount: 3750.5,
              status: 'SUCCESS',
              settledAt: '2026-10-21T10:00:00.000Z',
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
