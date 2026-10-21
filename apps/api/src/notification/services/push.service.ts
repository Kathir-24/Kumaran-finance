import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_DRIVER_TOKEN } from '../constants/notification.constants';
import type { PushDriver, PushNotificationPayload, PushResult } from '../drivers/push-driver.interface';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(PUSH_DRIVER_TOKEN) private readonly pushDriver: PushDriver,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Dispatches push notification to client device with financial non-blocking safety and stale token pruning.
   */
  async sendPushNotification(
    payload: PushNotificationPayload,
    metadata?: { userId?: string; customerId?: string },
  ): Promise<PushResult> {
    try {
      const result = await this.pushDriver.sendPushNotification(payload);

      // Automatic stale token pruning
      if (result.tokenInvalid && this.prisma) {
        if (metadata?.userId) {
          await this.prisma.user.update({
            where: { id: metadata.userId },
            data: { fcmToken: null },
          }).catch((err) => {
            this.logger.warn(`Failed to prune user FCM token: ${err.message}`);
          });
          this.logger.log(`Pruned unregistered FCM token for User ${metadata.userId}`);
        }

        if (metadata?.customerId) {
          await this.prisma.customer.update({
            where: { id: metadata.customerId },
            data: { fcmToken: null },
          }).catch((err) => {
            this.logger.warn(`Failed to prune customer FCM token: ${err.message}`);
          });
          this.logger.log(`Pruned unregistered FCM token for Customer ${metadata.customerId}`);
        }
      }

      return result;
    } catch (err: any) {
      this.logger.error(`[PushService] Unexpected push dispatch failure: ${err.message}`, err.stack);
      return {
        success: false,
        error: err.message,
      };
    }
  }
}
