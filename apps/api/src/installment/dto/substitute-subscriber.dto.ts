import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SubstituteSubscriberDto {
  @ApiProperty({
    example: 'cust-uuid-002',
    description: 'Customer UUID of verified replacement subscriber',
  })
  @IsNotEmpty({ message: 'New customer ID is required' })
  @IsUUID('4', { message: 'New customer ID must be a valid UUID' })
  newCustomerId: string;

  @ApiPropertyOptional({
    example: 'Previous subscriber removed for 3-month consecutive default; substituted per company policy.',
    description: 'Operational justification or notebook remarks',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SubstituteSubscriberResponseDto {
  @ApiProperty({ example: true, description: 'Operation success status' })
  success: boolean;

  @ApiProperty({
    example: 'Subscriber replacement successfully executed. Ticket restored to ACTIVE status.',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      id: 'ticket-uuid-001',
      ticketNumber: 5,
      status: 'ACTIVE',
      previousCustomerId: 'cust-uuid-001',
      newCustomerId: 'cust-uuid-002',
      newCustomerName: 'Ravi Kumar',
    },
    description: 'Substituted ticket details',
  })
  ticket: any;
}
