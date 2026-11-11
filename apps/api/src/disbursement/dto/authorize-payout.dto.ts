import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisbursementMode } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';
import {
  MAX_SAFE_WHOLE_RUPEE,
  parseStrictWholeRupeeValue,
} from '../../common/utils/whole-rupee.util';

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
    type: 'integer',
    example: 75000,
    description:
      'Whole-rupee prize money amount to authorize (defaults to calculated auction prize money: chitValue - bidDiscount)',
  })
  @IsOptional()
  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt({
    message: 'disbursedAmount must be a whole Rupee integer amount (zero paise/decimals)',
  })
  @IsPositive({ message: 'disbursedAmount must be a positive whole number' })
  @Max(MAX_SAFE_WHOLE_RUPEE, {
    message: 'disbursedAmount exceeds maximum safe whole-Rupee integer limit',
  })
  disbursedAmount?: number;

  @ApiPropertyOptional({
    example: 'Authorized payout via Account Payee Cheque after verifying blank cheques',
    description: 'Checker authorization remarks and conditions',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
