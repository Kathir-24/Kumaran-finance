import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserController } from '../../src/user/user.controller';
import { UserService } from '../../src/user/user.service';

describe('Staff User Management Tests', () => {
  let userService: UserService;
  let userController: UserController;
  let prismaMock: any;

  const mockBranchId = 'branch-prd-001';
  const mockSuperAdminId = 'user-admin-001';
  const mockAgentId = 'user-agent-002';

  const mockStaffUser = {
    id: mockAgentId,
    branchId: mockBranchId,
    name: 'R. Murugan',
    phone: '9842154321',
    passwordHash: '$2b$10$hashedpassword',
    roles: [Role.COLLECTION_AGENT],
    isActive: true,
    totpSecret: null,
    isTotpEnabled: false,
    mpinHash: '$2b$10$hashedmpin',
    refreshTokenHash: '$2b$10$hashedrefresh',
    fcmToken: 'fcm-agent-token',
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    branch: {
      id: mockBranchId,
      code: 'PRD',
      name: 'Head Office - Perundurai',
      nameTamil: 'தலைமை கிளை - பெருந்துறை',
    },
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    userService = new UserService(prismaMock as unknown as PrismaService);
    userController = new UserController(userService);
  });

  describe('1. Staff User Queries', () => {
    it('should return paginated staff user list and strip sensitive hashes', async () => {
      prismaMock.user.findMany.mockResolvedValue([mockStaffUser]);
      prismaMock.user.count.mockResolvedValue(1);

      const res = await userController.findAll({ page: 1, limit: 20 });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe(mockAgentId);
      expect(res.data[0].hasMpin).toBe(true);
      expect((res.data[0] as any).passwordHash).toBeUndefined();
      expect((res.data[0] as any).totpSecret).toBeUndefined();
      expect((res.data[0] as any).refreshTokenHash).toBeUndefined();
      expect(res.total).toBe(1);
    });

    it('should find single staff user by ID with branch details', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);

      const res = await userController.findOne(mockAgentId);
      expect(res.id).toBe(mockAgentId);
      expect(res.branch?.code).toBe('PRD');
      expect((res as any).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException if staff user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(userController.findOne('missing-user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should scope queries to currentUser.branchId when caller is Branch Manager', async () => {
      prismaMock.user.findMany.mockResolvedValue([mockStaffUser]);
      prismaMock.user.count.mockResolvedValue(1);

      const bmUser = {
        sub: 'user-bm-001',
        roles: [Role.BRANCH_MANAGER],
        branchId: 'branch-erd-002',
      };

      await userController.findAll({ page: 1, limit: 20 }, bmUser as any);
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            branchId: 'branch-erd-002',
          }),
        }),
      );
    });

    it('should throw ForbiddenException if Branch Manager queries a different branchId', async () => {
      const bmUser = {
        sub: 'user-bm-001',
        roles: [Role.BRANCH_MANAGER],
        branchId: 'branch-erd-002',
      };

      await expect(
        userController.findAll({ page: 1, limit: 20, branchId: 'other-branch' }, bmUser as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Staff User Creation', () => {
    it('should create staff account with default PRD branch and hashed password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.branch.findFirst.mockResolvedValue({ id: mockBranchId });
      prismaMock.user.create.mockResolvedValue(mockStaffUser);

      const res = await userController.create({
        name: 'R. Murugan',
        phone: '9842154321',
        roles: [Role.COLLECTION_AGENT],
      });

      expect(res.id).toBe(mockAgentId);
      expect(prismaMock.user.create).toHaveBeenCalled();
      const createArgs = prismaMock.user.create.mock.calls[0][0];
      expect(createArgs.data.branchId).toBe(mockBranchId);
      expect(createArgs.data.passwordHash).toBeDefined();
    });

    it('should throw ConflictException if phone number is already registered to a staff user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);

      await expect(
        userController.create({
          name: 'Duplicate Murugan',
          phone: '9842154321',
          roles: [Role.COLLECTION_AGENT],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if explicit branchId does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.branch.findUnique.mockResolvedValue(null);

      await expect(
        userController.create({
          name: 'New Agent',
          phone: '9842199999',
          roles: [Role.COLLECTION_AGENT],
          branchId: 'invalid-branch-id',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject staff creation with Role.CUSTOMER', async () => {
      await expect(
        userController.create({
          name: 'Invalid Staff',
          phone: '9842100000',
          roles: [Role.CUSTOMER as any],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow Super Admin to create staff with Role.PARTNER', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.branch.findFirst.mockResolvedValue({ id: mockBranchId });
      prismaMock.user.create.mockResolvedValue({
        ...mockStaffUser,
        name: 'Partner User',
        phone: '9842111111',
        roles: [Role.PARTNER],
      });

      const superAdminUser = { sub: mockSuperAdminId, roles: [Role.SUPER_ADMIN] };
      const res = await userController.create(
        {
          name: 'Partner User',
          phone: '9842111111',
          roles: [Role.PARTNER],
        },
        superAdminUser as any,
      );

      expect(res.roles).toContain(Role.PARTNER);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roles: [Role.PARTNER] }),
        }),
      );
    });

    it('should throw BadRequestException if creating user with both SUPER_ADMIN and PARTNER roles', async () => {
      const superAdminUser = { sub: mockSuperAdminId, roles: [Role.SUPER_ADMIN] };

      await expect(
        userController.create(
          {
            name: 'Conflicted User',
            phone: '9842122222',
            roles: [Role.SUPER_ADMIN, Role.PARTNER],
          },
          superAdminUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Staff User Status & Session Revocation', () => {
    it('should deactivate staff user and clear refresh token hash to revoke sessions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue({
        ...mockStaffUser,
        isActive: false,
        refreshTokenHash: null,
      });

      const res = await userController.updateStatus(
        mockAgentId,
        { isActive: false },
        mockSuperAdminId,
      );

      expect(res.isActive).toBe(false);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            refreshTokenHash: null,
          }),
        }),
      );
    });

    it('should prevent Super Admin from deactivating their own active account (self-lockout guard)', async () => {
      await expect(
        userController.updateStatus(
          mockSuperAdminId,
          { isActive: false },
          mockSuperAdminId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Staff Roles Management', () => {
    it('should update roles assigned to staff user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue({
        ...mockStaffUser,
        roles: [Role.COLLECTION_AGENT, Role.ACCOUNTANT],
      });

      const res = await userController.updateRoles(
        mockAgentId,
        { roles: [Role.COLLECTION_AGENT, Role.ACCOUNTANT] },
        mockSuperAdminId,
      );

      expect(res.roles).toContain(Role.ACCOUNTANT);
    });

    it('should prevent Super Admin from revoking their own Super Admin role', async () => {
      await expect(
        userController.updateRoles(
          mockSuperAdminId,
          { roles: [Role.ACCOUNTANT] },
          mockSuperAdminId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject updating staff with Role.CUSTOMER', async () => {
      await expect(
        userController.updateRoles(
          mockAgentId,
          { roles: [Role.CUSTOMER as any] },
          { sub: mockSuperAdminId, roles: [Role.SUPER_ADMIN], isPartner: true } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if assigning both SUPER_ADMIN and PARTNER roles', async () => {
      const superAdminUser = { sub: mockSuperAdminId, roles: [Role.SUPER_ADMIN] };

      await expect(
        userController.updateRoles(
          mockAgentId,
          { roles: [Role.SUPER_ADMIN, Role.PARTNER] },
          superAdminUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow Super Admin to update staff roles to Role.PARTNER', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockStaffUser);
      prismaMock.user.update.mockResolvedValue({
        ...mockStaffUser,
        roles: [Role.PARTNER],
      });

      const superAdminUser = { sub: mockSuperAdminId, roles: [Role.SUPER_ADMIN] };
      const res = await userController.updateRoles(
        mockAgentId,
        { roles: [Role.PARTNER] },
        superAdminUser as any,
      );

      expect(res.roles).toContain(Role.PARTNER);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roles: [Role.PARTNER] }),
        }),
      );
    });
  });
});
