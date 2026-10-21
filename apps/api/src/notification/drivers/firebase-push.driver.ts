import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import type { PushDriver, PushNotificationPayload, PushResult } from './push-driver.interface';

@Injectable()
export class FirebasePushDriver implements PushDriver, OnModuleInit {
  private readonly logger = new Logger(FirebasePushDriver.name);
  private firebaseApp: App | null = null;
  private isInitialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      this.firebaseApp = existingApps[0];
      this.isInitialized = true;
      return;
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (privateKey) {
      // Correct escaped newline characters from .env files
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (projectId && clientEmail && privateKey) {
      try {
        this.firebaseApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.isInitialized = true;
        this.logger.log(`[FirebasePushDriver] Initialized Firebase Admin SDK for Project: ${projectId}`);
      } catch (err: any) {
        this.logger.error(`[FirebasePushDriver] Failed to initialize Firebase Admin SDK: ${err.message}`, err.stack);
        this.isInitialized = false;
      }
    } else {
      this.logger.warn(
        '[FirebasePushDriver] Firebase credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) not configured. Operating in simulation fallback mode.',
      );
      this.isInitialized = false;
    }
  }

  async sendPushNotification(payload: PushNotificationPayload): Promise<PushResult> {
    const maskedToken = payload.recipientToken.length > 12
      ? `${payload.recipientToken.substring(0, 6)}...${payload.recipientToken.substring(payload.recipientToken.length - 4)}`
      : payload.recipientToken;

    if (!this.isInitialized || !this.firebaseApp) {
      this.logger.log(
        `[FirebasePushDriver] (Simulation) Push Notification sent to ${maskedToken}: "${payload.title}"`,
      );
      return {
        success: true,
        messageId: `simulated-fcm-${Date.now()}`,
      };
    }

    try {
      const message: Message = {
        token: payload.recipientToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: payload.priority === 'normal' ? 'normal' : 'high',
          notification: {
            sound: 'default',
            channelId: 'kumaran_high_importance',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              contentAvailable: true,
            },
          },
        },
      };

      const messaging = getMessaging(this.firebaseApp);
      const messageId = await messaging.send(message);

      this.logger.log(`[FirebasePushDriver] Push delivered to ${maskedToken} (FCM MessageId: ${messageId})`);
      return {
        success: true,
        messageId,
      };
    } catch (err: any) {
      const errorCode = err.code || '';
      const isTokenInvalid =
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/invalid-argument';

      this.logger.warn(
        `[FirebasePushDriver] Push failed for ${maskedToken}: ${err.message} (Code: ${errorCode}, TokenInvalid: ${isTokenInvalid})`,
      );

      return {
        success: false,
        error: err.message,
        tokenInvalid: isTokenInvalid,
      };
    }
  }
}
