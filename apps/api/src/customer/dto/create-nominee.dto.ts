import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import {
  REGEX_AADHAAR_LAST_4,
  REGEX_INDIAN_PHONE,
} from '../../common/constants';

export class CreateNomineeDto {
  @ApiProperty({
    example: 'Kavitha S',
    description: 'Full name of the nominee',
  })
  @IsNotEmpty({ message: 'Nominee full name is required' })
  @IsString()
  @MinLength(2, { message: 'Nominee name must be at least 2 characters' })
  fullName: string;

  @ApiProperty({
    example: 'Spouse',
    description: 'Relationship with the customer (e.g., Spouse, Son, Father, Mother)',
  })
  @IsNotEmpty({ message: 'Relationship is required' })
  @IsString()
  relationship: string;

  @ApiProperty({
    example: '9842798765',
    description: '10-digit mobile phone number of the nominee',
  })
  @IsNotEmpty({ message: 'Nominee phone number is required' })
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, {
    message: 'Nominee phone number must be a valid 10-digit Indian mobile (starts with 6-9)',
  })
  phone: string;

  @ApiPropertyOptional({
    example: '8912',
    description: 'Masked last 4 digits of nominee Aadhaar card',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_AADHAAR_LAST_4, {
    message: 'Nominee Aadhaar must be strictly the last 4 digits (e.g. 8912)',
  })
  aadhaarLast4?: string;
}
