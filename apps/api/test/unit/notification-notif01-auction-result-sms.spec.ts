// ==============================================================================
// Kumaran Chits — Issue NOTIF-01: Auction Result SMS Unit Test Suite
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// Invariant 2: Pure Whole Rupee Math (BigInt formatting)
// Invariant: Financial Non-Blocking Guarantee & Elimination of Fake Mock SMS IDs
// ==============================================================================

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SMS_DRIVER_TOKEN } from '../../src/notification/constants/notification.constants';
import type { SmsDispatchResult, SmsDriver } from '../../src/notification/drivers/sms-driver.interface';
import { SmsService } from '../../src/notification/services/sms.service';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { PushService } from '../../src/notification/services/push.service';
import { DLT_CONFIG } from '../../src/notification/templates/dlt-templates.constants';
import { AuctionResultNotificationJobPayload } from '../../src/jobs/dto/job-payloads.dto';

describe('Issue NOTIF-01: Auction Result SMS Delivery & Real Gateway Tracking Suite', () => {
  describe('1. SmsService.sendAuctionResultSms — DLT Template & Currency Formatting', () => {
    let smsService: SmsService;
    let smsDriverMock: { providerName: string; sendSms: jest.Mock };
    let configServiceMock: { get: jest.Mock };

    beforeEach(async () => {
      smsDriverMock = {
        providerName: 'msg91',
        sendSms: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'msg91-carrier-auc-100234',
          provider: 'msg91',
        } as SmsDispatchResult),
      };

      configServiceMock = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'MSG91_DLT_AUCTION_RESULT_TEMPLATE_ID') return null; // Default to DLT_CONFIG
          if (key === 'SMS_SENDER_ID') return 'KMRCHT';
          return null;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          {
            provide: SMS_DRIVER_TOKEN,
            useValue: smsDriverMock,
          },
          {
            provide: ConfigService,
            useValue: configServiceMock,
          },
        ],
      }).compile();

      smsService = module.get<SmsService>(SmsService);
    });

    it('should format BigInt amounts with Indian grouping and call smsDriver.sendSms with TRAI DLT template 1407169823412093851', async () => {
      const result = await smsService.sendAuctionResultSms({
        recipientPhone: '9842143210',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 4,
        winningBidDiscount: 25000n, // BigInt Whole Rupee Math
        dividendPerTicket: 1050n,   // BigInt
        netInstallmentDue: 3950n,   // BigInt
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg91-carrier-auc-100234');
      expect(smsDriverMock.sendSms).toHaveBeenCalledTimes(1);

      const callArg = smsDriverMock.sendSms.mock.calls[0][0];
      // TRAI DLT Registration Assertions
      expect(callArg.dltTemplateId).toBe('1407169823412093851');
      expect(callArg.dltTemplateId).toBe(DLT_CONFIG.TEMPLATES.AUCTION_RESULT.templateId);
      expect(callArg.to).toBe('9842143210');

      // Interpolation & BigInt Indian Currency Formatting Assertions
      expect(callArg.message).toBe(
        'Kumaran Chits: Chit KCA-1L-20M-01 Month 4 auction won at Rs.25,000 discount. Your dividend credit is Rs.1,050. Next month net due is Rs.3,950. View details: https://app.kumaranfinance.in/passbook',
      );

      // Positional MSG91 Variables
      expect(callArg.variables).toEqual({
        var1: 'KCA-1L-20M-01',
        var2: '4',
        var3: '25,000',
        var4: '1,050',
        var5: '3,950',
        var6: 'https://app.kumaranfinance.in/passbook',
      });
    });

    it('should support custom passbookAppUrl and handle string/number amounts gracefully', async () => {
      await smsService.sendAuctionResultSms({
        recipientPhone: '9443212345',
        chitCode: 'KCB-5L-20M-03',
        installmentMonth: 12,
        winningBidDiscount: '125000',
        dividendPerTicket: '5250',
        netInstallmentDue: '19750',
        passbookAppUrl: 'https://app.kumaranfinance.in/p/custom-link-77',
      });

      expect(smsDriverMock.sendSms).toHaveBeenCalledTimes(1);
      const callArg = smsDriverMock.sendSms.mock.calls[0][0];

      expect(callArg.message).toContain('Rs.1,25,000 discount');
      expect(callArg.message).toContain('Rs.5,250');
      expect(callArg.message).toContain('Rs.19,750');
      expect(callArg.message).toContain('https://app.kumaranfinance.in/p/custom-link-77');
      expect(callArg.variables).toEqual({
        var1: 'KCB-5L-20M-03',
        var2: '12',
        var3: '1,25,000',
        var4: '5,250',
        var5: '19,750',
        var6: 'https://app.kumaranfinance.in/p/custom-link-77',
      });
    });

    it('should respect ConfigService override for MSG91_DLT_AUCTION_RESULT_TEMPLATE_ID', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'MSG91_DLT_AUCTION_RESULT_TEMPLATE_ID') return '9999999999999999999';
        return null;
      });

      await smsService.sendAuctionResultSms({
        recipientPhone: '9842143210',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 2,
        winningBidDiscount: 20000n,
        dividendPerTicket: 800n,
        netInstallmentDue: 4200n,
      });

      const callArg = smsDriverMock.sendSms.mock.calls[0][0];
      expect(callArg.dltTemplateId).toBe('9999999999999999999');
    });

    it('should guarantee Financial Non-Blocking: returns success: false instead of throwing if driver fails', async () => {
      smsDriverMock.sendSms.mockRejectedValueOnce(new Error('Gateway HTTP 504 Gateway Timeout'));

      const result = await smsService.sendAuctionResultSms({
        recipientPhone: '9842143210',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 3,
        winningBidDiscount: 25000n,
        dividendPerTicket: 1050n,
        netInstallmentDue: 3950n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gateway HTTP 504 Gateway Timeout');
    });
  });

  describe('2. NotificationService.dispatchAuctionResult — Multi-Channel Routing & Mock ID Elimination', () => {
    let notificationService: NotificationService;
    let smsServiceMock: { sendAuctionResultSms: jest.Mock };
    let pushServiceMock: { sendPushNotification: jest.Mock };

    beforeEach(() => {
      smsServiceMock = {
        sendAuctionResultSms: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'msg91-carrier-auc-live-883311',
          provider: 'msg91',
        } as SmsDispatchResult),
      };

      pushServiceMock = {
        sendPushNotification: jest.fn().mockResolvedValue({
          success: true,
          messageId: 'fcm-push-auc-res-554422',
        }),
      };

      notificationService = new NotificationService(
        smsServiceMock as unknown as SmsService,
        pushServiceMock as unknown as PushService,
      );
      notificationService.clearLog();
    });

    it('should route to pushService for app subscribers (fcmToken present) and never call smsService', async () => {
      const payload: AuctionResultNotificationJobPayload = {
        chitGroupId: 'chit-group-001',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 5,
        winningTicketNumber: 14,
        winningDiscountAmount: '22000',
        dividendPerTicket: '950',
        nextMonthNetPayable: '4050',
        subscribers: [
          {
            name: 'P. Anandhan (Smartphone App User)',
            phone: '9842100001',
            fcmToken: 'fcm-anandhan-token-12345',
          },
        ],
      };

      const result = await notificationService.dispatchAuctionResult(payload);

      expect(result.dispatchedCount).toBe(1);
      expect(result.pushCount).toBe(1);
      expect(result.smsCount).toBe(0);

      // Verify pushService was invoked
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(1);
      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledWith({
        recipientToken: 'fcm-anandhan-token-12345',
        title: expect.stringContaining('குமரன் பைனான்ஸ்'),
        body: expect.stringContaining('ரூ. 950'),
        data: {
          type: 'AUCTION_RESULT',
          chitCode: 'KCA-1L-20M-01',
          installmentMonth: '5',
        },
      });

      // Verify smsService was NOT invoked
      expect(smsServiceMock.sendAuctionResultSms).not.toHaveBeenCalled();

      // Verify audit sent log
      const logs = notificationService.getSentNotificationLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].channel).toBe('PUSH_NOTIFICATION');
      expect(logs[0].id).toBe('fcm-push-auc-res-554422');
      expect(logs[0].status).toBe('DELIVERED');
    });

    it('should route to smsService.sendAuctionResultSms for keypad/non-app subscribers (fcmToken missing)', async () => {
      const payload: AuctionResultNotificationJobPayload = {
        chitGroupId: 'chit-group-001',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 5,
        winningTicketNumber: 14,
        winningDiscountAmount: '22000',
        dividendPerTicket: '950',
        nextMonthNetPayable: '4050',
        subscribers: [
          {
            name: 'M. Karuppasamy (Keypad Phone User)',
            phone: '9842100002',
            // fcmToken is undefined
          },
        ],
      };

      const result = await notificationService.dispatchAuctionResult(payload);

      expect(result.dispatchedCount).toBe(1);
      expect(result.pushCount).toBe(0);
      expect(result.smsCount).toBe(1);

      // Verify pushService was NOT invoked
      expect(pushServiceMock.sendPushNotification).not.toHaveBeenCalled();

      // Verify smsService WAS invoked with exact chit parameters
      expect(smsServiceMock.sendAuctionResultSms).toHaveBeenCalledTimes(1);
      expect(smsServiceMock.sendAuctionResultSms).toHaveBeenCalledWith({
        recipientPhone: '9842100002',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 5,
        winningBidDiscount: '22000',
        dividendPerTicket: '950',
        netInstallmentDue: '4050',
        passbookAppUrl: 'https://app.kumaranfinance.in/passbook',
      });
    });

    it('should completely eliminate fake mock IDs and record the real driver messageId in audit logs', async () => {
      const realGatewayMessageId = 'msg91-req-carrier-auction-live-998877';
      smsServiceMock.sendAuctionResultSms!.mockResolvedValueOnce({
        success: true,
        messageId: realGatewayMessageId,
        provider: 'msg91',
      });

      const payload: AuctionResultNotificationJobPayload = {
        chitGroupId: 'chit-group-001',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 6,
        winningTicketNumber: 8,
        winningDiscountAmount: '25000',
        dividendPerTicket: '1050',
        nextMonthNetPayable: '3950',
        subscribers: [
          {
            name: 'K. Muthusamy (Keypad)',
            phone: '9842100003',
          },
        ],
      };

      await notificationService.dispatchAuctionResult(payload);

      const logs = notificationService.getSentNotificationLog();
      expect(logs).toHaveLength(1);
      const smsLog = logs[0];

      // CRITICAL ASSERTION: Mock IDs ('mock-sms-...' and 'sms-res-...') are eliminated
      expect(smsLog.id).toBe(realGatewayMessageId);
      expect(smsLog.id).not.toContain('mock-sms-');
      expect(smsLog.id).not.toMatch(/^sms-res-/);
      expect(smsLog.channel).toBe('SMS_DLT');
      expect(smsLog.status).toBe('DELIVERED');
      expect(smsLog.messageText).toContain('Chit KCA-1L-20M-01 Month 6 auction won at Rs.25,000 discount');
      expect(smsLog.messageText).toContain('Your dividend credit is Rs.1,050');
      expect(smsLog.messageText).toContain('Next month net due is Rs.3,950');
    });

    it('should correctly partition mixed subscriber pools (Smartphone Push vs Keypad SMS)', async () => {
      const payload: AuctionResultNotificationJobPayload = {
        chitGroupId: 'chit-group-001',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 7,
        winningTicketNumber: 3,
        winningDiscountAmount: '24000',
        dividendPerTicket: '1000',
        nextMonthNetPayable: '4000',
        subscribers: [
          { name: 'User 1 (App)', phone: '9842100001', fcmToken: 'fcm-token-1' },
          { name: 'User 2 (Keypad)', phone: '9842100002' },
          { name: 'User 3 (App)', phone: '9842100003', fcmToken: 'fcm-token-3' },
          { name: 'User 4 (Keypad)', phone: '9842100004' },
          { name: 'User 5 (Keypad)', phone: '9842100005' },
        ],
      };

      const result = await notificationService.dispatchAuctionResult(payload);

      expect(result.dispatchedCount).toBe(5);
      expect(result.pushCount).toBe(2);
      expect(result.smsCount).toBe(3);

      expect(pushServiceMock.sendPushNotification).toHaveBeenCalledTimes(2);
      expect(smsServiceMock.sendAuctionResultSms).toHaveBeenCalledTimes(3);

      const logs = notificationService.getSentNotificationLog();
      expect(logs).toHaveLength(5);

      const pushLogs = logs.filter((l) => l.channel === 'PUSH_NOTIFICATION');
      const smsLogs = logs.filter((l) => l.channel === 'SMS_DLT');

      expect(pushLogs).toHaveLength(2);
      expect(smsLogs).toHaveLength(3);

      // Verify each SMS log recorded real message ID and none contain mock prefixes
      for (const smsRecord of smsLogs) {
        expect(smsRecord.id).toBe('msg91-carrier-auc-live-883311');
        expect(smsRecord.id).not.toContain('mock-sms-');
        expect(smsRecord.id).not.toMatch(/^sms-res-/);
      }
    });

    it('should mark status as FAILED in audit log when gateway reports failure without blocking workflow', async () => {
      smsServiceMock.sendAuctionResultSms!.mockResolvedValueOnce({
        success: false,
        messageId: 'msg91-carrier-err-442211',
        error: 'TRAI DLT Template Variable Mismatch',
        provider: 'msg91',
      });

      const payload: AuctionResultNotificationJobPayload = {
        chitGroupId: 'chit-group-001',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 8,
        winningTicketNumber: 5,
        winningDiscountAmount: '20000',
        dividendPerTicket: '800',
        nextMonthNetPayable: '4200',
        subscribers: [
          { name: 'Keypad User Inactive', phone: '9842100009' },
        ],
      };

      const result = await notificationService.dispatchAuctionResult(payload);

      expect(result.dispatchedCount).toBe(1);
      expect(result.smsCount).toBe(1);

      const logs = notificationService.getSentNotificationLog();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('FAILED');
      expect(logs[0].id).toBe('msg91-carrier-err-442211');
      expect(logs[0].id).not.toContain('mock-sms-');
      expect(logs[0].id).not.toMatch(/^sms-res-/);
    });
  });
});
