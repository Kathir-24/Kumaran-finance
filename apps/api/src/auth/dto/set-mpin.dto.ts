import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
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
}
