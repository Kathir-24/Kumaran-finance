export interface PaymentReceiptNotificationJobPayload {
  paymentId: string;
  receiptNumber: string;
  recipientPhone: string;
  subscriberName: string;
  amountPaid: string; // Serialized string for safe Redis transport
  chitCode: string;
  ticketNumber: number;
  paymentMode: string;
  transactionTimestamp: string;
  receiptDownloadUrl: string;
  passbookAppUrl: string;
  fcmToken?: string;
  channelPreference?: 'PUSH_NOTIFICATION' | 'SMS_FALLBACK';
}

export interface AuctionReminderJobPayload {
  chitGroupId: string;
  chitCode: string;
  installmentMonth: number;
  auctionDate: string;
  auctionTime: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  subscribers: Array<{
    name: string;
    phone: string;
  }>;
}

export interface DefaultWarningJobPayload {
  ticketId: string;
  customerName: string;
  customerPhone: string;
  chitCode: string;
  ticketNumber: number;
  consecutiveUnpaidMonths: number;
  totalOverdueAmount: string; // Serialized string
}

export interface DailyArrearsExecutionResult {
  executionTimestamp: string;
  cutoffDate: string;
  duesTransitionedToOverdue: number;
  ticketsEvaluated: number;
  ticketsInArrears: number;
  ticketsInDefault3M: number;
}

export interface ReconciliationJobResult {
  executionTimestamp: string;
  matchedCount: number;
  autoResolvedGhostDropsCount: number;
  exceptionCount: number;
  details: string[];
}
