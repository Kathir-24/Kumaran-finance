import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class AgentDueItemResponseDto {
  @ApiProperty({ example: 'due-uuid-001', description: 'Due record ID' })
  id: string;

  @ApiProperty({ example: 'ticket-uuid-001', description: 'Ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 4, description: 'Ticket number 1..N' })
  ticketNumber: number;

  @ApiProperty({ example: 'KCA-1L-20M-01', description: 'Chit group code' })
  chitGroupCode: string;

  @ApiProperty({ example: 2, description: 'Installment month' })
  installmentMonth: number;

  @ApiProperty({ example: 3950, description: 'Net payable amount in whole Rupees' })
  netPayableAmount: number;

  @ApiProperty({ example: 'KC-CUST-00101', description: 'Customer code' })
  customerCode: string;

  @ApiProperty({ example: 'Sundaram S', description: 'Customer full name' })
  customerName: string;

  @ApiProperty({ example: '9842712345', description: 'Customer phone' })
  phone: string;

  @ApiProperty({ example: '14/2, Gandhi Nagar, Perundurai', description: 'Doorstep collection address' })
  address: string;
}

export class CollectionRecordResponseDto {
  @ApiProperty({ example: 'pay-uuid-001', description: 'Payment record ID' })
  paymentId: string;

  @ApiProperty({ example: 'KC-RCPT-202610-00001', description: 'Issued sequential receipt number' })
  receiptNumber: string;

  @ApiProperty({ example: 3950, description: 'Collected amount in whole Rupees' })
  amount: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH, description: 'Collection payment mode' })
  paymentMethod: PaymentMethod;

  @ApiProperty({ example: 'PENDING_HANDOVER', description: 'Cash handover status' })
  cashHandoverStatus: string;

  @ApiProperty({ example: 'KC-CUST-00101', description: 'Customer code' })
  customerCode: string;

  @ApiProperty({ example: 'Sundaram S', description: 'Customer name' })
  customerName: string;

  @ApiProperty({ example: 'KCA-1L-20M-01', description: 'Chit group code' })
  chitGroupCode: string;

  @ApiProperty({ example: 4, description: 'Ticket number' })
  ticketNumber: number;

  @ApiProperty({ example: 2, description: 'Installment month' })
  installmentMonth: number;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Payment recorded timestamp' })
  paidAt: Date | string;
}

export class OfflineSyncSuccessItemDto {
  @ApiProperty({ example: 'item-uuid-001', description: 'Local client queue item ID' })
  clientQueueId: string;

  @ApiProperty({ example: 'pay-uuid-001', description: 'Server payment ID' })
  paymentId: string;

  @ApiProperty({ example: 'KC-RCPT-202610-00002', description: 'Server receipt number' })
  receiptNumber: string;

  @ApiProperty({ example: 3950, description: 'Synced amount in whole Rupees' })
  amount: number;
}

export class OfflineSyncFailedItemDto {
  @ApiProperty({ example: 'item-uuid-002', description: 'Local client queue item ID' })
  clientQueueId: string;

  @ApiProperty({ example: 'INELIGIBLE_ALREADY_PAID', description: 'Error code' })
  errorCode: string;

  @ApiProperty({ example: 'Due already marked as PAID by another channel', description: 'Rejection reason' })
  reason: string;
}

export class SyncOfflineQueueResponseDto {
  @ApiProperty({ example: 10, description: 'Total items submitted in batch' })
  totalSubmitted: number;

  @ApiProperty({ example: 9, description: 'Successfully synced collections count' })
  successCount: number;

  @ApiProperty({ example: 1, description: 'Failed or rejected collections count' })
  failureCount: number;

  @ApiProperty({ type: [OfflineSyncSuccessItemDto], description: 'Successfully recorded collections' })
  synced: OfflineSyncSuccessItemDto[];

  @ApiProperty({ type: [OfflineSyncFailedItemDto], description: 'Rejected collections with reasons' })
  failed: OfflineSyncFailedItemDto[];
}

export class DailyCollectionTotalsDto {
  @ApiProperty({ example: 45000, description: 'Total collections in whole Rupees' })
  totalCollected: number;

  @ApiProperty({ example: 35000, description: 'Total cash collections in whole Rupees' })
  cashCollected: number;

  @ApiProperty({ example: 20000, description: 'Cash pending handover into office vault' })
  cashPendingHandover: number;

  @ApiProperty({ example: 15000, description: 'Cash verified and acknowledged into vault' })
  cashHandedOver: number;

  @ApiProperty({ example: 10000, description: 'Total digital (UPI / Bank) collections' })
  digitalCollected: number;
}

export class DailyCollectionSummaryResponseDto {
  @ApiProperty({ example: '2026-10-22', description: 'Summary date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 12, description: 'Total collections count' })
  totalPaymentsCount: number;

  @ApiProperty({ type: DailyCollectionTotalsDto, description: 'Financial collection totals' })
  totals: DailyCollectionTotalsDto;

  @ApiProperty({ isArray: true, description: 'Itemized collections list' })
  payments: any[];
}

export class CashHandoverBatchResponseDto {
  @ApiProperty({ example: 'user-agent-001', description: 'Collector staff user ID' })
  collectorUserId: string;

  @ApiProperty({ example: 25000, description: 'Total cash handover amount in whole Rupees' })
  totalPendingAmount: number;

  @ApiProperty({ example: 6, description: 'Number of individual collection receipts in batch' })
  paymentsCount: number;

  @ApiProperty({ type: [String], description: 'List of payment IDs included in handover' })
  paymentIds: string[];

  @ApiProperty({ isArray: true, description: 'Itemized collection records' })
  collections: any[];
}

export class HandoverAcknowledgementResponseDto {
  @ApiProperty({ example: true, description: 'Whether cash was deposited into vault' })
  success: boolean;

  @ApiProperty({ example: 'Cash handover of ₹25000 successfully verified and deposited into branch vault.', description: 'Status message' })
  message: string;

  @ApiProperty({ example: 'user-agent-001', description: 'Collector staff user ID' })
  collectorUserId: string;

  @ApiProperty({ example: 'user-manager-001', description: 'Acknowledging staff user ID (Checker)' })
  acknowledgedByUserId: string;

  @ApiProperty({ example: 25000, description: 'Verified cash amount in whole Rupees' })
  acknowledgedAmount: number;

  @ApiProperty({ example: 6, description: 'Count of payments acknowledged' })
  totalPaymentsAcknowledged: number;
}
