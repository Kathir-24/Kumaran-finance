import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description: 'UUID of the subscriber ticket receiving the payment',
  })
  @IsNotEmpty({ message: 'Ticket ID is required' })
  @IsString()
  ticketId: string;

  @ApiProperty({
    example: 4,
    description: 'Installment month number (1 to N) being paid',
  })
  @IsNotEmpty({ message: 'Installment month is required' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentMonth: number;

  @ApiProperty({
    example: 3750,
    description:
      'Exact net installment amount in whole integer Rupees (must identically match due.netPayableAmount)',
  })
  @IsNotEmpty({ message: 'Payment amount is required' })
  @Type(() => Number)
  @IsInt({ message: 'Payment amount must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive({ message: 'Payment amount must be a positive whole number' })
  amount: number;

  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: 'Payment method (CASH, UPI, BANK_TRANSFER, CHEQUE)',
  })
  @IsNotEmpty({ message: 'Payment method is required' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    example: 'UPI-20261018-9876543210',
    description: 'Optional transaction reference (UPI UTR, Cheque number, Bank transfer UTR)',
  })
  @IsOptional()
  @IsString()
  transactionRef?: string;

  @ApiPropertyOptional({
    example: 'd9b2d63d-a232-4e45-814a-5f0962858b29',
    description: 'Optional unique idempotency key to prevent duplicate payments on retry',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    example: 'Paid at Perundurai head office counter',
    description: 'Optional cashier remarks or notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '2026-10-18T10:30:00.000Z',
    description: 'Optional payment collection timestamp',
  })
  @IsOptional()
  @IsDateString()
  collectedAt?: string;
}
