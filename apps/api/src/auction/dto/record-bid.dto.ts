import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';
import {
  MAX_SAFE_WHOLE_RUPEE,
  parseStrictWholeRupeeValue,
} from '../../common/utils/whole-rupee.util';

export class RecordBidDto {
  @ApiProperty({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description: 'UUID of the winning subscriber ticket (must be non-prized and with zero arrears)',
  })
  @IsNotEmpty({ message: 'Ticket ID is required' })
  @IsString()
  ticketId: string;

  @ApiProperty({
    type: 'integer',
    example: 22000,
    description:
      'Winning auction bid discount in whole integer Rupees (must be between 4% commission and 1/4 ceiling)',
  })
  @IsNotEmpty({ message: 'Bid discount is required' })
  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt({ message: 'Bid discount must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive({ message: 'Bid discount must be a positive whole number' })
  @Max(MAX_SAFE_WHOLE_RUPEE, {
    message: 'Bid discount exceeds maximum safe whole-Rupee integer limit',
  })
  bidDiscount: number;

  @ApiProperty({
    example: '2026-12-15T00:00:00.000Z',
    description: 'Date the physical auction was conducted at the branch',
  })
  @IsNotEmpty({ message: 'Auction date is required' })
  @IsDateString()
  auctionDate: string;
}
