import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RequestReversalDto {
  @ApiProperty({
    example: 'WRONG_TICKET_ENTERED',
    description:
      'Mandatory reason code or description for the payment reversal (e.g., WRONG_TICKET_ENTERED, CHEQUE_BOUNCED, DUPLICATE_ENTRY, CUSTOMER_DISPUTE)',
  })
  @IsNotEmpty({ message: 'Reversal reason is mandatory' })
  @IsString()
  @MinLength(5, { message: 'Reversal reason must be at least 5 characters' })
  reason: string;

  @ApiPropertyOptional({
    example: 'Entered for Ticket 7 instead of Ticket 8 during evening rush at branch counter',
    description: 'Detailed explanation and supporting notes for the Checker review',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Optional unique idempotency key to prevent duplicate reversal requests',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
