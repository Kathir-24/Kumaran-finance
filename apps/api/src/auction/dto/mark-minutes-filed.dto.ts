import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class MarkMinutesFiledDto {
  @ApiPropertyOptional({
    example: 'DRC/ERD/CHAL-2026-00412',
    description: 'Government challan, seal, or acknowledgement receipt number from Registrar office',
  })
  @IsOptional()
  @IsString()
  filingReference?: string;

  @ApiPropertyOptional({
    example: '2026-10-25T11:00:00.000Z',
    description:
      'Date minutes were physically submitted to Deputy Registrar office (defaults to current date)',
  })
  @IsOptional()
  @IsDateString()
  filedDate?: string;

  @ApiPropertyOptional({
    example: 'Submitted in person at Erode Deputy Registrar office by Partner A',
    description: 'Optional staff notes or remarks regarding physical filing',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
