import { ConfigService } from '@nestjs/config';
import { FirebasePushDriver } from '../../src/notification/drivers/firebase-push.driver';
import { MockPushDriver } from '../../src/notification/drivers/mock-push.driver';
import type { PushDriver } from '../../src/notification/drivers/push-driver.interface';
import { PushService } from '../../src/notification/services/push.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Firebase Cloud Messaging (FCM) Push Driver & PushService Tests', () => {
  describe('1. MockPushDriver', () => {
    let mockDriver: MockPushDriver;

    beforeEach(() => {
      mockDriver = new MockPushDriver();
      mockDriver.clearQueue();
    });

    it('should dispatch push notification and record in mock queue', async () => {
      const res = await mockDriver.sendPushNotification({
        recipientToken: 'sample-device-token-1234567890123456',
        title: 'Payment Received',
        body: 'Receipt KC-REC-001 issued',
        data: { type: 'RECEIPT' },
        priority: 'high',
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toMatch(/^mock-fcm-msg-/);

      const queue = mockDriver.getDispatchedPushes();
      expect(queue.length).toBe(1);
      expect(queue[0].title).toBe('Payment Received');
      expect(queue[0].priority).toBe('high');
    });

    it('should clear queue successfully', async () => {
      await mockDriver.sendPushNotification({
        recipientToken: 'token-1',
        title: 'Title',
        body: 'Body',
      });

      expect(mockDriver.getDispatchedPushes().length).toBe(1);
      mockDriver.clearQueue();
      expect(mockDriver.getDispatchedPushes().length).toBe(0);
    });
  });

  describe('2. FirebasePushDriver (Simulation & Error Handling)', () => {
    it('should operate safely in simulation fallback mode when credentials are missing', async () => {
      const configMock = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const driver = new FirebasePushDriver(configMock);
      driver.onModuleInit();

      const res = await driver.sendPushNotification({
        recipientToken: 'device-token-simulated',
        title: 'Auction Reminder',
        body: 'Chit KCA-1L Month 4',
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toContain('simulated-fcm');
    });
  });

  describe('3. PushService (Non-Blocking Guarantee & Stale Token Pruning)', () => {
    let pushService: PushService;
    let pushDriverMock: jest.Mocked<PushDriver>;
    let prismaMock: any;

    beforeEach(() => {
      pushDriverMock = {
        sendPushNotification: jest.fn(),
      };

      prismaMock = {
        user: {
          update: jest.fn().mockResolvedValue({}),
        },
        customer: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      pushService = new PushService(pushDriverMock, prismaMock as unknown as PrismaService);
    });

    it('should dispatch push notification successfully via driver', async () => {
      pushDriverMock.sendPushNotification.mockResolvedValue({
        success: true,
        messageId: 'fcm-msg-12345',
      });

      const res = await pushService.sendPushNotification({
        recipientToken: 'valid-token',
        title: 'Title',
        body: 'Body',
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toBe('fcm-msg-12345');
      expect(prismaMock.user.update).not.toHaveBeenCalled();
      expect(prismaMock.customer.update).not.toHaveBeenCalled();
    });

    it('should catch unexpected driver errors and preserve Financial Non-Blocking Guarantee', async () => {
      pushDriverMock.sendPushNotification.mockRejectedValue(new Error('Network socket hangup'));

      const res = await pushService.sendPushNotification({
        recipientToken: 'token',
        title: 'Title',
        body: 'Body',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Network socket hangup');
    });

    it('should automatically prune stale fcmToken on User record when tokenInvalid is returned', async () => {
      pushDriverMock.sendPushNotification.mockResolvedValue({
        success: false,
        error: 'Requested entity was not found',
        tokenInvalid: true,
      });

      const res = await pushService.sendPushNotification(
        {
          recipientToken: 'expired-token',
          title: 'Approval Request',
          body: 'Maker-Checker reversal pending',
        },
        { userId: 'user-partner-001' },
      );

      expect(res.tokenInvalid).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-partner-001' },
        data: { fcmToken: null },
      });
    });

    it('should automatically prune stale fcmToken on Customer record when tokenInvalid is returned', async () => {
      pushDriverMock.sendPushNotification.mockResolvedValue({
        success: false,
        error: 'Invalid registration token',
        tokenInvalid: true,
      });

      const res = await pushService.sendPushNotification(
        {
          recipientToken: 'unregistered-customer-token',
          title: 'Default Notice',
          body: 'Overdue installment',
        },
        { customerId: 'cust-uuid-444' },
      );

      expect(res.tokenInvalid).toBe(true);
      expect(prismaMock.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-uuid-444' },
        data: { fcmToken: null },
      });
    });
  });
});
