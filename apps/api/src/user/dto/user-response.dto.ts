import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BranchSummaryDto } from '../../auth/dto/auth-response.dto';

export class UserResponseDto {
  @ApiProperty({ example: 'user-uuid-001', description: 'User unique ID' })
  id: string;

  @ApiProperty({ example: 'R. Murugan', description: 'Staff name in English' })
  name: string;

  @ApiProperty({ example: '9842154321', description: 'Contact mobile number' })
  phone: string;

  @ApiProperty({
    isArray: true,
    enum: Role,
    example: [Role.COLLECTION_AGENT],
    description: 'Assigned RBAC roles',
  })
  roles: Role[];

  @ApiProperty({ example: true, description: 'Whether the staff account is active' })
  isActive: boolean;

  @ApiProperty({ example: false, description: 'Whether TOTP 2FA is active' })
  isTotpEnabled: boolean;

  @ApiProperty({ example: true, description: 'Whether 6-digit MPIN is configured' })
  hasMpin: boolean;

  @ApiProperty({ example: 'branch-prd-001', description: 'Branch ID', nullable: true })
  branchId?: string | null;

  @ApiProperty({ type: BranchSummaryDto, nullable: true, description: 'Assigned branch details' })
  branch?: BranchSummaryDto | null;

  @ApiProperty({ example: '2026-10-23T10:00:00.000Z', description: 'Last login timestamp', nullable: true })
  lastLoginAt?: Date | string | null;

  @ApiProperty({ example: '2026-10-23T10:00:00.000Z', description: 'Account creation timestamp' })
  createdAt: Date | string;

  @ApiProperty({ example: '2026-10-23T10:00:00.000Z', description: 'Last update timestamp' })
  updatedAt: Date | string;
}
