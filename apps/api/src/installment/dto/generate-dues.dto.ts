import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GenerateDuesDto {
  @ApiPropertyOptional({
    example: '2022-11-22T00:00:00.000Z',
    description:
      'Payment Date / Cycle start date (defaults to scheme cycle day for this month, e.g. 22nd)',
  })
  @IsOptional()
  @IsDateString()
  cycleStartDate?: string;

  @ApiPropertyOptional({
    example: '2022-12-22T00:00:00.000Z',
    description:
      'Cycle end date / Due date (defaults to next cycle date, e.g. next month 22nd)',
  })
  @IsOptional()
  @IsDateString()
  cycleEndDate?: string;

  @ApiPropertyOptional({
    example: '2022-12-22T00:00:00.000Z',
    description:
      'Optional payment due date for this installment month (defaults to cycleEndDate)',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
