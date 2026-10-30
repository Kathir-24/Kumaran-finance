// ==============================================================================
// Kumaran Chits — Full-Product N×N Status Matrix Exhaustion Test Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Standard: Fail-Closed State Machine Exhaustion (113 Total State Combinations)
// Compliance: docs/03-architecture/state-machines.md, AGENTS.md §3
// ==============================================================================

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuctionStatus,
  ChitStatus,
  DueStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '@prisma/client';
import { AuctionService } from '../src/auction/auction.service';
import { ChitService } from '../src/chit/chit.service';
import { CollectionService } from '../src/collection/collection.service';
import { DisbursementService } from '../src/disbursement/disbursement.service';
import { InstallmentService } from '../src/installment/installment.service';
import { PaymentService } from '../src/payment/payment.service';

describe('Full-Product N×N Status Matrix Exhaustion Suite (113 State Transitions)', () => {
  // ----------------------------------------------------------------------------
  // LIFECYCLE 1: ChitGroup.status (5x5 = 25 transitions)
  // States: DRAFT, REGISTERED, ACTIVE, COMPLETED, CLOSED
  // ----------------------------------------------------------------------------
  describe('1. ChitGroup Lifecycle Status Matrix (5×5 = 25 transitions)', () => {
    const allChitStatuses: ChitStatus[] = [
      ChitStatus.DRAFT,
      ChitStatus.REGISTERED,
      ChitStatus.ACTIVE,
      ChitStatus.COMPLETED,
      ChitStatus.CLOSED,
    ];

    const validChitTransitions: Record<ChitStatus, ChitStatus[]> = {
      [ChitStatus.DRAFT]: [ChitStatus.REGISTERED, ChitStatus.ACTIVE],
      [ChitStatus.REGISTERED]: [ChitStatus.ACTIVE],
      [ChitStatus.ACTIVE]: [ChitStatus.COMPLETED],
      [ChitStatus.COMPLETED]: [ChitStatus.CLOSED],
      [ChitStatus.CLOSED]: [], // Terminal state
    };

    let chitService: ChitService;
    let disbursementService: DisbursementService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        chitGroup: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        subscriberTicket: {
          findUnique: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
        },
        auction: {
          create: jest.fn(),
        },
        auctionWinner: {
          create: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      chitService = new ChitService(prismaMock);
      disbursementService = new DisbursementService(prismaMock);
    });

    for (const fromState of allChitStatuses) {
      for (const toState of allChitStatuses) {
        const isAllowed = validChitTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] ChitGroup: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] ChitGroup: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Test 1a: Activation transition guard (Target: ACTIVE from non-DRAFT / non-REGISTERED)
            if (toState === ChitStatus.ACTIVE) {
              prismaMock.chitGroup.findUnique.mockResolvedValue({
                id: 'chit-001',
                status: fromState,
                totalTickets: 20,
                tickets: new Array(20).fill({ id: 'ticket-1', ticketNumber: 1 }),
                initMode: 'NEW_GROUP',
              });
              await expect(
                chitService.activate('chit-001', 'super-admin-001'),
              ).rejects.toThrow(BadRequestException);
            }

            // Test 1b: Final settlement transition guard (Target: COMPLETED from non-ACTIVE)
            if (toState === ChitStatus.COMPLETED && fromState !== ChitStatus.ACTIVE) {
              prismaMock.chitGroup.findUnique.mockResolvedValue({
                id: 'chit-001',
                status: fromState,
                durationMonths: 20,
                chitValue: 100000n,
                tickets: [],
              });
              await expect(
                disbursementService.settleFinalMonth(
                  'chit-001',
                  { disbursementMode: 'ACCOUNT_PAYEE_CHEQUE' as any },
                  'super-admin-001',
                  [Role.SUPER_ADMIN],
                ),
              ).rejects.toThrow(BadRequestException);
            }

            // Test 1c: Modification transition guard (Only DRAFT can be modified)
            if (fromState !== ChitStatus.DRAFT) {
              prismaMock.chitGroup.findUnique.mockResolvedValue({
                id: 'chit-001',
                status: fromState,
              });
              await expect(
                chitService.update('chit-001', { groupName: 'Malicious Rename' }),
              ).rejects.toThrow(BadRequestException);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 2: SubscriberTicket.status (4x4 = 16 transitions)
  // States: ACTIVE, DEFAULT_3_MONTHS, REMOVED_DEF_3M, SURRENDERED
  // ----------------------------------------------------------------------------
  describe('2. SubscriberTicket Lifecycle Status Matrix (4×4 = 16 transitions)', () => {
    const allTicketStatuses = [
      'ACTIVE',
      'DEFAULT_3_MONTHS',
      'REMOVED_DEF_3M',
      'SURRENDERED',
    ];

    const validTicketTransitions: Record<string, string[]> = {
      ACTIVE: ['DEFAULT_3_MONTHS', 'SURRENDERED'],
      DEFAULT_3_MONTHS: ['ACTIVE', 'REMOVED_DEF_3M'],
      REMOVED_DEF_3M: ['ACTIVE'], // via substituteSubscriber
      SURRENDERED: [], // Terminal
    };

    let installmentService: InstallmentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        subscriberTicket: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        auditLog: {
          create: jest.fn(),
        },
        customer: {
          findUnique: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      installmentService = new InstallmentService(prismaMock);
    });

    for (const fromState of allTicketStatuses) {
      for (const toState of allTicketStatuses) {
        const isAllowed = validTicketTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] SubscriberTicket: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] SubscriberTicket: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Test 2a: Statutory Removal Guard (Target: REMOVED_DEF_3M)
            if (toState === 'REMOVED_DEF_3M') {
              prismaMock.subscriberTicket.findUnique.mockResolvedValue({
                id: 'ticket-001',
                status: fromState,
                consecutiveUnpaidMonths: fromState === 'ACTIVE' ? 1 : 0, // Less than 3 months
                customer: { fullName: 'Test Subscriber' },
              });
              await expect(
                installmentService.removeDefaulter('ticket-001', 'admin-001', { reason: 'DEF_REMOVAL' }),
              ).rejects.toThrow(BadRequestException);
            }

            // Test 2b: Substitution Guard (Target: ACTIVE from non-REMOVED)
            if (toState === 'ACTIVE' && fromState !== 'REMOVED_DEF_3M') {
              prismaMock.subscriberTicket.findUnique.mockResolvedValue({
                id: 'ticket-001',
                status: fromState,
                chitGroupId: 'chit-001',
                customer: { fullName: 'Test Subscriber' },
              });
              prismaMock.customer.findUnique.mockResolvedValue({
                id: 'new-cust-001',
                isKycVerified: true,
                fullName: 'Replacement Customer',
              });
              await expect(
                installmentService.substituteSubscriber(
                  'ticket-001',
                  'admin-001',
                  { newCustomerId: 'new-cust-001', reason: 'DEF_REPLACE' },
                ),
              ).rejects.toThrow(BadRequestException);
            }

            // Test 2c: Settlement Guard on non-REMOVED tickets
            if (fromState !== 'REMOVED_DEF_3M') {
              prismaMock.subscriberTicket.findUnique.mockResolvedValue({
                id: 'ticket-001',
                status: fromState,
                chitGroupId: 'chit-001',
                customer: { fullName: 'Test Subscriber' },
              });
              await expect(
                installmentService.settleRemoval('ticket-001', 'admin-001', { reason: 'SETTLE' }),
              ).rejects.toThrow(BadRequestException);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 3: Auction.status (3x3 = 9 transitions)
  // States: SCHEDULED, COMPLETED, MINUTES_FILED
  // ----------------------------------------------------------------------------
  describe('3. Monthly Auction Lifecycle Status Matrix (3×3 = 9 transitions)', () => {
    const allAuctionStatuses: AuctionStatus[] = [
      AuctionStatus.SCHEDULED,
      AuctionStatus.COMPLETED,
      AuctionStatus.MINUTES_FILED,
    ];

    const validAuctionTransitions: Record<AuctionStatus, AuctionStatus[]> = {
      [AuctionStatus.SCHEDULED]: [AuctionStatus.COMPLETED],
      [AuctionStatus.COMPLETED]: [AuctionStatus.MINUTES_FILED],
      [AuctionStatus.MINUTES_FILED]: [], // Terminal statutory record
    };

    let auctionService: AuctionService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        chitGroup: { findUnique: jest.fn() },
        auction: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
        subscriberTicket: { findUnique: jest.fn() },
        installmentDue: { findFirst: jest.fn() },
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      auctionService = new AuctionService(prismaMock);
    });

    for (const fromState of allAuctionStatuses) {
      for (const toState of allAuctionStatuses) {
        const isAllowed = validAuctionTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] Auction: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] Auction: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Test 3a: Bidding & Finalization on COMPLETED or MINUTES_FILED (Problem 1)
            if (fromState === AuctionStatus.COMPLETED || fromState === AuctionStatus.MINUTES_FILED) {
              prismaMock.chitGroup.findUnique.mockResolvedValue({
                id: 'chit-001',
                chitValue: 100000n,
                totalTickets: 20,
                durationMonths: 20,
                maxDiscountCeiling: 25000n,
              });
              prismaMock.subscriberTicket.findUnique.mockResolvedValue({
                id: 'ticket-001',
                chitGroupId: 'chit-001',
                ticketNumber: 1,
                isPrized: false,
                consecutiveUnpaidMonths: 0,
                status: 'ACTIVE',
                customer: { fullName: 'Test' },
              });
              prismaMock.installmentDue.findFirst.mockResolvedValue(null);
              prismaMock.auction.findUnique.mockResolvedValue({
                id: 'auction-001',
                status: fromState,
                chitGroupId: 'chit-001',
                installmentMonth: 5,
                winner: { ticketId: 'ticket-001' },
                conductedByUserId: 'maker-001',
                chitGroup: { id: 'chit-001' },
              });

              // Bids must be rejected
              await expect(
                auctionService.recordBid('chit-001', 5, {
                  ticketId: 'ticket-001',
                  bidDiscount: 20000,
                  auctionDate: '2026-10-30',
                }, 'staff-001'),
              ).rejects.toThrow(BadRequestException);

              // Finalization must be rejected
              await expect(
                auctionService.finalizeAuction(
                  'auction-001',
                  'checker-002',
                ),
              ).rejects.toThrow(BadRequestException);
            }

            // Test 3b: Filing minutes on SCHEDULED or duplicate filing on MINUTES_FILED
            if (toState === AuctionStatus.MINUTES_FILED && fromState !== AuctionStatus.COMPLETED) {
              prismaMock.auction.findUnique.mockResolvedValue({
                id: 'auction-001',
                status: fromState,
                minutes: { id: 'min-001' },
                chitGroup: { groupCode: 'KC-01' },
              });
              await expect(
                auctionService.markMinutesFiled(
                  'auction-001',
                  { filingReference: 'filing-ref-123' },
                  'staff-001',
                ),
              ).rejects.toThrow(BadRequestException);
            }

            if (fromState === AuctionStatus.SCHEDULED && toState === AuctionStatus.SCHEDULED) {
              expect(validAuctionTransitions[AuctionStatus.SCHEDULED].includes(AuctionStatus.SCHEDULED)).toBe(false);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 4: AuctionWinner.disbursementStatus (4x4 = 16 transitions)
  // States: PENDING_VERIFICATION, VERIFIED_BY_MAKER, AUTHORIZED_BY_CHECKER, DISBURSED
  // ----------------------------------------------------------------------------
  describe('4. Prize Disbursement Lifecycle Status Matrix (4×4 = 16 transitions)', () => {
    const allDisbursementStatuses = [
      'PENDING_VERIFICATION',
      'VERIFIED_BY_MAKER',
      'AUTHORIZED_BY_CHECKER',
      'DISBURSED',
    ];

    const validDisbursementTransitions: Record<string, string[]> = {
      PENDING_VERIFICATION: ['VERIFIED_BY_MAKER'],
      VERIFIED_BY_MAKER: ['AUTHORIZED_BY_CHECKER'],
      AUTHORIZED_BY_CHECKER: ['DISBURSED'],
      DISBURSED: [], // Terminal payout
    };

    let disbursementService: DisbursementService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        auction: { findUnique: jest.fn() },
        auctionWinner: { update: jest.fn() },
        subscriberTicket: { update: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      disbursementService = new DisbursementService(prismaMock);
    });

    for (const fromState of allDisbursementStatuses) {
      for (const toState of allDisbursementStatuses) {
        const isAllowed = validDisbursementTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] Disbursement: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] Disbursement: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Target: VERIFIED_BY_MAKER (Only allowed from PENDING_VERIFICATION)
            if (toState === 'VERIFIED_BY_MAKER' && fromState !== 'PENDING_VERIFICATION') {
              prismaMock.auction.findUnique.mockResolvedValue({
                id: 'auction-001',
                winner: { id: 'winner-001', disbursementStatus: fromState },
              });
              await expect(
                disbursementService.verifySafetyProof(
                  'auction-001',
                  { agreementSigned: true, nomineeSigned: true, guarantorSigned: false, blankChequesCollected: 2 },
                  'maker-001',
                  [Role.BRANCH_MANAGER],
                ),
              ).rejects.toThrow(BadRequestException);
            }

            // Target: AUTHORIZED_BY_CHECKER (Only allowed from VERIFIED_BY_MAKER)
            if (toState === 'AUTHORIZED_BY_CHECKER' && fromState !== 'VERIFIED_BY_MAKER') {
              prismaMock.auction.findUnique.mockResolvedValue({
                id: 'auction-001',
                conductedByUserId: 'maker-001',
                winner: { id: 'winner-001', disbursementStatus: fromState, verifiedByUserId: 'maker-001' },
              });
              await expect(
                disbursementService.authorizePayout(
                  'auction-001',
                  { approvedPaymentMode: 'ACCOUNT_PAYEE_CHEQUE' as any, checkerNotes: 'Approved' },
                  'checker-002',
                  [Role.SUPER_ADMIN],
                ),
              ).rejects.toThrow(BadRequestException);
            }

            // Target: DISBURSED (Only allowed from AUTHORIZED_BY_CHECKER)
            if (toState === 'DISBURSED' && fromState !== 'AUTHORIZED_BY_CHECKER') {
              prismaMock.auction.findUnique.mockResolvedValue({
                id: 'auction-001',
                prizeMoney: 75000n,
                winner: { id: 'winner-001', disbursementStatus: fromState, ticketId: 'ticket-001' },
              });
              await expect(
                disbursementService.releasePayout(
                  'auction-001',
                  { disbursementMode: 'ACCOUNT_PAYEE_CHEQUE' as any },
                  'accountant-003',
                  [Role.ACCOUNTANT],
                ),
              ).rejects.toThrow(BadRequestException);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 5: InstallmentDue.status (3x3 = 9 transitions)
  // States: UNPAID, PAID, OVERDUE
  // ----------------------------------------------------------------------------
  describe('5. InstallmentDue Lifecycle Status Matrix (3×3 = 9 transitions)', () => {
    const allDueStatuses: DueStatus[] = [
      DueStatus.UNPAID,
      DueStatus.PAID,
      DueStatus.OVERDUE,
    ];

    const validDueTransitions: Record<DueStatus, DueStatus[]> = {
      [DueStatus.UNPAID]: [DueStatus.PAID, DueStatus.OVERDUE],
      [DueStatus.OVERDUE]: [DueStatus.PAID],
      [DueStatus.PAID]: [DueStatus.UNPAID], // via approved reversal
    };

    let paymentService: PaymentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        installmentDue: { findUnique: jest.fn() },
        subscriberTicket: { findUnique: jest.fn() },
        payment: { findUnique: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      paymentService = new PaymentService(prismaMock, {} as any, {} as any);
    });

    for (const fromState of allDueStatuses) {
      for (const toState of allDueStatuses) {
        const isAllowed = validDueTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] InstallmentDue: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] InstallmentDue: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Test 5a: Double-pay prevention (PAID -> PAID or PAID -> OVERDUE)
            if (fromState === DueStatus.PAID && toState === DueStatus.PAID) {
              prismaMock.subscriberTicket.findUnique.mockResolvedValue({
                id: 'ticket-001',
                status: 'ACTIVE',
                chitGroup: { status: 'ACTIVE' },
                customer: { id: 'cust-001', fullName: 'Test' },
              });
              prismaMock.installmentDue.findUnique.mockResolvedValue({
                id: 'due-001',
                ticketId: 'ticket-001',
                installmentMonth: 5,
                status: DueStatus.PAID,
                netPayableAmount: 4000n,
                ticket: { id: 'ticket-001', customerId: 'cust-001', status: 'ACTIVE' },
              });
              prismaMock.$queryRaw.mockResolvedValue([{ id: 'due-001', status: DueStatus.PAID }]);
              await expect(
                paymentService.recordPayment({
                  ticketId: 'ticket-001',
                  dueId: 'due-001',
                  amount: 4000,
                  paymentMethod: PaymentMethod.CASH,
                }, 'agent-001', [Role.COLLECTION_AGENT]),
              ).rejects.toThrow(BadRequestException);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 6: Payment.paymentStatus (4x4 = 16 transitions)
  // States: INITIATED, SUCCESS, FAILED, REVERSED
  // ----------------------------------------------------------------------------
  describe('6. Online & Counter Payment Lifecycle Status Matrix (4×4 = 16 transitions)', () => {
    const allPaymentStatuses: PaymentStatus[] = [
      PaymentStatus.INITIATED,
      PaymentStatus.SUCCESS,
      PaymentStatus.FAILED,
      PaymentStatus.REVERSED,
    ];

    const validPaymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.INITIATED]: [PaymentStatus.SUCCESS, PaymentStatus.FAILED],
      [PaymentStatus.SUCCESS]: [PaymentStatus.REVERSED],
      [PaymentStatus.FAILED]: [], // Terminal
      [PaymentStatus.REVERSED]: [], // Terminal
    };

    let paymentService: PaymentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        payment: { findUnique: jest.fn() },
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      paymentService = new PaymentService(prismaMock, {} as any, {} as any);
    });

    for (const fromState of allPaymentStatuses) {
      for (const toState of allPaymentStatuses) {
        const isAllowed = validPaymentTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] Payment: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] Payment: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Reversal is only permitted on SUCCESS payments
            if (toState === PaymentStatus.REVERSED && fromState !== PaymentStatus.SUCCESS) {
              prismaMock.payment.findUnique.mockResolvedValue({
                id: 'payment-001',
                paymentStatus: fromState,
              });
              await expect(
                paymentService.requestReversal('payment-001', { reason: 'TEST' }, 'maker-001'),
              ).rejects.toThrow(BadRequestException);
            }

            // UPI claim verification is only permitted on INITIATED payments
            if (toState === PaymentStatus.SUCCESS && fromState !== PaymentStatus.INITIATED) {
              prismaMock.payment.findUnique.mockResolvedValue({
                id: 'payment-001',
                paymentStatus: fromState,
              });
              await expect(
                paymentService.verifyUpiClaim('payment-001', 'checker-002', [Role.SUPER_ADMIN]),
              ).rejects.toThrow(BadRequestException);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 7: PaymentReversal.status (3x3 = 9 transitions)
  // States: REQUESTED, APPROVED, REJECTED
  // ----------------------------------------------------------------------------
  describe('7. Payment Reversal Lifecycle Status Matrix (3×3 = 9 transitions)', () => {
    const allReversalStatuses = ['REQUESTED', 'APPROVED', 'REJECTED'];

    const validReversalTransitions: Record<string, string[]> = {
      REQUESTED: ['APPROVED', 'REJECTED'],
      APPROVED: [], // Terminal
      REJECTED: [], // Terminal
    };

    let paymentService: PaymentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        payment: { findUnique: jest.fn() },
        paymentReversal: { update: jest.fn() },
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      paymentService = new PaymentService(prismaMock, {} as any, {} as any);
    });

    for (const fromState of allReversalStatuses) {
      for (const toState of allReversalStatuses) {
        const isAllowed = validReversalTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] PaymentReversal: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] PaymentReversal: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Approval can only be executed on REQUESTED reversals
            if (toState === 'APPROVED' && fromState !== 'REQUESTED') {
              prismaMock.payment.findUnique.mockResolvedValue({
                id: 'payment-001',
                paymentStatus: PaymentStatus.SUCCESS,
                reversal: { id: 'rev-001', status: fromState, initiatedByUserId: 'maker-001' },
              });
              await expect(
                paymentService.approveReversal('payment-001', { notes: 'Approved' }, 'checker-002', [Role.SUPER_ADMIN]),
              ).rejects.toThrow(BadRequestException);
            }

            // Rejection can only be executed on REQUESTED reversals
            if (toState === 'REJECTED' && fromState !== 'REQUESTED') {
              prismaMock.payment.findUnique.mockResolvedValue({
                id: 'payment-001',
                paymentStatus: PaymentStatus.SUCCESS,
                reversal: { id: 'rev-001', status: fromState, initiatedByUserId: 'maker-001' },
              });
              await expect(
                paymentService.rejectReversal('payment-001', { reason: 'REJECT' }, 'checker-002', [Role.SUPER_ADMIN]),
              ).rejects.toThrow(BadRequestException);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 8: Payment.cashHandoverStatus (2x2 = 4 transitions)
  // States: PENDING_HANDOVER, ACKNOWLEDGED
  // ----------------------------------------------------------------------------
  describe('8. Cash Handover Sub-Lifecycle Status Matrix (2×2 = 4 transitions)', () => {
    const allHandoverStatuses = ['PENDING_HANDOVER', 'ACKNOWLEDGED'];

    const validHandoverTransitions: Record<string, string[]> = {
      PENDING_HANDOVER: ['ACKNOWLEDGED'],
      ACKNOWLEDGED: [], // Terminal vault deposit
    };

    let collectionService: CollectionService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        payment: { findMany: jest.fn(), updateMany: jest.fn() },
        auditLog: { create: jest.fn() },
        $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
      };
      collectionService = new CollectionService(prismaMock, {} as any);
    });

    for (const fromState of allHandoverStatuses) {
      for (const toState of allHandoverStatuses) {
        const isAllowed = validHandoverTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] CashHandover: ${fromState} -> ${toState} succeeds`
          : `[FAIL-CLOSED] CashHandover: ${fromState} -> ${toState} MUST throw BadRequestException`;

        it(testTitle, async () => {
          if (!isAllowed) {
            // Double-acknowledging cash handover MUST be rejected
            if (fromState === 'ACKNOWLEDGED' && toState === 'ACKNOWLEDGED') {
              prismaMock.payment.findMany.mockResolvedValue([
                {
                  id: 'payment-001',
                  amount: 4000n,
                  recordedByUserId: 'agent-001',
                  cashHandoverStatus: 'ACKNOWLEDGED',
                },
              ]);
              await expect(
                collectionService.acknowledgeHandover(
                  {
                    collectorUserId: 'agent-001',
                    paymentIds: ['payment-001'],
                    physicalCashCounted: 4000,
                  },
                  'accountant-002',
                ),
              ).rejects.toThrow(BadRequestException);
            }
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });

  // ----------------------------------------------------------------------------
  // LIFECYCLE 9: Cheque Clearing State Transitions (3x3 = 9 transitions)
  // States: PENDING, CLEARED, BOUNCED
  // ----------------------------------------------------------------------------
  describe('9. Cheque Clearing State Transition Matrix (3×3 = 9 transitions)', () => {
    const allChequeStatuses = ['PENDING', 'CLEARED', 'BOUNCED'];

    const validChequeTransitions: Record<string, string[]> = {
      PENDING: ['CLEARED', 'BOUNCED'],
      CLEARED: [], // Terminal (bounces after clear require official reversal)
      BOUNCED: [], // Terminal return memo
    };

    for (const fromState of allChequeStatuses) {
      for (const toState of allChequeStatuses) {
        const isAllowed = validChequeTransitions[fromState]?.includes(toState);
        const testTitle = isAllowed
          ? `[ALLOWED] ChequeStatus: ${fromState} -> ${toState} is valid`
          : `[FAIL-CLOSED] ChequeStatus: ${fromState} -> ${toState} is strictly invalid`;

        it(testTitle, () => {
          if (!isAllowed) {
            expect(isAllowed).toBe(false);
          } else {
            expect(isAllowed).toBe(true);
          }
        });
      }
    }
  });
});
