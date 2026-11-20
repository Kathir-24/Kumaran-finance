// ==============================================================================
// Kumaran Chits — Auction Reminder Scheduler UTC Timezone Drift Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Standard: P1: SCHED-01 (Strict Asia/Kolkata IST Day Bounds in UTC Environments)
// ==============================================================================

import { AuctionStatus, ChitStatus } from '@prisma/client';
import { AuctionReminderSchedulerService } from '../../src/jobs/services/auction-reminder-scheduler.service';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  formatIstDate,
  getIstDayBounds,
  IST_OFFSET_MS,
} from '../../src/report/helpers/report-scope.helper';

describe('AuctionReminderSchedulerService — UTC Timezone Hardening (P1: SCHED-01)', () => {
  let service: AuctionReminderSchedulerService;
  let prismaMock: any;
  let notificationServiceMock: any;
  let redisClientMock: any;
  let redisProviderMock: any;

  // Ensure test runs simulating UTC server environment
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'UTC';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  const baseChitGroup = {
    id: 'chit-group-tz-01',
    groupCode: 'KCA-2L-20M-01',
    status: ChitStatus.ACTIVE,
    durationMonths: 20,
    branch: {
      id: 'branch-prd-001',
      name: 'Head Office - Perundurai',
      address: 'Bhavani Road, Perundurai, Tamil Nadu 638052',
      phone: '9842143210',
    },
    tickets: [
      {
        id: 'ticket-tz-01',
        customer: {
          fullName: 'K. Palanisamy',
          phone: '9842143210',
          fcmToken: 'fcm-token-tz-01',
        },
      },
      {
        id: 'ticket-tz-02',
        customer: {
          fullName: 'S. Sundaram',
          phone: '9842111222',
          fcmToken: null, // Keypad phone -> DLT SMS
        },
      },
    ],
  };

  beforeEach(() => {
    prismaMock = {
      auction: {
        findMany: jest.fn(),
      },
    };

    notificationServiceMock = {
      dispatchAuctionReminder: jest.fn().mockImplementation(async (payload) => ({
        dispatchedCount: payload.subscribers.length,
        pushCount: payload.subscribers.filter((s: any) => s.fcmToken).length,
        smsCount: payload.subscribers.filter((s: any) => !s.fcmToken).length,
      })),
    };

    redisClientMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Explicit Target Date IST Day Bounds (UTC VPS Environment)', () => {
    const targetDateStr = '2026-10-25';
    const targetDate = new Date(`${targetDateStr}T00:00:00.000+05:30`);

    // Expected exact IST boundaries
    const expectedStartOfDay = new Date(`${targetDateStr}T00:00:00.000+05:30`);
    const expectedEndOfDay = new Date(`${targetDateStr}T23:59:59.999+05:30`);

    it('SCHED-TZ-01: Verifies exact query boundaries passed to Prisma (00:00:00.000+05:30 to 23:59:59.999+05:30)', async () => {
      prismaMock.auction.findMany.mockResolvedValue([]);

      await service.scanAndBroadcastUpcomingAuctions(targetDate);

      expect(prismaMock.auction.findMany).toHaveBeenCalledTimes(1);
      const queryWhere = prismaMock.auction.findMany.mock.calls[0][0].where;

      expect(queryWhere.auctionDate).toBeDefined();
      expect(queryWhere.auctionDate.gte).toEqual(expectedStartOfDay);
      expect(queryWhere.auctionDate.lte).toEqual(expectedEndOfDay);

      // In UTC, start of day 00:00:00.000+05:30 is 18:30:00.000Z on previous day
      expect(queryWhere.auctionDate.gte.toISOString()).toBe('2026-10-24T18:30:00.000Z');
      // In UTC, end of day 23:59:59.999+05:30 is 18:29:59.999Z on target day
      expect(queryWhere.auctionDate.lte.toISOString()).toBe('2026-10-25T18:29:59.999Z');
    });

    it('SCHED-TZ-02: Strictly includes auctions across all hours of target date in IST (00:01 AM, 05:00 AM, 10:30 AM, 23:55 PM IST)', async () => {
      const candidateAuctions = [
        {
          id: 'auc-001-midnight',
          installmentMonth: 2,
          // 00:01 AM IST (UTC: 2026-10-24T18:31:00.000Z)
          auctionDate: new Date('2026-10-25T00:01:00.000+05:30'),
          status: AuctionStatus.SCHEDULED,
          conductedByUserId: null,
          chitGroup: baseChitGroup,
        },
        {
          id: 'auc-002-dawn',
          installmentMonth: 3,
          // 05:00 AM IST (UTC: 2026-10-24T23:30:00.000Z) - Dropped in buggy UTC code!
          auctionDate: new Date('2026-10-25T05:00:00.000+05:30'),
          status: AuctionStatus.SCHEDULED,
          conductedByUserId: null,
          chitGroup: baseChitGroup,
        },
        {
          id: 'auc-003-standard-morning',
          installmentMonth: 4,
          // 10:30 AM IST (UTC: 2026-10-25T05:00:00.000Z)
          auctionDate: new Date('2026-10-25T10:30:00.000+05:30'),
          status: AuctionStatus.SCHEDULED,
          conductedByUserId: null,
          chitGroup: baseChitGroup,
        },
        {
          id: 'auc-004-late-night',
          installmentMonth: 5,
          // 23:55 PM IST (UTC: 2026-10-25T18:25:00.000Z)
          auctionDate: new Date('2026-10-25T23:55:00.000+05:30'),
          status: AuctionStatus.SCHEDULED,
          conductedByUserId: null,
          chitGroup: baseChitGroup,
        },
      ];

      // Simulate Prisma filtering using where.auctionDate.gte and lte
      prismaMock.auction.findMany.mockImplementation(async ({ where }: any) => {
        const { gte, lte } = where.auctionDate;
        return candidateAuctions.filter(
          (a) => a.auctionDate.getTime() >= gte.getTime() && a.auctionDate.getTime() <= lte.getTime(),
        );
      });

      const result = await service.scanAndBroadcastUpcomingAuctions(targetDate);

      // All 4 auctions on target date must be included
      expect(result.chitsCount).toBe(4);
      expect(result.remindersCount).toBe(8); // 2 subscribers * 4 auctions
      expect(notificationServiceMock.dispatchAuctionReminder).toHaveBeenCalledTimes(4);
    });

    it('SCHED-TZ-03: Strictly excludes auctions scheduled at 23:59 PM IST previous day and 00:01 AM IST next day', async () => {
      const candidateAuctions = [
        {
          id: 'auc-prev-day-2359',
          installmentMonth: 2,
          // 23:59 PM IST on PREVIOUS DAY (2026-10-24T23:59:00.000+05:30 -> UTC 18:29:00.000Z)
          auctionDate: new Date('2026-10-24T23:59:00.000+05:30'),
          status: AuctionStatus.SCHEDULED,
          conductedByUserId: null,
          chitGroup: baseChitGroup,
        },
        {
          id: 'auc-target-day-0001',
          installmentMonth: 3,
          // 00:01 AM IST on TARGET DAY
          auctionDate: new Date('2026-10-25T00:01:00.000+05:30'),
          status: AuctionStatus.SCHEDULED,
          conductedByUserId: null,
          chitGroup: baseChitGroup,
        },
        {
          id: 'auc-next-day-0001',
          installmentMonth: 4,
          // 00:01 AM IST on NEXT DAY (2026-10-26T00:01:00.000+05:30 -> UTC 18:31:00.000Z)
          auctionDate: new Date('2026-10-26T00:01:00.000+05:30'),
          status: AuctionStatus.SCHEDULED,
          conductedByUserId: null,
          chitGroup: baseChitGroup,
        },
      ];

      // Simulate Prisma filtering with gte and lte
      prismaMock.auction.findMany.mockImplementation(async ({ where }: any) => {
        const { gte, lte } = where.auctionDate;
        return candidateAuctions.filter(
          (a) => a.auctionDate.getTime() >= gte.getTime() && a.auctionDate.getTime() <= lte.getTime(),
        );
      });

      const result = await service.scanAndBroadcastUpcomingAuctions(targetDate);

      // Only the target day auction should be captured
      expect(result.chitsCount).toBe(1);
      expect(result.remindersCount).toBe(2);

      const dispatchedPayload = notificationServiceMock.dispatchAuctionReminder.mock.calls[0][0];
      expect(dispatchedPayload.installmentMonth).toBe(3); // auc-target-day-0001
    });
  });

  describe('2. Default Scan (No targetDate) — Exact 3 Calendar Days Ahead in IST', () => {
    it('SCHED-TZ-04: When cron runs at 01:00 AM IST (19:30 UTC previous day), scans exactly 3 calendar days ahead in IST', async () => {
      // 2026-10-20 at 01:00 AM IST is 2026-10-19 at 19:30 UTC
      // Notice: UTC date is 19th, but IST date is 20th!
      // In IST, 3 calendar days ahead is 2026-10-23.
      const runInstant = new Date('2026-10-19T19:30:00.000Z'); // 2026-10-20 01:00:00 IST
      jest.spyOn(Date, 'now').mockReturnValue(runInstant.getTime());

      prismaMock.auction.findMany.mockResolvedValue([]);

      await service.scanAndBroadcastUpcomingAuctions(); // No targetDate passed

      expect(prismaMock.auction.findMany).toHaveBeenCalledTimes(1);
      const queryWhere = prismaMock.auction.findMany.mock.calls[0][0].where;

      // Must scan for 2026-10-23 in IST
      const expectedStart = new Date('2026-10-23T00:00:00.000+05:30');
      const expectedEnd = new Date('2026-10-23T23:59:59.999+05:30');

      expect(queryWhere.auctionDate.gte).toEqual(expectedStart);
      expect(queryWhere.auctionDate.lte).toEqual(expectedEnd);
      expect(queryWhere.auctionDate.gte.toISOString()).toBe('2026-10-22T18:30:00.000Z');
      expect(queryWhere.auctionDate.lte.toISOString()).toBe('2026-10-23T18:29:59.999Z');
    });

    it('SCHED-TZ-05: When cron runs at 10:00 AM IST (04:30 UTC same day), scans the identical target date (2026-10-23)', async () => {
      // 2026-10-20 at 10:00 AM IST is 2026-10-20 at 04:30 UTC
      const runInstant = new Date('2026-10-20T04:30:00.000Z'); // 2026-10-20 10:00:00 IST
      jest.spyOn(Date, 'now').mockReturnValue(runInstant.getTime());

      prismaMock.auction.findMany.mockResolvedValue([]);

      await service.scanAndBroadcastUpcomingAuctions();

      expect(prismaMock.auction.findMany).toHaveBeenCalledTimes(1);
      const queryWhere = prismaMock.auction.findMany.mock.calls[0][0].where;

      const expectedStart = new Date('2026-10-23T00:00:00.000+05:30');
      const expectedEnd = new Date('2026-10-23T23:59:59.999+05:30');

      expect(queryWhere.auctionDate.gte).toEqual(expectedStart);
      expect(queryWhere.auctionDate.lte).toEqual(expectedEnd);
    });

    it('SCHED-TZ-06: Invariance check: 01:00 AM IST and 10:00 AM IST produce identical scan window bounds', async () => {
      // Early morning run (01:00 AM IST)
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-19T19:30:00.000Z').getTime());
      prismaMock.auction.findMany.mockResolvedValue([]);
      await service.scanAndBroadcastUpcomingAuctions();
      const earlyBounds = prismaMock.auction.findMany.mock.calls[0][0].where.auctionDate;

      // Morning run (10:00 AM IST)
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-20T04:30:00.000Z').getTime());
      prismaMock.auction.findMany.mockResolvedValue([]);
      await service.scanAndBroadcastUpcomingAuctions();
      const morningBounds = prismaMock.auction.findMany.mock.calls[1][0].where.auctionDate;

      // Late night run (23:45 PM IST)
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-20T18:15:00.000Z').getTime());
      prismaMock.auction.findMany.mockResolvedValue([]);
      await service.scanAndBroadcastUpcomingAuctions();
      const nightBounds = prismaMock.auction.findMany.mock.calls[2][0].where.auctionDate;

      // All three runs on October 20th IST must target exactly October 23rd IST
      expect(earlyBounds.gte.getTime()).toBe(morningBounds.gte.getTime());
      expect(earlyBounds.lte.getTime()).toBe(morningBounds.lte.getTime());
      expect(morningBounds.gte.getTime()).toBe(nightBounds.gte.getTime());
      expect(morningBounds.lte.getTime()).toBe(nightBounds.lte.getTime());
    });

    it('SCHED-TZ-07: Month-end rollover across leap and non-leap months (Feb 27 IST -> Mar 02 IST)', async () => {
      // 2026 is non-leap year (February has 28 days)
      // 2026-02-27 at 01:00 AM IST -> UTC: 2026-02-26T19:30:00.000Z
      // In IST, 3 calendar days ahead of Feb 27 is Mar 02!
      const runInstant = new Date('2026-02-26T19:30:00.000Z');
      jest.spyOn(Date, 'now').mockReturnValue(runInstant.getTime());

      prismaMock.auction.findMany.mockResolvedValue([]);

      await service.scanAndBroadcastUpcomingAuctions();

      const queryWhere = prismaMock.auction.findMany.mock.calls[0][0].where;
      const expectedStart = new Date('2026-03-02T00:00:00.000+05:30');
      const expectedEnd = new Date('2026-03-02T23:59:59.999+05:30');

      expect(queryWhere.auctionDate.gte).toEqual(expectedStart);
      expect(queryWhere.auctionDate.lte).toEqual(expectedEnd);
      expect(queryWhere.auctionDate.gte.toISOString()).toBe('2026-03-01T18:30:00.000Z');
    });

    it('SCHED-TZ-08: Year-end rollover (Dec 30 IST -> Jan 02 next year IST)', async () => {
      // 2026-12-30 at 02:00 AM IST -> UTC: 2026-12-29T20:30:00.000Z
      // In IST, 3 calendar days ahead of Dec 30 is Jan 02, 2027!
      const runInstant = new Date('2026-12-29T20:30:00.000Z');
      jest.spyOn(Date, 'now').mockReturnValue(runInstant.getTime());

      prismaMock.auction.findMany.mockResolvedValue([]);

      await service.scanAndBroadcastUpcomingAuctions();

      const queryWhere = prismaMock.auction.findMany.mock.calls[0][0].where;
      const expectedStart = new Date('2027-01-02T00:00:00.000+05:30');
      const expectedEnd = new Date('2027-01-02T23:59:59.999+05:30');

      expect(queryWhere.auctionDate.gte).toEqual(expectedStart);
      expect(queryWhere.auctionDate.lte).toEqual(expectedEnd);
      expect(queryWhere.auctionDate.gte.toISOString()).toBe('2027-01-01T18:30:00.000Z');
    });
  });

  describe('3. Bug Contrast & Mathematical Proof (SCHED-01 Drift Eradication)', () => {
    it('SCHED-TZ-09: Mathematical proof of why legacy setHours failed and getIstDayBounds succeeds', () => {
      const targetDate = new Date('2026-10-25T00:00:00.000+05:30'); // October 25, 2026 IST

      // 1. Simulating Legacy Buggy Implementation on UTC Node Server:
      // const scanDate = new Date(targetDate);
      // const buggyStart = new Date(scanDate);
      // buggyStart.setHours(0, 0, 0, 0); // Uses UTC hours! -> 2026-10-24T00:00:00.000Z (05:30 AM Oct 24 IST!)
      // const buggyEnd = new Date(scanDate);
      // buggyEnd.setHours(23, 59, 59, 999); // -> 2026-10-24T23:59:59.999Z (05:29:59.999 AM Oct 25 IST!)

      // 2. Fixed Implementation with getIstDayBounds:
      const { startOfDay: fixedStart, endOfDay: fixedEnd } = getIstDayBounds(targetDate);

      // Candidate 1: Auction at 05:00 AM IST on target date (Oct 25)
      const dawnAuctionDate = new Date('2026-10-25T05:00:00.000+05:30'); // UTC 2026-10-24T23:30:00.000Z

      // Candidate 2: Auction at 10:30 AM IST on target date (Oct 25)
      const morningAuctionDate = new Date('2026-10-25T10:30:00.000+05:30'); // UTC 2026-10-25T05:00:00.000Z

      // In Fixed Implementation:
      // Both dawn (05:00 AM IST) and morning (10:30 AM IST) are strictly inside fixed bounds:
      expect(dawnAuctionDate.getTime() >= fixedStart.getTime()).toBe(true);
      expect(dawnAuctionDate.getTime() <= fixedEnd.getTime()).toBe(true);
      expect(morningAuctionDate.getTime() >= fixedStart.getTime()).toBe(true);
      expect(morningAuctionDate.getTime() <= fixedEnd.getTime()).toBe(true);

      // Verify exact ISO string stamps
      expect(fixedStart.toISOString()).toBe('2026-10-24T18:30:00.000Z');
      expect(fixedEnd.toISOString()).toBe('2026-10-25T18:29:59.999Z');
    });
  });
});
