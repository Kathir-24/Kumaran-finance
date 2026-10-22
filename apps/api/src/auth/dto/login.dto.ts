import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { REGEX_INDIAN_PHONE } from '../../common/constants';

export class LoginDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Registered 10-digit Indian mobile number',
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, { message: 'Phone number must be a valid 10-digit Indian mobile number' })
  phone: string;

  @ApiProperty({
    example: 'Admin@Kumaran2026',
    description: 'Staff password (min 6 characters)',
  })
  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
