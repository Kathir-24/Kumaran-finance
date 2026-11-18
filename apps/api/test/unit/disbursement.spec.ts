import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuctionStatus, DisbursementMode, DueStatus, Prisma, Role } from '@prisma/client';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Module 8: Prize Disbursements & Company Safety Proof Checklist Tests', () => {
  let disbursementService: DisbursementService;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockAuctionId = 'auction-uuid-001';
  const mockTicketId = 'ticket-uuid-007';
  const mockCustomerId = 'cust-uuid-007';
  const mockMakerId = 'staff-maker-uuid-001';
  const mockCheckerId = 'partner-checker-uuid-002';
  const mockDisburserId = 'cashier-uuid-003';

  const mockBranch = {
    id: mockBranchId,
    code: 'PRD',
    name: 'Head Office - Perundurai',
    nameTamil: 'தலைமை கிளை, பெருந்துறை',
    address: 'Main Road, Perundurai, Erode',
    phone: '+91 98765 43210',
  };

  const mockChitGroup = {
    id: 'chit-group-uuid-001',
    groupCode: 'KCA-1L-20M-01',
    chitValue: 100000n,
    durationMonths: 20,
    branchId: mockBranchId,
    branch: mockBranch,
  };

  const mockCustomer = {
    id: mockCustomerId,
    customerCode: 'KC-CUST-00007',
    fullName: 'S. Sundaram',
    fullNameTamil: 'சுந்தரம்',
    phone: '9842143210',
    addressLine1: '14, Netaji Road',
    city: 'Perundurai',
    pincode: '638052',
  };

  const mockTicket = {
    id: mockTicketId,
    ticketNumber: 7,
    isPrized: true,
    customerId: mockCustomerId,
    customer: mockCustomer,
    chitGroup: mockChitGroup,
  };

  const mockWinner = {
    id: 'winner-uuid-001',
    auctionId: mockAuctionId,
    ticketId: mockTicketId,
    wasTieBreakWinner: false,
    isSecurityRequired: false,
    securityType: null,
    blankChequeDetails: null,
    agreementSigned: false,
    nomineeSigned: false,
    securityDocS3Key: null,
    verifiedByUserId: null,
    disbursementStatus: 'PENDING_VERIFICATION',
    disbursementMode: null,
    disbursedAmount: null,
    authorizedByUserId: null,
    disbursedAt: null,
    paymentReference: null,
    ticket: mockTicket,
  };

  const mockAuction = {
    id: mockAuctionId,
    chitGroupId: mockChitGroup.id,
    chitGroup: mockChitGroup,
    installmentMonth: 4,
    auctionDate: new Date('2026-10-18T10:00:00.000Z'),
    status: AuctionStatus.COMPLETED,
    bidDiscount: 25000n,
    foremanCommissionAmount: 4000n,
    totalDividend: 21000n,
    dividendPerTicket: 1050n,
    prizeMoney: 75000n,
    winner: mockWinner,
  };

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
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      auctionWinner: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where?.id || 'usr-default', isPartner: true, name: 'Partner Test' })),
      },
      customer: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      installmentDue: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'due-month-n-created' }),
        update: jest.fn().mockResolvedValue({ id: 'due-month-n-updated' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    disbursementService = new DisbursementService(
      prismaMock as unknown as PrismaService,
      {} as any,
    );
  });

  describe('1. Safety Proof Checklist Verification (Maker)', () => {
    it('should allow Maker to verify safety proof checklist and transition status to VERIFIED_BY_MAKER', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockWinner,
        isSecurityRequired: true,
        securityType: 'BLANK_CHEQUE',
        blankChequeDetails: 'SBI Cheque #004512',
        agreementSigned: true,
        nomineeSigned: true,
        verifiedByUserId: mockMakerId,
        disbursementStatus: 'VERIFIED_BY_MAKER',
      });

      const result = await disbursementService.verifySafetyProof(
        mockAuctionId,
        {
          isSecurityRequired: true,
          securityType: 'BLANK_CHEQUE',
          blankChequeDetails: 'SBI Cheque #004512',
          agreementSigned: true,
          nomineeSigned: true,
          notes: 'Customer verified at branch counter',
        },
        mockMakerId,
      );

      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockWinner.id },
          data: expect.objectContaining({
            isSecurityRequired: true,
            securityType: 'BLANK_CHEQUE',
            agreementSigned: true,
            nomineeSigned: true,
            verifiedByUserId: mockMakerId,
            disbursementStatus: 'VERIFIED_BY_MAKER',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SAFETY_PROOF_VERIFIED',
            userId: mockMakerId,
          }),
        }),
      );
      expect(result.winner.disbursementStatus).toBe('VERIFIED_BY_MAKER');
    });

    it('should enqueue disbursement approval alert to notification-queue upon safety proof verification', async () => {
      const mockQueueProvider = {
        addJob: jest.fn().mockResolvedValue({ jobId: 'job-disb-alert', status: 'ENQUEUED' }),
      };
      const mockStorage = {
        uploadFile: jest.fn(),
      };

      const queuedDisbursementService = new DisbursementService(
        prismaMock as unknown as PrismaService,
        mockStorage as any,
        mockQueueProvider as any,
      );

      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockWinner,
        disbursementStatus: 'VERIFIED_BY_MAKER',
      });
      prismaMock.auditLog.create.mockResolvedValue({});

      const result = await queuedDisbursementService.verifySafetyProof(
        mockAuctionId,
        {
          isSecurityRequired: false,
          agreementSigned: true,
          nomineeSigned: true,
        },
        mockMakerId,
      );

      expect(result.message).toContain('Safety proof checklist verified successfully');
      expect(mockQueueProvider.addJob).toHaveBeenCalledWith(
        'notification-queue',
        'dispatch-approval-alert',
        expect.objectContaining({
          approvalType: 'DISBURSEMENT_APPROVAL',
          entityId: mockAuctionId,
          amount: '75000',
          excludeUserId: mockMakerId,
          data: expect.objectContaining({
            auctionId: mockAuctionId,
            ticketNumber: '7',
            customerName: 'S. Sundaram',
            chitCode: 'KCA-1L-20M-01',
          }),
        }),
        expect.objectContaining({
          jobId: 'approval-alert-disbursement-auction-uuid-001',
          priority: 1,
        }),
      );
    });

    it('should reject verification if auction is still in SCHEDULED status', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        status: AuctionStatus.SCHEDULED,
      });

      await expect(
        disbursementService.verifySafetyProof(
          mockAuctionId,
          {
            isSecurityRequired: false,
            agreementSigned: true,
            nomineeSigned: true,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject verification if disbursementStatus is not PENDING_VERIFICATION', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: {
          ...mockWinner,
          disbursementStatus: 'VERIFIED_BY_MAKER',
        },
      });

      await expect(
        disbursementService.verifySafetyProof(
          mockAuctionId,
          {
            isSecurityRequired: false,
            agreementSigned: true,
            nomineeSigned: true,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Maker-Checker Payout Authorization (Checker)', () => {
    const mockVerifiedAuction = {
      ...mockAuction,
      winner: {
        ...mockWinner,
        verifiedByUserId: mockMakerId, // Verified by Maker A
        disbursementStatus: 'VERIFIED_BY_MAKER',
      },
    };

    it('should ENFORCE MAKER != CHECKER: Throw 403 Forbidden if Maker attempts to authorize own payout', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockVerifiedAuction);

      // Checker is also mockMakerId (Violation!)
      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          {
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          },
          mockMakerId, // Same as Maker!
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should ENFORCE SUPER_ADMIN EXCLUSIVITY: Block Branch Manager from authorizing prize payout', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockVerifiedAuction);

      // User has only BRANCH_MANAGER role
      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          {
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          },
          mockCheckerId,
          [Role.BRANCH_MANAGER], // Not Super Admin!
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should authorize prize payout when independent Partner B (Checker) approves', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockVerifiedAuction);
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockVerifiedAuction.winner,
        disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
        disbursedAmount: 75000n,
        authorizedByUserId: mockCheckerId,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      });

      const result = await disbursementService.authorizePayout(
        mockAuctionId,
        {
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          notes: 'Authorized after verifying blank cheques and agreement',
        },
        mockCheckerId, // Independent Partner B (Maker != Checker satisfied!)
        [Role.SUPER_ADMIN],
      );

      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockWinner.id },
          data: expect.objectContaining({
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            disbursedAmount: 75000n,
            authorizedByUserId: mockCheckerId,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PRIZE_PAYOUT_AUTHORIZED',
            userId: mockCheckerId,
          }),
        }),
      );
      expect(result.winner.disbursementStatus).toBe('AUTHORIZED_BY_CHECKER');
    });

    it('should authorize prize payout in CASH for large amount (zero artificial cash block)', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockVerifiedAuction,
        prizeMoney: 375000n,
      });
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockVerifiedAuction.winner,
        disbursementMode: DisbursementMode.CASH,
        disbursedAmount: 375000n,
        authorizedByUserId: mockCheckerId,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      });

      const result = await disbursementService.authorizePayout(
        mockAuctionId,
        {
          disbursementMode: DisbursementMode.CASH,
          disbursedAmount: 375000,
          notes: 'Authorized ₹3,75,000 prize payout in hard cash at Perundurai head office',
        },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            disbursementMode: DisbursementMode.CASH,
            disbursedAmount: 375000n,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
          }),
        }),
      );
      expect(result.winner.disbursementMode).toBe(DisbursementMode.CASH);
      expect(result.winner.disbursedAmount).toBe(375000n);
    });

    it('should proactively invalidate report dashboard, daybook, and approvals cache upon payout authorization', async () => {
      const mockRedisClient = {
        del: jest.fn().mockResolvedValue(4),
      };
      const mockRedisProvider = {
        getClient: jest.fn().mockReturnValue(mockRedisClient),
        getIsConnected: jest.fn().mockReturnValue(true),
      };
      const cachedDisbursementService = new DisbursementService(
        prismaMock as unknown as PrismaService,
        {} as any,
        undefined,
        mockRedisProvider as any,
      );

      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockVerifiedAuction,
        chitGroup: { branchId: 'branch-prd-01' },
      });
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockVerifiedAuction.winner,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      });

      await cachedDisbursementService.authorizePayout(
        mockAuctionId,
        { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        expect.stringContaining('report:daybook:ALL:'),
        expect.stringContaining('report:daybook:ALL_BRANCHES:'),
        'report:dashboard:ALL',
        'report:approvals:ALL',
        expect.stringContaining('report:daybook:branch-prd-01:'),
        'report:dashboard:branch-prd-01',
        'report:approvals:branch-prd-01',
      );
    });

    it('KFC-FIN-003: should automatically deduct unpaid installment arrears from prize money at payout authorization', async () => {
      // Auction prize money: 75,000. Customer has 2 unpaid installments totaling 10,000.
      prismaMock.auction.findUnique.mockResolvedValue(mockVerifiedAuction);
      prismaMock.installmentDue.findMany.mockResolvedValue([
        { id: 'due-1', installmentMonth: 2, netPayableAmount: 5000n, paidAmount: 0n, status: 'UNPAID' },
        { id: 'due-2', installmentMonth: 3, netPayableAmount: 5000n, paidAmount: 0n, status: 'UNPAID' },
      ]);
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockVerifiedAuction.winner,
        disbursedAmount: 65000n, // 75,000 - 10,000
        authorizedByUserId: mockCheckerId,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      });

      await disbursementService.authorizePayout(
        mockAuctionId,
        {
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          notes: 'Deducted ₹10,000 prior arrears from ₹75,000 prize',
        },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      // Verify DB update recorded net amount after arrears offset: 75,000 - 10,000 = 65,000
      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockWinner.id },
          data: expect.objectContaining({
            disbursedAmount: 65000n,
            authorizedByUserId: mockCheckerId,
            disbursementStatus: 'AUTHORIZED_BY_CHECKER',
          }),
        }),
      );
    });

    it('KFC-FIN-004: should strictly reject arbitrary payout override if disbursedAmount does not match authorized net payout', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockVerifiedAuction);
      prismaMock.installmentDue.findMany.mockResolvedValue([]); // Zero arrears -> expected net: 75,000

      // Caller attempts to pass arbitrary disbursedAmount = 70,000 instead of calculated 75,000
      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          {
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            disbursedAmount: 70000, // Override attempt!
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Payout Release & Voucher Generation', () => {
    const mockAuthorizedAuction = {
      ...mockAuction,
      winner: {
        ...mockWinner,
        verifiedByUserId: mockMakerId,
        authorizedByUserId: mockCheckerId,
        disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
        disbursedAmount: 75000n,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      },
    };

    it('should reject release if payout is not in AUTHORIZED_BY_CHECKER status', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuction); // In PENDING_VERIFICATION

      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'IOB-CHQ-009182' },
          mockDisburserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should release payout and record transaction reference and timestamp', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuthorizedAuction);
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockAuthorizedAuction.winner,
        paymentReference: 'IOB-CHQ-009182',
        disbursedAt: new Date('2026-10-18T11:30:00.000Z'),
        disbursementStatus: 'DISBURSED',
      });

      const result = await disbursementService.releasePayout(
        mockAuctionId,
        {
          paymentReference: 'IOB-CHQ-009182',
          disbursedAt: '2026-10-18T11:30:00.000Z',
        },
        mockDisburserId,
      );

      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockWinner.id },
          data: expect.objectContaining({
            paymentReference: 'IOB-CHQ-009182',
            disbursementStatus: 'DISBURSED',
          }),
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PRIZE_PAYOUT_DISBURSED',
            userId: mockDisburserId,
          }),
        }),
      );
      expect(result.winner.disbursementStatus).toBe('DISBURSED');
    });

    it('FIN-D / TOCTOU: should reject payout release if outstanding arrears changed between authorization and release', async () => {
      // Payout was authorized with arrears offset of 5000 (disbursed 70000 out of 75000)
      const auctionWithArrearsOffset = {
        ...mockAuthorizedAuction,
        winner: {
          ...mockAuthorizedAuction.winner,
          disbursedAmount: 70000n, // 75000 - 5000 expected arrears
        },
      };
      prismaMock.auction.findUnique.mockResolvedValue(auctionWithArrearsOffset);

      // But now inside releasePayout transaction, current unpaid dues is 0 (subscriber paid meanwhile)
      prismaMock.installmentDue.findMany.mockResolvedValue([]);

      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'IOB-CHQ-TOCTOU' },
          mockDisburserId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'ARREARS_STATE_CHANGED: Outstanding arrears (₹0) no longer match the authorized arrears offset (₹5000). Arrears status was modified after authorization. Payout must be re-authorized.',
        ),
      );
    });

    it('should generate bilingual prize disbursement voucher (English + தமிழ்)', async () => {
      const mockDisbursedAuction = {
        ...mockAuthorizedAuction,
        winner: {
          ...mockAuthorizedAuction.winner,
          paymentReference: 'IOB-CHQ-009182',
          disbursedAt: new Date('2026-10-18T11:30:00.000Z'),
          disbursementStatus: 'DISBURSED',
        },
      };

      prismaMock.auction.findUnique.mockResolvedValue(mockDisbursedAuction);
      prismaMock.user.findUnique.mockResolvedValueOnce({ name: 'Muniasamy AG' }); // Maker
      prismaMock.user.findUnique.mockResolvedValueOnce({ name: 'Partner K' }); // Checker

      const staffUser: JwtPayload = {
        sub: mockMakerId,
        phone: '9842199999',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access',
      };

      const voucher = await disbursementService.getBilingualVoucher(
        mockAuctionId,
        staffUser,
      );

      expect(voucher.voucherNumber).toContain('KC-VOU-PRD-2026-');
      expect(voucher.isBilingual).toBe(true);
      expect(voucher.formattedText).toContain('KUMARAN FINANCE');
      expect(voucher.formattedText).toContain('குமரன் பைனான்ஸ்');
      expect(voucher.formattedText).toContain('பரிசுத் தொகை பட்டுவாடா ரசீது / PRIZE MONEY DISBURSEMENT VOUCHER');
      expect(voucher.formattedText).toContain('KCA-1L-20M-01');
      expect(voucher.formattedText).toContain('₹ 100000');
      expect(voucher.formattedText).toContain('₹ 25000');
      expect(voucher.formattedText).toContain('₹ 75000');
      expect(voucher.formattedText).toContain('IOB-CHQ-009182');
    });
  });

  describe('4. Persona Scoping & Ownership Guards', () => {
    it('should block Customer from viewing another customer prize payout voucher', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);
      prismaMock.customer.findUnique.mockResolvedValue({ id: 'different-cust-uuid' });

      const customerUser: JwtPayload = {
        sub: 'user-cust-001',
        phone: '9842100000',
        roles: [Role.CUSTOMER],
        branchId: null,
        tokenType: 'access',
      };

      await expect(
        disbursementService.getBilingualVoucher(mockAuctionId, customerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if auction does not exist', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);

      const staffUser: JwtPayload = {
        sub: mockMakerId,
        phone: '9842199999',
        roles: [Role.SUPER_ADMIN],
        branchId: null,
        tokenType: 'access',
      };

      await expect(
        disbursementService.getWinnerDisbursement('non-existent-id', staffUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. Final Month (Month N) Maturity Settlement Tests', () => {
    it('should reject final settlement if caller is not SUPER_ADMIN', async () => {
      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          },
          mockMakerId,
          [Role.BRANCH_MANAGER],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject final settlement if more than 1 unprized ticket remains', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        ...mockChitGroup,
        status: 'ACTIVE',
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId,
        chitGroupId: mockChitGroup.id,
        ticketNumber: 20,
        isPrized: false,
        customer: mockCustomer,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(2); // 2 unprized tickets!

      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully execute final Month N settlement (KFC-FIN-001: ₹1L chit -> ₹4,000 commission - ₹5,000 Month N installment -> ₹91,000 net payout)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        ...mockChitGroup,
        status: 'ACTIVE',
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId,
        chitGroupId: mockChitGroup.id,
        ticketNumber: 20,
        isPrized: false,
        customer: mockCustomer,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(1); // exactly 1 remaining unprized subscriber!

      prismaMock.auction.create.mockResolvedValue({
        id: 'auction-settle-final',
        installmentMonth: 20,
        prizeMoney: 91000n,
      });
      prismaMock.auctionWinner.create.mockResolvedValue({
        id: 'winner-settle-final',
        disbursedAmount: 91000n,
        disbursementStatus: 'DISBURSED',
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: mockTicketId,
        isPrized: true,
      });
      prismaMock.chitGroup.update.mockResolvedValue({
        id: mockChitGroup.id,
        status: 'COMPLETED',
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-log-final' });

      const result = await disbursementService.settleFinalMonth(
        mockChitGroup.id,
        {
          ticketId: mockTicketId,
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          paymentReference: 'IOB-CHQ-FINAL-999',
          makerUserId: mockMakerId,
        },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      expect(result.settlement.grossPrize).toBe(100000);
      expect(result.settlement.foremanCommission).toBe(4000); // 4% of 100,000
      expect(result.settlement.finalMonthInstallment).toBe(5000); // 100,000 / 20 months
      expect(result.settlement.priorArrearsDeducted).toBe(0);
      expect(result.settlement.netPrizeMoney).toBe(91000);    // 100,000 - 4,000 - 5,000
      expect(result.settlement.installmentMonth).toBe(20);
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTicketId },
          data: expect.objectContaining({ isPrized: true }),
        }),
      );
      expect(prismaMock.chitGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockChitGroup.id },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('FIN-B: should NOT deduct final month installment again if subscriber already paid Month N due (finalMonthDeduction = 0n)', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        ...mockChitGroup,
        status: 'ACTIVE',
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        ...mockTicket,
        chitGroupId: mockChitGroup.id,
        isPrized: false,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(1); // Exactly 1 unprized
      prismaMock.installmentDue.findUnique.mockResolvedValue({
        id: 'due-month-20-paid',
        ticketId: mockTicketId,
        installmentMonth: 20,
        status: DueStatus.PAID,
        netPayableAmount: 5000n,
        paidAmount: 5000n,
      });
      prismaMock.installmentDue.findMany.mockResolvedValue([]); // No prior arrears

      prismaMock.auction.create.mockResolvedValue({
        id: 'final-settlement-auction-002',
        installmentMonth: 20,
      });
      prismaMock.auctionWinner.create.mockResolvedValue({
        id: 'final-winner-002',
        disbursedAmount: 96000n, // 100,000 - 4,000 (No Month 20 deduction because already paid!)
      });
      prismaMock.subscriberTicket.update.mockResolvedValue({
        ...mockTicket,
        isPrized: true,
      });
      prismaMock.chitGroup.update.mockResolvedValue({
        id: mockChitGroup.id,
        status: 'COMPLETED',
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-log-final-2' });

      const result = await disbursementService.settleFinalMonth(
        mockChitGroup.id,
        {
          ticketId: mockTicketId,
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          paymentReference: 'IOB-CHQ-FINAL-ALREADY-PAID',
          makerUserId: mockMakerId,
        },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      expect(result.settlement.grossPrize).toBe(100000);
      expect(result.settlement.foremanCommission).toBe(4000); // 4% of 100,000
      expect(result.settlement.finalMonthInstallment).toBe(0); // ₹0 deducted because already paid!
      expect(result.settlement.isFinalMonthAlreadyPaid).toBe(true);
      expect(result.settlement.priorArrearsDeducted).toBe(0);
      expect(result.settlement.netPrizeMoney).toBe(96000);    // 100,000 - 4,000 - 0 = 96,000
    });

    it('SEC-A: should reject non-partner Super Admin attempting final month settlement', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'non-partner-admin', isPartner: false });
      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          },
          'non-partner-admin',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'PARTNER_IDENTITY_REQUIRED: Only verified business partners possess financial authority to authorize final month settlements',
        ),
      );
    });
  });

  describe('6. Direct Presigned S3 Safety Proof Confirm Controls (DEF-FE-07)', () => {
    it('confirms existing S3 safety proof under safety-proof/{auctionId}/ and links AuctionWinner', async () => {
      const storageMock = {
        fileExists: jest.fn().mockResolvedValue(true),
      };
      const serviceWithStorage = new DisbursementService(
        prismaMock as unknown as PrismaService,
        storageMock as any,
      );

      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockWinner,
        securityDocS3Key: `safety-proof/${mockAuctionId}/abcd1234-cheque.jpg`,
      });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-sp-1' });

      const result = await serviceWithStorage.confirmSafetyProof(
        mockAuctionId,
        {
          key: `safety-proof/${mockAuctionId}/abcd1234-cheque.jpg`,
          fileName: 'cheque.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 245_000,
        },
        mockMakerId,
      );

      expect(storageMock.fileExists).toHaveBeenCalledWith(
        `safety-proof/${mockAuctionId}/abcd1234-cheque.jpg`,
      );
      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith({
        where: { id: mockWinner.id },
        data: { securityDocS3Key: `safety-proof/${mockAuctionId}/abcd1234-cheque.jpg` },
      });
      expect(result.securityDocS3Key).toBe(`safety-proof/${mockAuctionId}/abcd1234-cheque.jpg`);
    });

    it('fail-closed: rejects confirmSafetyProof when S3 object is missing (zero DB updates)', async () => {
      const storageMock = {
        fileExists: jest.fn().mockResolvedValue(false),
      };
      const serviceWithStorage = new DisbursementService(
        prismaMock as unknown as PrismaService,
        storageMock as any,
      );

      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);

      await expect(
        serviceWithStorage.confirmSafetyProof(
          mockAuctionId,
          {
            key: `safety-proof/${mockAuctionId}/abcd1234-missing.jpg`,
            fileName: 'missing.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 120_000,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.auctionWinner.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects wrong auction key prefix and already-disbursed winners', async () => {
      const storageMock = {
        fileExists: jest.fn().mockResolvedValue(true),
      };
      const serviceWithStorage = new DisbursementService(
        prismaMock as unknown as PrismaService,
        storageMock as any,
      );

      await expect(
        serviceWithStorage.confirmSafetyProof(
          mockAuctionId,
          {
            key: 'safety-proof/other-auction-999/abcd-cheque.jpg',
            fileName: 'cheque.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 100_000,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);

      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: { ...mockWinner, disbursementStatus: 'DISBURSED' },
      });

      await expect(
        serviceWithStorage.confirmSafetyProof(
          mockAuctionId,
          {
            key: `safety-proof/${mockAuctionId}/abcd-cheque.jpg`,
            fileName: 'cheque.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 100_000,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('7. Module 6 Forensic Audit Remediations (DISB-01..08)', () => {
    const branchManagerB: JwtPayload = {
      sub: 'bm-branch-b',
      phone: '9842100088',
      roles: [Role.BRANCH_MANAGER],
      branchId: 'branch-erode-002',
      tokenType: 'access',
    };

    const itSuperAdmin: JwtPayload = {
      sub: 'it-admin-001',
      phone: '9842100077',
      roles: [Role.SUPER_ADMIN],
      isPartner: false,
      branchId: mockBranchId,
      tokenType: 'access',
    };

    it('DISB-01: fails closed on authorizePayout/approveFinalSettlement/settleFinalMonth when user lookup returns null', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
          'deleted-user-id',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            makerUserId: mockMakerId,
          },
          'deleted-user-id',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        disbursementService.approveFinalSettlement(
          mockChitGroup.id,
          'deleted-user-id',
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DISB-01: blocks administrative IT Super Admin (isPartner: false) from verifySafetyProof, releasePayout, and prepareFinalSettlement', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: itSuperAdmin.sub, isPartner: false, isActive: true });
      await expect(
        disbursementService.verifySafetyProof(
          mockAuctionId,
          { isSecurityRequired: false, agreementSigned: true, nomineeSigned: true },
          itSuperAdmin.sub,
          itSuperAdmin,
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/i);

      prismaMock.user.findUnique.mockResolvedValueOnce({ id: itSuperAdmin.sub, isPartner: false, isActive: true });
      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'CHQ-IT-001' },
          itSuperAdmin.sub,
          itSuperAdmin,
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/i);

      prismaMock.user.findUnique.mockResolvedValueOnce({ id: itSuperAdmin.sub, isPartner: false, isActive: true });
      await expect(
        disbursementService.prepareFinalSettlement(
          mockChitGroup.id,
          { ticketId: mockTicketId, disbursementMode: DisbursementMode.CASH },
          itSuperAdmin.sub,
          itSuperAdmin.roles,
          itSuperAdmin.branchId,
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/i);
    });

    it('DISB-02: enforces cross-branch Anti-BOLA guards for Branch Manager across all disbursement endpoints', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: { ...mockWinner, securityDocS3Key: `safety-proof/${mockAuctionId}/cheque.jpg` },
      });

      await expect(
        disbursementService.getWinnerDisbursement(mockAuctionId, branchManagerB),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        disbursementService.getBilingualVoucher(mockAuctionId, branchManagerB),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        disbursementService.getSafetyProofPresignedUrl(mockAuctionId, branchManagerB),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        disbursementService.verifySafetyProof(
          mockAuctionId,
          { isSecurityRequired: false, agreementSigned: true, nomineeSigned: true },
          branchManagerB.sub,
          branchManagerB,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Fail-closed queryDisbursements when BRANCH_MANAGER has null branchId
      await expect(
        disbursementService.queryDisbursements(
          { page: 1, limit: 20 },
          { ...branchManagerB, branchId: null },
        ),
      ).rejects.toThrow(ForbiddenException);

      // Cross-branch prepareFinalSettlement rejected
      prismaMock.chitGroup.findUnique.mockResolvedValue({ ...mockChitGroup, status: 'ACTIVE' });
      await expect(
        disbursementService.prepareFinalSettlement(
          mockChitGroup.id,
          { ticketId: mockTicketId, disbursementMode: DisbursementMode.CASH },
          branchManagerB.sub,
          branchManagerB.roles,
          branchManagerB.branchId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DISB-02: blocks uploadSafetyProof after prize has already been DISBURSED', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: { ...mockWinner, disbursementStatus: 'DISBURSED' },
      });

      await expect(
        disbursementService.uploadSafetyProof(
          mockAuctionId,
          {
            originalname: 'late-cheque.jpg',
            mimetype: 'image/jpeg',
            size: 1024,
            buffer: Buffer.from('img'),
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/already been disbursed/i);
    });

    it('DISB-03: uses frozen ChitGroup.foremanCommissionRate (e.g. 5.00%) in Month N settlement instead of hardcoded 4%', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        ...mockChitGroup,
        status: 'ACTIVE',
        foremanCommissionRate: new Prisma.Decimal('5.00'),
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId,
        chitGroupId: mockChitGroup.id,
        ticketNumber: 20,
        isPrized: false,
        status: 'ACTIVE',
        customer: mockCustomer,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(1);
      prismaMock.auction.create.mockResolvedValue({ id: 'auc-final-5pct', installmentMonth: 20 });
      prismaMock.auctionWinner.create.mockResolvedValue({ id: 'win-final-5pct', disbursedAmount: 90000n });
      prismaMock.subscriberTicket.update.mockResolvedValue({ id: mockTicketId, isPrized: true });
      prismaMock.chitGroup.update.mockResolvedValue({ id: mockChitGroup.id, status: 'COMPLETED' });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-5pct' });

      const res = await disbursementService.settleFinalMonth(
        mockChitGroup.id,
        {
          ticketId: mockTicketId,
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          paymentReference: 'CHQ-5PCT-001',
          makerUserId: mockMakerId,
        },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      // 100,000 - 5% (5,000) - Month 20 base (5,000) = 90,000
      expect(res.settlement.foremanCommission).toBe(5000);
      expect(res.settlement.netPrizeMoney).toBe(90000);
    });

    it('DISB-04: releasePayout recalculates consecutiveUnpaidMonths via arrears.util.ts without wiping post-auction arrears', async () => {
      const authorizedWithArrears = {
        ...mockAuction,
        installmentMonth: 4,
        winner: {
          ...mockWinner,
          verifiedByUserId: mockMakerId,
          authorizedByUserId: mockCheckerId,
          disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
          disbursedAmount: 70000n, // 75,000 - 5,000 arrears from Month 3
          disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        },
      };
      prismaMock.auction.findUnique.mockResolvedValue(authorizedWithArrears);
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...authorizedWithArrears.winner,
        paymentReference: 'NEFT-ARREARS-001',
        disbursementStatus: 'DISBURSED',
      });
      // First findMany: unpaid <= Month 4 (Month 3 = 5000n)
      // Second findMany (arrears.util.ts): all ticket dues including post-auction Months 5, 6, 7 UNPAID
      prismaMock.installmentDue.findMany
        .mockResolvedValueOnce([
          { id: 'due-m3', ticketId: mockTicketId, installmentMonth: 3, netPayableAmount: 5000n, paidAmount: 0n, status: DueStatus.OVERDUE },
        ])
        .mockResolvedValueOnce([
          { id: 'due-m1', installmentMonth: 1, status: DueStatus.PAID },
          { id: 'due-m2', installmentMonth: 2, status: DueStatus.PAID },
          { id: 'due-m3', installmentMonth: 3, status: DueStatus.OVERDUE }, // treated as PAID via offset
          { id: 'due-m4', installmentMonth: 4, status: DueStatus.PAID },
          { id: 'due-m5', installmentMonth: 5, status: DueStatus.OVERDUE },
          { id: 'due-m6', installmentMonth: 6, status: DueStatus.OVERDUE },
          { id: 'due-m7', installmentMonth: 7, status: DueStatus.UNPAID },
        ]);

      await disbursementService.releasePayout(
        mockAuctionId,
        { paymentReference: 'NEFT-ARREARS-001' },
        mockDisburserId,
      );

      // Post-auction Months 5, 6, 7 remain 3 consecutive unpaid months -> DEFAULT_3_MONTHS preserved!
      expect(prismaMock.subscriberTicket.update).toHaveBeenCalledWith({
        where: { id: mockTicketId },
        data: {
          consecutiveUnpaidMonths: 3,
          status: 'DEFAULT_3_MONTHS',
        },
      });
    });

    it('DISB-05: rejects duplicate non-cash Bank UTR / Cheque paymentReference with 409 ConflictException', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: {
          ...mockWinner,
          verifiedByUserId: mockMakerId,
          authorizedByUserId: mockCheckerId,
          disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
          disbursedAmount: 75000n,
          disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        },
      });
      prismaMock.auctionWinner.findFirst = jest.fn().mockResolvedValue({
        id: 'other-winner-999',
        auctionId: 'other-auction-999',
      });

      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'NEFT-DUP-UTR-999999' },
          mockDisburserId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('DISB-06: rejects fabricated makerUserId in settleFinalMonth and emits PRIZE_ARREARS_OFFSET_ALLOCATED for Month N & prior arrears', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({ ...mockChitGroup, status: 'ACTIVE' });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId,
        chitGroupId: mockChitGroup.id,
        ticketNumber: 20,
        isPrized: false,
        status: 'ACTIVE',
        customer: mockCustomer,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(1);
      // First lookup: checker partner (valid); second lookup: spoofed makerUserId (null!)
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: mockCheckerId, isPartner: true, isActive: true })
        .mockResolvedValueOnce(null);

      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.CASH,
            makerUserId: '00000000-0000-0000-0000-000000000999',
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/INVALID_MAKER_IDENTITY/i);

      // Now test valid settlement with 1 prior arrears due -> verifies PRIZE_ARREARS_OFFSET_ALLOCATED logs
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: mockCheckerId, isPartner: true, isActive: true })
        .mockResolvedValueOnce({ id: mockMakerId, roles: [Role.ACCOUNTANT], isPartner: false, isActive: true });
      prismaMock.installmentDue.findMany
        .mockResolvedValueOnce([
          { id: 'due-m19', ticketId: mockTicketId, installmentMonth: 19, netPayableAmount: 4000n, paidAmount: 0n, status: DueStatus.OVERDUE },
        ])
        .mockResolvedValueOnce([
          { id: 'due-m19', installmentMonth: 19, status: DueStatus.OVERDUE },
          { id: 'due-month-n-created', installmentMonth: 20, status: DueStatus.PAID },
        ]);
      prismaMock.auction.create.mockResolvedValue({ id: 'auc-final-audit', installmentMonth: 20 });
      prismaMock.auctionWinner.create.mockResolvedValue({ id: 'win-final-audit', disbursedAmount: 87000n });
      prismaMock.subscriberTicket.update.mockResolvedValue({ id: mockTicketId, isPrized: true });
      prismaMock.chitGroup.update.mockResolvedValue({ id: mockChitGroup.id, status: 'COMPLETED' });
      prismaMock.auditLog.create.mockClear();

      const res = await disbursementService.settleFinalMonth(
        mockChitGroup.id,
        {
          ticketId: mockTicketId,
          disbursementMode: DisbursementMode.CASH,
          paymentReference: 'CASH-FINAL-001',
          makerUserId: mockMakerId,
        },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      // 100,000 - 4,000 commission - 5,000 Month 20 - 4,000 Month 19 prior arrears = 87,000
      expect(res.settlement.netPrizeMoney).toBe(87000);
      const offsetAuditCalls = prismaMock.auditLog.create.mock.calls.filter(
        ([arg]: any) => arg.data?.action === 'PRIZE_ARREARS_OFFSET_ALLOCATED',
      );
      expect(offsetAuditCalls.length).toBe(2); // Month 20 offset + Month 19 prior arrears offset
    });

    it('DISB-06: approveFinalSettlement rejects via FIN-D TOCTOU guard if arrears changed after preparation', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({ ...mockChitGroup, status: 'ACTIVE' });
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-prep-20',
        installmentMonth: 20,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockMakerId,
        winner: {
          id: 'win-prep-20',
          ticketId: mockTicketId,
          disbursementStatus: 'VERIFIED_BY_MAKER',
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          disbursedAmount: 86000n, // Prepared with ₹5,000 prior arrears
          verifiedByUserId: mockMakerId,
          paymentReference: 'CHQ-TOCTOU-20',
        },
      });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId,
        chitGroupId: mockChitGroup.id,
        ticketNumber: 20,
        isPrized: false,
        status: 'ACTIVE',
        customer: mockCustomer,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(1);
      // Meanwhile subscriber paid prior arrears -> current arrears = 0 -> net would be 91,000 != 86,000!
      prismaMock.installmentDue.findMany.mockResolvedValue([]);

      await expect(
        disbursementService.approveFinalSettlement(
          mockChitGroup.id,
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/ARREARS_STATE_CHANGED/i);
    });

    it('DISB-07 & DISB-08: preserves previously uploaded securityDocS3Key, rejects property deeds & cross-auction keys, and renders arrears & issuedAt on bilingual voucher', async () => {
      // Rejects property deed (ADR-15 / Guardrail 9)
      await expect(
        disbursementService.verifySafetyProof(
          mockAuctionId,
          {
            isSecurityRequired: true,
            securityType: 'PROPERTY_DEED',
            agreementSigned: true,
            nomineeSigned: true,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/INVALID_SECURITY_TYPE/i);

      // Rejects cross-auction S3 key injection
      await expect(
        disbursementService.verifySafetyProof(
          mockAuctionId,
          {
            isSecurityRequired: true,
            securityType: 'BLANK_CHEQUE',
            agreementSigned: true,
            nomineeSigned: true,
            securityDocS3Key: 'kyc/other-customer/aadhaar.jpg',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/Invalid storage key prefix/i);

      // Preserves existing uploaded securityDocS3Key when omitted in verifySafetyProof
      const existingKey = `safety-proof/${mockAuctionId}/abcd-cheque.jpg`;
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: { ...mockWinner, securityDocS3Key: existingKey },
      });
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockWinner,
        securityDocS3Key: existingKey,
        disbursementStatus: 'VERIFIED_BY_MAKER',
      });

      await disbursementService.verifySafetyProof(
        mockAuctionId,
        {
          isSecurityRequired: true,
          securityType: 'BLANK_CHEQUE',
          agreementSigned: true,
          nomineeSigned: true,
        },
        mockMakerId,
      );

      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            securityDocS3Key: existingKey,
          }),
        }),
      );

      // Bilingual voucher includes issuedAt and reconciles arrears deduction line
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: {
          ...mockWinner,
          verifiedByUserId: mockMakerId,
          authorizedByUserId: mockCheckerId,
          disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
          disbursedAmount: 65000n, // 100,000 - 25,000 discount - 10,000 arrears
          paymentReference: 'NEFT-VOU-001',
          disbursedAt: new Date('2026-10-18T11:30:00.000Z'),
          disbursementStatus: 'DISBURSED',
        },
      });
      prismaMock.user.findUnique.mockResolvedValueOnce({ name: 'Maker Staff' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ name: 'Partner B' });

      const voucher = await disbursementService.getBilingualVoucher(mockAuctionId, {
        sub: mockCheckerId,
        phone: '9842199999',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access',
      });

      expect(voucher.issuedAt).toBeInstanceOf(Date);
      expect(voucher.data.arrearsDeducted).toBe(10000n);
      expect(voucher.formattedText).toContain('நிலுவை கழிவு / Arrears & Installment Offset : - ₹ 10000');
      expect(voucher.formattedText).toContain('₹ 65000');
      expect(voucher.formattedText).toContain('Head Office - Perundurai');
    });

    it('DISB-09: persistSafetyProofLink locks AuctionWinner and blocks concurrent post-disbursement overwrite (TOCTOU)', async () => {
      const storageMock = {
        fileExists: jest.fn().mockResolvedValue(true),
      };
      prismaMock.$queryRaw = jest.fn().mockResolvedValue([
        { id: mockWinner.id, disbursementStatus: 'DISBURSED' },
      ]);
      const serviceWithStorage = new DisbursementService(
        prismaMock as unknown as PrismaService,
        storageMock as any,
      );

      // Pre-check sees PENDING_VERIFICATION, but locked row inside TX reveals concurrent DISBURSED
      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);

      await expect(
        serviceWithStorage.confirmSafetyProof(
          mockAuctionId,
          {
            key: `safety-proof/${mockAuctionId}/abcd-race.jpg`,
            fileName: 'race.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 120_000,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/already been disbursed/i);

      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(prismaMock.auctionWinner.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    });

    it('DISB-10: enforces frozen commission rate bounds (0 < rate <= 25%) and returns normalized paymentReference in settleFinalMonth', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId,
        chitGroupId: mockChitGroup.id,
        ticketNumber: 20,
        isPrized: false,
        status: 'ACTIVE',
        customer: mockCustomer,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(1);

      // Reject 0% rate
      prismaMock.chitGroup.findUnique.mockResolvedValueOnce({
        ...mockChitGroup,
        status: 'ACTIVE',
        foremanCommissionRate: new Prisma.Decimal('0.00'),
      });
      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.CASH,
            makerUserId: mockMakerId,
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/INVALID_COMMISSION_RATE/i);

      // Reject > 25% rate
      prismaMock.chitGroup.findUnique.mockResolvedValueOnce({
        ...mockChitGroup,
        status: 'ACTIVE',
        foremanCommissionRate: new Prisma.Decimal('26.00'),
      });
      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.CASH,
            makerUserId: mockMakerId,
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/INVALID_COMMISSION_RATE/i);

      // Returns trimmed/normalized paymentReference (defaults to FINAL_SETTLEMENT_MONTH_N when omitted)
      prismaMock.chitGroup.findUnique.mockResolvedValueOnce({
        ...mockChitGroup,
        status: 'ACTIVE',
      });
      prismaMock.auction.create.mockResolvedValue({ id: 'auc-norm-ref', installmentMonth: 20 });
      prismaMock.auctionWinner.create.mockResolvedValue({ id: 'win-norm-ref', disbursedAmount: 91000n });
      prismaMock.subscriberTicket.update.mockResolvedValue({ id: mockTicketId, isPrized: true });
      prismaMock.chitGroup.update.mockResolvedValue({ id: mockChitGroup.id, status: 'COMPLETED' });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-norm-ref' });

      const settled = await disbursementService.settleFinalMonth(
        mockChitGroup.id,
        {
          ticketId: mockTicketId,
          disbursementMode: DisbursementMode.CASH,
          paymentReference: '   ',
          makerUserId: mockMakerId,
        },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      expect(settled.settlement.paymentReference).toBe('FINAL_SETTLEMENT_MONTH_N');
    });
  });

  describe('8. Module 6 Round-3 Cross-Review Remediations (CR-DISB-01..08)', () => {
    it('CR-DISB-01: blocks authorizePayout and releasePayout on SCHEDULED auctions and Month 1 / Month N records', async () => {
      // Stage-1 Month N prepared settlement has status SCHEDULED and installmentMonth === durationMonths
      const monthNPreparedAuction = {
        ...mockAuction,
        installmentMonth: 20,
        status: AuctionStatus.SCHEDULED,
        winner: {
          ...mockWinner,
          verifiedByUserId: mockMakerId,
          disbursementStatus: 'VERIFIED_BY_MAKER',
        },
      };
      prismaMock.auction.findUnique.mockResolvedValueOnce(monthNPreparedAuction);

      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/AUCTION_NOT_FINALIZED/i);

      // Completed Month 20 (Month N) cannot use auction authorizePayout
      prismaMock.auction.findUnique.mockResolvedValueOnce({
        ...monthNPreparedAuction,
        status: AuctionStatus.COMPLETED,
      });
      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/INVALID_PAYOUT_MONTH/i);

      // Month 1 cannot use releasePayout
      prismaMock.auction.findUnique.mockResolvedValueOnce({
        ...mockAuction,
        installmentMonth: 1,
        status: AuctionStatus.COMPLETED,
        winner: {
          ...mockWinner,
          verifiedByUserId: mockMakerId,
          authorizedByUserId: mockCheckerId,
          disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        },
      });
      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'CHQ-M1-001' },
          mockDisburserId,
        ),
      ).rejects.toThrow(/INVALID_PAYOUT_MONTH/i);
    });

    it('CR-DISB-02: strict 2-stage settleFinalMonth rejects missing Stage-1 prepared record even with spoofed makerUserId and enforces DB maker != checker under lock', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({ ...mockChitGroup, status: 'ACTIVE' });
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: mockTicketId,
        chitGroupId: mockChitGroup.id,
        ticketNumber: 20,
        isPrized: false,
        status: 'ACTIVE',
        customer: mockCustomer,
      });
      prismaMock.subscriberTicket.count.mockResolvedValue(1);
      // No Stage-1 prepared auction in DB!
      prismaMock.auction.findUnique.mockResolvedValue(null);

      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            paymentReference: 'CHQ-SPOOF-001',
            makerUserId: mockMakerId, // Forged client makerUserId!
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
          { requirePreparedSettlement: true },
        ),
      ).rejects.toThrow(/PREPARED_SETTLEMENT_REQUIRED/i);

      // Stage-1 prepared by mockCheckerId themselves -> rejected even if DTO passes different makerUserId!
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-prep-self',
        installmentMonth: 20,
        status: AuctionStatus.SCHEDULED,
        conductedByUserId: mockCheckerId,
        winner: {
          id: 'win-prep-self',
          ticketId: mockTicketId,
          disbursementStatus: 'VERIFIED_BY_MAKER',
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          disbursedAmount: 91000n,
          verifiedByUserId: mockCheckerId,
          paymentReference: 'CHQ-SELF-001',
        },
      });

      await expect(
        disbursementService.settleFinalMonth(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            paymentReference: 'CHQ-SELF-001',
            makerUserId: mockMakerId, // Attempt to spoof different maker!
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
          { requirePreparedSettlement: true },
        ),
      ).rejects.toThrow(/MAKER_CHECKER_VIOLATION/i);
    });

    it('CR-DISB-03: authorizePayout locks Auction -> AuctionWinner -> SubscriberTicket -> InstallmentDue in DAG order, reloads fresh in-TX prizeMoney, and fails closed on null prizeMoney', async () => {
      const lockOrder: string[] = [];
      prismaMock.$queryRaw = jest.fn().mockImplementation(async (q: any) => {
        const sql = Array.isArray(q) ? q.join('') : String(q);
        if (sql.includes('"AuctionWinner"')) {
          lockOrder.push('AuctionWinner');
          return [{ id: mockWinner.id, disbursementStatus: 'VERIFIED_BY_MAKER' }];
        }
        if (sql.includes('"Auction"')) {
          lockOrder.push('Auction');
          return [{ id: mockAuctionId, status: AuctionStatus.COMPLETED }];
        }
        if (sql.includes('"SubscriberTicket"')) {
          lockOrder.push('SubscriberTicket');
          return [{ id: mockTicketId, status: 'ACTIVE', isPrized: true }];
        }
        if (sql.includes('"InstallmentDue"')) {
          lockOrder.push('InstallmentDue');
          return [];
        }
        return [];
      });

      // Pre-TX snapshot has stale 80000n; inside-TX reload returns corrected 76000n!
      prismaMock.auction.findUnique
        .mockResolvedValueOnce({
          ...mockAuction,
          prizeMoney: 80000n,
          winner: {
            ...mockWinner,
            verifiedByUserId: mockMakerId,
            disbursementStatus: 'VERIFIED_BY_MAKER',
          },
        })
        .mockResolvedValueOnce({
          ...mockAuction,
          prizeMoney: 76000n,
        });
      prismaMock.auctionWinner.update.mockResolvedValue({
        ...mockWinner,
        disbursedAmount: 76000n,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      });

      await disbursementService.authorizePayout(
        mockAuctionId,
        { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
        mockCheckerId,
        [Role.SUPER_ADMIN],
      );

      expect(lockOrder).toEqual([
        'Auction',
        'AuctionWinner',
        'SubscriberTicket',
        'InstallmentDue',
      ]);
      expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ disbursedAmount: 76000n }),
        }),
      );

      // Fail closed on prizeMoney === null (no longer passes through as 0n)
      prismaMock.auction.findUnique
        .mockResolvedValueOnce({
          ...mockAuction,
          prizeMoney: null,
          winner: {
            ...mockWinner,
            verifiedByUserId: mockMakerId,
            disbursementStatus: 'VERIFIED_BY_MAKER',
          },
        })
        .mockResolvedValueOnce({
          ...mockAuction,
          prizeMoney: null,
        });

      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          { disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/INVALID_PRIZE_MONEY/i);
    });

    it('CR-DISB-04: getWinnerDisbursement queries Customer with explicit safe allowlist (never customer: true)', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);

      await disbursementService.getWinnerDisbursement(mockAuctionId, {
        sub: mockCheckerId,
        phone: '9876543211',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access',
      });

      const queryArgs = prismaMock.auction.findUnique.mock.calls[0][0];
      const customerQuery = queryArgs.include.winner.include.ticket.include.customer;
      expect(customerQuery).toHaveProperty('select');
      expect(customerQuery.select).not.toHaveProperty('refreshTokenHash');
      expect(customerQuery.select).not.toHaveProperty('fcmToken');
      expect(customerQuery.select).not.toHaveProperty('tokenRevokedBefore');
      expect(customerQuery.select).not.toHaveProperty('panNumber');
    });

    it('CR-DISB-05: rejects reserved system placeholders in releasePayout & Month N settlement and checks non-cash UTR case-insensitively', async () => {
      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'COMPANY_POOL_MONTH_1' },
          mockDisburserId,
        ),
      ).rejects.toThrow(/INVALID_PAYMENT_REFERENCE/i);

      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'final_settlement_month_n' },
          mockDisburserId,
        ),
      ).rejects.toThrow(/INVALID_PAYMENT_REFERENCE/i);

      await expect(
        disbursementService.prepareFinalSettlement(
          mockChitGroup.id,
          {
            ticketId: mockTicketId,
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            paymentReference: 'company_pool_month_1',
          },
          mockMakerId,
          [Role.ACCOUNTANT],
        ),
      ).rejects.toThrow(/INVALID_PAYMENT_REFERENCE/i);

      // Case-insensitive duplicate non-cash UTR check
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: {
          ...mockWinner,
          verifiedByUserId: mockMakerId,
          authorizedByUserId: mockCheckerId,
          disbursementMode: DisbursementMode.BANK_TRANSFER_NEFT,
          disbursedAmount: 75000n,
          disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        },
      });
      prismaMock.auctionWinner.findFirst = jest.fn().mockResolvedValue({
        id: 'other-winner-ci',
        auctionId: 'other-auction-ci',
      });

      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          { paymentReference: 'neft-dup-ci-001' },
          mockDisburserId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.auctionWinner.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentReference: { equals: 'neft-dup-ci-001', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('CR-DISB-06: prepareFinalSettlement fails closed when BRANCH_MANAGER JwtPayload has branchId: undefined', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({ ...mockChitGroup, status: 'ACTIVE' });

      const branchlessBm = {
        sub: 'bm-no-branch',
        phone: '9842100099',
        roles: [Role.BRANCH_MANAGER],
        branchId: undefined as any,
        tokenType: 'access' as const,
      };

      await expect(
        disbursementService.prepareFinalSettlement(
          mockChitGroup.id,
          { ticketId: mockTicketId, disbursementMode: DisbursementMode.CASH },
          branchlessBm.sub,
          branchlessBm.roles,
          branchlessBm,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('CR-DISB-07: verifySafetyProof checks storageService.fileExists for supplied key and uploadSafetyProof strips ".." from filenames', async () => {
      const storageMock = {
        fileExists: jest.fn().mockResolvedValue(false),
        uploadFile: jest.fn().mockResolvedValue({ key: 'ok' }),
      };
      const serviceWithStorage = new DisbursementService(
        prismaMock as unknown as PrismaService,
        storageMock as any,
      );

      await expect(
        serviceWithStorage.verifySafetyProof(
          mockAuctionId,
          {
            isSecurityRequired: true,
            securityType: 'BLANK_CHEQUE',
            agreementSigned: true,
            nomineeSigned: true,
            securityDocS3Key: `safety-proof/${mockAuctionId}/nonexistent.jpg`,
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/not found in storage/i);
      expect(storageMock.fileExists).toHaveBeenCalledWith(
        `safety-proof/${mockAuctionId}/nonexistent.jpg`,
      );

      // Filename containing ".." is sanitized safely without traversal segments
      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);
      prismaMock.auctionWinner.update.mockResolvedValue({ ...mockWinner });
      prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-sp-upload' });

      const uploaded = await serviceWithStorage.uploadSafetyProof(
        mockAuctionId,
        {
          originalname: '../../evil..cheque..scan.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('img'),
        },
        mockMakerId,
      );
      expect(uploaded.securityDocS3Key).not.toContain('..');
      expect(uploaded.securityDocS3Key).toMatch(new RegExp(`^safety-proofs/${mockAuctionId}/`));
    });

    it('CR-DISB-08: voucherNumber includes chitGroup.groupCode and releasePayout honors idempotencyKey retry replay', async () => {
      // 1. Cross-group unique voucherNumber includes groupCode
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: {
          ...mockWinner,
          verifiedByUserId: mockMakerId,
          authorizedByUserId: mockCheckerId,
          disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
          disbursedAmount: 75000n,
          paymentReference: 'CHQ-VOU-UNIQUE',
          disbursedAt: new Date('2026-10-18T11:30:00.000Z'),
          disbursementStatus: 'DISBURSED',
        },
      });
      prismaMock.user.findUnique.mockResolvedValueOnce({ name: 'Maker A' });
      prismaMock.user.findUnique.mockResolvedValueOnce({ name: 'Partner B' });

      const voucher = await disbursementService.getBilingualVoucher(mockAuctionId, {
        sub: mockCheckerId,
        phone: '9876543211',
        roles: [Role.SUPER_ADMIN],
        branchId: mockBranchId,
        tokenType: 'access',
      });
      expect(voucher.voucherNumber).toBe('KC-VOU-PRD-2026-KCA-1L-20M-01-00004');

      // 2. releasePayout idempotent replay with matching idempotencyKey
      const alreadyDisbursedWinner = {
        ...mockWinner,
        verifiedByUserId: mockMakerId,
        authorizedByUserId: mockCheckerId,
        disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
        disbursedAmount: 75000n,
        paymentReference: 'CHQ-IDEMP-001',
        disbursementStatus: 'DISBURSED',
      };
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: alreadyDisbursedWinner,
      });
      prismaMock.auditLog.findFirst = jest.fn().mockResolvedValue({
        id: 'audit-disb-1',
        newValue: { idempotencyKey: 'idem-release-uuid-001' },
      });

      const replay = await disbursementService.releasePayout(
        mockAuctionId,
        {
          paymentReference: 'CHQ-IDEMP-001',
          idempotencyKey: 'idem-release-uuid-001',
        },
        mockDisburserId,
      );
      expect((replay as any).idempotentReplay).toBe(true);
      expect(replay.winner.paymentReference).toBe('CHQ-IDEMP-001');
      expect(prismaMock.auctionWinner.update).not.toHaveBeenCalled();
    });
  });

  describe('9. Module 9 Forensic Dual-Control Remediation Proofs (M9-DUAL-DEF-02)', () => {
    it('M9-DUAL-DEF-02: verifySafetyProof, authorizePayout, and releasePayout reject with PENDING_CORRECTION_LOCKOUT when an auction correction request is pending partner review', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(mockAuction);
      prismaMock.auctionWinner.findUnique = jest.fn().mockResolvedValue(mockWinner);

      // Mock an active AUCTION_CORRECTION_REQUESTED with no resolution
      prismaMock.auditLog.findFirst = jest.fn().mockImplementation(({ where }: any) => {
        if (where?.action === 'AUCTION_CORRECTION_REQUESTED') {
          return Promise.resolve({
            id: 'audit-corr-req-1',
            action: 'AUCTION_CORRECTION_REQUESTED',
            timestamp: new Date(),
          });
        }
        if (where?.action?.in?.includes('AUCTION_CORRECTION_APPROVED')) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      // 1. verifySafetyProof
      await expect(
        disbursementService.verifySafetyProof(
          mockAuctionId,
          {
            isSecurityRequired: true,
            securityType: 'BLANK_CHEQUE',
            blankChequeDetails: 'SBI Cheque #004512',
            agreementSigned: true,
            nomineeSigned: true,
            notes: 'Customer verified at branch counter',
          },
          mockMakerId,
        ),
      ).rejects.toThrow(/PENDING_CORRECTION_LOCKOUT/i);

      // 2. authorizePayout
      const verifiedWinner = {
        ...mockWinner,
        disbursementStatus: 'VERIFIED_BY_MAKER',
        verifiedByUserId: mockMakerId,
      };
      prismaMock.auctionWinner.findUnique = jest.fn().mockResolvedValue(verifiedWinner);
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: verifiedWinner,
      });

      await expect(
        disbursementService.authorizePayout(
          mockAuctionId,
          {
            disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
            disbursedAmount: 75000,
          },
          mockCheckerId,
          [Role.SUPER_ADMIN],
        ),
      ).rejects.toThrow(/PENDING_CORRECTION_LOCKOUT/i);

      // 3. releasePayout
      const authorizedWinner = {
        ...mockWinner,
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
        verifiedByUserId: mockMakerId,
        authorizedByUserId: mockCheckerId,
        disbursedAmount: 75000n,
        disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
      };
      prismaMock.auctionWinner.findUnique = jest.fn().mockResolvedValue(authorizedWinner);
      prismaMock.auction.findUnique.mockResolvedValue({
        ...mockAuction,
        winner: authorizedWinner,
      });

      await expect(
        disbursementService.releasePayout(
          mockAuctionId,
          {
            paymentReference: 'CHQ-RELEASE-999',
            idempotencyKey: 'idem-new-001',
          },
          mockDisburserId,
        ),
      ).rejects.toThrow(/PENDING_CORRECTION_LOCKOUT/i);
    });
  });
});
