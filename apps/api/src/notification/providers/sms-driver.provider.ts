// ==============================================================================
// Kumaran Chits — SMS Driver Provider Factory
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// ==============================================================================

import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockSmsDriver } from '../drivers/mock-sms.driver';
import { Msg91SmsDriver } from '../drivers/msg91-sms.driver';
import { SMS_DRIVER_TOKEN } from '../constants/notification.constants';

export const SmsDriverProvider: Provider = {
  provide: SMS_DRIVER_TOKEN,
  useFactory: (configService: ConfigService) => {
    const driverType = (configService.get<string>('SMS_DRIVER') || 'mock').toLowerCase();
    const authKey = configService.get<string>('MSG91_AUTH_KEY');
    const senderId = configService.get<string>('SMS_SENDER_ID') || 'KMRCHT';

    if (driverType === 'msg91' && authKey) {
      return new Msg91SmsDriver({
        authKey,
        senderId,
        maxRetries: configService.get<number>('SMS_MAX_RETRIES') || 2,
        retryBaseDelayMs: configService.get<number>('SMS_RETRY_BASE_DELAY_MS') || 400,
        timeoutMs: configService.get<number>('SMS_REQUEST_TIMEOUT_MS') || 5000,
      });
    }

    // Default to MockSmsDriver for local dev, QA, CI, and test isolation
    return new MockSmsDriver();
  },
  inject: [ConfigService],
};
