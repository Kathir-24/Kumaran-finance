import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisbursementMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryDisbursementDto {
  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter disbursements by chit group ID',
  })
  @IsOptional()
  @IsString()
  chitGroupId?: string;

  @ApiPropertyOptional({
    example: 'PENDING_VERIFICATION',
    description:
      'Filter by disbursement status (PENDING_VERIFICATION, VERIFIED_BY_MAKER, AUTHORIZED_BY_CHECKER, DISBURSED)',
  })
  @IsOptional()
  @IsString()
  disbursementStatus?: string;

  @ApiPropertyOptional({
    enum: DisbursementMode,
    description: 'Filter by disbursement mode',
  })
  @IsOptional()
  @IsEnum(DisbursementMode)
  disbursementMode?: DisbursementMode;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Filter records on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Filter records on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

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
    description: 'Maximum items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
