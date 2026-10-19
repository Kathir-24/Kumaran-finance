import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { REGEX_INDIAN_PHONE, REGEX_MPIN } from '../../common/constants';

export class MpinLoginDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Registered 10-digit mobile number',
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(REGEX_INDIAN_PHONE, { message: 'Phone number must be exactly 10 digits' })
  phone: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit MPIN for field agent quick unlock',
  })
  @IsNotEmpty({ message: 'MPIN is required' })
  @IsString()
  @Matches(REGEX_MPIN, { message: 'MPIN must be exactly 6 digits' })
  mpin: string;
}
