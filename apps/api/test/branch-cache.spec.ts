// ==============================================================================
// Kumaran Chits — Branch Service Master Data Redis Caching Tests
// ==============================================================================

import { BranchService } from '../src/branch/branch.service';
import { MasterCacheKeys } from '../src/common/constants';

describe('BranchService Master Data Redis Caching', () => {
  let branchService: BranchService;
  let prismaMock: any;
  let redisClientMock: any;
  let redisProviderMock: any;

  const mockBranches = [
    {
      id: 'branch-prd-01',
      code: 'PRD',
      name: 'Perundurai Head Office',
      nameTamil: 'பெருந்துறை தலைமை அலுவலகம்',
      address: '123 Main Road, Perundurai',
      phone: '9842712345',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    prismaMock = {
      branch: {
        findMany: jest.fn().mockResolvedValue(mockBranches),
        findUnique: jest.fn().mockResolvedValue(mockBranches[0]),
        create: jest.fn().mockResolvedValue(mockBranches[0]),
      },
    };

    redisClientMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    branchService = new BranchService(prismaMock, redisProviderMock);
  });

  it('1. Cache Miss: Queries Prisma DB and caches results in Redis with 1-hour TTL with jitter', async () => {
    redisClientMock.get.mockResolvedValueOnce(null);

    const result = await branchService.findAll(false);

    expect(result).toEqual(mockBranches);
    expect(prismaMock.branch.findMany).toHaveBeenCalledTimes(1);
    expect(redisClientMock.set).toHaveBeenCalledWith(
      MasterCacheKeys.branchesAll,
      JSON.stringify(mockBranches),
      'EX',
      expect.any(Number),
    );
    const ttl = redisClientMock.set.mock.calls[0][3];
    expect(ttl).toBeGreaterThanOrEqual(3060);
    expect(ttl).toBeLessThanOrEqual(4140);
  });

  it('2. Cache Hit: Returns cached branch list directly from Redis without hitting Prisma DB', async () => {
    redisClientMock.get.mockResolvedValueOnce(JSON.stringify(mockBranches));

    const result = await branchService.findAll(false);

    expect(result).toEqual(mockBranches);
    expect(prismaMock.branch.findMany).not.toHaveBeenCalled();
    expect(redisClientMock.get).toHaveBeenCalledWith(MasterCacheKeys.branchesAll);
  });

  it('3. Cache Fail-Open: When Redis throws an error, gracefully falls back to Prisma DB', async () => {
    redisClientMock.get.mockRejectedValueOnce(new Error('Redis connection timeout'));

    const result = await branchService.findAll(false);

    expect(result).toEqual(mockBranches);
    expect(prismaMock.branch.findMany).toHaveBeenCalledTimes(1);
  });

  it('4. Branch Detail Cache: Caches branch by ID in Redis on first call and serves on second call', async () => {
    // Call 1: Miss
    redisClientMock.get.mockResolvedValueOnce(null);
    const branch1 = await branchService.findById('branch-prd-01');
    expect(branch1).toEqual(mockBranches[0]);
    expect(prismaMock.branch.findUnique).toHaveBeenCalledWith({ where: { id: 'branch-prd-01' } });
    expect(redisClientMock.set).toHaveBeenCalledWith(
      MasterCacheKeys.branchById('branch-prd-01'),
      JSON.stringify(mockBranches[0]),
      'EX',
      expect.any(Number),
    );
    const ttl = redisClientMock.set.mock.calls[0][3];
    expect(ttl).toBeGreaterThanOrEqual(3060);
    expect(ttl).toBeLessThanOrEqual(4140);

    // Call 2: Hit
    redisClientMock.get.mockResolvedValueOnce(JSON.stringify(mockBranches[0]));
    const branch2 = await branchService.findById('branch-prd-01');
    expect(branch2).toEqual(mockBranches[0]);
    expect(prismaMock.branch.findUnique).toHaveBeenCalledTimes(1); // Not called again
  });

  it('5. Mutation Eviction: Creating a new branch atomically purges branch cache keys', async () => {
    prismaMock.branch.findUnique.mockResolvedValueOnce(null); // No existing branch with code
    prismaMock.branch.create.mockResolvedValueOnce({
      ...mockBranches[0],
      id: 'branch-new-02',
      code: 'ERD',
    });

    await branchService.create({
      code: 'ERD',
      name: 'Erode Branch',
      address: '456 Brough Road',
      phone: '9842798765',
    });

    expect(redisClientMock.del).toHaveBeenCalledWith(
      MasterCacheKeys.branchesAll,
      MasterCacheKeys.branchesActive,
      MasterCacheKeys.branchById('branch-new-02'),
    );
  });

  it('6. Negative Caching: Non-existent branch lookup caches __notFound sentinel in Redis for 60s', async () => {
    redisClientMock.get.mockResolvedValueOnce(null);
    prismaMock.branch.findUnique.mockResolvedValueOnce(null);

    await expect(branchService.findById('non-existent-branch')).rejects.toThrow(
      'Branch with ID non-existent-branch not found',
    );

    expect(redisClientMock.set).toHaveBeenCalledWith(
      MasterCacheKeys.branchById('non-existent-branch'),
      JSON.stringify({ __notFound: true }),
      'EX',
      60,
    );
  });

  it('7. Negative Caching Hit: Repetitive lookup for non-existent branch short-circuits without querying database', async () => {
    redisClientMock.get.mockResolvedValueOnce(JSON.stringify({ __notFound: true }));

    await expect(branchService.findById('non-existent-branch')).rejects.toThrow(
      'Branch with ID non-existent-branch not found',
    );

    expect(prismaMock.branch.findUnique).not.toHaveBeenCalled();
  });
});
