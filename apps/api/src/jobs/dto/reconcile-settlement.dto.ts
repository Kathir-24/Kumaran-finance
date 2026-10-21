import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SettlementRecordDto {
  @ApiProperty({
    example: 'ORD_20261021_001',
    description: 'Payment gateway order / reference ID (transactionRef)',
  })
  @IsNotEmpty({ message: 'gatewayOrderId is required' })
  @IsString()
  gatewayOrderId: string;

  @ApiProperty({
    example: 'pay_1234567890',
    description: 'External gateway payment transaction ID',
  })
  @IsNotEmpty({ message: 'gatewayPaymentId is required' })
  @IsString()
  gatewayPaymentId: string;

  @ApiProperty({
    example: 3750,
    description: 'Settlement amount in whole integer Rupees',
  })
  @IsNotEmpty({ message: 'amount is required' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'amount must be a positive whole number' })
  amount: number;

  @ApiProperty({
    enum: ['SUCCESS', 'FAILED', 'REFUNDED'],
    example: 'SUCCESS',
    description: 'Gateway settlement transaction status',
  })
  @IsNotEmpty({ message: 'status is required' })
  @IsIn(['SUCCESS', 'FAILED', 'REFUNDED'], {
    message: 'status must be SUCCESS, FAILED, or REFUNDED',
  })
  status: 'SUCCESS' | 'FAILED' | 'REFUNDED';

  @ApiProperty({
    example: '2026-10-21T10:00:00.000Z',
    description: 'Gateway settlement timestamp',
  })
  @IsNotEmpty({ message: 'settledAt timestamp is required' })
  @IsDateString({}, { message: 'settledAt must be a valid ISO 8601 string' })
  settledAt: string;
}

export class ReconcileSettlementDto {
  @ApiProperty({
    type: [SettlementRecordDto],
    description: 'List of external gateway settlement records to reconcile against internal payments',
  })
  @IsArray({ message: 'records must be an array' })
  @ValidateNested({ each: true })
  @Type(() => SettlementRecordDto)
  records: SettlementRecordDto[];
}
