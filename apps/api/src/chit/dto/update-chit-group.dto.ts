import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateChitGroupDto {
  @ApiPropertyOptional({
    example: '₹1 Lakh 20 Months Group A',
    description: 'Chit group name in English',
  })
  @IsOptional()
  @IsString()
  groupName?: string;

  @ApiPropertyOptional({
    example: '₹1 லட்சம் 20 மாதங்கள் குழு A',
    description: 'Chit group name in Tamil',
  })
  @IsOptional()
  @IsString()
  groupNameTamil?: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Scheduled start date (Month 1)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2028-06-01',
    description: 'Scheduled end date (Month N)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'SO/ERD/2026/00918',
    description: 'Chit Registrar official Sanction Order Number',
  })
  @IsOptional()
  @IsString()
  sanctionOrderNumber?: string;

  @ApiPropertyOptional({
    example: '2026-10-15',
    description: 'Date of Chit Registrar sanction',
  })
  @IsOptional()
  @IsDateString()
  sanctionDate?: string;
}
