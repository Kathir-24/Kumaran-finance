// ==============================================================================
// Kumaran Chits — Auction Reminder Scheduler Broadcast Idempotency Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: Cost Protection, Indian DLT Telecom SMS & Push Anti-Spam Standards
// ==============================================================================

import { AuctionStatus } from '@prisma/client';
import { AuctionReminderSchedulerService } from '../src/jobs/services/auction-reminder-scheduler.service';
import { NotificationService } from '../src/jobs/services/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuctionReminderSchedulerService (Broadcast Idempotency & Cost Protection)', () => {
  let service: AuctionReminderSchedulerService;
  let prismaMock: any;
  let notificationServiceMock: any;
  let redisClientMock: any;
  let redisProviderMock: any;

  const mockAuction = {
    id: 'auction-uuid-001',
    installmentMonth: 4,
    auctionDate: new Date('2026-10-25T10:30:00Z'),
    status: AuctionStatus.SCHEDULED,
    chitGroup: {
      id: 'chit-group-uuid-001',
      groupCode: 'KCA-1L-20M-01',
      branch: {
        id: 'branch-prd-001',
        name: 'Head Office - Perundurai',
        address: 'Bhavani Road, Perundurai, Tamil Nadu 638052',
        phone: '9842143210',
      },
      tickets: [
        {
          id: 'ticket-1',
          customer: {
            fullName: 'Murugan K',
            phone: '9842143210',
            fcmToken: 'fcm-token-murugan',
          },
        },
        {
          id: 'ticket-2',
          customer: {
            fullName: 'Ramasamy P',
            phone: '9842111222',
            fcmToken: null, // Keypad phone -> DLT SMS
          },
        },
      ],
    },
  };

  const redisStore = new Map<string, string>();

  beforeEach(() => {
    redisStore.clear();

    prismaMock = {
      auction: {
        findMany: jest.fn().mockResolvedValue([mockAuction]),
      },
    };

    notificationServiceMock = {
      dispatchAuctionReminder: jest.fn().mockResolvedValue({
        dispatchedCount: 2,
        pushCount: 1,
        smsCount: 1,
      }),
    };

    redisClientMock = {
      set: jest.fn(async (key: string, val: string, ...args: any[]) => {
        if (args.includes('NX')) {
          if (redisStore.has(key)) {
            return null; // Key already exists -> lock not acquired
          }
          redisStore.set(key, val);
          return 'OK';
        }
        redisStore.set(key, val);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => redisStore.get(key) || null),
    };

    redisProviderMock = {
      getClient: jest.fn(() => redisClientMock),
      getIsConnected: jest.fn(() => true),
    };

    service = new AuctionReminderSchedulerService(
      prismaMock as unknown as PrismaService,
      notificationServiceMock as unknown as NotificationService,
      redisProviderMock,
    );
  });

  it('REMIND-01: First-run broadcast acquires Redis lock and dispatches reminders', async () => {
    const targetDate = new Date('2026-10-25T00:00:00Z');
    const result = await service.scanAndBroadcastUpcomingAuctions(targetDate);

    expect(result.chitsCount).toBe(1);
    expect(result.remindersCount).toBe(2);
    expect(notificationServiceMock.dispatchAuctionReminder).toHaveBeenCalledTimes(1);

    // Verify Redis lock was created with 24-hour TTL (86400s)
    const expectedLockKey = `lock:broadcast:auction:${mockAuction.id}:${mockAuction.installmentMonth}`;
    expect(redisClientMock.set).toHaveBeenCalledWith(
      expectedLockKey,
      '1',
      'EX',
      86400,
      'NX',
    );
    expect(redisStore.has(expectedLockKey)).toBe(true);
  });

  it('REMIND-02: Second-run within 24 hours is rejected by lock with zero duplicate dispatches', async () => {
    const targetDate = new Date('2026-10-25T00:00:00Z');

    // Call 1: First dispatch acquires lock
    await service.scanAndBroadcastUpcomingAuctions(targetDate);
    expect(notificationServiceMock.dispatchAuctionReminder).toHaveBeenCalledTimes(1);

    // Call 2: Second run (e.g. BullMQ job retry or duplicate trigger)
    const secondResult = await service.scanAndBroadcastUpcomingAuctions(targetDate);

    // Assert that second call skipped dispatch
    expect(secondResult.remindersCount).toBe(0);
    expect(notificationServiceMock.dispatchAuctionReminder).toHaveBeenCalledTimes(1); // Still 1, NOT 2!
  });

  it('REMIND-03: Gracefully dispatches reminders if Redis is disconnected (fail-open)', async () => {
    redisProviderMock.getIsConnected.mockReturnValue(false);

    const targetDate = new Date('2026-10-25T00:00:00Z');
    const result = await service.scanAndBroadcastUpcomingAuctions(targetDate);

    expect(result.chitsCount).toBe(1);
    expect(result.remindersCount).toBe(2);
    expect(notificationServiceMock.dispatchAuctionReminder).toHaveBeenCalledTimes(1);
    expect(redisClientMock.set).not.toHaveBeenCalled();
  });

  it('REMIND-04: Handles chit groups with zero subscribers with valid phone numbers', async () => {
    const auctionNoSubscribers = {
      ...mockAuction,
      chitGroup: {
        ...mockAuction.chitGroup,
        tickets: [],
      },
    };
    prismaMock.auction.findMany.mockResolvedValue([auctionNoSubscribers]);

    const targetDate = new Date('2026-10-25T00:00:00Z');
    const result = await service.scanAndBroadcastUpcomingAuctions(targetDate);

    expect(result.chitsCount).toBe(1);
    expect(result.remindersCount).toBe(0);
    expect(notificationServiceMock.dispatchAuctionReminder).not.toHaveBeenCalled();
    expect(redisClientMock.set).not.toHaveBeenCalled();
  });
});
