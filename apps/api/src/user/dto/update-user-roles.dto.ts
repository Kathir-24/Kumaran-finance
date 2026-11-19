import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsIn } from 'class-validator';
import { STAFF_ROLES } from '../../common/constants';

export class UpdateUserRolesDto {
  @ApiProperty({
    isArray: true,
    enum: STAFF_ROLES,
    example: [Role.COLLECTION_AGENT, Role.ACCOUNTANT],
    description: 'Updated RBAC roles for staff account (strictly excludes CUSTOMER)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(STAFF_ROLES, {
    each: true,
    message: 'roles must contain only staff roles (SUPER_ADMIN, PARTNER, BRANCH_MANAGER, ACCOUNTANT, COLLECTION_AGENT, AUDITOR)',
  })
  roles: Role[];
}
