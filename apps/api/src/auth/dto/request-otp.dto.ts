import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { REGEX_INDIAN_PHONE } from '../../common/constants';

export class RequestOtpDto {
  @ApiProperty({
    example: '9842154321',
    description: 'Registered 10-digit Indian mobile number of staff or customer',
  })
  @Matches(REGEX_INDIAN_PHONE, {
    message: 'Phone must be a valid 10-digit Indian mobile number',
  })
  phone: string;
}
