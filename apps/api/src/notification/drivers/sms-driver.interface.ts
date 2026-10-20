// ==============================================================================
// Kumaran Chits — SMS Driver Interface
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// ==============================================================================

export interface SmsPayload {
  to: string; // Indian mobile number (e.g. "9842143210" or "919842143210")
  message: string; // Interpolated message text
  dltTemplateId?: string; // Pre-registered TRAI DLT Template ID
  variables?: Record<string, string>; // Named variables for gateways like MSG91 (var1, var2...)
}

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  provider: 'mock' | 'msg91';
  bypassed?: boolean;
  error?: string;
}

export interface SmsDriver {
  readonly providerName: string;
  sendSms(payload: SmsPayload): Promise<SmsDispatchResult>;
}
