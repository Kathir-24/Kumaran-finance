import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuctionStatus, DisbursementMode, Role } from '@prisma/client';
import { JwtPayload } from '../src/auth/interfaces/jwt-payload.interface';
import { DisbursementService } from '../src/disbursement/disbursement.service';
import { PrismaService } from '../src/prisma/prisma.service';

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
      auction: {
        findUnique: jest.fn(),
      },
      auctionWinner: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    disbursementService = new DisbursementService(
      prismaMock as unknown as PrismaService,
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
        email: 'partner@kumaran.com',
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
        email: null,
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
        email: null,
        roles: [Role.SUPER_ADMIN],
        branchId: null,
        tokenType: 'access',
      };

      await expect(
        disbursementService.getWinnerDisbursement('non-existent-id', staffUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
