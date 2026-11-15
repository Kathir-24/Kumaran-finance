import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { REGEX_INDIAN_PHONE } from '../../common/constants';

export class CreateUserDto {
  @ApiProperty({ example: 'R. Murugan', description: 'Full staff name in English' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '9842154321', description: '10-digit Indian mobile phone number' })
  @Matches(REGEX_INDIAN_PHONE, { message: 'Phone must be a valid 10-digit Indian mobile number' })
  phone: string;

  @ApiProperty({
    isArray: true,
    enum: Role,
    example: [Role.COLLECTION_AGENT],
    description: 'Assigned RBAC role personas for this staff user',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles: Role[];

  @ApiProperty({
    example: 'branch-prd-001',
    description: 'Assigned branch ID. Defaults to Head Office (PRD) if omitted.',
    required: false,
  })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiProperty({
    example: 'TempPass#2026!',
    description: 'Initial password. If omitted, a cryptographically secure random temporary password is generated requiring first-login change.',
    required: false,
  })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
