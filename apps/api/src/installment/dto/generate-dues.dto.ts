import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GenerateDuesDto {
  @ApiPropertyOptional({
    example: '2026-12-10T00:00:00.000Z',
    description:
      'Optional due date for this installment month (defaults to scheme monthly due date)',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
