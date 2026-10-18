import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisbursementMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class AuthorizePayoutDto {
  @ApiProperty({
    enum: DisbursementMode,
    example: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
    description:
      'Payment mode for prize money release (ACCOUNT_PAYEE_CHEQUE, BANK_TRANSFER_NEFT, BANK_TRANSFER_RTGS, BANK_TRANSFER_IMPS, CASH)',
  })
  @IsNotEmpty({ message: 'Disbursement mode is required' })
  @IsEnum(DisbursementMode)
  disbursementMode: DisbursementMode;

  @ApiPropertyOptional({
    example: 75000,
    description:
      'Whole-rupee prize money amount to authorize (defaults to calculated auction prize money: chitValue - bidDiscount)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  disbursedAmount?: number;

  @ApiPropertyOptional({
    example: 'Authorized payout via Account Payee Cheque after verifying blank cheques',
    description: 'Checker authorization remarks and conditions',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
