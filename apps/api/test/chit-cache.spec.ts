// ==============================================================================
// Kumaran Chits — Chit Schemes Master Catalog Redis Caching Tests
// ==============================================================================

import { ChitService } from '../src/chit/chit.service';
import { MasterCacheKeys } from '../src/common/constants';

describe('ChitService Master Scheme Redis Caching', () => {
  let chitService: ChitService;
  let prismaMock: any;
  let redisClientMock: any;
  let redisProviderMock: any;

  const mockSchemeResult = {
    data: [
      {
        id: 'chit-grp-01',
        groupCode: 'KCF-2026-A',
        groupName: 'Gold 20 Lakhs Scheme',
        chitValue: 2000000,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 100000,
        status: 'DRAFT',
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(() => {
    prismaMock = {
      chitGroup: {
        findMany: jest.fn().mockResolvedValue(mockSchemeResult.data),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockSchemeResult.data[0]),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch-prd' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
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

    chitService = new ChitService(prismaMock, redisProviderMock);
  });

  it('1. Cache Miss: Queries database and caches default catalog list in Redis with 30-min TTL with jitter', async () => {
    redisClientMock.get.mockResolvedValueOnce(null);

    const result = await chitService.findAll({});

    expect(result.data).toEqual(mockSchemeResult.data);
    expect(prismaMock.chitGroup.findMany).toHaveBeenCalledTimes(1);
    expect(redisClientMock.set).toHaveBeenCalledWith(
      MasterCacheKeys.schemesAll,
      expect.any(String),
      'EX',
      expect.any(Number),
    );
    const ttl = redisClientMock.set.mock.calls[0][3];
    expect(ttl).toBeGreaterThanOrEqual(1530);
    expect(ttl).toBeLessThanOrEqual(2070);
  });

  it('2. Cache Hit: Returns cached catalog directly from Redis without hitting database', async () => {
    redisClientMock.get.mockResolvedValueOnce(JSON.stringify(mockSchemeResult));

    const result = await chitService.findAll({});

    expect(result).toEqual(mockSchemeResult);
    expect(prismaMock.chitGroup.findMany).not.toHaveBeenCalled();
    expect(redisClientMock.get).toHaveBeenCalledWith(MasterCacheKeys.schemesAll);
  });

  it('3. Cache Fail-Open: Falls back to database gracefully if Redis throws error', async () => {
    redisClientMock.get.mockRejectedValueOnce(new Error('Redis connection drop'));

    const result = await chitService.findAll({});

    expect(result.data).toEqual(mockSchemeResult.data);
    expect(prismaMock.chitGroup.findMany).toHaveBeenCalledTimes(1);
  });

  it('4. Mutation Eviction: Creating a new scheme purges Redis schemesAll cache key', async () => {
    const createDto = {
      groupCode: 'KCF-NEW',
      groupName: 'New Chit Plan',
      chitValue: 1000000,
      durationMonths: 20,
      totalTickets: 20,
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
    };

    await chitService.create(createDto as any, 'branch-prd');

    expect(redisClientMock.del).toHaveBeenCalledWith(
      MasterCacheKeys.schemesAll,
      MasterCacheKeys.schemeById(mockSchemeResult.data[0].id),
    );
  });

  it('5. Negative Caching: Non-existent scheme lookup caches __notFound sentinel in Redis for 60s', async () => {
    redisClientMock.get.mockResolvedValueOnce(null);
    prismaMock.chitGroup.findUnique.mockResolvedValueOnce(null);

    await expect(chitService.findOne('non-existent-id')).rejects.toThrow(
      'Chit scheme with ID non-existent-id not found',
    );

    expect(redisClientMock.set).toHaveBeenCalledWith(
      MasterCacheKeys.schemeById('non-existent-id'),
      JSON.stringify({ __notFound: true }),
      'EX',
      60,
    );
  });

  it('6. Negative Caching Hit: Repetitive lookup for non-existent ID short-circuits without querying database', async () => {
    redisClientMock.get.mockResolvedValueOnce(JSON.stringify({ __notFound: true }));

    await expect(chitService.findOne('non-existent-id')).rejects.toThrow(
      'Chit scheme with ID non-existent-id not found',
    );

    expect(prismaMock.chitGroup.findUnique).not.toHaveBeenCalled();
  });
});
