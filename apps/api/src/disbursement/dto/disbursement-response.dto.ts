import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisbursementMode } from '@prisma/client';

export class WinnerDisbursementItemDto {
  @ApiProperty({ example: 'winner-uuid-001', description: 'Winner record ID' })
  id: string;

  @ApiProperty({ example: 'auc-uuid-001', description: 'Auction ID' })
  auctionId: string;

  @ApiProperty({ example: 'ticket-uuid-001', description: 'Prized ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 'PENDING_VERIFICATION', description: 'Safety proof and settlement workflow state' })
  disbursementStatus: string;

  @ApiProperty({ enum: DisbursementMode, example: DisbursementMode.BANK_TRANSFER_NEFT, description: 'Authorized payment mode', nullable: true })
  disbursementMode?: DisbursementMode | null;

  @ApiProperty({ type: Number, example: 75000, description: 'Prize money amount in whole Rupees', nullable: true })
  disbursedAmount?: number | null;

  @ApiProperty({ type: String, example: 'UTR-NEFT-12345678', description: 'Bank UTR, Cheque number, or Cash voucher reference', nullable: true })
  paymentReference?: string | null;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-22T07:28:14.000Z', description: 'Payout release timestamp', nullable: true })
  disbursedAt?: Date | string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Auction and scheme details' })
  auction?: any;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Subscriber ticket details' })
  ticket?: any;
}

export class SafetyProofVerificationResponseDto {
  @ApiProperty({ example: 'Safety proof verified successfully and marked ready for authorization', description: 'Status message' })
  message: string;

  @ApiProperty({ type: WinnerDisbursementItemDto, description: 'Updated winner settlement record' })
  winner: WinnerDisbursementItemDto;
}

export class DisbursementAuthorizationResponseDto {
  @ApiProperty({ example: 'Payout voucher authorized successfully', description: 'Status message' })
  message: string;

  @ApiProperty({ type: WinnerDisbursementItemDto, description: 'Authorized winner settlement record' })
  winner: WinnerDisbursementItemDto;
}

export class DisbursementReleaseResponseDto {
  @ApiProperty({ example: 'Prize payout released successfully', description: 'Status message' })
  message: string;

  @ApiProperty({ type: WinnerDisbursementItemDto, description: 'Released winner settlement record' })
  winner: WinnerDisbursementItemDto;
}

export class BilingualVoucherResponseDto {
  @ApiProperty({ example: 'KC-VCHR-202610-00001', description: 'Voucher number' })
  voucherNumber: string;

  @ApiProperty({ example: true, description: 'Bilingual flag' })
  isBilingual: boolean;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-22T07:28:14.000Z', description: 'Voucher issue timestamp' })
  issuedAt: Date | string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Structured voucher parameters' })
  data: any;

  @ApiProperty({ description: 'A4 / A5 monospace formatted voucher layout' })
  formattedText: string;
}

export class FinalSettlementDataDto {
  @ApiProperty({ example: '37051c9a-9d53-46e2-b292-719bc05f373e' })
  chitGroupId: string;

  @ApiProperty({ example: 20 })
  installmentMonth: number;

  @ApiProperty({ example: 20 })
  ticketNumber: number;

  @ApiProperty({ example: 'N. Subramaniam' })
  customerName: string;

  @ApiProperty({ example: 100000 })
  grossPrize: number;

  @ApiProperty({ example: 4000 })
  foremanCommission: number;

  @ApiProperty({ example: 5000, description: 'Final month base installment deducted from payout', required: false })
  finalMonthInstallment?: number;

  @ApiProperty({ example: 0, description: 'Prior arrears deducted from payout', required: false })
  priorArrearsDeducted?: number;

  @ApiProperty({ example: 91000 })
  netPrizeMoney: number;

  @ApiProperty({ example: 'ACCOUNT_PAYEE_CHEQUE' })
  disbursementMode: string;

  @ApiProperty({ example: 'IOB-CHQ-FINAL-998811', required: false, nullable: true })
  paymentReference?: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2025-08-22T00:00:00.000Z' })
  disbursedAt: Date | string;

  @ApiProperty({ example: 'a6452114-52d1-4893-a04c-9736a1bee74e' })
  auctionId: string;
}

export class FinalSettlementResponseDto {
  @ApiProperty({
    example:
      'Final Month 20 maturity settlement successfully executed for Ticket #20 (N. Subramaniam). Scheme marked as COMPLETED.',
  })
  message: string;

  @ApiProperty({ type: FinalSettlementDataDto })
  settlement: FinalSettlementDataDto;
}
