import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class QueryDefaultersReportDto {
  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter overdue accounts by chit scheme ID',
  })
  @IsOptional()
  @IsUUID()
  chitGroupId?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Minimum consecutive unpaid months (1, 2, or 3). Set to 3 for company removal candidates.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  minArrearsMonths?: number;

  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter overdue accounts by branch ID (Super Admin / Accountant only)',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number for pagination',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Number of records per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
