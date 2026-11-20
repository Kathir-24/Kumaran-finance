// ==============================================================================
// Kumaran Chits — Issue 7 (P1: JOB-01): NotificationService Idempotency Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Architecture: ADR-10, Guardrails 10 & 11, BullMQ Redis Worker Idempotency
// Test Coverage:
//   1. First-run calls acquire Redis lock and dispatch normally (Receipt, Default Warning, Auction Result, Approval Alert).
//   2. Second-run calls within TTL return idempotency skip (isDuplicate: true) with ZERO duplicate SMS or Push dispatches.
//   3. Fail-open behavior when Redis is disconnected (getIsConnected() === false).
//   4. Fail-open behavior when Redis throws an unexpected runtime/network error during lock acquisition.
//   5. Fail-open behavior when RedisProvider or client is null/undefined.
// ==============================================================================

import { Role } from '@prisma/client';
import { NotificationService } from '../../src/jobs/services/notification.service';
import {
  ApprovalAlertJobPayload,
  AuctionResultNotificationJobPayload,
  DefaultWarningJobPayload,
  PaymentReceiptNotificationJobPayload,
} from '../../src/jobs/dto/job-payloads.dto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PushService } from '../../src/notification/services/push.service';
import { SmsService } from '../../src/notification/services/sms.service';
import { PdfService } from '../../src/pdf/pdf.service';
import { RedisConnectionProvider } from '../../src/jobs/providers/redis-connection.provider';

