import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class QueryDashboardDto {
  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter dashboard metrics by branch ID (Super Admin / Auditor only)',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
