import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuctionStatus, DisbursementMode, DueStatus, Role } from '@prisma/client';
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
});
