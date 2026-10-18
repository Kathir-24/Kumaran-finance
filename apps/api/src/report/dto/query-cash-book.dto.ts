import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QueryCashBookDto {
  @ApiPropertyOptional({
    example: '2026-10-18',
    description: 'Transaction date (YYYY-MM-DD or ISO string). Defaults to current date.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter cash book safe records by branch ID (Super Admin / Accountant only)',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
