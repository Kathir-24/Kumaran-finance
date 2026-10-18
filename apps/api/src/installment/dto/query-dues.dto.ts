import { ApiPropertyOptional } from '@nestjs/swagger';
import { DueStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryDuesDto {
  @ApiPropertyOptional({
    enum: DueStatus,
    description: 'Filter by installment due status (UNPAID, PAID, OVERDUE)',
  })
  @IsOptional()
  @IsEnum(DueStatus)
  status?: DueStatus;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number for pagination',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Number of records per page (max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
