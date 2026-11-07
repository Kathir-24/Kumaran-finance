// ==============================================================================
// Kumaran Chits — Notification Module (DLT SMS Engine & Push FCM Engine)
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2 & §5)
// ==============================================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MockPushDriver } from './drivers/mock-push.driver';
import { MockSmsDriver } from './drivers/mock-sms.driver';
import { PushDriverProvider } from './providers/push-driver.provider';
import { SmsDriverProvider } from './providers/sms-driver.provider';
import { PushService } from './services/push.service';
import { SmsService } from './services/sms.service';
import {
  PUSH_DRIVER_TOKEN,
  SMS_BACKUP_DRIVER_TOKEN,
  SMS_DRIVER_TOKEN,
} from './constants/notification.constants';
import { SmsBackupDriverProvider, SmsDriverProvider } from './providers/sms-driver.provider';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    MockSmsDriver,
    SmsDriverProvider,
    SmsBackupDriverProvider,
    SmsService,
    MockPushDriver,
    PushDriverProvider,
    PushService,
  ],
  exports: [
    SmsService,
    SMS_DRIVER_TOKEN,
    SMS_BACKUP_DRIVER_TOKEN,
    PushService,
    PUSH_DRIVER_TOKEN,
  ],
})
export class NotificationModule {}
