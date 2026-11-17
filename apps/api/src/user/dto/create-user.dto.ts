import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { REGEX_INDIAN_PHONE, STAFF_ROLES } from '../../common/constants';

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
    enum: STAFF_ROLES,
    example: [Role.COLLECTION_AGENT],
    description: 'Assigned RBAC role personas for this staff user (strictly excludes CUSTOMER)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(STAFF_ROLES, {
    each: true,
    message: 'roles must contain only staff roles (SUPER_ADMIN, BRANCH_MANAGER, ACCOUNTANT, COLLECTION_AGENT, AUDITOR)',
  })
  roles: Role[];

  @ApiPropertyOptional({
    example: false,
    description: 'Verified statutory partner identity (requires caller to be an active partner)',
  })
  @IsBoolean()
  @IsOptional()
  isPartner?: boolean;

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
