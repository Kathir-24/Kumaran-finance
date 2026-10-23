import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';

export class UpdateUserRolesDto {
  @ApiProperty({
    isArray: true,
    enum: Role,
    example: [Role.COLLECTION_AGENT, Role.ACCOUNTANT],
    description: 'Updated RBAC roles for staff account',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles: Role[];
}
