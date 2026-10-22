import { ApiProperty } from '@nestjs/swagger';
import { DueStatus, PaymentMethod, PaymentStatus } from '@prisma/client';

export class ReceiptDto {
  @ApiProperty({ example: 'rcpt-uuid-001', description: 'Receipt unique ID' })
  id: string;

  @ApiProperty({ example: 'KC-RCPT-202610-00001', description: 'Sequential receipt number' })
  receiptNumber: string;

  @ApiProperty({ example: 4500, description: 'Receipt amount in whole Rupees' })
  amount: number;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Receipt issue timestamp' })
  issuedAt: Date | string;
}

export class PaymentRecordDto {
  @ApiProperty({ example: 'pay-uuid-001', description: 'Payment record ID' })
  id: string;

  @ApiProperty({ example: 'KC-RCPT-202610-00001', description: 'Receipt number' })
  receiptNumber: string;

  @ApiProperty({ example: 4500, description: 'Collected amount in whole Rupees' })
  amount: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH, description: 'Mode of collection' })
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.SUCCESS, description: 'Payment lifecycle status' })
  paymentStatus: PaymentStatus;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Payment timestamp' })
  paidAt: Date | string;

  @ApiProperty({ example: 'UPI-REF-9876543210', description: 'Transaction / Cheque reference', nullable: true })
  transactionRef?: string | null;

  @ApiProperty({ example: 'user-agent-001', description: 'Collecting staff ID', nullable: true })
  recordedByUserId?: string | null;

  @ApiProperty({ example: 'branch-prd-001', description: 'Branch ID', nullable: true })
  branchId?: string | null;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Creation timestamp' })
  createdAt: Date | string;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Updated timestamp' })
  updatedAt: Date | string;
}


export class RecordPaymentResponseDto {
  @ApiProperty({ type: PaymentRecordDto, description: 'Payment record' })
  payment: PaymentRecordDto;

  @ApiProperty({ type: ReceiptDto, description: 'Issued bilingual receipt' })
  receipt: ReceiptDto;

  @ApiProperty({ enum: DueStatus, example: DueStatus.PAID, description: 'Resulting installment due status' })
  dueStatus: DueStatus;

  @ApiProperty({ example: 4500, description: 'Paid amount in whole Rupees' })
  paidAmount: number;

  @ApiProperty({ example: 4500, description: 'Net payable amount in whole Rupees' })
  netPayableAmount: number;
}

export class PaymentDetailResponseDto extends PaymentRecordDto {
  @ApiProperty({ type: ReceiptDto, nullable: true, description: 'Receipt details' })
  receipt?: ReceiptDto | null;

  @ApiProperty({ description: 'Subscriber ticket details' })
  ticket?: any;

  @ApiProperty({ description: 'Installment due details' })
  installmentDue?: any;
}

export class BilingualReceiptResponseDto {
  @ApiProperty({ example: 'KC-RCPT-202610-00001', description: 'Sequential receipt number' })
  receiptNumber: string;

  @ApiProperty({ example: true, description: 'Indicates receipt supports English and Tamil' })
  isBilingual: boolean;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Receipt issue timestamp' })
  issuedAt: Date | string;

  @ApiProperty({ example: false, description: 'Whether the payment is currently reversed' })
  isReversed: boolean;

  @ApiProperty({ description: 'Structured receipt fields for thermal printer rendering' })
  data: any;

  @ApiProperty({ description: 'Formatted bilingual 80mm monospace text receipt layout' })
  formattedText: string;
}

export class ReversalRecordDto {
  @ApiProperty({ example: 'rev-uuid-001', description: 'Reversal request ID' })
  id: string;

  @ApiProperty({ example: 'pay-uuid-001', description: 'Reversed payment ID' })
  paymentId: string;

  @ApiProperty({ example: 'WRONG_TICKET', description: 'Reversal justification reason' })
  reversalReason: string;

  @ApiProperty({ example: 'user-maker-001', description: 'Maker user ID' })
  makerUserId: string;

  @ApiProperty({ example: 'Wrong member account credited by mistake', description: 'Maker explanation', nullable: true })
  makerNotes?: string | null;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Request timestamp' })
  requestedAt: Date | string;

  @ApiProperty({ example: 'user-checker-001', description: 'Checker user ID', nullable: true })
  checkerUserId?: string | null;

  @ApiProperty({ example: 'Verified with physical voucher. Approved.', description: 'Checker notes', nullable: true })
  checkerNotes?: string | null;

  @ApiProperty({ example: true, description: 'Reversal approval state', nullable: true })
  isApproved?: boolean | null;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Review timestamp', nullable: true })
  reviewedAt?: Date | string | null;
}

export class PaymentReversalResponseDto {
  @ApiProperty({ example: 'Payment reversal requested successfully. Pending Checker approval by Super Admin.', description: 'Status message' })
  message: string;

  @ApiProperty({ type: ReversalRecordDto, description: 'Payment reversal log record' })
  reversal: ReversalRecordDto;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.REVERSED, description: 'Updated payment status', required: false })
  paymentStatus?: PaymentStatus;

  @ApiProperty({ enum: DueStatus, example: DueStatus.UNPAID, description: 'Restored installment due status', required: false })
  dueStatus?: DueStatus;
}
