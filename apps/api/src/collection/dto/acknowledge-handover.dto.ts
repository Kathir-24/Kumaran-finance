import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

export class AcknowledgeHandoverDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'UUID of the field collection agent who collected the physical cash in the field',
  })
  @IsNotEmpty({ message: 'Collector user ID is required' })
  @IsString()
  collectorUserId: string;

  @ApiProperty({
    type: 'integer',
    example: 45000,
    description:
      'Physically counted cash currency notes amount received into branch vault (must match total of specified paymentIds)',
  })
  @IsNotEmpty({ message: 'Acknowledged cash amount is required' })
  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt({ message: 'Acknowledged amount must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive({ message: 'Acknowledged amount must be a positive number' })
  @Max(MAX_SAFE_WHOLE_RUPEE, {
    message: 'Acknowledged amount exceeds maximum safe whole-Rupee integer limit',
  })
  acknowledgedAmount: number;

  @ApiProperty({
    example: [
      'd7b68e74-2794-4366-a6fb-6dbf8615951c',
      'c8b749fa-1152-47ef-84b2-a4f6696b9978',
    ],
    description:
      'List of Payment UUIDs included in the physical cash batch being acknowledged',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one payment ID is required in handover' })
  @IsString({ each: true })
  paymentIds: string[];

  @ApiPropertyOptional({
    example:
      'Currency counted: ₹500 x 80 = ₹40,000; ₹200 x 20 = ₹4,000; ₹100 x 10 = ₹1,000. Total verified: ₹45,000.',
    description:
      'Physical denomination breakdown and verification notes by Partner/Super Admin',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
