import { ReportService } from '../../src/report/report.service';

describe('Cache Stampede Guard (Thundering Herd) Tests', () => {
  let reportService: ReportService;
  let dbComputeCount = 0;

  const mockRedisStore = new Map<string, string>();
  let activeLock: string | null = null;

  const mockRedisClient = {
    get: jest.fn(async (key: string) => mockRedisStore.get(key) || null),
    set: jest.fn(async (key: string, val: string, ...args: any[]) => {
      // Check if NX is passed (mutex lock)
      if (args.includes('NX')) {
        if (activeLock) {
          return null; // Lock already held
        }
        activeLock = val;
        return 'OK';
      }
      mockRedisStore.set(key, val);
      return 'OK';
    }),
    setex: jest.fn(async (key: string, ttl: number, val: string) => {
      mockRedisStore.set(key, val);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      if (key.startsWith('lock:')) {
        activeLock = null;
      }
      mockRedisStore.delete(key);
      return 1;
    }),
    eval: jest.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      if (key.startsWith('lock:') && activeLock === token) {
        activeLock = null;
        return 1;
      }
      if (mockRedisStore.get(key) === token) {
        mockRedisStore.delete(key);
        return 1;
      }
      return 0;
    }),
  };

  const mockRedisProvider = {
    getClient: jest.fn(() => mockRedisClient),
    getIsConnected: jest.fn(() => true),
  };

  const mockPrisma = {
    chitGroup: { count: jest.fn(async () => { dbComputeCount++; return 5; }) },
    customer: { count: jest.fn(async () => 100) },
    subscriberTicket: { count: jest.fn(async () => 100), findMany: jest.fn(async () => []) },
    payment: {
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { amount: 100000n } })),
      count: jest.fn(async () => 0),
    },
    auctionWinner: {
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { disbursedAmount: 50000n } })),
      count: jest.fn(async () => 0),
    },
  };

  const mockStatutoryReportService = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisStore.clear();
    activeLock = null;
    dbComputeCount = 0;

    reportService = new ReportService(
      mockPrisma as any,
      mockStatutoryReportService as any,
      mockRedisProvider as any,
    );
  });

  it('allows the first request to acquire mutex lock and compute from DB', async () => {
    const user = { id: 'u1', branchId: 'PRD', roles: ['SUPER_ADMIN'] } as any;
    const result = await reportService.getExecutiveDashboard({ branchId: 'PRD' }, user);

    expect(result).toBeDefined();
    expect(dbComputeCount).toBe(1);
    expect(mockRedisStore.has('report:dashboard:PRD')).toBe(true);
  });

  it('coalesces concurrent requests during cache miss so DB is only queried once', async () => {
    const user = { id: 'u1', branchId: 'PRD', roles: ['SUPER_ADMIN'] } as any;

    // Simulate 3 concurrent requests arriving simultaneously upon key expiry
    const [res1, res2, res3] = await Promise.all([
      reportService.getExecutiveDashboard({ branchId: 'PRD' }, user),
      reportService.getExecutiveDashboard({ branchId: 'PRD' }, user),
      reportService.getExecutiveDashboard({ branchId: 'PRD' }, user),
    ]);

    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    expect(res3).toBeDefined();

    // Despite 3 simultaneous requests, DB computation was executed only once!
    expect(dbComputeCount).toBe(1);
  });

  it('guarantees lock is released in finally block', async () => {
    const user = { id: 'u1', branchId: 'PRD', roles: ['SUPER_ADMIN'] } as any;
    await reportService.getExecutiveDashboard({ branchId: 'PRD' }, user);

    // Active lock should be null after method finishes
    expect(activeLock).toBeNull();
  });

  it('serves in-memory snapshot when Redis is down and fail-open bulkhead is saturated', async () => {
    const user = { id: 'u1', branchId: 'PRD', roles: ['SUPER_ADMIN'] } as any;

    // First call with Redis connected populates snapshot
    await reportService.getExecutiveDashboard({ branchId: 'PRD' }, user);
    expect(dbComputeCount).toBe(1);

    // Disconnect Redis
    mockRedisProvider.getIsConnected.mockReturnValue(false);

    // Artificially simulate 3 active concurrent fallback queries
    (reportService as any).activeFallbackDashboardQueries = 3;

    // Saturated request should serve in-memory snapshot without hitting DB
    const fallbackRes = await reportService.getExecutiveDashboard({ branchId: 'PRD' }, user);
    expect(fallbackRes).toBeDefined();
    expect(dbComputeCount).toBe(1); // No additional DB query executed!
  });

  it('bounds in-memory snapshot cache to max 20 entries, evicting oldest item', () => {
    for (let i = 1; i <= 25; i++) {
      (reportService as any).recordDashboardSnapshot(`key-${i}`, { index: i });
    }

    const snapshotMap: Map<string, any> = (reportService as any).lastKnownDashboardSnapshot;
    expect(snapshotMap.size).toBe(20);
    // Oldest keys 1 to 5 should have been evicted
    expect(snapshotMap.has('key-1')).toBe(false);
    expect(snapshotMap.has('key-5')).toBe(false);
    // Keys 6 to 25 should be preserved
    expect(snapshotMap.has('key-6')).toBe(true);
    expect(snapshotMap.has('key-25')).toBe(true);
  });
});
