import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
} from 'class-validator';

export class RecordBidDto {
  @ApiProperty({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description: 'UUID of the winning subscriber ticket (must be non-prized and with zero arrears)',
  })
  @IsNotEmpty({ message: 'Ticket ID is required' })
  @IsString()
  ticketId: string;

  @ApiProperty({
    example: 22000,
    description:
      'Winning auction bid discount in whole integer Rupees (must be between 4% commission and 1/4 ceiling)',
  })
  @IsNotEmpty({ message: 'Bid discount is required' })
  @Type(() => Number)
  @IsInt({ message: 'Bid discount must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive({ message: 'Bid discount must be a positive whole number' })
  bidDiscount: number;

  @ApiProperty({
    example: '2026-12-15T00:00:00.000Z',
    description: 'Date the physical auction was conducted at the branch',
  })
  @IsNotEmpty({ message: 'Auction date is required' })
  @IsDateString()
  auctionDate: string;
}
