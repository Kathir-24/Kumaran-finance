import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_SAFE_WHOLE_RUPEE,
  parseStrictWholeRupeeValue,
} from '../../common/utils/whole-rupee.util';

export class SyncOfflineCollectionItemDto {
  @ApiProperty({
    example: 'd9b2d63d-a232-4e45-814a-5f0962858b29',
    description:
      'Unique UUID generated offline by the mobile app for safe deduplication upon network sync',
  })
  @IsNotEmpty({ message: 'Idempotency key is required for offline collections' })
  @IsString()
  idempotencyKey: string;

  @ApiProperty({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description: 'UUID of the subscriber ticket receiving the collection',
  })
  @IsNotEmpty({ message: 'Ticket ID is required' })
  @IsString()
  ticketId: string;

  @ApiProperty({
    example: 4,
    description: 'Installment month number (1 to N) being collected',
  })
  @IsNotEmpty({ message: 'Installment month is required' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installmentMonth: number;

  @ApiProperty({
    type: 'integer',
    example: 3950,
    description:
      'Exact net installment amount in whole integer Rupees (must match due.netPayableAmount)',
  })
  @IsNotEmpty({ message: 'Collection amount is required' })
  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt({
    message: 'Collection amount must be a whole Rupee integer amount (zero paise/decimals)',
  })
  @IsPositive({ message: 'Collection amount must be a positive whole number' })
  @Max(MAX_SAFE_WHOLE_RUPEE, {
    message: 'Collection amount exceeds maximum safe whole-Rupee integer limit',
  })
  amount: number;

  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: 'Payment method (CASH, UPI, CHEQUE, BANK_TRANSFER)',
  })
  @IsNotEmpty({ message: 'Payment method is required' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({
    example: '2026-10-21T09:30:00.000Z',
    description:
      'Exact ISO-8601 timestamp recorded by mobile device at physical collection point',
  })
  @IsNotEmpty({ message: 'Collected at timestamp is required' })
  @IsDateString({}, { message: 'collectedAt must be a valid ISO 8601 string' })
  collectedAt: string;

  @ApiPropertyOptional({
    example: 'UPI/20261021/9876543210',
    description:
      'Optional transaction reference (UPI UTR number, Cheque number, or Bank transfer reference)',
  })
  @IsOptional()
  @IsString()
  transactionRef?: string;
}

export class SyncOfflineQueueDto {
  @ApiProperty({
    type: [SyncOfflineCollectionItemDto],
    description: 'Array of offline queued collection items to synchronize (1 to 100 items)',
  })
  @IsArray({ message: 'items must be an array of offline collection items' })
  @ArrayMinSize(1, { message: 'Queue batch must contain at least 1 item' })
  @ArrayMaxSize(100, { message: 'Queue batch cannot exceed 100 items per request' })
  @ValidateNested({ each: true })
  @Type(() => SyncOfflineCollectionItemDto)
  items: SyncOfflineCollectionItemDto[];
}
