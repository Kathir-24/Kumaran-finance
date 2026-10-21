// ==============================================================================
// Kumaran Chits — Push Notification Driver Interface
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Channel: Mobile App Push Notifications (Android & iOS via FCM HTTP v1)
// ==============================================================================

export interface PushNotificationPayload {
  recipientToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'high' | 'normal';
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  tokenInvalid?: boolean; // True if FCM rejected token as expired/unregistered
}

export interface PushDriver {
  sendPushNotification(payload: PushNotificationPayload): Promise<PushResult>;
}
