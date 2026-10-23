import { ConflictException, NotFoundException } from '@nestjs/common';
import { BranchController } from '../src/branch/branch.controller';
import { BranchService } from '../src/branch/branch.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Branch Management Tests', () => {
  let branchService: BranchService;
  let branchController: BranchController;
  let prismaMock: any;

  const mockBranch = {
    id: 'branch-prd-001',
    code: 'PRD',
    name: 'Head Office - Perundurai',
    nameTamil: 'தலைமை கிளை - பெருந்துறை',
    address: '142, Erode Main Road, Perundurai - 638052',
    phone: '9876543210',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prismaMock = {
      branch: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    branchService = new BranchService(prismaMock as unknown as PrismaService);
    branchController = new BranchController(branchService);
  });

  describe('1. Branch Queries', () => {
    it('should return all branches', async () => {
      prismaMock.branch.findMany.mockResolvedValue([mockBranch]);

      const result = await branchController.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('PRD');
      expect(prismaMock.branch.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should filter active-only branches', async () => {
      prismaMock.branch.findMany.mockResolvedValue([mockBranch]);

      const result = await branchController.findAll('true');
      expect(result).toHaveLength(1);
      expect(prismaMock.branch.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should find single branch by ID', async () => {
      prismaMock.branch.findUnique.mockResolvedValue(mockBranch);

      const result = await branchController.findOne('branch-prd-001');
      expect(result.id).toBe('branch-prd-001');
    });

    it('should throw NotFoundException if branch not found', async () => {
      prismaMock.branch.findUnique.mockResolvedValue(null);

      await expect(branchController.findOne('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('2. Branch Creation', () => {
    it('should create new branch successfully', async () => {
      prismaMock.branch.findUnique.mockResolvedValue(null);
      prismaMock.branch.create.mockResolvedValue({
        ...mockBranch,
        id: 'branch-erd-002',
        code: 'ERD',
        name: 'Erode Branch',
      });

      const res = await branchController.create({
        code: 'erd',
        name: 'Erode Branch',
        nameTamil: 'ஈரோடு கிளை',
        address: '12, Brough Road, Erode',
        phone: '9842143210',
      });

      expect(res.code).toBe('ERD');
      expect(prismaMock.branch.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if branch code is already registered', async () => {
      prismaMock.branch.findUnique.mockResolvedValue(mockBranch);

      await expect(
        branchController.create({
          code: 'PRD',
          name: 'Duplicate PRD Branch',
          address: 'Main road',
          phone: '9842143210',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
