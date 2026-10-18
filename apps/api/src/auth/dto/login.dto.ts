import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Registered mobile number (10 digits) or staff email address',
  })
  @IsNotEmpty({ message: 'Identifier (phone or email) is required' })
  @IsString()
  identifier: string;

  @ApiProperty({
    example: 'Admin@Kumaran2026',
    description: 'Staff password (min 6 characters)',
  })
  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
