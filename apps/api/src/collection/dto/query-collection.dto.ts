import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryCollectionDto {
  @ApiPropertyOptional({
    example: '2026-10-18',
    description: 'Filter collection records by date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Filter collection records by specific collection agent UUID',
  })
  @IsOptional()
  @IsString()
  collectorUserId?: string;

  @ApiPropertyOptional({
    example: 'branch-prd-001',
    description: 'Filter collections by branch ID',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}
