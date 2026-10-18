import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class QueryFormXviiDto {
  @ApiProperty({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Chit group ID to retrieve consolidated auction minutes for',
  })
  @IsNotEmpty()
  @IsUUID()
  chitGroupId!: string;

  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Filter auctions on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    description: 'Filter auctions on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
