import { NotificationService, SentNotificationRecord } from '../src/jobs/services/notification.service';

describe('NotificationService Distributed State Tests', () => {
  let service: NotificationService;
  const mockRedisStorage: string[] = [];

  const mockPipeline = {
    lpush: jest.fn((key: string, val: string) => {
      mockRedisStorage.unshift(val);
      return mockPipeline;
    }),
    ltrim: jest.fn((key: string, start: number, stop: number) => {
      mockRedisStorage.splice(stop + 1);
      return mockPipeline;
    }),
    expire: jest.fn(() => mockPipeline),
    exec: jest.fn(async () => ['OK', 'OK', 'OK']),
  };

  const mockRedisClient = {
    pipeline: jest.fn(() => mockPipeline),
    lrange: jest.fn(async (key: string, start: number, stop: number) => {
      return mockRedisStorage.slice(start, stop + 1);
    }),
    del: jest.fn(async (_key: string) => {
      mockRedisStorage.length = 0;
      return 1;
    }),
  };

  const mockRedisProvider = {
    getClient: jest.fn(() => mockRedisClient),
    getIsConnected: jest.fn(() => true),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisStorage.length = 0;
    service = new NotificationService(undefined, undefined, undefined, mockRedisProvider as any);
  });

  it('pushes sent notifications to shared Redis cluster pipeline', async () => {
    const payload = {
      receiptNumber: 'KC-REC-PRD-2026-00999',
      customerPhone: '9842199999',
      subscriberName: 'Perundurai Member',
      chitGroupName: 'KCA-1L-20M-01',
      installmentMonth: 5,
      amountPaid: '5000',
      branchCode: 'PRD',
    };

    await service.dispatchPaymentReceipt(payload);

    expect(mockRedisClient.pipeline).toHaveBeenCalled();
    expect(mockPipeline.lpush).toHaveBeenCalled();
    expect(mockPipeline.ltrim).toHaveBeenCalledWith('audit:notifications', 0, 199);
    expect(mockPipeline.expire).toHaveBeenCalledWith('audit:notifications', 604800);
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it('retrieves distributed notification log across instances from Redis', async () => {
    const record: SentNotificationRecord = {
      id: 'notif-101',
      channel: 'SMS_DLT',
      recipientPhone: '9842188888',
      templateType: 'RECEIPT',
      messageText: 'Kumaran Chits Receipt #KC-REC-PRD-2026-00001',
      variables: {},
      sentAt: new Date(),
      status: 'DELIVERED',
    };

    mockRedisStorage.push(JSON.stringify(record));

    const distributedLogs = await service.getDistributedNotificationLog(10);
    expect(distributedLogs.length).toBe(1);
    expect(distributedLogs[0].id).toBe('notif-101');
    expect(distributedLogs[0].recipientPhone).toBe('9842188888');
    expect(distributedLogs[0].sentAt).toBeInstanceOf(Date);
  });

  it('clears distributed logs from Redis on clearLog', () => {
    service.clearLog();
    expect(mockRedisClient.del).toHaveBeenCalledWith('audit:notifications');
  });
});
