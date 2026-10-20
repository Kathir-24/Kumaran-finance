// ==============================================================================
// Kumaran Chits — Notification Module (DLT SMS Engine)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// ==============================================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MockSmsDriver } from './drivers/mock-sms.driver';
import { SmsDriverProvider } from './providers/sms-driver.provider';
import { SmsService } from './services/sms.service';
import { SMS_DRIVER_TOKEN } from './constants/notification.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    MockSmsDriver,
    SmsDriverProvider,
    SmsService,
  ],
  exports: [
    SmsService,
    SMS_DRIVER_TOKEN,
  ],
})
export class NotificationModule {}
