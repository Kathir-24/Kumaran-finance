// ==============================================================================
// Kumaran Chits — Mock SMS Driver (Local Development & Testing Sandbox)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// ==============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PhoneHelper } from '../helpers/phone.helper';
import {
  SmsDispatchResult,
  SmsDriver,
  SmsPayload,
} from './sms-driver.interface';

export interface MockSentSmsRecord {
  id: string;
  to: string;
  msisdn: string;
  message: string;
  dltTemplateId?: string;
  variables?: Record<string, string>;
  sentAt: Date;
}

@Injectable()
export class MockSmsDriver implements SmsDriver {
  public readonly providerName = 'mock';
  private readonly logger = new Logger(MockSmsDriver.name);
  private readonly sentMessages: MockSentSmsRecord[] = [];

  async sendSms(payload: SmsPayload): Promise<SmsDispatchResult> {
    const msisdn = PhoneHelper.formatIndianMsisdn(payload.to);
    const maskedPhone = PhoneHelper.maskPhone(payload.to);
    const messageId = `mock-sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const record: MockSentSmsRecord = {
      id: messageId,
      to: payload.to,
      msisdn,
      message: payload.message,
      dltTemplateId: payload.dltTemplateId,
      variables: payload.variables,
      sentAt: new Date(),
    };

    this.sentMessages.push(record);

    this.logger.log(
      `[MockSmsDriver] Bypassed SMS to ${maskedPhone} (Template: ${payload.dltTemplateId || 'N/A'}): "${payload.message}"`,
    );

    return {
      success: true,
      messageId,
      provider: 'mock',
      bypassed: true,
    };
  }

  getSentMessages(): MockSentSmsRecord[] {
    return [...this.sentMessages];
  }

  clear(): void {
    this.sentMessages.length = 0;
  }
}
