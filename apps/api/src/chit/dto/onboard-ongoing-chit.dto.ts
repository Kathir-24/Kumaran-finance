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

export class HistoricalWinnerDto {
  @ApiProperty({
    example: 2,
    description: 'Installment month of past auction (e.g., Months 2 to onboardedAtMonth - 1)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(2, { message: 'Historical auctions can only start from Month 2 (Month 1 has no auction)' })
  month: number;

  @ApiProperty({
    example: 5,
    description: 'Ticket number that won the past auction',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ticketNumber: number;

  @ApiProperty({
    example: 22000,
    description: 'Winning bid discount in whole integer Rupees (must be <= chitValue / 4)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt({ message: 'Bid discount must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive()
  bidDiscount: number;

  @ApiProperty({
    example: '2026-05-15T00:00:00.000Z',
    description: 'Date the past physical auction took place',
  })
  @IsNotEmpty()
  @IsDateString()
  auctionDate: string;
}

export class OngoingMemberAllocationDto {
  @ApiProperty({
    example: 1,
    description: 'Ticket number (1 to totalTickets)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ticketNumber: number;

  @ApiProperty({
    example: '76e354a9-31d0-4bbd-94e4-27c66e50b3bb',
    description: 'Customer ID for this ticket',
  })
  @IsNotEmpty()
  @IsString()
  customerId: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Opening balance in whole Rupees transcribed from paper notebook',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Opening balance must be a whole Rupee integer amount (zero paise/decimals)' })
  openingBalance?: number = 0;
}

export class OnboardOngoingChitDto {
  @ApiProperty({
    example: 'KCA-1L-20M-ONGOING-07',
    description: 'Group code for the ongoing chit scheme',
  })
  @IsNotEmpty()
  @IsString()
  groupCode: string;

  @ApiProperty({
    example: '₹1 Lakh 20 Months Ongoing Group (Intake Month 7)',
    description: 'Scheme name',
  })
  @IsNotEmpty()
  @IsString()
  groupName: string;

  @ApiPropertyOptional({
    example: '₹1 லட்சம் 20 மாதங்கள் நடைமுறை குழு',
  })
  @IsOptional()
  @IsString()
  groupNameTamil?: string;

  @ApiProperty({
    example: 100000,
    description: 'Total chit value in whole integer Rupees',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt({ message: 'Chit value must be a whole Rupee integer amount (zero paise/decimals)' })
  @IsPositive()
  chitValue: number;

  @ApiProperty({
    example: 20,
    description: 'Total scheme duration in months',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  durationMonths: number;

  @ApiProperty({
    example: 20,
    description: 'Total tickets in the scheme',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  totalTickets: number;

  @ApiProperty({
    example: 7,
    description: 'Current active month where digital tracking starts (e.g. Month 7)',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(2, { message: 'Ongoing intake must be at least Month 2' })
  onboardedAtMonth: number;

  @ApiPropertyOptional({
    example: 'ROC/ERD/CHIT/2026/012',
  })
  @IsOptional()
  @IsString()
  sanctionOrderNumber?: string;

  @ApiPropertyOptional({
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  sanctionDate?: string;

  @ApiProperty({
    example: '2026-04-01T00:00:00.000Z',
    description: 'Original start date of Month 1 from physical notebook',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    example: '2027-11-30T00:00:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty({
    type: [HistoricalWinnerDto],
    description: 'List of past auction winners transcribed from paper notebooks',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoricalWinnerDto)
  historicalWinners: HistoricalWinnerDto[];

  @ApiProperty({
    type: [OngoingMemberAllocationDto],
    description: 'Full roster of member tickets (1..N) transcribed from paper notebooks',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OngoingMemberAllocationDto)
  memberAllocations: OngoingMemberAllocationDto[];

  @ApiPropertyOptional({
    example: '94204d28-4a7b-49f5-bf3e-302a4107f750',
  })
  @IsOptional()
  @IsString()
  branchId?: string;
}
