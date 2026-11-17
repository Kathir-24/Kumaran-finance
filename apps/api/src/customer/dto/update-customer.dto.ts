import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import {
  REGEX_AADHAAR_LAST_4,
  REGEX_INDIAN_PAN,
  REGEX_INDIAN_PHONE,
  REGEX_INDIAN_PINCODE,
} from '../../common/constants';

export class UpdateCustomerDto {
  @ApiPropertyOptional({
    example: 'Sundaram S',
    description: 'Updated full name in English',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  fullName?: string;

  @ApiPropertyOptional({
    example: 'சுந்தரம் சு',
    description: 'Updated full name in Tamil',
  })
  @IsOptional()
  @IsString()
  fullNameTamil?: string;

  @ApiPropertyOptional({
    example: '9842712345',
    description: 'Updated 10-digit primary mobile number',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, { message: 'Phone number must be exactly 10 digits' })
  phone?: string;

  @ApiPropertyOptional({
    example: '9443212345',
    description: 'Updated alternate phone number',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, { message: 'Alternate phone must be exactly 10 digits' })
  altPhone?: string;

  @ApiPropertyOptional({
    example: '15/A, North Street',
    description: 'Updated address line 1',
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({
    example: 'Opp. Post Office',
    description: 'Updated address line 2',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({
    example: 'Perundurai',
    description: 'Updated city or town',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: '638052',
    description: 'Updated 6-digit PIN code',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_INDIAN_PINCODE, { message: 'Pincode must be exactly 6 digits' })
  pincode?: string;

  @ApiPropertyOptional({
    example: 'ABCDE1234F',
    description: 'Updated 10-character PAN',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase().trim() : value))
  @Matches(REGEX_INDIAN_PAN, {
    message: 'PAN must be valid 10-character format (e.g. ABCDE1234F)',
  })
  panNumber?: string;

  @ApiPropertyOptional({
    example: '4821',
    description: 'Updated masked last 4 digits of Aadhaar',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_AADHAAR_LAST_4, {
    message: 'Aadhaar must be strictly the last 4 digits (e.g. 4821)',
  })
  aadhaarLast4?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Current record version for optimistic concurrency control',
  })
  @IsOptional()
  @IsInt()
  version?: number;
}
