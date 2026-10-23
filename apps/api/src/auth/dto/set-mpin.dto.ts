import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { REGEX_MPIN } from '../../common/constants';

export class SetMpinDto {
  @ApiProperty({
    example: '123456',
    description: 'New 6-digit MPIN',
  })
  @IsNotEmpty({ message: 'MPIN is required' })
  @IsString()
  @Matches(REGEX_MPIN, { message: 'MPIN must be exactly 6 digits' })
  mpin: string;

  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'Temporary setup token returned from verify-otp (required during first-time device registration)',
  })
  @IsOptional()
  @IsString()
  setupToken?: string;
}

