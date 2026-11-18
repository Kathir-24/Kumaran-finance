import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class QueryAuditLogsDto {
  @ApiPropertyOptional({
    example: 'Payment',
    description: 'Filter audit trail by entity type (Payment, Auction, ChitGroup, AuctionWinner)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({
    example: 'PAYMENT_REVERSED',
    description: 'Filter audit trail by action (AUCTION_FINALIZED, PAYMENT_REVERSED, TIE_BREAK_DRAWN, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Filter by user ID who performed the action',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Filter audit records on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Filter audit records on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Page number for pagination (1 to 10000)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page: number = 1;

  @ApiPropertyOptional({
    example: 50,
    default: 50,
    description: 'Number of audit records per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
