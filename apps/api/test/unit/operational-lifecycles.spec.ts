import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ChitStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';
import { ChitService } from '../../src/chit/chit.service';
import { CustomerService } from '../../src/customer/customer.service';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { InstallmentService } from '../../src/installment/installment.service';
import { UserService } from '../../src/user/user.service';

describe('Operational Lifecycles & Maintenance Workflows', () => {
  let authService: AuthService;
  let userService: UserService;
  let disbursementService: DisbursementService;
  let installmentService: InstallmentService;
  let chitService: ChitService;
  let customerService: CustomerService;

  let mockPrisma: any;
  let mockStorageService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockSmsService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
      },
      customerDocument: {
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      auction: {
        findUnique: jest.fn(),
      },
      auctionWinner: {
        update: jest.fn(),
      },
      subscriberTicket: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      paymentAllocation: {
        findMany: jest.fn(),
      },
      chitGroup: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockStorageService = {
      uploadFile: jest.fn().mockResolvedValue({ key: 'test-key', url: 'https://s3/test-key' }),
      getPresignedUrl: jest.fn().mockResolvedValue('https://s3/presigned-url-15m'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
      verify: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('15m'),
    };

    mockSmsService = {
      sendOtpSms: jest.fn().mockResolvedValue(true),
    };

    authService = new AuthService(
      mockPrisma,
      mockJwtService,
      mockConfigService,
      mockSmsService,
    );

    userService = new UserService(mockPrisma);

    disbursementService = new DisbursementService(
      mockPrisma,
      mockStorageService,
    );

    installmentService = new InstallmentService(mockPrisma);

    chitService = new ChitService(mockPrisma);

    customerService = new CustomerService(mockPrisma, mockStorageService);
  });

  // =========================================================================
  // Cluster 1: Auth & User Security
  // =========================================================================
  describe('Cluster 1: Everyday Login & Credential Security', () => {
    it('1. GET /auth/me: resolves customer profile when caller is a subscriber', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'cust-101',
        customerCode: 'KC-CUST-00101',
        fullName: 'Murugan K',
        fullNameTamil: 'முருகன் கே',
        phone: '9842199999',
        branchId: 'branch-1',
        isKycVerified: true,
        branch: { id: 'branch-1', code: 'PRD', name: 'Perundurai', nameTamil: 'பெருந்துறை' },
      });

      const profile = await authService.getProfile('cust-101');

      expect(profile).toBeDefined();
      expect(profile.id).toBe('cust-101');
      expect(profile.customerCode).toBe('KC-CUST-00101');
      expect(profile.roles).toEqual([Role.CUSTOMER]);
      expect(profile.branch?.code).toBe('PRD');
    });

    it('2. POST /auth/change-password: staff updates password and revokes active sessions', async () => {
      const oldHash = await bcrypt.hash('OldPass@123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'staff-1',
        passwordHash: oldHash,
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'staff-1' });

      const res = await authService.changePassword('staff-1', {
        currentPassword: 'OldPass@123',
        newPassword: 'NewSecurePass@2026',
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'staff-1' },
          data: expect.objectContaining({
            refreshTokenHash: null,
          }),
        }),
      );
    });

    it('2b. POST /auth/change-password: rejects with 401 on incorrect current password', async () => {
      const oldHash = await bcrypt.hash('CorrectPass@123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'staff-1',
        passwordHash: oldHash,
      });

      await expect(
        authService.changePassword('staff-1', {
          currentPassword: 'WrongPassword@123',
          newPassword: 'NewSecurePass@2026',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('3. POST /users/:id/reset-password: Super Admin resets staff credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'staff-agent-1',
        name: 'Agent Senthil',
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'staff-agent-1' });

      const res = await userService.resetPassword(
        'staff-agent-1',
        { temporaryPassword: 'TempPassword#2026' },
        'admin-user-1',
      );

      expect(res.success).toBe(true);
      expect(res.temporaryPassword).toBe('TempPassword#2026');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'staff-agent-1' },
          data: expect.objectContaining({
            refreshTokenHash: null,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Cluster 2: Prize Safety Proofs
  // =========================================================================
  describe('Cluster 2: Prize Safety Proof Upload & Verification', () => {
    it('4. POST /disbursements/auction/:id/upload-safety-proof: uploads cheque photos to S3', async () => {
      mockPrisma.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        winner: { id: 'winner-1' },
      });
      mockPrisma.auctionWinner.update.mockResolvedValue({ id: 'winner-1' });

      const mockFile = {
        originalname: 'signed_blank_cheque.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 500,
        buffer: Buffer.from('test-image-content'),
      };

      const res = await disbursementService.uploadSafetyProof(
        'auction-1',
        mockFile,
        'maker-staff-1',
      );

      expect(res.success).toBe(true);
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(mockPrisma.auctionWinner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'winner-1' },
          data: expect.objectContaining({
            securityDocS3Key: expect.stringContaining('safety-proofs/auction-1/'),
          }),
        }),
      );
    });

    it('5. GET /disbursements/auction/:id/safety-proof-url: generates 15-minute viewing URL', async () => {
      mockPrisma.auction.findUnique.mockResolvedValue({
        id: 'auction-1',
        winner: { id: 'winner-1', securityDocS3Key: 'safety-proofs/auction-1/cheque.jpg' },
      });

      const res = await disbursementService.getSafetyProofPresignedUrl('auction-1');

      expect(res.url).toBe('https://s3/presigned-url-15m');
      expect(res.expiresInSeconds).toBe(900);
      expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith(
        'safety-proofs/auction-1/cheque.jpg',
        900,
      );
    });
  });

  // =========================================================================
  // Cluster 3: Defaulter Substitution & Exit Settlement
  // =========================================================================
  describe('Cluster 3: 3-Month Defaulter Substitution & Exit Settlement', () => {
    it('6. POST /tickets/:id/substitute: assigns verified replacement customer to REMOVED_DEF_3M ticket', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        roles: [Role.PARTNER],
        isActive: true,
      });
      mockPrisma.subscriberTicket.findUnique
        .mockResolvedValueOnce({
          id: 'ticket-5',
          chitGroupId: 'chit-1',
          ticketNumber: 5,
          customerId: 'old-cust-1',
          status: 'REMOVED_DEF_3M',
          customer: { fullName: 'Old Defaulted Customer' },
          chitGroup: { groupCode: 'KCA-1L-20M-01' },
        })
        .mockResolvedValueOnce(null); // No existing ticket for new customer in this group

      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'new-cust-2',
        fullName: 'Ravi Kumar',
        isKycVerified: true,
      });

      mockPrisma.subscriberTicket.update.mockResolvedValue({
        id: 'ticket-5',
        ticketNumber: 5,
        status: 'ACTIVE',
        customer: { id: 'new-cust-2', fullName: 'Ravi Kumar' },
        chitGroup: { groupCode: 'KCA-1L-20M-01' },
      });

      const res = await installmentService.substituteSubscriber(
        'ticket-5',
        'admin-1',
        { newCustomerId: 'new-cust-2', reason: 'Replacement member' },
      );

      expect(res.success).toBe(true);
      expect(res.ticket.status).toBe('ACTIVE');
      expect(res.ticket.newCustomerName).toBe('Ravi Kumar');
    });

    it('6b. POST /tickets/:id/substitute: enforces ADR-13 single ticket rule', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        roles: [Role.PARTNER],
        isActive: true,
      });
      mockPrisma.subscriberTicket.findUnique
        .mockResolvedValueOnce({
          id: 'ticket-5',
          chitGroupId: 'chit-1',
          status: 'REMOVED_DEF_3M',
          customer: { fullName: 'Old Customer' },
          chitGroup: { groupCode: 'KCA-1L-20M-01' },
        })
        .mockResolvedValueOnce({ id: 'existing-ticket-10', ticketNumber: 10 }); // Customer already has Ticket #10

      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'new-cust-2',
        fullName: 'Ravi Kumar',
        isKycVerified: true,
      });

      await expect(
        installmentService.substituteSubscriber('ticket-5', 'admin-1', {
          newCustomerId: 'new-cust-2',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('7. POST /tickets/:id/settle-removal: calculates refund = Total Paid - 4% Damages', async () => {
      mockPrisma.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-5',
        ticketNumber: 5,
        status: 'REMOVED_DEF_3M',
        customer: { fullName: 'Defaulted Member' },
        chitGroup: { groupCode: 'KCA-1L-20M-01', chitValue: 100000n }, // ₹1 Lakh chit -> 4% damages = ₹4,000
      });

      // Customer paid Month 1 (₹5,000) and Month 2 (₹4,500) = ₹9,500 total
      mockPrisma.paymentAllocation.findMany.mockResolvedValue([
        { amountAllocated: 5000n },
        { amountAllocated: 4500n },
      ]);

      // FIN-F / Q25: Early exit settlement formula is pending board resolution. Fails closed.
      await expect(
        installmentService.settleRemoval('ticket-5', 'admin-1', {
          paymentMethod: 'CASH' as any,
          notes: 'Exit voucher issued',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'UNAPPROVED_SETTLEMENT_POLICY: Early exit and defaulter settlement formula (Q25) is pending formal Partner Board resolution and statutory legal validation. Automated settlement payout execution is strictly locked fail-closed.',
        ),
      );
    });
  });

  // =========================================================================
  // Cluster 4: Scheme Maintenance & KYC Data Hygiene
  // =========================================================================
  describe('Cluster 4: Scheme Maintenance & KYC Data Hygiene', () => {
    it('8. PATCH /chits/:id: updates draft scheme parameters', async () => {
      mockPrisma.chitGroup.findUnique.mockResolvedValue({
        id: 'chit-draft-1',
        status: ChitStatus.DRAFT,
      });
      mockPrisma.chitGroup.update.mockResolvedValue({
        id: 'chit-draft-1',
        groupName: '₹1 Lakh 20 Months Group B',
        status: ChitStatus.DRAFT,
        branch: { id: 'branch-1', code: 'PRD', name: 'Perundurai' },
      });

      const updated = await chitService.update(
        'chit-draft-1',
        { groupName: '₹1 Lakh 20 Months Group B' },
        'admin-1',
      );

      expect(updated.groupName).toBe('₹1 Lakh 20 Months Group B');
    });

    it('8b. PATCH /chits/:id: rejects update if scheme is already ACTIVE', async () => {
      mockPrisma.chitGroup.findUnique.mockResolvedValue({
        id: 'chit-active-1',
        status: ChitStatus.ACTIVE,
      });

      await expect(
        chitService.update(
          'chit-active-1',
          { groupName: 'Attempted Change' },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('9. DELETE /chits/:id/tickets/:ticketNumber: unassigns ticket in DRAFT status', async () => {
      mockPrisma.chitGroup.findUnique.mockResolvedValue({
        id: 'chit-draft-1',
        status: ChitStatus.DRAFT,
      });
      mockPrisma.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-uuid-3',
        ticketNumber: 3,
        customerId: 'cust-3',
        customer: { fullName: 'Misallocated Customer' },
      });
      mockPrisma.subscriberTicket.delete.mockResolvedValue({ id: 'ticket-uuid-3' });

      const res = await chitService.unassignTicket('chit-draft-1', 3, 'staff-1');

      expect(res.success).toBe(true);
      expect(mockPrisma.subscriberTicket.delete).toHaveBeenCalledWith({
        where: { id: 'ticket-uuid-3' },
      });
    });

    it('10. DELETE /customers/:id/documents/:docId: deletes KYC scan from S3 and DB', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockPrisma.customerDocument.findFirst.mockResolvedValue({
        id: 'doc-1',
        customerId: 'cust-1',
        fileName: 'blurry_aadhaar.jpg',
        s3Key: 'kyc/cust-1/blurry_aadhaar.jpg',
        verified: false,
      });
      mockPrisma.customerDocument.delete.mockResolvedValue({ id: 'doc-1' });

      const res = await customerService.deleteDocument('cust-1', 'doc-1', {
        sub: 'cust-1',
        roles: [Role.CUSTOMER],
      });

      expect(res.success).toBe(true);
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith('kyc/cust-1/blurry_aadhaar.jpg');
      expect(mockPrisma.customerDocument.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });

    it('10b. DELETE /customers/:id/documents/:docId: blocks non-admin from deleting verified document', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockPrisma.customerDocument.findFirst.mockResolvedValue({
        id: 'doc-1',
        customerId: 'cust-1',
        fileName: 'verified_pan.jpg',
        s3Key: 'kyc/cust-1/verified_pan.jpg',
        verified: true,
      });

      await expect(
        customerService.deleteDocument('cust-1', 'doc-1', {
          sub: 'cust-1',
          roles: [Role.CUSTOMER],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