describe('JOB-01: Atomic Redis Worker Idempotency in NotificationService', () => {
  let notificationService: NotificationService;
  let smsServiceMock: jest.Mocked<Partial<SmsService>>;
  let pushServiceMock: jest.Mocked<Partial<PushService>>;
  let prismaMock: any;
  let pdfServiceMock: jest.Mocked<Partial<PdfService>>;
  let redisClientMock: {
    set: jest.Mock;
    pipeline: jest.Mock;
    lrange: jest.Mock;
    del: jest.Mock;
  };
  let redisProviderMock: {
    getClient: jest.Mock;
    getIsConnected: jest.Mock;
  };

  const sampleReceiptPayloadPush: PaymentReceiptNotificationJobPayload = {
    paymentId: 'pay-uuid-001',
    receiptNumber: 'KC-REC-2026-0001',
    recipientPhone: '9842199001',
    subscriberName: 'Murugan K',
    chitCode: 'KCA-1L-20M-01',
    ticketNumber: 3,
    amountPaid: '5000',
    paymentMode: 'CASH',
    transactionTimestamp: '2026-11-20 10:00:00',
    receiptDownloadUrl: 'https://storage.kumaranfinance.in/rec-001.pdf',
    fcmToken: 'fcm-token-murugan',
    passbookAppUrl: 'https://app.kumaranfinance.in/passbook',
  };

  const sampleReceiptPayloadSms: PaymentReceiptNotificationJobPayload = {
    paymentId: 'pay-uuid-002',
    receiptNumber: 'KC-REC-2026-0002',
    recipientPhone: '9842199002',
    subscriberName: 'Kandasamy S',
    chitCode: 'KCA-1L-20M-01',
    ticketNumber: 4,
    amountPaid: '5000',
    paymentMode: 'CASH',
    transactionTimestamp: '2026-11-20 10:05:00',
    receiptDownloadUrl: 'https://storage.kumaranfinance.in/rec-002.pdf',
    passbookAppUrl: 'https://app.kumaranfinance.in/passbook',
  };

  const sampleDefaultWarningPayload: DefaultWarningJobPayload = {
    ticketId: 'ticket-uuid-777',
    customerName: 'Senthil V',
    customerPhone: '9842199003',
    chitCode: 'KCA-1L-20M-01',
    ticketNumber: 7,
    consecutiveUnpaidMonths: 3,
    totalOverdueAmount: '15000',
  };

  const sampleAuctionResultPayload: AuctionResultNotificationJobPayload = {
    chitGroupId: 'chit-group-uuid-888',
    chitCode: 'KCA-1L-20M-01',
    installmentMonth: 4,
    winningTicketNumber: 5,
    winningDiscountAmount: '25000',
    winningBidDiscount: '25000',
    dividendPerTicket: '1050',
    nextMonthNetPayable: '3950',
    netInstallmentDue: '3950',
    subscribers: [
      {
        name: 'Member 1 (App)',
        phone: '9842199011',
        fcmToken: 'fcm-sub-1',
      },
      {
        name: 'Member 2 (Keypad)',
        phone: '9842199012',
      },
    ],
  };

  const sampleApprovalAlertPayload: ApprovalAlertJobPayload = {
    approvalType: 'REVERSAL_APPROVAL',
    title: 'திருப்புதல் ஒப்புதல் தேவை / Reversal Approval Required',
    body: 'Payment reversal of Rs. 5,000 pending partner approval.',
    entityId: 'pay-rev-uuid-999',
    amount: '5000',
    excludeUserId: 'partner-maker-uuid-1',
    data: { paymentId: 'pay-001' },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    smsServiceMock = {
      sendPaymentReceiptSms: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-rec-msg-1' }),
      sendDefaultWarningSms: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-def-msg-1' }),
      sendAuctionResultSms: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-auc-msg-1' }),
    };

    pushServiceMock = {
      sendPushNotification: jest.fn().mockResolvedValue({ success: true, messageId: 'push-fcm-msg-1' }),
    };

    pdfServiceMock = {
      generateReceiptPdf: jest.fn().mockResolvedValue('https://storage.kumaranfinance.in/receipts/rec-001.pdf'),
    };

    prismaMock = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'partner-checker-01',
            name: 'Partner B (Checker)',
            phone: '9842199002',
            fcmToken: 'fcm-token-partner-b',
          },
          {
            id: 'partner-checker-02',
            name: 'Partner C (Checker)',
            phone: '9842199003',
            fcmToken: 'fcm-token-partner-c',
          },
        ]),
      },
    };

    const mockPipeline: any = {
      lpush: jest.fn(() => mockPipeline),
      ltrim: jest.fn(() => mockPipeline),
      expire: jest.fn(() => mockPipeline),
      exec: jest.fn().mockResolvedValue(['OK', 'OK', 'OK']),
    };

    redisClientMock = {
      set: jest.fn().mockResolvedValue('OK'),
      pipeline: jest.fn(() => mockPipeline),
      lrange: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
    };

    redisProviderMock = {
      getClient: jest.fn().mockReturnValue(redisClientMock),
      getIsConnected: jest.fn().mockReturnValue(true),
    };

    notificationService = new NotificationService(
      smsServiceMock as unknown as SmsService,
      pushServiceMock as unknown as PushService,
      prismaMock as unknown as PrismaService,
      redisProviderMock as unknown as RedisConnectionProvider,
      pdfServiceMock as unknown as PdfService,
    );
    notificationService.clearLog();
  });

  describe('1. First-Run Normal Execution (Atomic Lock Acquired)', () => {
    it('dispatchPaymentReceipt: acquires Redis lock with TTL 86400 and dispatches push', async () => {
      redisClientMock.set.mockResolvedValue('OK');

      const result = await notificationService.dispatchPaymentReceipt(sampleReceiptPayloadPush);

      // Verify Redis lock acquisition: key, timestamp value, 'EX', 86400, 'NX'
      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [key, value, exFlag, ttl, nxFlag] = redisClientMock.set.mock.calls[0];
      expect(key).toBe(`lock:idemp:notify:receipt:${sampleReceiptPayloadPush.paymentId}`);
      expect(typeof value).toBe('string');
      expect(exFlag).toBe('EX');
      expect(ttl).toBe(86400);
      expect(nxFlag).toBe('NX');

      // Verify side effects occurred normally
      expect(pdfServiceMock.generateReceiptPdf).toHaveBeenCalledWith(sampleReceiptPayloadPush.paymentId);
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
      expect(smsServiceMock.sendPaymentReceiptSms).not.toHaveBeenCalled();

      // Verify result
      expect(result.channel).toBe('PUSH_NOTIFICATION');
      expect(result.pushId).toBe('push-fcm-msg-1');
      expect(result.isDuplicate).toBeUndefined();
    });

    it('dispatchPaymentReceipt: falls back to receiptNumber when paymentId is absent or empty', async () => {
      redisClientMock.set.mockResolvedValue('OK');
      const payloadWithoutPaymentId = { ...sampleReceiptPayloadSms, paymentId: '' };

      const result = await notificationService.dispatchPaymentReceipt(payloadWithoutPaymentId);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [key, , exFlag, ttl, nxFlag] = redisClientMock.set.mock.calls[0];
      expect(key).toBe(`lock:idemp:notify:receipt:${payloadWithoutPaymentId.receiptNumber}`);
      expect(exFlag).toBe('EX');
      expect(ttl).toBe(86400);
      expect(nxFlag).toBe('NX');

      expect(smsServiceMock.sendPaymentReceiptSms).toHaveBeenCalledTimes(1);
      expect(result.channel).toBe('SMS_DLT');
      expect(result.isDuplicate).toBeUndefined();
    });

    it('dispatchDefaultWarning: acquires Redis lock with ticketId:dateStr and dispatches warning SMS', async () => {
      redisClientMock.set.mockResolvedValue('OK');
      const todayDateStr = new Date().toISOString().slice(0, 10);

      const result = await notificationService.dispatchDefaultWarning(sampleDefaultWarningPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [key, , exFlag, ttl, nxFlag] = redisClientMock.set.mock.calls[0];
      expect(key).toBe(`lock:idemp:notify:default-warn:${sampleDefaultWarningPayload.ticketId}:${todayDateStr}`);
      expect(exFlag).toBe('EX');
      expect(ttl).toBe(86400);
      expect(nxFlag).toBe('NX');

      expect(smsServiceMock.sendDefaultWarningSms).toHaveBeenCalledTimes(1);
      expect(result.channel).toBe('SMS_DLT');
      expect(result.notificationId).toBeDefined();
      expect(result.isDuplicate).toBeUndefined();
    });

    it('dispatchAuctionResult: acquires Redis lock with chitGroupId:month and dispatches to all subscribers', async () => {
      redisClientMock.set.mockResolvedValue('OK');

      const result = await notificationService.dispatchAuctionResult(sampleAuctionResultPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [key, , exFlag, ttl, nxFlag] = redisClientMock.set.mock.calls[0];
      expect(key).toBe(
        `lock:idemp:notify:auction-res:${sampleAuctionResultPayload.chitGroupId}:${sampleAuctionResultPayload.installmentMonth}`,
      );
      expect(exFlag).toBe('EX');
      expect(ttl).toBe(86400);
      expect(nxFlag).toBe('NX');

      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
      expect(smsServiceMock.sendAuctionResultSms).toHaveBeenCalledTimes(1);
      expect(result.dispatchedCount).toBe(2);
      expect(result.pushCount).toBe(1);
      expect(result.smsCount).toBe(1);
      expect(result.isDuplicate).toBeUndefined();
    });

    it('dispatchApprovalAlert: acquires Redis lock with approvalType:entityId and dispatches partner alerts', async () => {
      redisClientMock.set.mockResolvedValue('OK');

      const result = await notificationService.dispatchApprovalAlert(sampleApprovalAlertPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      const [key, , exFlag, ttl, nxFlag] = redisClientMock.set.mock.calls[0];
      expect(key).toBe(
        `lock:idemp:notify:approval-alert:${sampleApprovalAlertPayload.approvalType}:${sampleApprovalAlertPayload.entityId}`,
      );
      expect(exFlag).toBe('EX');
      expect(ttl).toBe(3600);
      expect(nxFlag).toBe('NX');

      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(2);
      expect(result.partnerCount).toBe(2);
      expect(result.dispatchedCount).toBe(2);
      expect(result.isDuplicate).toBeUndefined();
    });
  });

  describe('2. Second-Run Duplicate Prevention (Zero Duplicate Dispatches within TTL)', () => {
    it('dispatchPaymentReceipt: returns isDuplicate: true and skips PDF generation, SMS, and Push dispatches', async () => {
      // Simulate Redis SET NX returning null (key already exists, lock NOT acquired)
      redisClientMock.set.mockResolvedValue(null);

      const result = await notificationService.dispatchPaymentReceipt(sampleReceiptPayloadPush);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBe(true);
      expect(result.channel).toBe('PUSH_NOTIFICATION');
      expect(result.pushId).toBeUndefined();
      expect(result.smsId).toBeUndefined();

      // ZERO Duplicate Dispatches Assertions
      expect(pdfServiceMock.generateReceiptPdf).not.toHaveBeenCalled();
      expect(pushServiceMock.sendPushNotification).not.toHaveBeenCalled();
      expect(smsServiceMock.sendPaymentReceiptSms).not.toHaveBeenCalled();
      expect(notificationService.getSentNotificationLog()).toHaveLength(0);
    });

    it('dispatchDefaultWarning: returns isDuplicate: true and skips duplicate warning dispatch', async () => {
      redisClientMock.set.mockResolvedValue(null);

      const result = await notificationService.dispatchDefaultWarning(sampleDefaultWarningPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBe(true);
      expect(result.notificationId).toBe('duplicate-skipped');
      expect(result.channel).toBe('SMS_DLT');

      // ZERO Duplicate Dispatches Assertions
      expect(smsServiceMock.sendDefaultWarningSms).not.toHaveBeenCalled();
      expect(pushServiceMock.sendPushNotification).not.toHaveBeenCalled();
      expect(notificationService.getSentNotificationLog()).toHaveLength(0);
    });

    it('dispatchAuctionResult: returns isDuplicate: true and skips all subscriber dispatches', async () => {
      redisClientMock.set.mockResolvedValue(null);

      const result = await notificationService.dispatchAuctionResult(sampleAuctionResultPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBe(true);
      expect(result.dispatchedCount).toBe(0);
      expect(result.pushCount).toBe(0);
      expect(result.smsCount).toBe(0);

      // ZERO Duplicate Dispatches Assertions
      expect(pushServiceMock.sendPushNotification).not.toHaveBeenCalled();
      expect(smsServiceMock.sendAuctionResultSms).not.toHaveBeenCalled();
      expect(notificationService.getSentNotificationLog()).toHaveLength(0);
    });

    it('dispatchApprovalAlert: returns isDuplicate: true and skips partner queries and push alerts', async () => {
      redisClientMock.set.mockResolvedValue(null);

      const result = await notificationService.dispatchApprovalAlert(sampleApprovalAlertPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBe(true);
      expect(result.dispatchedCount).toBe(0);
      expect(result.partnerCount).toBe(0);

      // ZERO Duplicate Dispatches Assertions
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(pushServiceMock.sendPushNotification).not.toHaveBeenCalled();
      expect(notificationService.getSentNotificationLog()).toHaveLength(0);
    });
  });

  describe('3. Fail-Open Resilience when Redis is Disconnected (getIsConnected() === false)', () => {
    beforeEach(() => {
      redisProviderMock.getIsConnected.mockReturnValue(false);
    });

    it('dispatchPaymentReceipt: succeeds gracefully without blocking when Redis is offline', async () => {
      const result = await notificationService.dispatchPaymentReceipt(sampleReceiptPayloadPush);

      expect(redisClientMock.set).not.toHaveBeenCalled();
      expect(result.isDuplicate).toBeUndefined();
      expect(result.channel).toBe('PUSH_NOTIFICATION');
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
      expect(pdfServiceMock.generateReceiptPdf).toHaveBeenCalledTimes(1);
    });

    it('dispatchDefaultWarning: succeeds gracefully without blocking when Redis is offline', async () => {
      const result = await notificationService.dispatchDefaultWarning(sampleDefaultWarningPayload);

      expect(redisClientMock.set).not.toHaveBeenCalled();
      expect(result.isDuplicate).toBeUndefined();
      expect(result.channel).toBe('SMS_DLT');
      expect(smsServiceMock.sendDefaultWarningSms).toHaveBeenCalledTimes(1);
    });

    it('dispatchAuctionResult: succeeds gracefully without blocking when Redis is offline', async () => {
      const result = await notificationService.dispatchAuctionResult(sampleAuctionResultPayload);

      expect(redisClientMock.set).not.toHaveBeenCalled();
      expect(result.isDuplicate).toBeUndefined();
      expect(result.dispatchedCount).toBe(2);
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
      expect(smsServiceMock.sendAuctionResultSms).toHaveBeenCalledTimes(1);
    });

    it('dispatchApprovalAlert: succeeds gracefully without blocking when Redis is offline', async () => {
      const result = await notificationService.dispatchApprovalAlert(sampleApprovalAlertPayload);

      expect(redisClientMock.set).not.toHaveBeenCalled();
      expect(result.isDuplicate).toBeUndefined();
      expect(result.dispatchedCount).toBe(2);
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('4. Fail-Open Resilience on Redis Operation Error / Exception', () => {
    beforeEach(() => {
      redisProviderMock.getIsConnected.mockReturnValue(true);
      redisClientMock.set.mockRejectedValue(new Error('READONLY You cannot write against a read only replica.'));
    });

    it('dispatchPaymentReceipt: catches Redis error, logs warning, and dispatches normally', async () => {
      const result = await notificationService.dispatchPaymentReceipt(sampleReceiptPayloadPush);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBeUndefined();
      expect(result.channel).toBe('PUSH_NOTIFICATION');
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
    });

    it('dispatchDefaultWarning: catches Redis error, logs warning, and dispatches normally', async () => {
      const result = await notificationService.dispatchDefaultWarning(sampleDefaultWarningPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBeUndefined();
      expect(result.channel).toBe('SMS_DLT');
      expect(smsServiceMock.sendDefaultWarningSms).toHaveBeenCalledTimes(1);
    });

    it('dispatchAuctionResult: catches Redis error, logs warning, and dispatches normally', async () => {
      const result = await notificationService.dispatchAuctionResult(sampleAuctionResultPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBeUndefined();
      expect(result.dispatchedCount).toBe(2);
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
      expect(smsServiceMock.sendAuctionResultSms).toHaveBeenCalledTimes(1);
    });

    it('dispatchApprovalAlert: catches Redis error, logs warning, and dispatches normally', async () => {
      const result = await notificationService.dispatchApprovalAlert(sampleApprovalAlertPayload);

      expect(redisClientMock.set).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBeUndefined();
      expect(result.dispatchedCount).toBe(2);
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('5. Fail-Open Resilience when RedisProvider or Client is Null / Undefined', () => {
    it('dispatches normally when RedisProvider is not injected into NotificationService', async () => {
      const standaloneService = new NotificationService(
        smsServiceMock as unknown as SmsService,
        pushServiceMock as unknown as PushService,
        prismaMock as unknown as PrismaService,
        undefined, // No RedisProvider
        pdfServiceMock as unknown as PdfService,
      );

      const receiptRes = await standaloneService.dispatchPaymentReceipt(sampleReceiptPayloadPush);
      expect(receiptRes.isDuplicate).toBeUndefined();
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);

      const defaultRes = await standaloneService.dispatchDefaultWarning(sampleDefaultWarningPayload);
      expect(defaultRes.isDuplicate).toBeUndefined();
      expect(smsServiceMock.sendDefaultWarningSms).toHaveBeenCalledTimes(1);

      const auctionRes = await standaloneService.dispatchAuctionResult(sampleAuctionResultPayload);
      expect(auctionRes.isDuplicate).toBeUndefined();
      expect(auctionRes.dispatchedCount).toBe(2);

      const alertRes = await standaloneService.dispatchApprovalAlert(sampleApprovalAlertPayload);
      expect(alertRes.isDuplicate).toBeUndefined();
      expect(alertRes.dispatchedCount).toBe(2);
    });

    it('dispatches normally when RedisProvider.getClient() returns null', async () => {
      const nullClientProvider = {
        getClient: jest.fn().mockReturnValue(null),
        getIsConnected: jest.fn().mockReturnValue(true),
      };

      const serviceWithNullClient = new NotificationService(
        smsServiceMock as unknown as SmsService,
        pushServiceMock as unknown as PushService,
        prismaMock as unknown as PrismaService,
        nullClientProvider as unknown as RedisConnectionProvider,
        pdfServiceMock as unknown as PdfService,
      );

      const receiptRes = await serviceWithNullClient.dispatchPaymentReceipt(sampleReceiptPayloadPush);
      expect(receiptRes.isDuplicate).toBeUndefined();
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
    });
  });
});
