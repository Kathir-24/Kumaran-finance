import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisbursementMode } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SettleFinalMonthDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Ticket ID of the single remaining unprized subscriber for Month N settlement',
  })
  @IsNotEmpty()
  @IsUUID()
  ticketId: string;

  @ApiProperty({
    enum: DisbursementMode,
    example: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
    description: 'Payment settlement mode (ACCOUNT_PAYEE_CHEQUE, BANK_TRANSFER_NEFT, BANK_TRANSFER_RTGS, BANK_TRANSFER_IMPS, CASH)',
  })
  @IsNotEmpty()
  @IsEnum(DisbursementMode)
  disbursementMode: DisbursementMode;

  @ApiPropertyOptional({
    example: 'CHQ-889921',
    description: 'Official cheque number, bank UTR, or cash voucher reference',
  })
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @ApiPropertyOptional({
    example: 'Final Month 30 maturity settlement payout per Section 16 Chit Rules',
    description: 'Foreman settlement notes or audit remarks',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '2025-04-22T00:00:00.000Z',
    description: 'Settlement disbursement timestamp (defaults to current date)',
  })
  @IsOptional()
  @IsDateString()
  disbursedAt?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'Distinct staff user ID who prepared the settlement voucher (Maker != Checker)',
  })
  @IsOptional()
  @IsUUID()
  makerUserId?: string;
}
