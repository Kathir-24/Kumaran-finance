// ==============================================================================
// Kumaran Chits — SMS Domain Service (DLT Orchestrator)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// Invariant: Financial Non-Blocking Guarantee (SMS error never aborts payment)
// ==============================================================================

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_DRIVER_TOKEN } from '../constants/notification.constants';
import type { SmsDispatchResult, SmsDriver } from '../drivers/sms-driver.interface';
import { DltTemplateFormatter } from '../helpers/dlt-template-formatter.helper';
import { PhoneHelper } from '../helpers/phone.helper';
import { DLT_CONFIG } from '../templates/dlt-templates.constants';
import { MetricsService } from '../../metrics/services/metrics.service';

export interface PaymentReceiptSmsPayload {
  recipientPhone: string;
  amountPaid: bigint | number | string;
  chitCode: string;
  ticketNumber: number;
  transactionTimestamp: string;
  receiptNumber: string;
  passbookAppUrl: string;
}

export interface AuctionReminderSmsPayload {
  recipientPhone: string;
  chitCode: string;
  installmentMonth: number;
  auctionDate: string;
  auctionTime: string;
  branchName: string;
  branchPhone: string;
}

export interface DefaultWarningSmsPayload {
  recipientPhone: string;
  customerName: string;
  chitCode: string;
  ticketNumber: number;
  consecutiveUnpaidMonths: number;
  totalOverdueAmount: bigint | number | string;
  branchPhone: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @Inject(SMS_DRIVER_TOKEN) private readonly smsDriver: SmsDriver,
    private readonly configService: ConfigService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Dispatches a TRAI DLT-compliant Device Verification / Staff Login OTP.
   * Template ID: 1407169823412093847
   */
  async sendOtpSms(phone: string, otpCode: string): Promise<SmsDispatchResult> {
    const template = DLT_CONFIG.TEMPLATES.DEVICE_OTP;
    const templateId =
      this.configService.get<string>('MSG91_DLT_OTP_TEMPLATE_ID') ||
      template.templateId;

    const messageText = DltTemplateFormatter.interpolate(template.text, [otpCode, otpCode]);
    const variables = { var1: otpCode, var2: otpCode };

    return this.safeDispatch({
      to: phone,
      message: messageText,
      dltTemplateId: templateId,
      variables,
    });
  }

  /**
   * Dispatches a TRAI DLT-compliant Payment Receipt Alert.
   */
  async sendPaymentReceiptSms(
    payload: PaymentReceiptSmsPayload,
  ): Promise<SmsDispatchResult> {
    const template = DLT_CONFIG.TEMPLATES.PAYMENT_RECEIPT;
    const templateId =
      this.configService.get<string>('MSG91_DLT_RECEIPT_TEMPLATE_ID') ||
      template.templateId;

    const formattedAmount = BigInt(payload.amountPaid).toLocaleString('en-IN');
    const rawVars = [
      formattedAmount,
      payload.chitCode,
      payload.ticketNumber,
      payload.transactionTimestamp,
      payload.receiptNumber,
      payload.passbookAppUrl,
    ];

    const messageText = DltTemplateFormatter.interpolate(template.text, rawVars);
    const variables = DltTemplateFormatter.toMsg91Variables(rawVars);

    return this.safeDispatch({
      to: payload.recipientPhone,
      message: messageText,
      dltTemplateId: templateId,
      variables,
    });
  }

  /**
   * Broadcasts a TRAI DLT-compliant Upcoming Monthly Auction Reminder.
   */
  async sendAuctionReminderSms(
    payload: AuctionReminderSmsPayload,
  ): Promise<SmsDispatchResult> {
    const template = DLT_CONFIG.TEMPLATES.AUCTION_REMINDER;
    const templateId =
      this.configService.get<string>('MSG91_DLT_AUCTION_TEMPLATE_ID') ||
      template.templateId;

    const rawVars = [
      payload.chitCode,
      payload.installmentMonth,
      payload.auctionDate,
      payload.auctionTime,
      payload.branchName,
      payload.branchPhone,
    ];

    const messageText = DltTemplateFormatter.interpolate(template.text, rawVars);
    const variables = DltTemplateFormatter.toMsg91Variables(rawVars);

    return this.safeDispatch({
      to: payload.recipientPhone,
      message: messageText,
      dltTemplateId: templateId,
      variables,
    });
  }

  /**
   * Dispatches a statutory 3-Month Default Warning notice.
   */
  async sendDefaultWarningSms(
    payload: DefaultWarningSmsPayload,
  ): Promise<SmsDispatchResult> {
    const template = DLT_CONFIG.TEMPLATES.DEFAULT_WARNING;
    const templateId =
      this.configService.get<string>('MSG91_DLT_DEFAULT_TEMPLATE_ID') ||
      template.templateId;

    const formattedOverdue = BigInt(payload.totalOverdueAmount).toLocaleString('en-IN');
    const rawVars = [
      payload.ticketNumber,
      payload.chitCode,
      payload.consecutiveUnpaidMonths,
      formattedOverdue,
      payload.branchPhone,
    ];

    const messageText = DltTemplateFormatter.interpolate(template.text, rawVars);
    const variables = DltTemplateFormatter.toMsg91Variables(rawVars);

    return this.safeDispatch({
      to: payload.recipientPhone,
      message: messageText,
      dltTemplateId: templateId,
      variables,
    });
  }

  /**
   * Resilient dispatcher: catches all gateway errors to guarantee financial transaction non-blocking.
   */
  private async safeDispatch(smsPayload: {
    to: string;
    message: string;
    dltTemplateId?: string;
    variables?: Record<string, string>;
  }): Promise<SmsDispatchResult> {
    const maskedPhone = PhoneHelper.maskPhone(smsPayload.to);
    const templateLabel = smsPayload.dltTemplateId || 'default';

    try {
      const result = await this.smsDriver.sendSms(smsPayload);

      // Synchronize circuit breaker state gauge if supported by driver
      if (this.metricsService && typeof this.smsDriver.getCircuitBreakerState === 'function') {
        const cbState = this.smsDriver.getCircuitBreakerState();
        const gaugeVal = cbState === 'CLOSED' ? 0 : cbState === 'HALF_OPEN' ? 1 : 2;
        this.metricsService.smsCircuitBreakerState.set({ provider: this.smsDriver.providerName }, gaugeVal);
      }

      // Record dispatch outcome counter
      if (this.metricsService) {
        const statusLabel = result.bypassed
          ? 'bypassed'
          : result.success
            ? 'success'
            : result.error?.includes('Circuit breaker')
              ? 'circuit_open'
              : 'failure';

        this.metricsService.smsDispatchesTotal.inc({
          provider: this.smsDriver.providerName,
          template: templateLabel,
          status: statusLabel,
        });
      }

      return result;
    } catch (err: any) {
      if (this.metricsService) {
        this.metricsService.smsDispatchesTotal.inc({
          provider: this.smsDriver.providerName,
          template: templateLabel,
          status: 'failure',
        });
      }

      this.logger.error(
        `[SmsService] Failed to send SMS to ${maskedPhone} via ${this.smsDriver.providerName}: ${err.message}`,
      );
      return {
        success: false,
        messageId: '',
        provider: this.smsDriver.providerName as any,
        error: err.message,
      };
    }
  }

  /**
   * Returns current active SMS driver.
   */
  getActiveDriver(): SmsDriver {
    return this.smsDriver;
  }
}
