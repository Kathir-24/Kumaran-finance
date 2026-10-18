import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ActivateChitDto {
  @ApiPropertyOptional({
    example: '76e354a9-31d0-4bbd-94e4-27c66e50b3bb',
    description:
      'Customer ID of company representative holding Ticket #1 for Month 1 full pool payout (Month 1 Rule)',
  })
  @IsOptional()
  @IsString()
  companyTicketCustomerId?: string;

  @ApiPropertyOptional({
    example: 'Verified by Partner B against physical register',
    description: 'Checker approval notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
