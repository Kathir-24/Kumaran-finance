import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class TiedTicketDto {
  @ApiProperty({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description: 'Ticket UUID that bid the maximum ceiling discount',
  })
  @IsNotEmpty()
  @IsString()
  ticketId: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Physical paper token number drawn at the branch lot draw',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenNumber?: number;
}

export class RecordTieBreakDto {
  @ApiProperty({
    type: [TiedTicketDto],
    description:
      'List of all subscriber tickets that simultaneously bid the maximum 1/4 ceiling discount',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TiedTicketDto)
  tiedTickets: TiedTicketDto[];

  @ApiProperty({
    example: '2351d319-24f1-48dd-8a9d-657fbf2d371f',
    description:
      'UUID of the winning ticket drawn by the Foreman via physical paper token draw (Option A)',
  })
  @IsNotEmpty({ message: 'Winning ticket ID is required' })
  @IsString()
  winningTicketId: string;

  @ApiProperty({
    example: 25000,
    description: 'Tied bid discount (must equal exact 1/4 ceiling: chitValue / 4)',
  })
  @IsNotEmpty({ message: 'Bid discount is required' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  bidDiscount: number;

  @ApiProperty({
    example: '2026-12-15T00:00:00.000Z',
    description: 'Date the physical lot draw took place at the branch in front of members',
  })
  @IsNotEmpty({ message: 'Auction date is required' })
  @IsDateString()
  auctionDate: string;

  @ApiPropertyOptional({
    example: ['S. Sundaram', 'K. Murugesan', 'M. Ramesh'],
    description: 'Names of attending subscribers who witnessed the physical token draw',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  witnessNames?: string[];
}
