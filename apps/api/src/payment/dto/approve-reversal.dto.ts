import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveReversalDto {
  @ApiPropertyOptional({
    example: 'Verified counter receipt and confirmed customer mistake with Ticket 8',
    description: 'Checker verification notes and audit justification',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
