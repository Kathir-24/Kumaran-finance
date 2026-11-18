import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class QueryPendingApprovalsDto {
  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter pending approvals by branch ID (Super Admin / Accountant / Auditor only)',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'When true, returns only dual-control items the authenticated caller is legally eligible to approve under Maker != Checker (Guardrail 10) and Partner Identity (Guardrail 11)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  actionableOnly?: boolean;
}
