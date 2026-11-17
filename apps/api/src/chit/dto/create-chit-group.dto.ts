import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  MAX_SAFE_WHOLE_RUPEE,
  parseStrictWholeRupeeValue,
} from '../../common/utils/whole-rupee.util';

export class CreateChitGroupDto {
  @ApiProperty({
    example: 'KCA-1L-20M-01',
    description: 'Unique scheme group code',
  })
  @IsNotEmpty({ message: 'Group code is required' })
  @IsString()
  groupCode: string;

  @ApiProperty({
    example: '₹1 Lakh 20 Months Group A',
    description: 'Human-readable scheme name in English',
  })
  @IsNotEmpty({ message: 'Group name is required' })
  @IsString()
  groupName: string;

  @ApiPropertyOptional({
    example: '₹1 லட்சம் 20 மாதங்கள் குழு A',
    description: 'Scheme name in Tamil for bilingual receipt rendering',
  })
  @IsOptional()
  @IsString()
  groupNameTamil?: string;

  @ApiProperty({
    type: 'integer',
    example: 100000,
    description: 'Total chit value in whole integer Rupees (e.g., 100000 for ₹1 Lakh)',
  })
  @IsNotEmpty({ message: 'Chit value is required' })
  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt({ message: 'Chit value must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive({ message: 'Chit value must be a positive whole number' })
  @Max(MAX_SAFE_WHOLE_RUPEE, {
    message: 'Chit value exceeds maximum safe whole-Rupee integer limit',
  })
  chitValue: number;

  @ApiProperty({
    type: 'integer',
    example: 20,
    description: 'Duration of the chit scheme in months (e.g., 20, 25, 40)',
  })
  @IsNotEmpty({ message: 'Duration in months is required' })
  @Type(() => Number)
  @IsInt()
  @Min(2, { message: 'Duration must be at least 2 months' })
  durationMonths: number;

  @ApiProperty({
    type: 'integer',
    example: 20,
    description: 'Total number of subscriber tickets (must match durationMonths in standard chits)',
  })
  @IsNotEmpty({ message: 'Total tickets is required' })
  @Type(() => Number)
  @IsInt()
  @Min(2, { message: 'Total tickets must be at least 2' })
  totalTickets: number;

  @ApiPropertyOptional({
    example: 'ROC/ERD/CHIT/2026/045',
    description: 'Prior sanction order number issued by Chit Registrar',
  })
  @IsOptional()
  @IsString()
  sanctionOrderNumber?: string;

  @ApiPropertyOptional({
    example: '2026-09-15T00:00:00.000Z',
    description: 'Date of prior sanction order',
  })
  @IsOptional()
  @IsDateString()
  sanctionDate?: string;

  @ApiProperty({
    example: '2026-11-01T00:00:00.000Z',
    description: 'Official commencement date (Month 1 start)',
  })
  @IsNotEmpty({ message: 'Start date is required' })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    example: '2028-06-30T00:00:00.000Z',
    description: 'Scheduled maturity date (Month N end)',
  })
  @IsNotEmpty({ message: 'End date is required' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    example: '94204d28-4a7b-49f5-bf3e-302a4107f750',
    description: 'Assigned branch ID (defaults to current staff branch if omitted)',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}
