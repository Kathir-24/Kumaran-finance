// ==============================================================================
// Kumaran Chits — SMS Pluggable Drivers & DLT Formatter Unit Tests
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// Invariant: Financial Non-Blocking Guarantee (SMS error never aborts transactions)
// ==============================================================================

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SMS_DRIVER_TOKEN } from '../../src/notification/constants/notification.constants';
import { MockSmsDriver } from '../../src/notification/drivers/mock-sms.driver';
import { Msg91SmsDriver } from '../../src/notification/drivers/msg91-sms.driver';
import { DltTemplateFormatter } from '../../src/notification/helpers/dlt-template-formatter.helper';
import { PhoneHelper } from '../../src/notification/helpers/phone.helper';
import { SmsService } from '../../src/notification/services/sms.service';
import { NotificationService } from '../../src/jobs/services/notification.service';
import { DLT_CONFIG } from '../../src/notification/templates/dlt-templates.constants';

describe('Component 3: Pluggable SMS Drivers & DLT Notification Suite', () => {
  describe('1. PhoneHelper (MSISDN Normalization & DPDP Masking)', () => {
    it('should format 10-digit Indian numbers to 12-digit MSISDN (91XXXXXXXXXX)', () => {
      expect(PhoneHelper.formatIndianMsisdn('9842143210')).toBe('919842143210');
    });

    it('should normalize numbers with leading 0 to 12-digit MSISDN', () => {
      expect(PhoneHelper.formatIndianMsisdn('09842143210')).toBe('919842143210');
    });

    it('should normalize international formatted strings (+91, spaces, hyphens)', () => {
      expect(PhoneHelper.formatIndianMsisdn('+91 98421-43210')).toBe('919842143210');
      expect(PhoneHelper.formatIndianMsisdn('919842143210')).toBe('919842143210');
    });

    it('should validate legitimate Indian mobile numbers (starts with 6, 7, 8, 9)', () => {
      expect(PhoneHelper.isValidIndianMobile('9842143210')).toBe(true);
      expect(PhoneHelper.isValidIndianMobile('+91 8765432109')).toBe(true);
      expect(PhoneHelper.isValidIndianMobile('7012345678')).toBe(true);
      expect(PhoneHelper.isValidIndianMobile('6381234567')).toBe(true);

      // Invalid cases
      expect(PhoneHelper.isValidIndianMobile('5842143210')).toBe(false);
      expect(PhoneHelper.isValidIndianMobile('12345')).toBe(false);
      expect(PhoneHelper.isValidIndianMobile('')).toBe(false);
    });

    it('should mask phone number preserving country code and last 4 digits per DPDP Act', () => {
      expect(PhoneHelper.maskPhone('9842143210')).toBe('+91******3210');
      expect(PhoneHelper.maskPhone('919842143210')).toBe('+91******3210');
      expect(PhoneHelper.maskPhone('+91 98421-43210')).toBe('+91******3210');
      expect(PhoneHelper.maskPhone('123')).toBe('***');
    });
  });

  describe('2. DltTemplateFormatter (TRAI DLT Template Interpolation)', () => {
    it('should sequentially replace {#var#} placeholders with supplied values', () => {
      const template =
        'Kumaran Chits: Received Rs.{#var#} for Chit {#var#}, Ticket #{#var#} on {#var#}. Receipt: {#var#}. View passbook: {#var#}';
      const variables = [
        '3,750',
        'KCA-1L-20M-01',
        '07',
        '17-Oct-2026',
        'KC-REC-001',
        'https://app.kumaranfinance.in/p/07',
      ];

      const interpolated = DltTemplateFormatter.interpolate(template, variables);
      expect(interpolated).toBe(
        'Kumaran Chits: Received Rs.3,750 for Chit KCA-1L-20M-01, Ticket #07 on 17-Oct-2026. Receipt: KC-REC-001. View passbook: https://app.kumaranfinance.in/p/07',
      );
    });

    it('should map positional variable arrays to MSG91 JSON key-value pairs', () => {
      const rawVars = ['3,750', 'KCA-1L-20M-01', 7];
      const msg91Vars = DltTemplateFormatter.toMsg91Variables(rawVars);

      expect(msg91Vars).toEqual({
        var1: '3,750',
        var2: 'KCA-1L-20M-01',
        var3: '7',
      });
    });

    it('should handle empty or undefined templates cleanly', () => {
      expect(DltTemplateFormatter.interpolate('', ['test'])).toBe('');
      expect(DltTemplateFormatter.interpolate('Static Text Without Vars', [])).toBe(
        'Static Text Without Vars',
      );
    });
  });

  describe('3. MockSmsDriver (Sandbox & Bypass Execution)', () => {
    let mockDriver: MockSmsDriver;

    beforeEach(() => {
      mockDriver = new MockSmsDriver();
      mockDriver.clear();
    });

    it('should record outbound messages in memory and return bypassed result', async () => {
      const result = await mockDriver.sendSms({
        to: '9842143210',
        message: 'Kumaran Chits: Test alert',
        dltTemplateId: '1407169823412093848',
        variables: { var1: 'Test' },
      });

      expect(result.success).toBe(true);
      expect(result.bypassed).toBe(true);
      expect(result.provider).toBe('mock');
      expect(result.messageId).toContain('mock-sms-');

      const records = mockDriver.getSentMessages();
      expect(records).toHaveLength(1);
      expect(records[0].msisdn).toBe('919842143210');
      expect(records[0].message).toBe('Kumaran Chits: Test alert');
      expect(records[0].dltTemplateId).toBe('1407169823412093848');
    });

    it('should clear stored messages upon clear() call', async () => {
      await mockDriver.sendSms({
        to: '9842143210',
        message: 'Message 1',
      });
      expect(mockDriver.getSentMessages()).toHaveLength(1);

      mockDriver.clear();
      expect(mockDriver.getSentMessages()).toHaveLength(0);
    });
  });

  describe('4. Msg91SmsDriver (TRAI DLT HTTP Flow Client)', () => {
    let driver: Msg91SmsDriver;

    beforeEach(() => {
      driver = new Msg91SmsDriver({
        authKey: 'test_msg91_authkey_12345',
        senderId: 'KMRCHT',
        maxRetries: 2,
        retryBaseDelayMs: 10,
        timeoutMs: 2000,
      });
    });

    it('should reject dispatch if DLT template ID is omitted', async () => {
      const result = await driver.sendSms({
        to: '9842143210',
        message: 'Message without DLT ID',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('DLT Template ID is missing');
    });

    it('should format MSG91 flow JSON payload and handle successful response', async () => {
      const fakeResponse = {
        message: 'msg91-req-998877',
        type: 'success',
      };

      const httpRequestSpy = jest
        .spyOn(driver as any, 'httpRequest')
        .mockImplementation((postData: unknown) => {
          const parsed = JSON.parse(postData as string);
          expect(parsed.template_id).toBe('1407169823412093848');
          expect(parsed.sender).toBe('KMRCHT');
          expect(parsed.recipients[0].mobiles).toBe('919842143210');
          expect(parsed.recipients[0].var1).toBe('3750');

          return Promise.resolve({
            success: true,
            statusCode: 200,
            data: fakeResponse,
          });
        });

      const result = await driver.sendSms({
        to: '9842143210',
        message: 'Payment received',
        dltTemplateId: '1407169823412093848',
        variables: { var1: '3750' },
      });

      expect(httpRequestSpy).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg91-req-998877');
      expect(result.provider).toBe('msg91');
    });

    it('should retry on HTTP 500 error and eventually succeed or fail gracefully', async () => {
      let callCount = 0;

      jest.spyOn(driver as any, 'httpRequest').mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: false,
            statusCode: 500,
            error: 'HTTP 500: Internal Server Error',
          });
        }
        return Promise.resolve({
          success: true,
          statusCode: 200,
          data: { request_id: 'retry-ok-123' },
        });
      });

      const result = await driver.sendSms({
        to: '9842143210',
        message: 'Payment received',
        dltTemplateId: '1407169823412093848',
      });

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('retry-ok-123');
    });

    it('should return failure if max retries are exhausted on 500/network error', async () => {
      jest.spyOn(driver as any, 'httpRequest').mockResolvedValue({
        success: false,
        statusCode: 500,
        error: 'HTTP 500: Server Down',
      });

      const result = await driver.sendSms({
        to: '9842143210',
        message: 'Payment received',
        dltTemplateId: '1407169823412093848',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });
  });

  describe('5. SmsService (Domain Orchestrator & Invariant Guards)', () => {
    let smsService: SmsService;
    let mockDriver: MockSmsDriver;

    beforeEach(async () => {
      mockDriver = new MockSmsDriver();
      mockDriver.clear();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SmsService,
          {
            provide: SMS_DRIVER_TOKEN,
            useValue: mockDriver,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'SMS_DRIVER') return 'mock';
                if (key === 'SMS_SENDER_ID') return 'KMRCHT';
                return null;
              }),
            },
          },
        ],
      }).compile();

      smsService = module.get<SmsService>(SmsService);
    });

    it('should format and dispatch OTP SMS with registered template ID', async () => {
      const result = await smsService.sendOtpSms('9842143210', '482910');

      expect(result.success).toBe(true);
      const messages = mockDriver.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].dltTemplateId).toBe(DLT_CONFIG.TEMPLATES.DEVICE_OTP.templateId);
      expect(messages[0].message).toContain('482910');
      expect(messages[0].variables).toEqual({ var1: '482910', var2: '482910' });
    });

    it('should format and dispatch payment receipt SMS with whole Rupee currency', async () => {
      const result = await smsService.sendPaymentReceiptSms({
        recipientPhone: '9842143210',
        amountPaid: 3750n,
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        transactionTimestamp: '17-Oct-2026 10:30 AM',
        receiptNumber: 'KC-REC-2026-0001',
        passbookAppUrl: 'https://app.kumaranfinance.in/p/07',
      });

      expect(result.success).toBe(true);
      const messages = mockDriver.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].dltTemplateId).toBe(DLT_CONFIG.TEMPLATES.PAYMENT_RECEIPT.templateId);
      expect(messages[0].message).toContain('Rs.3,750');
      expect(messages[0].message).toContain('KCA-1L-20M-01');
      expect(messages[0].message).toContain('KC-REC-2026-0001');
    });

    it('should format and dispatch upcoming auction reminder SMS', async () => {
      const result = await smsService.sendAuctionReminderSms({
        recipientPhone: '9842143210',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 2,
        auctionDate: '25-Oct-2026',
        auctionTime: '05:00 PM',
        branchName: 'Perundurai Head Office',
        branchPhone: '0424-2223333',
      });

      expect(result.success).toBe(true);
      const messages = mockDriver.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].dltTemplateId).toBe(DLT_CONFIG.TEMPLATES.AUCTION_REMINDER.templateId);
      expect(messages[0].message).toContain('KCA-1L-20M-01');
      expect(messages[0].message).toContain('Perundurai Head Office');
    });

    it('should format and dispatch statutory default warning SMS', async () => {
      const result = await smsService.sendDefaultWarningSms({
        recipientPhone: '9842143210',
        customerName: 'S. Ramanathan',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        consecutiveUnpaidMonths: 3,
        totalOverdueAmount: 11250n,
        branchPhone: '0424-2223333',
      });

      expect(result.success).toBe(true);
      const messages = mockDriver.getSentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].dltTemplateId).toBe(DLT_CONFIG.TEMPLATES.DEFAULT_WARNING.templateId);
      expect(messages[0].message).toContain('Rs.11,250');
      expect(messages[0].message).toContain('3 months overdue');
    });

    it('GUARANTEE: Driver failure must NEVER throw an uncaught exception (Financial Non-Blocking)', async () => {
      jest.spyOn(mockDriver, 'sendSms').mockRejectedValueOnce(new Error('Gateway timeout 504'));

      // Must resolve cleanly with success: false rather than throwing
      const result = await smsService.sendPaymentReceiptSms({
        recipientPhone: '9842143210',
        amountPaid: 5000n,
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 3,
        transactionTimestamp: '17-Oct-2026 11:00 AM',
        receiptNumber: 'KC-REC-2026-0002',
        passbookAppUrl: 'https://app.kumaranfinance.in/p/03',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Gateway timeout 504');
    });
  });

  describe('6. NotificationService with Pluggable SmsService Integration', () => {
    let notificationService: NotificationService;
    let mockDriver: MockSmsDriver;
    let smsService: SmsService;

    beforeEach(() => {
      mockDriver = new MockSmsDriver();
      const configService = { get: jest.fn().mockReturnValue(null) } as any;
      smsService = new SmsService(mockDriver, configService);
      notificationService = new NotificationService(smsService);
      notificationService.clearLog();
    });

    it('should trigger both DLT SMS and record bilingual receipts', async () => {
      const receiptRes = await notificationService.dispatchPaymentReceipt({
        paymentId: 'pay-001',
        receiptNumber: 'KC-REC-001',
        recipientPhone: '9842143210',
        subscriberName: 'S. Ramanathan',
        amountPaid: '3750',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        paymentMode: 'CASH',
        transactionTimestamp: '17-Oct-2026 10:30 AM',
        receiptDownloadUrl: 'https://s3.kumaranfinance.in/receipts/KC-REC-001.pdf',
        passbookAppUrl: 'https://app.kumaranfinance.in/p/07',
      });

      expect(receiptRes.smsId).toBeDefined();
      expect(mockDriver.getSentMessages()).toHaveLength(1);
      expect(mockDriver.getSentMessages()[0].msisdn).toBe('919842143210');
      expect(mockDriver.getSentMessages()[0].message).toContain('Rs.3,750');

      const logs = notificationService.getSentNotificationLog();
      expect(logs).toHaveLength(2); // SMS + WhatsApp
      expect(logs[0].channel).toBe('WHATSAPP');
      expect(logs[1].channel).toBe('SMS_DLT');
    });

    it('should broadcast auction reminder SMS to all subscribers', async () => {
      const reminderRes = await notificationService.dispatchAuctionReminder({
        chitGroupId: 'group-1',
        chitCode: 'KCA-1L-20M-01',
        installmentMonth: 2,
        auctionDate: '25-Oct-2026',
        auctionTime: '05:00 PM',
        branchName: 'Perundurai Head Office',
        branchAddress: '123 Bhavani Road, Perundurai',
        branchPhone: '0424-2223333',
        subscribers: [
          { name: 'S. Ramanathan', phone: '9842143210' },
          { name: 'K. Kathiresan', phone: '9443212345' },
        ],
      });

      expect(reminderRes.dispatchedCount).toBe(2);
      expect(mockDriver.getSentMessages()).toHaveLength(2);
      expect(mockDriver.getSentMessages()[0].msisdn).toBe('919842143210');
      expect(mockDriver.getSentMessages()[1].msisdn).toBe('919443212345');
    });

    it('should dispatch statutory default warning SMS to delinquent subscriber', async () => {
      const warningRes = await notificationService.dispatchDefaultWarning({
        ticketId: 'ticket-7',
        customerName: 'S. Ramanathan',
        customerPhone: '9842143210',
        chitCode: 'KCA-1L-20M-01',
        ticketNumber: 7,
        consecutiveUnpaidMonths: 3,
        totalOverdueAmount: '11250',
      });

      expect(warningRes.notificationId).toBeDefined();
      expect(mockDriver.getSentMessages()).toHaveLength(1);
      expect(mockDriver.getSentMessages()[0].msisdn).toBe('919842143210');
      expect(mockDriver.getSentMessages()[0].message).toContain('Rs.11,250');
    });
  });
});
