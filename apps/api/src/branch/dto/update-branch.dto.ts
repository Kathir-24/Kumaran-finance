import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { REGEX_INDIAN_PHONE } from '../../common/constants';

export class UpdateBranchDto {
  @ApiPropertyOptional({ example: 'Erode Town Branch', description: 'Official branch name in English' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'ஈரோடு கிளை', description: 'Official branch name in Tamil' })
  @IsString()
  @IsOptional()
  nameTamil?: string;

  @ApiPropertyOptional({ example: '12, Brough Road, Erode - 638001', description: 'Physical street address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '9842143210', description: '10-digit Indian phone number' })
  @Matches(REGEX_INDIAN_PHONE, { message: 'Branch phone must be a valid 10-digit Indian mobile number' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether the branch is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
