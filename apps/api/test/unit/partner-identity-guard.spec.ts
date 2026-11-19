import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertVerifiedPartner } from '../../src/common/utils/partner-identity.util';

describe('Guardrail 11 & ADR-27: Statutory PARTNER Role vs IT SUPER_ADMIN Isolation', () => {
  const createPrismaMock = (userRecord: any) => ({
    user: {
      findUnique: jest.fn().mockResolvedValue(userRecord),
    },
  });

  describe('assertVerifiedPartner Utility', () => {
    it('should grant access to a user with Role.PARTNER', async () => {
      const prisma = createPrismaMock({
        id: 'usr-partner-001',
        phone: '9876543210',
        roles: [Role.PARTNER],
        isActive: true,
      });

      await expect(
        assertVerifiedPartner(prisma as any, 'usr-partner-001', 'Financial Mutation'),
      ).resolves.toBeUndefined();
    });

    it('should strictly bar an IT SUPER_ADMIN from financial mutations', async () => {
      const prisma = createPrismaMock({
        id: 'usr-it-admin',
        phone: '9876543219',
        roles: [Role.SUPER_ADMIN],
        isActive: true,
      });

      await expect(
        assertVerifiedPartner(prisma as any, 'usr-it-admin', 'finalize auctions'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        assertVerifiedPartner(prisma as any, 'usr-it-admin', 'finalize auctions'),
      ).rejects.toThrow(
        /PARTNER_IDENTITY_REQUIRED: Only verified business partners possess authority to finalize auctions/i,
      );
    });

    it('should strictly bar other staff roles without partner identity', async () => {
      const prismaBm = createPrismaMock({
        id: 'usr-bm-001',
        phone: '9876543212',
        roles: [Role.BRANCH_MANAGER],
        isActive: true,
      });

      const prismaAcc = createPrismaMock({
        id: 'usr-acc-001',
        phone: '9876543213',
        roles: [Role.ACCOUNTANT],
        isActive: true,
      });

      const prismaAud = createPrismaMock({
        id: 'usr-aud-001',
        phone: '9876543216',
        roles: [Role.AUDITOR],
        isActive: true,
      });

      await expect(assertVerifiedPartner(prismaBm as any, 'usr-bm-001', 'authorize payouts')).rejects.toThrow(ForbiddenException);
      await expect(assertVerifiedPartner(prismaAcc as any, 'usr-acc-001', 'authorize payouts')).rejects.toThrow(ForbiddenException);
      await expect(assertVerifiedPartner(prismaAud as any, 'usr-aud-001', 'authorize payouts')).rejects.toThrow(ForbiddenException);
    });

    it('should strictly bar inactive partners (isActive: false)', async () => {
      const prisma = createPrismaMock({
        id: 'usr-partner-inactive',
        phone: '9876543210',
        roles: [Role.PARTNER],
        isActive: false,
      });

      await expect(
        assertVerifiedPartner(prisma as any, 'usr-partner-inactive', 'finalize auctions'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should fail closed when user record does not exist', async () => {
      const prisma = createPrismaMock(null);

      await expect(
        assertVerifiedPartner(prisma as any, 'usr-nonexistent', 'finalize auctions'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
