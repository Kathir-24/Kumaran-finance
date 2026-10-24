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
    fcmToken?: string;
  }>;
}

export interface AuctionResultNotificationJobPayload {
  chitGroupId: string;
  chitCode: string;
  installmentMonth: number;
  winningTicketNumber: number;
  winningDiscountAmount: string;
  dividendPerTicket: string;
  nextMonthNetPayable: string;
  subscribers: Array<{
    name: string;
    phone: string;
    fcmToken?: string;
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
  fcmToken?: string;
}

export interface ApprovalAlertJobPayload {
  approvalType: 'DISBURSEMENT_APPROVAL' | 'REVERSAL_APPROVAL';
  title: string;
  body: string;
  entityId: string;
  amount?: string;
  excludeUserId?: string; // Maker user ID to prevent alerting maker
  data: Record<string, string>;
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
