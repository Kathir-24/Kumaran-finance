// ==============================================================================
// Kumaran Chits — Chit Schemes Master Catalog Redis Caching Tests
// ==============================================================================

import { Prisma } from '@prisma/client';
import { ChitService } from '../src/chit/chit.service';
import { MasterCacheKeys } from '../src/common/constants';
import { stringifyBigIntSafe } from '../src/common/utils/bigint-json.util';

describe('ChitService Master Scheme Redis Caching', () => {
  let chitService: ChitService;
  let prismaMock: any;
  let redisClientMock: any;
  let redisProviderMock: any;

  const mockPrismaRows = [
    {
      id: 'chit-grp-01',
      groupCode: 'KCF-2026-A',
      groupName: 'Gold 20 Lakhs Scheme',
      chitValue: 2000000n,
      durationMonths: 20,
      totalTickets: 20,
      baseInstallment: 100000n,
      maxDiscountCeiling: 500000n,
      foremanCommissionRate: new Prisma.Decimal('4.00'),
      status: 'DRAFT',
    },
  ];

  const expectedSchemeResult = {
    data: [
      {
        id: 'chit-grp-01',
        groupCode: 'KCF-2026-A',
        groupName: 'Gold 20 Lakhs Scheme',
        chitValue: 2000000n,
        durationMonths: 20,
        totalTickets: 20,
        baseInstallment: 100000n,
        maxDiscountCeiling: 500000n,
        foremanCommissionRate: 4,
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
        findMany: jest.fn().mockResolvedValue(mockPrismaRows),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockPrismaRows[0]),
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

  it('1. Cache Miss: Queries database, preserves native bigint, and caches exact strings in Redis with 30-min TTL with jitter', async () => {
    redisClientMock.get.mockResolvedValueOnce(null);

    const result = await chitService.findAll({});

    expect(result).toEqual(expectedSchemeResult);
    expect(typeof result.data[0].chitValue).toBe('bigint');
    expect(typeof result.data[0].baseInstallment).toBe('bigint');
    expect(typeof result.data[0].maxDiscountCeiling).toBe('bigint');
    expect(result.data[0].foremanCommissionRate).toBe(4);
    expect(prismaMock.chitGroup.findMany).toHaveBeenCalledTimes(1);
    expect(redisClientMock.set).toHaveBeenCalledWith(
      MasterCacheKeys.schemesAll,
      expect.any(String),
      'EX',
      expect.any(Number),
    );
    const cachedJson = JSON.parse(redisClientMock.set.mock.calls[0][1]);
    expect(cachedJson.data[0].chitValue).toBe('2000000');
    expect(cachedJson.data[0].baseInstallment).toBe('100000');
    expect(cachedJson.data[0].maxDiscountCeiling).toBe('500000');
    expect(cachedJson.data[0].foremanCommissionRate).toBe(4);
    const ttl = redisClientMock.set.mock.calls[0][3];
    expect(ttl).toBeGreaterThanOrEqual(1530);
    expect(ttl).toBeLessThanOrEqual(2070);
  });

  it('2. Cache Hit: Revives native bigint values from Redis catalog without hitting database', async () => {
    redisClientMock.get.mockResolvedValueOnce(stringifyBigIntSafe(expectedSchemeResult));

    const result = await chitService.findAll({});

    expect(result).toEqual(expectedSchemeResult);
    expect(typeof result.data[0].chitValue).toBe('bigint');
    expect(typeof result.data[0].baseInstallment).toBe('bigint');
    expect(typeof result.data[0].maxDiscountCeiling).toBe('bigint');
    expect(prismaMock.chitGroup.findMany).not.toHaveBeenCalled();
    expect(redisClientMock.get).toHaveBeenCalledWith(MasterCacheKeys.schemesAll);
  });

  it('3. Cache Fail-Open: Falls back to database gracefully if Redis throws error', async () => {
    redisClientMock.get.mockRejectedValueOnce(new Error('Redis connection drop'));

    const result = await chitService.findAll({});

    expect(result.data).toEqual(expectedSchemeResult.data);
    expect(typeof result.data[0].chitValue).toBe('bigint');
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
      MasterCacheKeys.schemeById(mockPrismaRows[0].id),
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

  it('7. 64-Bit Precision: Preserves whole-rupee BigInt values beyond Number.MAX_SAFE_INTEGER across cache miss and hit', async () => {
    const hugeValue = 9007199254740993n; // MAX_SAFE_INTEGER + 2 (odd integer that Number rounds to ...992)
    prismaMock.chitGroup.findMany.mockResolvedValueOnce([
      {
        ...mockPrismaRows[0],
        chitValue: hugeValue,
        baseInstallment: 4503599627370496n,
        maxDiscountCeiling: 2251799813685248n,
      },
    ]);
    redisClientMock.get.mockResolvedValueOnce(null);

    const missResult = await chitService.findAll({});
    expect(missResult.data[0].chitValue).toBe(hugeValue);

    const serializedForRedis = redisClientMock.set.mock.calls[0][1];
    expect(JSON.parse(serializedForRedis).data[0].chitValue).toBe('9007199254740993');

    redisClientMock.get.mockResolvedValueOnce(serializedForRedis);
    const hitResult = await chitService.findAll({});
    expect(hitResult.data[0].chitValue).toBe(hugeValue);
    expect(prismaMock.chitGroup.findMany).toHaveBeenCalledTimes(1);
  });

  it('8. Corrupt Cache & Non-Default Filter: Falls open cleanly on invalid JSON and bypasses cache for filtered queries', async () => {
    redisClientMock.get.mockResolvedValueOnce('{corrupt-json');

    const recoveredResult = await chitService.findAll({});
    expect(recoveredResult.data).toEqual(expectedSchemeResult.data);
    expect(typeof recoveredResult.data[0].chitValue).toBe('bigint');

    const filteredResult = await chitService.findAll({ status: 'ACTIVE' as any });
    expect(filteredResult.data).toEqual(expectedSchemeResult.data);
    expect(typeof filteredResult.data[0].chitValue).toBe('bigint');
    expect(filteredResult.data[0].foremanCommissionRate).toBe(4);
    expect(prismaMock.chitGroup.findMany).toHaveBeenCalledTimes(2);
    expect(redisClientMock.get).toHaveBeenCalledTimes(1);
  });
});
