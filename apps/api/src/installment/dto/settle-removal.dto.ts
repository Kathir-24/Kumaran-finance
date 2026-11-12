import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SettleRemovalDto {
  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: 'Payout settlement mode (CASH, BANK_TRANSFER, CHEQUE)',
  })
  @IsNotEmpty({ message: 'Payment method is required' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    example: 'Settled remaining refund after 4% contractual damages deduction.',
    description: 'Remarks or voucher narrative',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SettleRemovalResponseDto {
  @ApiProperty({ example: true, description: 'Operation success status' })
  success: boolean;

  @ApiProperty({
    example: 'Defaulter account successfully settled with exit refund voucher.',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({ example: 'ticket-uuid-001', description: 'Settled ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 5, description: 'Ticket number' })
  ticketNumber: number;

  @ApiProperty({ example: 'Murugan K', description: 'Removed subscriber full name' })
  customerName: string;

  @ApiProperty({ example: 'KCA-1L-20M-01', description: 'Chit group code' })
  groupCode: string;

  @ApiProperty({ example: 10000, description: 'Total installments paid by removed subscriber in Rupees' })
  totalPaid: number;

  @ApiProperty({ example: 4000, description: '4% Foreman Commission damages deducted in Rupees' })
  damagesDeducted: number;

  @ApiProperty({ example: 6000, description: 'Net refund amount disbursed in Rupees' })
  refundAmount: number;

  @ApiProperty({ example: 'KC-VOU-DEF-819201', description: 'Exit settlement refund voucher number' })
  voucherNumber: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-23T19:00:00.000Z', description: 'Settlement timestamp' })
  settledAt: Date | string;
}
