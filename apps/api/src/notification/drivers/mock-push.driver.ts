import { Injectable, Logger } from '@nestjs/common';
import type { PushDriver, PushNotificationPayload, PushResult } from './push-driver.interface';

export interface MockPushRecord {
  recipientToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority: 'high' | 'normal';
  sentAt: Date;
  messageId: string;
}

@Injectable()
export class MockPushDriver implements PushDriver {
  private readonly logger = new Logger(MockPushDriver.name);
  private readonly dispatchedPushes: MockPushRecord[] = [];

  async sendPushNotification(payload: PushNotificationPayload): Promise<PushResult> {
    const maskedToken = payload.recipientToken.length > 12
      ? `${payload.recipientToken.substring(0, 6)}...${payload.recipientToken.substring(payload.recipientToken.length - 4)}`
      : payload.recipientToken;

    const messageId = `mock-fcm-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    this.logger.log(
      `[MockPushDriver] Dispatched Push Notification to ${maskedToken}: "${payload.title}" - "${payload.body}"`,
    );

    this.dispatchedPushes.push({
      recipientToken: payload.recipientToken,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      priority: payload.priority || 'high',
      sentAt: new Date(),
      messageId,
    });

    return {
      success: true,
      messageId,
    };
  }

  getDispatchedPushes(): MockPushRecord[] {
    return [...this.dispatchedPushes];
  }

  clearQueue(): void {
    this.dispatchedPushes.length = 0;
  }
}
