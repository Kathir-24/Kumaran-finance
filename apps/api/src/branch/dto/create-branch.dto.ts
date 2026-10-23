import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { REGEX_INDIAN_PHONE } from '../../common/constants';

export class CreateBranchDto {
  @ApiProperty({ example: 'ERD', description: 'Unique uppercase branch code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Erode Town Branch', description: 'Official branch name in English' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'ஈரோடு கிளை', description: 'Official branch name in Tamil', required: false })
  @IsString()
  @IsOptional()
  nameTamil?: string;

  @ApiProperty({ example: '12, Brough Road, Erode - 638001', description: 'Physical street address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: '9842143210', description: '10-digit Indian phone number' })
  @Matches(REGEX_INDIAN_PHONE, { message: 'Branch phone must be a valid 10-digit Indian mobile number' })
  phone: string;
}
