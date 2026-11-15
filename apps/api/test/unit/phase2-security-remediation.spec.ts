import { DueStatus, Role } from '@prisma/client';
import { DisbursementService } from '../../src/disbursement/disbursement.service';
import { DocumentAccessHelper } from '../../src/storage/helpers/document-access.helper';
import { CustomerService } from '../../src/customer/customer.service';
import { ChitService } from '../../src/chit/chit.service';
import { AuctionService } from '../../src/auction/auction.service';
import { CollectionService } from '../../src/collection/collection.service';
import { PaymentService } from '../../src/payment/payment.service';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';

describe('Phase 2 Security Remediation: Adversarial Verification (F05, F06, F07, F08, F09, F12)', () => {
  // Common Mock User Payloads
  const superAdminPartner: JwtPayload = {
    sub: 'user-partner-001',
    phone: '+919876543210',
    roles: [Role.SUPER_ADMIN],
    branchId: 'branch-prd-001',
    tokenType: 'access' as const,
  };

  const superAdminNonPartner: JwtPayload = {
    sub: 'user-admin-it-001',
    phone: '+919876543211',
    roles: [Role.SUPER_ADMIN],
    branchId: 'branch-prd-001',
    tokenType: 'access' as const,
  };

  const branchManagerPrd: JwtPayload = {
    sub: 'user-bm-prd-001',
    phone: '+919876543212',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-prd-001',
    tokenType: 'access' as const,
  };

  const branchManagerErd: JwtPayload = {
    sub: 'user-bm-erd-001',
    phone: '+919876543213',
    roles: [Role.BRANCH_MANAGER],
    branchId: 'branch-erd-002',
    tokenType: 'access' as const,
  };

  const collectionAgentPrd: JwtPayload = {
    sub: 'user-agent-prd-001',
    phone: '+919876543214',
    roles: [Role.COLLECTION_AGENT],
    branchId: 'branch-prd-001',
    tokenType: 'access' as const,
  };

  const collectionAgentErd: JwtPayload = {
    sub: 'user-agent-erd-001',
    phone: '+919876543215',
    roles: [Role.COLLECTION_AGENT],
    branchId: 'branch-erd-002',
    tokenType: 'access' as const,
  };

  const customerAlice: JwtPayload = {
    sub: 'cust-alice-001',
    phone: '+919443322110',
    roles: [Role.CUSTOMER],
    branchId: null,
    tokenType: 'access' as const,
  };

  const customerBob: JwtPayload = {
    sub: 'cust-bob-002',
    phone: '+919443322111',
    roles: [Role.CUSTOMER],
    branchId: null,
    tokenType: 'access' as const,
  };

  // ============================================================================
  // F05: Month N Final Settlement Maker-Checker Dual-Control
  // ============================================================================
  describe('F05: Month N Settlement Maker-Checker Dual-Control (ADR-10 & ADR-21)', () => {
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
          findMany: jest.fn(),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(1),
        },
        auction: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        auctionWinner: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          upsert: jest.fn().mockResolvedValue({ id: 'win-final-001' }),
        },
        payment: {
          create: jest.fn(),
        },
        auditLog: {
          create: jest.fn(),
        },
        user: {
          findUnique: jest.fn(),
        },
        $transaction: jest.fn(async (callback: any) => {
          if (typeof callback === 'function') {
            return callback(prismaMock);
          }
          return callback;
        }),
        $queryRaw: jest.fn(),
      };

      disbursementService = new DisbursementService(
        prismaMock,
        {} as any, // storageService
        { addJob: jest.fn().mockResolvedValue({}) } as any, // bullMqQueue
        {
          getClient: jest.fn().mockReturnValue(null),
          getIsConnected: jest.fn().mockReturnValue(false),
        } as any, // redisConnection
      );
    });

    it('F05-1: prepareFinalSettlement creates pending settlement record with conductedByUserId = makerUserId', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        groupCode: 'KCA-1L-20M',
        chitValue: BigInt(100000),
        durationMonths: 20,
        baseInstallment: BigInt(5000),
        monthlyContribution: BigInt(5000),
        foremanCommissionPercent: 4.0,
        status: 'ACTIVE',
      });

      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-20',
        ticketNumber: 20,
        chitGroupId: 'group-001',
        isPrized: false,
        dues: [],
        customer: { fullName: 'M. Shanmugam' },
      });

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-20',
          ticketNumber: 20,
          isPrized: false,
          dues: [],
          customer: { fullName: 'M. Shanmugam' },
        },
      ]);

      prismaMock.auction.findUnique.mockResolvedValue(null);
      prismaMock.auction.create.mockResolvedValue({
        id: 'auc-final-001',
        installmentMonth: 20,
        conductedByUserId: branchManagerPrd.sub,
      });

      prismaMock.auctionWinner.findUnique.mockResolvedValue(null);
      prismaMock.auctionWinner.create.mockResolvedValue({
        id: 'win-final-001',
        disbursementStatus: 'VERIFIED_BY_MAKER',
        verifiedByUserId: branchManagerPrd.sub,
      });

      const result = await disbursementService.prepareFinalSettlement(
        'group-001',
        {
          ticketId: 'ticket-20',
          disbursementMode: 'ACCOUNT_PAYEE_CHEQUE' as any,
          paymentReference: 'CHQ-990011',
        },
        branchManagerPrd.sub,
        branchManagerPrd.roles,
      );

      expect(result.success).toBe(true);
      expect(result.settlement.preparedByUserId).toBe(branchManagerPrd.sub);
      expect(result.settlement.netPayablePrize).toBe(91000); // 100000 - 4000 (commission) - 5000 (Month N installment)
      expect(result.settlement.status).toBe('PENDING_APPROVAL');
    });

    it('F05-2: approveFinalSettlement rejects non-partner user with 403 PARTNER_IDENTITY_REQUIRED', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: superAdminNonPartner.sub,
        isPartner: false,
      });

      await expect(
        disbursementService.approveFinalSettlement(
          'group-001',
          superAdminNonPartner.sub,
          superAdminNonPartner.roles,
        ),
      ).rejects.toThrow(/PARTNER_IDENTITY_REQUIRED/i);
    });

    it('F05-3: approveFinalSettlement rejects when makerUserId === checkerUserId with 403 MAKER_CHECKER_VIOLATION', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: superAdminPartner.sub,
        isPartner: true,
      });

      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        groupCode: 'KCA-1L-20M',
        chitValue: BigInt(100000),
        durationMonths: 20,
        baseInstallment: BigInt(5000),
        monthlyContribution: BigInt(5000),
        foremanCommissionPercent: 4.0,
        status: 'ACTIVE',
      });

      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-final-001',
        installmentMonth: 20,
        conductedByUserId: superAdminPartner.sub, // SAME user who prepared it
        winner: {
          id: 'win-final-001',
          ticketId: 'ticket-20',
          verifiedByUserId: superAdminPartner.sub, // SAME user
          disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
          paymentReference: 'CHQ-990011',
        },
      });

      await expect(
        disbursementService.approveFinalSettlement(
          'group-001',
          superAdminPartner.sub, // Checker is SAME as Maker
          superAdminPartner.roles,
        ),
      ).rejects.toThrow(/MAKER_CHECKER_VIOLATION/i);
    });

    it('F05-4: approveFinalSettlement succeeds when makerUserId !== checkerUserId and checker is partner', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: superAdminPartner.sub,
        isPartner: true,
      });

      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        groupCode: 'KCA-1L-20M',
        chitValue: BigInt(100000),
        durationMonths: 20,
        baseInstallment: BigInt(5000),
        monthlyContribution: BigInt(5000),
        foremanCommissionPercent: 4.0,
        status: 'ACTIVE',
      });

      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-final-001',
        installmentMonth: 20,
        conductedByUserId: branchManagerPrd.sub, // Maker is Branch Manager
        status: 'SCHEDULED',
        winner: {
          id: 'win-final-001',
          ticketId: 'ticket-20',
          verifiedByUserId: branchManagerPrd.sub,
          disbursementMode: 'ACCOUNT_PAYEE_CHEQUE',
          paymentReference: 'CHQ-990011',
        },
      });

      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-20',
        ticketNumber: 20,
        chitGroupId: 'group-001',
        isPrized: false,
        dues: [],
        customer: { fullName: 'M. Shanmugam' },
      });

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-20',
          ticketNumber: 20,
          isPrized: false,
          dues: [],
          customer: { fullName: 'M. Shanmugam' },
        },
      ]);

      prismaMock.auction.create.mockResolvedValue({
        id: 'auc-final-001',
        chitGroupId: 'group-001',
        installmentMonth: 20,
        status: 'COMPLETED',
      });

      prismaMock.auction.update.mockResolvedValue({
        id: 'auc-final-001',
        chitGroupId: 'group-001',
        installmentMonth: 20,
        status: 'COMPLETED',
      });

      prismaMock.auctionWinner.create.mockResolvedValue({
        id: 'win-final-001',
        disbursedAmount: 91000n,
        disbursementStatus: 'DISBURSED',
      });

      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: 'ticket-20',
        isPrized: true,
      });

      prismaMock.chitGroup.update.mockResolvedValue({
        id: 'group-001',
        status: 'COMPLETED',
      });

      const result = await disbursementService.approveFinalSettlement(
        'group-001',
        superAdminPartner.sub, // Checker is Partner Super Admin
        superAdminPartner.roles,
      );

      expect(result.message).toContain('Final Month 20 maturity settlement successfully executed');
      expect(result.settlement.netPrizeMoney).toBe(91000);
      expect(prismaMock.auction.create).toHaveBeenCalled();
    });

    it('F05-5: settleFinalMonth without makerUserId throws BadRequestException MAKER_REQUIRED', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        groupCode: 'KCA-1L-20M',
        chitValue: BigInt(100000),
        durationMonths: 20,
        baseInstallment: BigInt(5000),
        monthlyContribution: BigInt(5000),
        foremanCommissionPercent: 4.0,
        status: 'ACTIVE',
      });

      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-20',
        ticketNumber: 20,
        chitGroupId: 'group-001',
        isPrized: false,
        dues: [],
        customer: { fullName: 'M. Shanmugam' },
      });

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-20',
          ticketNumber: 20,
          isPrized: false,
          dues: [],
          customer: { fullName: 'M. Shanmugam' },
        },
      ]);

      await expect(
        disbursementService.settleFinalMonth(
          'group-001',
          {
            ticketId: 'ticket-20',
            disbursementMode: 'ACCOUNT_PAYEE_CHEQUE' as any,
            paymentReference: 'CHQ-990011',
            // makerUserId omitted
          } as any,
          superAdminPartner.sub,
          superAdminPartner.roles,
        ),
      ).rejects.toThrow(/MAKER_REQUIRED/i);
    });

    it('F05-6: settleFinalMonth uses upsert on auction and winner, avoiding duplicate key crash', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        groupCode: 'KCA-1L-20M',
        chitValue: BigInt(100000),
        durationMonths: 20,
        baseInstallment: BigInt(5000),
        monthlyContribution: BigInt(5000),
        foremanCommissionPercent: 4.0,
        status: 'ACTIVE',
      });

      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-20',
        ticketNumber: 20,
        chitGroupId: 'group-001',
        isPrized: false,
        dues: [],
        customer: { fullName: 'M. Shanmugam' },
      });

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-20',
          ticketNumber: 20,
          isPrized: false,
          dues: [],
          customer: { fullName: 'M. Shanmugam' },
        },
      ]);

      prismaMock.auction.upsert = jest.fn().mockResolvedValue({
        id: 'auc-final-001',
        chitGroupId: 'group-001',
        installmentMonth: 20,
        status: 'COMPLETED',
      });

      prismaMock.auctionWinner.upsert = jest.fn().mockResolvedValue({
        id: 'win-final-001',
        disbursedAmount: 91000n,
        disbursementStatus: 'DISBURSED',
      });

      prismaMock.subscriberTicket.update.mockResolvedValue({
        id: 'ticket-20',
        isPrized: true,
      });

      prismaMock.chitGroup.update.mockResolvedValue({
        id: 'group-001',
        status: 'COMPLETED',
      });

      const result = await disbursementService.settleFinalMonth(
        'group-001',
        {
          ticketId: 'ticket-20',
          disbursementMode: 'ACCOUNT_PAYEE_CHEQUE' as any,
          paymentReference: 'CHQ-990011',
          makerUserId: branchManagerPrd.sub,
        },
        superAdminPartner.sub,
        superAdminPartner.roles,
      );

      expect(result.message).toContain('Final Month 20 maturity settlement successfully executed');
      expect(prismaMock.auction.upsert).toHaveBeenCalled();
      expect(prismaMock.auctionWinner.upsert).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // F06: Storage Guardians, Passbook Ownership & Default-Deny
  // ============================================================================
  describe('F06: Storage Guardians, Passbook Ownership & Default-Deny', () => {
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        subscriberTicket: {
          findFirst: jest.fn(),
        },
        customer: {
          findUnique: jest.fn(),
        },
        chitGroup: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        auction: {
          findUnique: jest.fn(),
        },
        branch: {
          findUnique: jest.fn(),
        },
      };
    });

    it('F06-1: Customer Alice accessing her own passbook succeeds', async () => {
      prismaMock.subscriberTicket.findFirst.mockResolvedValue({
        id: 'ticket-001',
        customerId: customerAlice.sub,
      });

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'passbooks/group-001/ticket-1/passbook.pdf',
          customerAlice,
          prismaMock,
        ),
      ).resolves.toBeUndefined();
    });

    it('F06-2: Customer Bob accessing Alice passbook throws 403 Forbidden', async () => {
      // For Bob, subscriberTicket query returns null because ticket-1 belongs to Alice
      prismaMock.subscriberTicket.findFirst.mockResolvedValue(null);

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'passbooks/group-001/ticket-1/passbook.pdf',
          customerBob,
          prismaMock,
        ),
      ).rejects.toThrow(/You can only view passbooks for your own subscriber tickets/i);
    });

    it('F06-3: Collection Agent accessing passbook throws 403 Forbidden', async () => {
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'passbooks/group-001/ticket-1/passbook.pdf',
          collectionAgentPrd,
          prismaMock,
        ),
      ).rejects.toThrow(/Field agents cannot download raw passbooks via direct storage routes/i);
    });

    it('F06-4: Cross-branch Branch Manager accessing passbook throws 403 Forbidden', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        branchId: 'branch-prd-001', // PRD branch
      });

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'passbooks/group-001/ticket-1/passbook.pdf',
          branchManagerErd, // ERD branch manager!
          prismaMock,
        ),
      ).rejects.toThrow(/Chit scheme does not belong to your assigned branch/i);
    });

    it('F06-5: Cross-branch Branch Manager accessing customer KYC document throws 403 Forbidden', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-alice-001',
        branchId: 'branch-prd-001', // PRD customer
      });

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'kyc/cust-alice-001/pan.pdf',
          branchManagerErd, // ERD branch manager!
          prismaMock,
        ),
      ).rejects.toThrow(/Customer does not belong to your assigned branch/i);
    });

    it('F06-6: Unapproved storage key prefix triggers strict default-deny with 403', async () => {
      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'unknown-prefix/secret.pdf',
          superAdminPartner,
          prismaMock,
        ),
      ).rejects.toThrow(/Unknown or unauthorized storage category/i);

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'temp/malicious-dump.sql',
          superAdminPartner,
          prismaMock,
        ),
      ).rejects.toThrow(/Unknown or unauthorized storage category/i);
    });

    it('F06-7: Branch Manager accessing auction minutes of another branch throws 403 Forbidden', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        chitGroup: {
          branchId: 'branch-prd-001', // PRD branch
        },
      });

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'minutes/auc-001/minutes.pdf',
          branchManagerErd, // ERD manager
          prismaMock,
        ),
      ).rejects.toThrow(/Auction minutes or safety proofs belong to another branch/i);
    });

    it('F06-8: Branch Manager accessing safety proofs of another branch throws 403 Forbidden', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        chitGroup: {
          branchId: 'branch-prd-001', // PRD branch
        },
      });

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'safety-proof/auc-001/doc-1.pdf',
          branchManagerErd, // ERD manager
          prismaMock,
        ),
      ).rejects.toThrow(/Auction minutes or safety proofs belong to another branch/i);
    });

    it('F06-9: Branch Manager accessing receipts or vouchers of another branch throws 403 Forbidden', async () => {
      prismaMock.branch.findUnique.mockResolvedValue({
        id: 'branch-erd-002',
        code: 'ERD',
      });

      await expect(
        DocumentAccessHelper.assertStorageKeyAccess(
          'receipts/KC-REC-PRD-2026-00001.pdf',
          branchManagerErd, // ERD manager (code: ERD) accessing PRD receipt
          prismaMock,
        ),
      ).rejects.toThrow(/Receipt belongs to another branch/i);
    });

    it('F06-10: Branch Manager requesting presigned upload URL for another branch kyc throws 403 Forbidden', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-alice-001',
        branchId: 'branch-prd-001', // PRD customer
      });

      await expect(
        DocumentAccessHelper.assertStorageUploadAccess(
          'kyc/cust-alice-001/pan.pdf',
          branchManagerErd, // ERD manager
          prismaMock,
        ),
      ).rejects.toThrow(/Customer does not belong to your assigned branch/i);
    });
  });

  // ============================================================================
  // F07: Customer Scoping & Sensitive Token Stripping
  // ============================================================================
  describe('F07: Customer Scoping & Response Allowlists', () => {
    let customerService: CustomerService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        customer: {
          findMany: jest.fn(),
          count: jest.fn(),
          findUnique: jest.fn(),
        },
      };

      customerService = new CustomerService(
        prismaMock,
        {} as any, // storageService
      );
    });

    it('F07-1: findAll scopes Branch Manager query to own branch and strips sensitive tokens', async () => {
      prismaMock.customer.count.mockResolvedValue(1);
      prismaMock.customer.findMany.mockResolvedValue([
        {
          id: 'cust-alice-001',
          fullName: 'Alice Walker',
          branchId: 'branch-prd-001',
          panNumber: 'ABCDE1234F',
          fcmToken: 'fcm-device-secret-token',
          refreshTokenHash: '$2b$12$secretHash',
          tokenRevokedBefore: new Date(),
        },
      ]);

      const result = await customerService.findAll({}, branchManagerPrd);

      expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 'branch-prd-001' }),
        }),
      );

      const item = result.data[0] as any;
      expect(item.refreshTokenHash).toBeUndefined();
      expect(item.fcmToken).toBeUndefined();
      expect(item.tokenRevokedBefore).toBeUndefined();
      // Masked PAN for non-admin
      expect(item.panNumber).toBe('ABXXXXX34F');
    });

    it('F07-2: findAll scopes Customer query to customer own ID only', async () => {
      prismaMock.customer.count.mockResolvedValue(1);
      prismaMock.customer.findMany.mockResolvedValue([
        {
          id: customerAlice.sub,
          fullName: 'Alice Walker',
          panNumber: 'ABCDE1234F',
        },
      ]);

      await customerService.findAll({}, customerAlice);

      expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: customerAlice.sub }),
        }),
      );
    });

    it('F07-3: findOne rejects cross-branch inspection for Branch Manager with 403', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-alice-001',
        branchId: 'branch-prd-001', // PRD branch
      });

      await expect(
        customerService.findOne('cust-alice-001', branchManagerErd), // ERD manager
      ).rejects.toThrow(/Customer does not belong to your assigned branch/i);
    });

    it('F07-4: findOne strips tokens and masks PAN for non-admin caller', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-alice-001',
        fullName: 'Alice Walker',
        branchId: 'branch-prd-001',
        panNumber: 'ABCDE1234F',
        fcmToken: 'fcm-secret',
        refreshTokenHash: 'hash-secret',
        tokenRevokedBefore: new Date(),
      });

      const customer = (await customerService.findOne('cust-alice-001', branchManagerPrd)) as any;

      expect(customer.refreshTokenHash).toBeUndefined();
      expect(customer.fcmToken).toBeUndefined();
      expect(customer.tokenRevokedBefore).toBeUndefined();
      expect(customer.panNumber).toBe('ABXXXXX34F');
    });

    it('F07-5: Collection Agent findAll scopes query to active tickets in agent branch and strips panNumber', async () => {
      prismaMock.customer.count.mockResolvedValue(1);
      prismaMock.customer.findMany.mockResolvedValue([
        {
          id: 'cust-alice-001',
          fullName: 'Alice Walker',
          branchId: 'branch-prd-001',
          panNumber: 'ABCDE1234F',
          tickets: [{ chitGroup: { branchId: 'branch-prd-001', status: 'ACTIVE' } }],
        },
      ]);

      const result = await customerService.findAll({}, collectionAgentPrd);

      expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tickets: {
              some: {
                chitGroup: {
                  branchId: 'branch-prd-001',
                  status: 'ACTIVE',
                },
              },
            },
          }),
        }),
      );

      const customer = result.data[0] as any;
      expect(customer.panNumber).toBeUndefined(); // PAN stripped for collection agent
    });

    it('F07-6: Collection Agent findOne throws 403 if customer has no active ticket in agent branch', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-alice-001',
        fullName: 'Alice Walker',
        branchId: 'branch-prd-001',
        panNumber: 'ABCDE1234F',
        tickets: [], // No active ticket in branch!
      });

      await expect(
        customerService.findOne('cust-alice-001', collectionAgentPrd),
      ).rejects.toThrow(/Access denied: Customer is not assigned to your active collection purview/i);
    });

    it('F07-7: Collection Agent findOne returns customer with panNumber stripped if active in branch', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({
        id: 'cust-alice-001',
        fullName: 'Alice Walker',
        branchId: 'branch-prd-001',
        panNumber: 'ABCDE1234F',
        tickets: [
          {
            status: 'ACTIVE',
            chitGroup: { branchId: 'branch-prd-001', status: 'ACTIVE' },
          },
        ],
      });

      const customer = (await customerService.findOne('cust-alice-001', collectionAgentPrd)) as any;
      expect(customer.fullName).toBe('Alice Walker');
      expect(customer.panNumber).toBeUndefined();
    });
  });

  // ============================================================================
  // F08: Chit & Auction Group Scoping & PII Masking
  // ============================================================================
  describe('F08: Group Membership Scoping & Fellow Subscriber PII Masking', () => {
    let chitService: ChitService;
    let auctionService: AuctionService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        chitGroup: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        subscriberTicket: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        auction: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
      };

      chitService = new ChitService(
        prismaMock,
        {} as any, // redisConnection
      );

      auctionService = new AuctionService(
        prismaMock,
        {} as any, // bullMqQueue
        {} as any, // redisConnection
      );
    });

    it('F08-1: ChitService.getTickets rejects Customer not enrolled in chit group with 403', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        branchId: 'branch-prd-001',
      });

      prismaMock.subscriberTicket.findFirst.mockResolvedValue(null); // Not enrolled!

      await expect(
        chitService.getTickets('group-001', customerAlice),
      ).rejects.toThrow(/You do not belong to this chit scheme/i);
    });

    it('F08-2: ChitService.getTickets masks fellow subscribers phones and names for enrolled customer', async () => {
      prismaMock.chitGroup.findUnique.mockResolvedValue({
        id: 'group-001',
        branchId: 'branch-prd-001',
      });

      // Alice is enrolled (owns ticket 1)
      prismaMock.subscriberTicket.findFirst.mockResolvedValue({
        id: 'ticket-001',
      });

      prismaMock.subscriberTicket.findMany.mockResolvedValue([
        {
          id: 'ticket-001',
          ticketNumber: 1,
          customerId: customerAlice.sub,
          customer: {
            id: customerAlice.sub,
            customerCode: 'KC-CUST-00001',
            fullName: 'Alice Walker',
            phone: '+919443322110',
          },
        },
        {
          id: 'ticket-002',
          ticketNumber: 2,
          customerId: customerBob.sub,
          customer: {
            id: customerBob.sub,
            customerCode: 'KC-CUST-00002',
            fullName: 'Bob Builder',
            phone: '+919876500000',
          },
        },
      ]);

      const tickets = await chitService.getTickets('group-001', customerAlice);

      // Alice's own ticket has real data
      expect(tickets[0].customer?.fullName).toBe('Alice Walker');
      expect(tickets[0].customer?.phone).toBe('+919443322110');

      // Bob's ticket is masked
      expect(tickets[1].customer?.fullName).toBe('Subscriber (Ticket #2)');
      expect(tickets[1].customer?.phone).toBe('+91 ******0000');
      expect(tickets[1].customer?.id).toBe('MASKED');
    });

    it('F08-3: AuctionService.getGroupAuctions rejects Customer not enrolled in group with 403', async () => {
      prismaMock.subscriberTicket.findFirst.mockResolvedValue(null); // Not enrolled

      await expect(
        auctionService.getGroupAuctions('group-001', customerAlice),
      ).rejects.toThrow(/You do not belong to this chit scheme/i);
    });

    it('F08-4: AuctionService.getGroupAuctions masks winner phone for fellow subscribers', async () => {
      prismaMock.subscriberTicket.findFirst.mockResolvedValue({
        id: 'ticket-001',
      });

      prismaMock.auction.findMany.mockResolvedValue([
        {
          id: 'auc-002',
          installmentMonth: 2,
          winner: {
            ticketId: 'ticket-002',
            ticket: {
              customerId: customerBob.sub, // Winner is Bob
              customer: {
                fullName: 'Bob Builder',
                phone: '+919876543210',
              },
            },
          },
        },
      ]);

      const auctions = await auctionService.getGroupAuctions('group-001', customerAlice);

      // Caller is Alice, winner is Bob -> Bob's phone must be masked
      expect((auctions[0] as any).winner.ticket.customer.phone).toBe('+91 ******0000');
    });

    it('F08-5: AuctionService.findOne rejects customer not enrolled in chit group with 403', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        chitGroupId: 'group-001',
        chitGroup: { id: 'group-001', branchId: 'branch-prd-001' },
      });

      prismaMock.subscriberTicket.findFirst.mockResolvedValue(null); // Not enrolled!

      await expect(
        auctionService.findOne('auc-001', customerBob),
      ).rejects.toThrow(/Access denied: You do not belong to this chit scheme/i);
    });

    it('F08-6: AuctionService.findOne rejects cross-branch branch manager with 403', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        chitGroupId: 'group-001',
        chitGroup: { id: 'group-001', branchId: 'branch-prd-001' }, // PRD branch
      });

      await expect(
        auctionService.findOne('auc-001', branchManagerErd), // ERD branch manager
      ).rejects.toThrow(/Access denied: Chit scheme belongs to another branch/i);
    });

    it('F08-7: AuctionService.findOne masks fellow subscriber phone numbers for customer caller', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        id: 'auc-001',
        chitGroupId: 'group-001',
        chitGroup: { id: 'group-001', branchId: 'branch-prd-001' },
        winner: {
          id: 'win-001',
          ticket: {
            customerId: 'cust-bob-002', // Fellow subscriber (Bob)
            customer: { fullName: 'Bob Builder', phone: '+919443322111' },
          },
        },
        tieBidders: [
          {
            ticket: {
              customerId: 'cust-charlie-003',
              customer: { fullName: 'Charlie Davis', phone: '+919443322112' },
            },
          },
        ],
      });

      prismaMock.subscriberTicket.findFirst.mockResolvedValue({
        id: 'ticket-alice-001',
        customerId: customerAlice.sub, // Alice is enrolled
      });

      const result = await auctionService.findOne('auc-001', customerAlice);

      expect(result.winner!.ticket.customer!.phone).toBe('+91 ******0000');
      expect(result.tieBidders![0].ticket.customer!.phone).toBe('+91 ******0000');
    });
  });

  // ============================================================================
  // F09: Domain Branch Derivation & Idempotency Scoping
  // ============================================================================
  describe('F09: Domain Branch Derivation & Idempotency Access Assertions', () => {
    let collectionService: CollectionService;
    let paymentService: PaymentService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        subscriberTicket: {
          findUnique: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        installmentDue: {
          findUnique: jest.fn(),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        payment: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
        paymentAllocation: {
          create: jest.fn().mockResolvedValue({ id: 'alloc-001' }),
        },
        receipt: {
          create: jest.fn().mockResolvedValue({ id: 'rec-001', receiptNumber: 'KC-REC-PRD-2026-00001' }),
        },
        auditLog: {
          create: jest.fn(),
        },
        user: {
          findUnique: jest.fn(),
        },
        branch: {
          findUnique: jest.fn(),
        },
        $transaction: jest.fn(async (cb: any) => {
          if (typeof cb === 'function') return cb(prismaMock);
          return cb;
        }),
        $queryRaw: jest.fn(),
      };

      collectionService = new CollectionService(
        prismaMock,
        { addJob: jest.fn().mockResolvedValue({}) } as any, // queueProvider
      );

      paymentService = new PaymentService(
        prismaMock,
        {} as any, // bullMqQueue
        {} as any, // redisConnection
      );
    });

    it('F09-1: CollectionService rejects cross-branch agent collection with 403 CROSS_BRANCH_FORBIDDEN', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-001',
        chitGroupId: 'group-001',
        chitGroup: {
          id: 'group-001',
          branchId: 'branch-prd-001', // PRD group
          groupCode: 'KCA-1L-20M',
          status: 'ACTIVE',
        },
        dues: [],
      });

      await expect(
        collectionService.recordCollection(
          {
            ticketId: 'ticket-001',
            installmentMonth: 1,
            amount: 5000,
            collectionMode: 'CASH',
            idempotencyKey: 'idemp-001',
          } as any,
          collectionAgentErd.sub, // ERD agent!
          collectionAgentErd.branchId, // ERD branch!
        ),
      ).rejects.toThrow(/CROSS_BRANCH_FORBIDDEN/i);
    });

    it('F09-2: CollectionService derives accounting branch from ticket.chitGroup.branchId', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-001',
        ticketNumber: 1,
        customerId: customerAlice.sub,
        customer: {
          customerCode: 'KC-CUST-00001',
          fullName: 'Alice Walker',
          fullNameTamil: null,
        },
        chitGroupId: 'group-001',
        chitGroup: {
          id: 'group-001',
          branchId: 'branch-prd-001', // PRD group
          groupCode: 'KCA-1L-20M',
          status: 'ACTIVE',
          monthlyContribution: BigInt(5000),
          durationMonths: 20,
        },
        dues: [
          {
            id: 'due-001',
            installmentMonth: 1,
            status: 'UNPAID',
            payableAmount: BigInt(5000),
          },
        ],
      });

      prismaMock.installmentDue.findUnique.mockResolvedValue({
        id: 'due-001',
        installmentMonth: 1,
        status: DueStatus.UNPAID,
        netPayableAmount: BigInt(5000),
        payableAmount: BigInt(5000),
        ticket: {
          id: 'ticket-001',
          customerId: customerAlice.sub,
        },
      });

      prismaMock.payment.findUnique.mockResolvedValue(null);
      prismaMock.payment.create.mockResolvedValue({
        id: 'pay-001',
        receiptNumber: 'KC-REC-PRD-2026-00001',
        branchId: 'branch-prd-001',
        amount: BigInt(5000),
        createdAt: new Date(),
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: collectionAgentPrd.sub,
        fullName: 'Agent Kumar',
      });

      prismaMock.branch.findUnique.mockResolvedValue({
        id: 'branch-prd-001',
        branchCode: 'PRD',
      });

      await collectionService.recordCollection(
        {
          ticketId: 'ticket-001',
          installmentMonth: 1,
          amount: 5000,
          collectionMode: 'CASH',
          idempotencyKey: 'idemp-fresh-001',
        } as any,
        collectionAgentPrd.sub,
        collectionAgentPrd.branchId,
      );

      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: 'branch-prd-001', // Derived from domain record!
          }),
        }),
      );
    });

    it('F09-3: CollectionService asserts caller branch before returning idempotency replay', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-existing-001',
        branchId: 'branch-prd-001', // Recorded at PRD branch
        recordedByUserId: collectionAgentPrd.sub,
        receipt: { receiptNumber: 'KC-REC-PRD-2026-00001' },
      });

      // Attempt to replay idempotency key from ERD branch agent
      await expect(
        collectionService.recordCollection(
          {
            ticketId: 'ticket-001',
            installmentMonth: 1,
            amount: 5000,
            collectionMode: 'CASH',
            idempotencyKey: 'idemp-existing-001',
          } as any,
          collectionAgentErd.sub,
          collectionAgentErd.branchId, // ERD agent attempting replay!
        ),
      ).rejects.toThrow(/Unauthorized idempotency replay from another branch/i);
    });

    it('F09-4: PaymentService rejects cross-branch payment recording with 403 CROSS_BRANCH_FORBIDDEN', async () => {
      prismaMock.subscriberTicket.findUnique.mockResolvedValue({
        id: 'ticket-001',
        chitGroupId: 'group-001',
        chitGroup: {
          id: 'group-001',
          branchId: 'branch-prd-001', // PRD group
          groupCode: 'KCA-1L-20M',
          status: 'ACTIVE',
        },
        dues: [],
      });

      await expect(
        paymentService.recordPayment(
          {
            ticketId: 'ticket-001',
            installmentMonth: 1,
            amount: 5000,
            paymentMode: 'CASH',
            idempotencyKey: 'pay-idemp-001',
          } as any,
          collectionAgentErd.sub,
          collectionAgentErd.branchId, // Cross-branch caller!
        ),
      ).rejects.toThrow(/CROSS_BRANCH_FORBIDDEN/i);
    });

    it('F09-5: CollectionService rejects same-branch agent idempotency replay of another agent collection with 403', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-existing-001',
        branchId: 'branch-prd-001',
        recordedByUserId: 'user-agent-prd-OTHER', // Different agent in same branch!
        receipt: { receiptNumber: 'KC-REC-PRD-2026-00001' },
      });

      await expect(
        collectionService.recordCollection(
          {
            ticketId: 'ticket-001',
            installmentMonth: 1,
            amount: 5000,
            collectionMode: 'CASH',
            idempotencyKey: 'idemp-other-agent',
          } as any,
          collectionAgentPrd.sub, // Agent Kumar attempting replay!
          collectionAgentPrd.branchId,
        ),
      ).rejects.toThrow(/You can only query or replay your own collection records/i);
    });

    it('F09-6: PaymentService rejects same-branch user idempotency replay of another user payment with 403', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay-existing-002',
        branchId: 'branch-prd-001',
        recordedByUserId: 'user-cashier-002', // Different cashier in same branch!
        receipt: { receiptNumber: 'KC-REC-PRD-2026-00002' },
      });

      await expect(
        paymentService.recordPayment(
          {
            ticketId: 'ticket-001',
            installmentMonth: 1,
            amount: 5000,
            paymentMode: 'CASH',
            idempotencyKey: 'idemp-other-cashier',
          } as any,
          superAdminPartner.sub, // Different user attempting replay!
          'branch-prd-001',
        ),
      ).rejects.toThrow(/You can only query or replay your own payment records/i);
    });
  });
});
