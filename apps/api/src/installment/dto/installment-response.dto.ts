import { ApiProperty } from '@nestjs/swagger';
import { DueStatus } from '@prisma/client';

export class InstallmentDueResponseDto {
  @ApiProperty({ example: 'due-uuid-001', description: 'Installment due unique ID' })
  id: string;

  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group ID' })
  chitGroupId: string;

  @ApiProperty({ example: 'ticket-uuid-001', description: 'Subscriber ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 2, description: 'Installment month 1..N' })
  installmentMonth: number;

  @ApiProperty({ example: '2026-11-15T00:00:00.000Z', description: 'Due payment cutoff date' })
  dueDate: Date | string;

  @ApiProperty({ example: 5000, description: 'Base monthly installment gross in whole Rupees' })
  grossAmount: number;

  @ApiProperty({ example: 1050, description: 'Universal dividend deduction in whole Rupees' })
  dividendDeduction: number;

  @ApiProperty({ example: 3950, description: 'Net payable installment amount in whole Rupees (gross - dividend)' })
  netPayableAmount: number;

  @ApiProperty({ example: 0, description: 'Amount collected in whole Rupees' })
  paidAmount: number;

  @ApiProperty({ enum: DueStatus, example: DueStatus.UNPAID, description: 'Payment status' })
  status: DueStatus;

  @ApiProperty({ description: 'Subscriber ticket details', required: false })
  ticket?: any;
}

export class GenerateDuesResultResponseDto {
  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group ID' })
  chitGroupId: string;

  @ApiProperty({ example: 2, description: 'Installment month' })
  installmentMonth: number;

  @ApiProperty({ example: 5000, description: 'Gross installment amount' })
  grossAmount: number;

  @ApiProperty({ example: 1050, description: 'Dividend deduction per ticket' })
  dividendDeduction: number;

  @ApiProperty({ example: 3950, description: 'Net payable amount' })
  netPayableAmount: number;

  @ApiProperty({ example: 20, description: 'Number of dues created or synced' })
  duesCount: number;
}

export class DefaulterItemResponseDto {
  @ApiProperty({ example: 'ticket-uuid-001', description: 'Ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 5, description: 'Ticket number 1..N' })
  ticketNumber: number;

  @ApiProperty({ example: false, description: 'Prized status' })
  isPrized: boolean;

  @ApiProperty({ example: 'ACTIVE', description: 'Ticket status' })
  status: string;

  @ApiProperty({ example: 3, description: 'Consecutive unpaid months count' })
  consecutiveUnpaidMonths: number;

  @ApiProperty({ example: true, description: 'Whether subscriber is eligible for 3M removal' })
  isEligibleForRemoval: boolean;

  @ApiProperty({ example: 11850, description: 'Cumulative unpaid arrears in whole Rupees' })
  totalArrears: number;

  @ApiProperty({ description: 'Subscriber details' })
  customer: any;

  @ApiProperty({ description: 'Chit group details' })
  chitGroup: any;
}

export class PassbookEntryDto {
  @ApiProperty({ example: 2, description: 'Installment month' })
  installmentMonth: number;

  @ApiProperty({ example: '2026-11-15T00:00:00.000Z', description: 'Due cutoff date' })
  dueDate: Date | string;

  @ApiProperty({ example: 5000, description: 'Gross installment in whole Rupees' })
  grossAmount: number;

  @ApiProperty({ example: 1050, description: 'Universal dividend in whole Rupees' })
  dividendDeduction: number;

  @ApiProperty({ example: 3950, description: 'Net payable in whole Rupees' })
  netPayableAmount: number;

  @ApiProperty({ example: 3950, description: 'Paid amount in whole Rupees' })
  paidAmount: number;

  @ApiProperty({ enum: DueStatus, example: DueStatus.PAID, description: 'Payment status' })
  status: DueStatus;

  @ApiProperty({ example: '2026-11-12T14:30:00.000Z', description: 'Payment date', nullable: true })
  paidAt?: Date | string | null;

  @ApiProperty({ example: 'KC-RCPT-202611-00042', description: 'Issued receipt number', nullable: true })
  receiptNumber?: string | null;
}

export class PassbookResponseDto {
  @ApiProperty({ description: 'Ticket details' })
  ticket: any;

  @ApiProperty({ description: 'Chit group parameters' })
  chitGroup: any;

  @ApiProperty({ description: 'Customer details' })
  customer: any;

  @ApiProperty({ description: 'Summary statistics' })
  summary: {
    totalGrossAmount: number;
    totalDividendEarned: number;
    totalNetPayable: number;
    totalPaidAmount: number;
    balancePending: number;
    paidMonthsCount: number;
    unpaidMonthsCount: number;
  };

  @ApiProperty({ type: [PassbookEntryDto], description: 'Chronological installment dues and payment entries' })
  passbook: PassbookEntryDto[];
}

export class RemoveDefaulterResponseDto {
  @ApiProperty({ example: true, description: 'Success flag' })
  success: boolean;

  @ApiProperty({ example: 'Subscriber successfully removed under 3-month consecutive default rule', description: 'Status message' })
  message: string;

  @ApiProperty({ description: 'Updated subscriber ticket details' })
  ticket: any;
}

export class UpiIntentResponseDto {
  @ApiProperty({ example: '6cb8a9e8-e371-42c8-bf3e-c3b72216bfb8', description: 'Installment due unique ID' })
  dueId: string;

  @ApiProperty({ example: 'ticket-uuid-001', description: 'Subscriber ticket unique ID' })
  ticketId: string;

  @ApiProperty({ example: 'KCA-1L-20M-01', description: 'Chit group code' })
  groupCode: string;

  @ApiProperty({ example: 4, description: 'Ticket number in chit group' })
  ticketNumber: number;

  @ApiProperty({ example: 2, description: 'Installment month 1..N' })
  installmentMonth: number;

  @ApiProperty({ example: 3950, description: 'Net payable amount in whole Rupees (Inet)' })
  netPayableAmount: number;

  @ApiProperty({ example: 'kumaranfinance@kvb', description: 'Company payee UPI VPA' })
  payeeVpa: string;

  @ApiProperty({ example: 'Kumaran Finance', description: 'Company payee legal entity name' })
  payeeName: string;

  @ApiProperty({ example: 'KCA-1L-20M-01 Ticket #4 Month 2', description: 'Payment transaction note' })
  transactionNote: string;

  @ApiProperty({
    example: 'upi://pay?pa=kumaranfinance@kvb&pn=Kumaran%20Finance&am=3950&cu=INR&tn=KCA-1L-20M-01%20Ticket%20%234%20Month%202&tr=6cb8a9e8',
    description: 'Full NPCI-compliant UPI Intent URI for zero-fee deep-linking',
  })
  upiUri: string;
}

