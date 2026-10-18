import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class MpinLoginDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Registered 10-digit mobile number',
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' })
  phone: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit MPIN for field agent quick unlock',
  })
  @IsNotEmpty({ message: 'MPIN is required' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'MPIN must be exactly 6 digits' })
  mpin: string;
}
