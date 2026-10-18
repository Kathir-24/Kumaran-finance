import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class QueryFormXxiDto {
  @ApiProperty({
    example: 'd9f96b99-3ea5-4191-be71-0cecaad62354',
    description: 'Chit group ID to retrieve subscriber ledger for',
  })
  @IsNotEmpty()
  @IsUUID()
  chitGroupId!: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Filter ledger by ticket number (1 to 20). If omitted, returns all tickets in group.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  ticketNumber?: number;
}
