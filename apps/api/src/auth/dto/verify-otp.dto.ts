import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { REGEX_INDIAN_PHONE } from '../../common/constants';

export class VerifyOtpDto {
  @ApiProperty({
    example: '9842154321',
    description: 'Registered 10-digit Indian mobile number',
  })
  @Matches(REGEX_INDIAN_PHONE, {
    message: 'Phone must be a valid 10-digit Indian mobile number',
  })
  phone: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit SMS OTP received on registered device',
  })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
