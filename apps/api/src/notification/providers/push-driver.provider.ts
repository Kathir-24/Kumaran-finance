// ==============================================================================
// Kumaran Chits — Push Notification Driver Provider Factory
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// ==============================================================================

import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PUSH_DRIVER_TOKEN } from '../constants/notification.constants';
import { FirebasePushDriver } from '../drivers/firebase-push.driver';
import { MockPushDriver } from '../drivers/mock-push.driver';

export const PushDriverProvider: Provider = {
  provide: PUSH_DRIVER_TOKEN,
  useFactory: (configService: ConfigService) => {
    const driverType = (configService.get<string>('PUSH_DRIVER') || 'mock').toLowerCase();

    if (driverType === 'firebase') {
      const driver = new FirebasePushDriver(configService);
      driver.onModuleInit();
      return driver;
    }

    // Default to MockPushDriver for local dev, QA, CI, and test isolation
    return new MockPushDriver();
  },
  inject: [ConfigService],
};
