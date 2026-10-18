import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AssignTicketDto {
  @ApiProperty({
    example: 4,
    description: 'Ticket number to assign (between 1 and totalTickets)',
  })
  @IsNotEmpty({ message: 'Ticket number is required' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Ticket number must be at least 1' })
  ticketNumber: number;

  @ApiProperty({
    example: '76e354a9-31d0-4bbd-94e4-27c66e50b3bb',
    description: 'Verified customer UUID (Enforces ADR-13: max 1 ticket per customer in this group)',
  })
  @IsNotEmpty({ message: 'Customer ID is required' })
  @IsString()
  customerId: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Opening balance in whole Rupees (used for mid-cycle intake adjustments)',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openingBalance?: number = 0;
}
