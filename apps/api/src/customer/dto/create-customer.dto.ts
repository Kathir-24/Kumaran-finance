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
  REGEX_INDIAN_PAN,
  REGEX_INDIAN_PHONE,
  REGEX_INDIAN_PINCODE,
} from '../../common/constants';

export class CreateCustomerDto {
  @ApiProperty({
    example: 'Sundaram S',
    description: 'Full name in English (minimum 2 characters)',
  })
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  fullName: string;

  @ApiPropertyOptional({
    example: 'சுந்தரம் சு',
    description: 'Full name in Tamil for native receipt rendering',
  })
  @IsOptional()
  @IsString()
  fullNameTamil?: string;

  @ApiProperty({
    example: '9842712345',
    description: '10-digit primary mobile number (unique)',
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, { message: 'Phone number must be exactly 10 digits' })
  phone: string;

  @ApiPropertyOptional({
    example: '9443212345',
    description: 'Alternate contact number',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, { message: 'Alternate phone must be exactly 10 digits' })
  altPhone?: string;

  @ApiProperty({
    example: '14/2, Gandhi Nagar',
    description: 'Primary street address line 1',
  })
  @IsNotEmpty({ message: 'Address line 1 is required' })
  @IsString()
  addressLine1: string;

  @ApiPropertyOptional({
    example: 'Near Bus Stand',
    description: 'Address line 2 / Landmark',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({
    example: 'Perundurai',
    description: 'City or Town name (defaults to Perundurai if omitted)',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: '638052',
    description: '6-digit Indian Postal PIN code (defaults to 638052 if omitted)',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_INDIAN_PINCODE, { message: 'Pincode must be exactly 6 digits' })
  pincode?: string;

  @ApiPropertyOptional({
    example: 'ABCDE1234F',
    description: '10-character alphanumeric PAN number',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_INDIAN_PAN, {
    message: 'PAN must be valid 10-character format (e.g. ABCDE1234F)',
  })
  panNumber?: string;

  @ApiPropertyOptional({
    example: '4821',
    description:
      'Masked last 4 digits of Aadhaar only (Data Minimization / DPDP Act 2023 compliance)',
  })
  @IsOptional()
  @IsString()
  @Matches(REGEX_AADHAAR_LAST_4, {
    message: 'Aadhaar must be strictly the last 4 digits (e.g. 4821)',
  })
  aadhaarLast4?: string;

  @ApiPropertyOptional({
    example: '94204d28-4a7b-49f5-bf3e-302a4107f750',
    description: 'Assigned branch ID (defaults to current staff branch if omitted)',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}
