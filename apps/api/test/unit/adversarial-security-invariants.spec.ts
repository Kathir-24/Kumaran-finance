import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuctionStatus,
  DisbursementMode,
  DueStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuctionService } from '../../src/auction/auction.service';
import { AuthService } from '../../src/auth/auth.service';
import { ChitService } from '../../src/chit/chit.service';
import { CollectionService } from '../../src/collection/collection.service';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { PaymentService } from '../../src/payment/payment.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DocumentAccessHelper } from '../../src/storage/helpers/document-access.helper';

const preHash = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

describe('Adversarial Security, RBAC & Dual Control Challenger Suite', () => {
  let prismaMock: any;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockBranchId = 'branch-prd-001';
  const mockMakerId = 'usr-maker-001';
  const mockCheckerId = 'usr-checker-002';
  const mockBranchManagerId = 'usr-bm-003';
  const mockCollectorId = 'usr-collector-004';

  const mockCustomer1Id = 'cust-uuid-001';
  const mockCustomer1Phone = '9842100001';
  const mockCustomer2Id = 'cust-uuid-002';
  const mockCustomer2Phone = '9842100002';

  const mockChitGroupId = 'chit-group-uuid-001';
  const mockAuctionId = 'auction-uuid-001';
  const mockPaymentId = 'payment-uuid-001';
  const mockTicketId = 'ticket-uuid-001';

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where?.id || 'usr-default', isActive: true, isPartner: true })),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      chitGroup: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      auction: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auctionMinutes: {
        upsert: jest.fn(),
      },
      auctionWinner: {
        update: jest.fn(),
      },
      payment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      receipt: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      paymentReversal: {
        update: jest.fn(),
      },
      installmentDue: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        count: jest.fn(),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(prismaMock)),
    };

    configService = new ConfigService({
      JWT_SECRET: 'test-adversarial-secret-key-32-chars-minimum',
      JWT_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
    });

    jwtService = new JwtService({
      secret: 'test-adversarial-secret-key-32-chars-minimum',
      signOptions: { expiresIn: '15m' },
    });
  });

  // =========================================================================
  // 1. MAKER != CHECKER DUAL CONTROL (ALL 5 PAIRS)
  // =========================================================================
  describe('1. Maker != Checker Dual Control (5 Invariant Pairs)', () => {
    // -----------------------------------------------------------------------
    // Pair 1: Auction Finalization
    // -----------------------------------------------------------------------
    describe('Pair 1: Auction Finalization (POST /auctions/:id/finalize)', () => {
      let auctionService: AuctionService;

      beforeEach(() => {
        auctionService = new AuctionService(prismaMock as unknown as PrismaService);
      });

      it('should REJECT self-finalization when Maker who conducted auction attempts to finalize (403 Forbidden)', async () => {
        const mockAuction = {
          id: mockAuctionId,
          chitGroupId: mockChitGroupId,
          installmentMonth: 2,
          conductedByUserId: mockMakerId, // Auction recorded/conducted by Maker
          status: AuctionStatus.SCHEDULED,
          winner: { ticketId: mockTicketId },
        };

        prismaMock.auction.findUnique.mockResolvedValue(mockAuction);

        // Attempt finalization by the same user who conducted the auction
        await expect(
          auctionService.finalizeAuction(mockAuctionId, mockMakerId),
        ).rejects.toThrow(
          new ForbiddenException(
            'Maker-Checker Separation of Duties Violated: The staff who recorded the auction bids cannot finalize and commit the auction result',
          ),
        );
      });

      it('should APPROVE auction finalization when independent Checker finalizes (200 OK)', async () => {
        const mockAuction = {
          id: mockAuctionId,
          chitGroupId: mockChitGroupId,
          installmentMonth: 2,
          auctionDate: new Date('2026-10-20'),
          conductedByUserId: mockMakerId,
          status: AuctionStatus.SCHEDULED,
          winner: {
            ticketId: mockTicketId,
            bidAmount: 20000n,
            dividendPerTicket: 800n,
            ticket: {
              ticketNumber: 3,
              customer: { fullName: 'S. Ramanathan' },
            },
          },
          chitGroup: {
            id: mockChitGroupId,
            groupCode: 'KCA-1L-20M-01',
            groupName: '₹1 Lakh 20 Months Scheme',
            totalTickets: 20,
            baseInstallment: 5000n,
          },
        };

        prismaMock.auction.findUnique
          .mockResolvedValueOnce(mockAuction)
          .mockResolvedValueOnce({
            ...mockAuction,
            status: AuctionStatus.COMPLETED,
            finalizedByUserId: mockCheckerId,
          });

        prismaMock.auction.update.mockResolvedValue({
          ...mockAuction,
          status: AuctionStatus.COMPLETED,
          finalizedByUserId: mockCheckerId,
        });

        const res = await auctionService.finalizeAuction(mockAuctionId, mockCheckerId, {
          subscribersPresent: 14,
        });
        expect(res).toBeDefined();
        expect(res?.status).toBe(AuctionStatus.COMPLETED);
        expect(res?.finalizedByUserId).toBe(mockCheckerId);
      });
    });

    // -----------------------------------------------------------------------
    // Pair 2: Cash Handover
    // -----------------------------------------------------------------------
    describe('Pair 2: Cash Handover (POST /collections/cash-handover/acknowledge)', () => {
      let collectionService: CollectionService;

      beforeEach(() => {
        collectionService = new CollectionService(prismaMock as unknown as PrismaService);
      });

      it('should REJECT self-acknowledgment when field collector attempts to acknowledge own cash (403 Forbidden)', async () => {
        const acknowledgeDto = {
          collectorUserId: mockCollectorId,
          paymentIds: [mockPaymentId],
          acknowledgedAmount: 5000,
        };

        // Attempting to acknowledge own cash into vault (collectorUserId === acknowledgerUserId)
        await expect(
          collectionService.acknowledgeHandover(acknowledgeDto, mockCollectorId),
        ).rejects.toThrow(
          new ForbiddenException(
            'Dual-Control Separation of Duties Violated: The field agent who collected the cash cannot acknowledge or sign off on their own cash handover into the branch vault (collector_user_id != acknowledger_user_id)',
          ),
        );
      });

      it('should APPROVE cash handover acknowledgment when independent vault staff verifies (200 OK)', async () => {
        const acknowledgeDto = {
          collectorUserId: mockCollectorId,
          paymentIds: [mockPaymentId],
          acknowledgedAmount: 5000,
        };

        const mockPayment = {
          id: mockPaymentId,
          amount: 5000n,
          paymentMethod: PaymentMethod.CASH,
          cashHandoverStatus: 'PENDING_HANDOVER',
          recordedByUserId: mockCollectorId,
        };

        prismaMock.payment.findMany.mockResolvedValue([mockPayment]);
        prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

        const res = await collectionService.acknowledgeHandover(acknowledgeDto, mockCheckerId);
        expect(res.success).toBe(true);
        expect(res.totalPaymentsAcknowledged).toBe(1);
        expect(res.acknowledgedAmount).toBe(5000n);
        expect(res.acknowledgedByUserId).toBe(mockCheckerId);
      });
    });

    // -----------------------------------------------------------------------
    // Pair 3: UPI Claims
    // -----------------------------------------------------------------------
    describe('Pair 3: UPI Claims (POST /payments/:id/verify-upi-claim)', () => {
      let paymentService: PaymentService;

      beforeEach(() => {
        paymentService = new PaymentService(prismaMock as unknown as PrismaService);
      });

      it('should REJECT self-verification when staff who recorded/submitted UPI claim attempts to verify (403 Forbidden)', async () => {
        const mockPendingClaim = {
          id: mockPaymentId,
          paymentStatus: PaymentStatus.INITIATED,
          paymentMethod: PaymentMethod.UPI,
          recordedByUserId: mockMakerId, // Recorded by Maker
          amount: 4200n,
          allocations: [
            {
              id: 'alloc-01',
              due: { id: 'due-01', status: DueStatus.UNPAID },
              ticket: {
                id: mockTicketId,
                chitGroup: { branchId: mockBranchId, branch: { code: 'PRD' } },
              },
            },
          ],
        };

        prismaMock.payment.findUnique.mockResolvedValue(mockPendingClaim);

        // Maker attempts self-verification
        await expect(
          paymentService.verifyUpiClaim(
            mockPaymentId,
            mockMakerId, // Same as recordedByUserId!
            [Role.SUPER_ADMIN],
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'MAKER_CHECKER_VIOLATION: The user who submitted the UPI claim cannot verify it. A separate staff member must verify bank credit.',
          ),
        );
      });

      it('should APPROVE UPI claim when independent Checker verifies bank credit (200 OK)', async () => {
        const mockPendingClaim = {
          id: mockPaymentId,
          paymentStatus: PaymentStatus.INITIATED,
          paymentMethod: PaymentMethod.UPI,
          recordedByUserId: mockMakerId,
          amount: 4200n,
          transactionRef: 'KVB123456789012',
          allocations: [
            {
              id: 'alloc-01',
              due: { id: 'due-01', status: DueStatus.UNPAID },
              ticket: {
                id: mockTicketId,
                customerId: mockCustomer1Id,
                chitGroup: { branchId: mockBranchId, branch: { code: 'PRD' } },
              },
            },
          ],
        };

        prismaMock.payment.findUnique.mockResolvedValue(mockPendingClaim);
        prismaMock.payment.update.mockResolvedValue({
          ...mockPendingClaim,
          paymentStatus: PaymentStatus.SUCCESS,
        });
        prismaMock.receipt.findFirst.mockResolvedValue(null);
        prismaMock.receipt.create.mockResolvedValue({
          id: 'rec-01',
          receiptNumber: 'KC-REC-PRD-2026-00001',
        });
        prismaMock.installmentDue.update.mockResolvedValue({});
        prismaMock.installmentDue.count.mockResolvedValue(0);

        const res = await paymentService.verifyUpiClaim(
          mockPaymentId,
          mockCheckerId, // Independent Checker
          [Role.SUPER_ADMIN],
          { verificationNotes: 'Credit verified in KVB statement' },
        );

        expect(res.success).toBe(true);
        expect(res.dueStatus).toBe(DueStatus.PAID);
      });
    });

    // -----------------------------------------------------------------------
    // Pair 4: Payment Reversals
    // -----------------------------------------------------------------------
    describe('Pair 4: Payment Reversals (POST /payments/:id/approve-reversal)', () => {
      let paymentService: PaymentService;

      beforeEach(() => {
        paymentService = new PaymentService(prismaMock as unknown as PrismaService);
      });

      it('should REJECT self-approval when Maker who requested reversal attempts to approve (403 Forbidden)', async () => {
        const mockPaymentToReverse = {
          id: mockPaymentId,
          amount: 5000n,
          paymentStatus: PaymentStatus.SUCCESS,
          reversal: {
            id: 'rev-01',
            status: 'REQUESTED',
            initiatedByUserId: mockMakerId, // Initiated by Maker
          },
        };

        prismaMock.payment.findUnique.mockResolvedValue(mockPaymentToReverse);

        // Maker attempts self-approval
        await expect(
          paymentService.approveReversal(
            mockPaymentId,
            { notes: 'Self-approval attempt' },
            mockMakerId, // Same as initiatedByUserId
            [Role.SUPER_ADMIN],
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'MAKER_CHECKER_VIOLATION: The user who requested the reversal cannot approve it. An independent Partner must review and commit.',
          ),
        );
      });

      it('should APPROVE reversal when independent Partner B approves Partner A request (200 OK)', async () => {
        const mockPaymentToReverse = {
          id: mockPaymentId,
          amount: 5000n,
          paymentStatus: PaymentStatus.SUCCESS,
          reversal: {
            id: 'rev-01',
            status: 'REQUESTED',
            initiatedByUserId: mockMakerId,
          },
          allocations: [
            {
              id: 'alloc-01',
              due: { id: 'due-01', status: DueStatus.PAID },
              ticket: { id: mockTicketId },
            },
          ],
        };

        prismaMock.payment.findUnique.mockResolvedValue(mockPaymentToReverse);
        prismaMock.paymentReversal.update.mockResolvedValue({
          id: 'rev-01',
          status: 'APPROVED',
          approvedByUserId: mockCheckerId,
        });
        prismaMock.payment.update.mockResolvedValue({
          ...mockPaymentToReverse,
          paymentStatus: PaymentStatus.REVERSED,
        });
        prismaMock.installmentDue.count.mockResolvedValue(1);

        const res = await paymentService.approveReversal(
          mockPaymentId,
          { notes: 'Partner B approval' },
          mockCheckerId, // Independent Checker
          [Role.SUPER_ADMIN],
        );

        expect(res.reversal.status).toBe('APPROVED');
        expect(res.paymentStatus).toBe(PaymentStatus.REVERSED);
        expect(res.dueStatus).toBe(DueStatus.UNPAID);
      });

      it('SEC-A: should REJECT non-partner Super Admin attempting to approve reversal (403 Forbidden)', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'non-partner-admin', isPartner: false });
        await expect(
          paymentService.approveReversal(
            mockPaymentId,
            { notes: 'Approval attempt by non-partner admin' },
            'non-partner-admin',
            [Role.SUPER_ADMIN],
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to approve payment reversals',
          ),
        );
      });

      it('SEC-A: should REJECT non-partner attempting to request reversal (403 Forbidden)', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'non-partner-maker', isPartner: false });
        await expect(
          paymentService.requestReversal(
            mockPaymentId,
            { reason: 'Mistake', notes: 'Request attempt by non-partner' },
            'non-partner-maker',
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to request payment reversals',
          ),
        );
      });
    });

    // -----------------------------------------------------------------------
    // Pair 5: Prize Disbursements
    // -----------------------------------------------------------------------
    describe('Pair 5: Prize Disbursements (POST /disbursements/auction/:id/authorize-payout)', () => {
      let disbursementService: DisbursementService;

      beforeEach(() => {
        disbursementService = new DisbursementService(
          prismaMock as unknown as PrismaService,
          {} as any,
        );
      });

      it('should REJECT self-authorization when Maker who verified safety checklist attempts to authorize (403 Forbidden)', async () => {
        const mockVerifiedAuction = {
          id: mockAuctionId,
          winner: {
            id: 'winner-01',
            ticketId: mockTicketId,
            verifiedByUserId: mockMakerId, // Verified by Maker
            disbursementStatus: 'VERIFIED_BY_MAKER',
          },
        };

        prismaMock.auction.findUnique.mockResolvedValue(mockVerifiedAuction);

        // Maker attempts self-authorization
        await expect(
          disbursementService.authorizePayout(
            mockAuctionId,
            { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
            mockMakerId, // Same as verifiedByUserId
            [Role.SUPER_ADMIN],
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'MAKER_CHECKER_VIOLATION: The user who verified the safety proof checklist cannot authorize the prize payout. An independent Partner must review and authorize.',
          ),
        );
      });

      it('should APPROVE prize payout when independent Partner B authorizes (200 OK)', async () => {
        const mockVerifiedAuction = {
          id: mockAuctionId,
          winner: {
            id: 'winner-01',
            ticketId: mockTicketId,
            verifiedByUserId: mockMakerId,
            disbursementStatus: 'VERIFIED_BY_MAKER',
          },
        };

        prismaMock.auction.findUnique.mockResolvedValue(mockVerifiedAuction);
        prismaMock.auctionWinner.update.mockResolvedValue({
          ...mockVerifiedAuction.winner,
          disbursementStatus: 'AUTHORIZED_BY_CHECKER',
          authorizedByUserId: mockCheckerId,
        });

        const res = await disbursementService.authorizePayout(
          mockAuctionId,
          { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
          mockCheckerId, // Independent Checker
          [Role.SUPER_ADMIN],
        );

        expect(res.winner.disbursementStatus).toBe('AUTHORIZED_BY_CHECKER');
        expect(res.winner.authorizedByUserId).toBe(mockCheckerId);
      });

      it('SEC-A: should REJECT non-partner Super Admin attempting to authorize payout (403 Forbidden)', async () => {
        prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'non-partner-admin', isPartner: false });
        await expect(
          disbursementService.authorizePayout(
            mockAuctionId,
            { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
            'non-partner-admin',
            [Role.SUPER_ADMIN],
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to authorize prize money disbursements',
          ),
        );
      });
    });
  });

  // =========================================================================
  // 2. BRANCH MANAGER ROLE BLOCKS (REVERSALS & DISBURSEMENTS)
  // =========================================================================
  describe('2. Branch Manager Role Blocks (Super Admin Exclusivity)', () => {
    let paymentService: PaymentService;
    let disbursementService: DisbursementService;
    let auctionService: AuctionService;

    beforeEach(() => {
      paymentService = new PaymentService(prismaMock as unknown as PrismaService);
      disbursementService = new DisbursementService(
        prismaMock as unknown as PrismaService,
        {} as any,
      );
      auctionService = new AuctionService(prismaMock as unknown as PrismaService);
    });

    it('should STRICTLY BLOCK Branch Manager from approving payment reversals (403 Forbidden)', async () => {
      await expect(
        paymentService.approveReversal(
          mockPaymentId,
          { notes: 'Branch Manager approval attempt' },
          mockBranchManagerId,
          [Role.BRANCH_MANAGER], // Branch Manager role only
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'REVERSAL_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to approve payment reversals',
        ),
      );
    });

    it('should STRICTLY BLOCK Branch Manager from authorizing prize disbursements (403 Forbidden)', async () => {
      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
          mockBranchManagerId,
          [Role.BRANCH_MANAGER], // Branch Manager role only
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'DISBURSEMENT_PERMISSION_DENIED: Only Super Admin (Partners) possess financial authority to authorize prize money disbursements',
        ),
      );
    });

    it('KFC-SEC-003: should STRICTLY BLOCK Branch Manager from finalizing auctions (403 Forbidden)', async () => {
      await expect(
        auctionService.finalizeAuction(
          mockAuctionId,
          mockBranchManagerId,
          undefined,
          [Role.BRANCH_MANAGER], // Branch Manager role only
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'SUPER_ADMIN_REQUIRED: Only Partners (Super Admin) are authorized to finalize and commit auctions.',
        ),
      );
    });
  });

  // =========================================================================
  // 3. ADR-13 TICKET LIMIT CONSTRAINT
  // =========================================================================
  describe('3. ADR-13 Ticket Limit Constraint (Max 1 Ticket per Customer in Same Group)', () => {
    let chitService: ChitService;

    beforeEach(() => {
      chitService = new ChitService(prismaMock as unknown as PrismaService);
    });

    it('should REJECT assigning a second ticket to the same customer in the same group with HTTP 409 Conflict', async () => {
      const mockChit = {
        id: mockChitGroupId,
        groupCode: 'KCA-1L-20M-01',
        status: 'DRAFT',
        totalTickets: 20,
        tickets: [
          {
            id: 't-01',
            ticketNumber: 1,
            customerId: mockCustomer1Id, // Customer 1 already holds ticket #1
          },
        ],
      };

      prismaMock.chitGroup.findUnique.mockResolvedValue(mockChit);

      // Attempt to assign Ticket #2 to Customer 1 in the SAME chit group
      await expect(
        chitService.assignTicket(mockChitGroupId, {
          ticketNumber: 2,
          customerId: mockCustomer1Id,
        }),
      ).rejects.toThrow(
        new ConflictException(
          'ADR-13 Violation: Customer already holds a ticket in this chit group (Max 1 ticket per customer)',
        ),
      );
    });
  });

  // =========================================================================
  // 4. RFC 6819 TOKEN REUSE REVOCATION
  // =========================================================================
  describe('4. RFC 6819 Token Reuse Revocation Protocol', () => {
    let authService: AuthService;

    beforeEach(() => {
      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtService,
        configService,
        {} as any,
      );
    });

    it('should DETECT refresh token reuse and atomically REVOKE the entire session family (HTTP 401)', async () => {
      // Token 1 (stale/compromised token)
      const token1 = jwtService.sign(
        {
          sub: mockMakerId,
          phone: '9876543210',
          roles: [Role.SUPER_ADMIN],
          tokenType: 'refresh',
          jti: 'jti-token-1',
        },
        { expiresIn: '7d' },
      );

      // Token 2 (current active token in database)
      const token2 = jwtService.sign(
        {
          sub: mockMakerId,
          phone: '9876543210',
          roles: [Role.SUPER_ADMIN],
          tokenType: 'refresh',
          jti: 'jti-token-2',
        },
        { expiresIn: '7d' },
      );
      const hash2 = await bcrypt.hash(preHash(token2), 10);

      prismaMock.user.findUnique.mockResolvedValue({
        id: mockMakerId,
        isActive: true,
        refreshTokenHash: hash2, // Active hash belongs to Token 2
      });

      // Attacker replays Token 1
      await expect(
        authService.refreshToken({ refreshToken: token1 }),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Token reuse detected. Active session revoked for security. Please sign in again.',
        ),
      );

      // Database MUST have set refreshTokenHash = null
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: mockMakerId },
        data: { refreshTokenHash: null },
      });
    });
  });

  // =========================================================================
  // 5. 3-ATTEMPT OTP BRUTE-FORCE LOCKOUT
  // =========================================================================
  describe('5. 3-Attempt OTP Brute-Force Lockout', () => {
    let authService: AuthService;
    let smsServiceMock: { sendOtpSms: jest.Mock };

    beforeEach(() => {
      smsServiceMock = {
        sendOtpSms: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-01' }),
      };

      authService = new AuthService(
        prismaMock as unknown as PrismaService,
        jwtService,
        configService,
        smsServiceMock as any,
      );

      prismaMock.customer.findUnique.mockResolvedValue({
        id: mockCustomer1Id,
        phone: mockCustomer1Phone,
      });
    });

    it('should LOCK OUT phone for 5 minutes (HTTP 429) after 3 consecutive failed OTP attempts', async () => {
      await authService.requestOtp({ phone: mockCustomer1Phone });

      // Attempt 1 -> 400 (2 remaining)
      await expect(
        authService.verifyOtp({ phone: mockCustomer1Phone, otp: '000000' }),
      ).rejects.toThrow(/2 attempt\(s\) remaining/);

      // Attempt 2 -> 400 (1 remaining)
      await expect(
        authService.verifyOtp({ phone: mockCustomer1Phone, otp: '000000' }),
      ).rejects.toThrow(/1 attempt\(s\) remaining/);

      // Attempt 3 -> 429 Lockout triggered!
      try {
        await authService.verifyOtp({ phone: mockCustomer1Phone, otp: '000000' });
        fail('Expected 429 lockout exception');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.message).toContain('temporarily locked out');
      }

      // Subsequent attempt while locked out must fail closed with 429
      try {
        await authService.verifyOtp({ phone: mockCustomer1Phone, otp: '000000' });
        fail('Expected 429 lockout exception');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });
  });

  // =========================================================================
  // 6. ANTI-BOLA / IDOR PERMISSION BOUNDARIES
  // =========================================================================
  describe('6. Anti-BOLA / IDOR Protection Boundaries', () => {
    it('Customer A token viewing Customer B KYC document throws 403 Forbidden', async () => {
      const customerAPayload = {
        sub: mockCustomer1Id,
        phone: mockCustomer1Phone,
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      // Customer A tries to access Customer B KYC folder
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          `kyc/${mockCustomer2Id}/aadhaar.pdf`,
          customerAPayload,
        ),
      ).rejects.toThrow(
        new ForbiddenException('Access denied: You can only view your own KYC documents'),
      );
    });

    it('Customer A token viewing Customer B passbook throws 403 Forbidden', () => {
      const customerAPayload = {
        sub: mockCustomer1Id,
        phone: mockCustomer1Phone,
        roles: [Role.CUSTOMER],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      const ticketB = {
        chitGroup: { branchId: mockBranchId },
        customer: { phone: mockCustomer2Phone }, // Belongs to Customer B
      };

      expect(() => {
        DocumentAccessHelper.assertPassbookAccess(ticketB, customerAPayload);
      }).toThrow(
        new ForbiddenException('Access denied: You can only view your own passbook statement'),
      );
    });

    it('Field Collection Agent attempting to download KYC documents throws 403 Forbidden', async () => {
      const agentPayload = {
        sub: mockCollectorId,
        phone: '9876543214',
        roles: [Role.COLLECTION_AGENT],
        branchId: mockBranchId,
        tokenType: 'access' as const,
      };

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          `kyc/${mockCustomer1Id}/pan.pdf`,
          agentPayload,
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'Access denied: Field collection agents cannot access customer KYC scans',
        ),
      );
    });

    it('Branch Manager from Branch PRD cannot access KYC of customer in another branch (403 Forbidden)', () => {
      const bmPayload = {
        sub: mockBranchManagerId,
        phone: '9876543210',
        branchId: 'branch-prd-001',
        roles: [Role.BRANCH_MANAGER],
        tokenType: 'access' as const,
      };

      const customerInAnotherBranch = {
        id: mockCustomer1Id,
        branchId: 'branch-erd-002', // Erode branch!
      };

      expect(() => {
        DocumentAccessHelper.assertCustomerAccess(customerInAnotherBranch, bmPayload);
      }).toThrow(
        new ForbiddenException(
          'BOLA_VIOLATION: Access denied. Customer profile and KYC documents belong to another branch office',
        ),
      );
    });
  });
});
