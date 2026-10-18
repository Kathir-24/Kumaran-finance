import { ApiPropertyOptional } from '@nestjs/swagger';
import { ChitStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryChitDto {
  @ApiPropertyOptional({
    enum: ChitStatus,
    description: 'Filter by scheme status (DRAFT, REGISTERED, ACTIVE, COMPLETED, CLOSED)',
  })
  @IsOptional()
  @IsEnum(ChitStatus)
  status?: ChitStatus;

  @ApiPropertyOptional({
    example: 'KCA',
    description: 'Search keyword matching group code or name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
