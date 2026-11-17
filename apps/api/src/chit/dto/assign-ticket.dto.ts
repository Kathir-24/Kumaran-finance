import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  MAX_SAFE_WHOLE_RUPEE,
  parseStrictWholeRupeeValue,
} from '../../common/utils/whole-rupee.util';

export class AssignTicketDto {
  @ApiProperty({
    type: 'integer',
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
    type: 'integer',
    example: 0,
    description: 'Opening balance in whole Rupees (used for mid-cycle intake adjustments)',
    default: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt({
    message: 'Opening balance must be a whole Rupee integer amount (zero paise/decimals)',
  })
  @Min(0, { message: 'Opening balance cannot be negative' })
  @Max(MAX_SAFE_WHOLE_RUPEE, {
    message: 'Opening balance exceeds maximum safe whole-Rupee integer limit',
  })
  openingBalance?: number = 0;
}
