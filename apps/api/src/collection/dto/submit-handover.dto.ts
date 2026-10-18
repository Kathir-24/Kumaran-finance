import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class SubmitHandoverDto {
  @ApiPropertyOptional({
    example: '2026-10-18T00:00:00.000Z',
    description:
      'Collection date to batch for evening cash handover (defaults to current date)',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
