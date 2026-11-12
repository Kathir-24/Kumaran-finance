import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionStatus } from '@prisma/client';

export class EligibleBidderResponseDto {
  @ApiProperty({ example: 'ticket-uuid-001', description: 'Subscriber ticket unique ID' })
  ticketId: string;

  @ApiProperty({ example: 5, description: 'Ticket number 1..N' })
  ticketNumber: number;

  @ApiProperty({ example: 'cust-uuid-001', description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ example: 'Sundaram S', description: 'Customer full name' })
  customerName: string;

  @ApiProperty({ example: 'KC-CUST-00101', description: 'Customer code' })
  customerCode: string;

  @ApiProperty({ example: '9842712345', description: 'Customer phone number' })
  phone: string;
}

export class AuctionWinnerDto {
  @ApiProperty({ example: 'winner-uuid-001', description: 'Winner record ID' })
  id: string;

  @ApiProperty({ example: 'ticket-uuid-001', description: 'Winning ticket ID' })
  ticketId: string;

  @ApiProperty({ example: false, description: 'Whether the winner was selected via physical paper token tie-break' })
  wasTieBreakWinner: boolean;

  @ApiProperty({ example: false, description: 'Whether company safety proof security was required' })
  isSecurityRequired: boolean;

  @ApiProperty({ example: false, description: 'Whether subscriber signed payout agreement' })
  agreementSigned: boolean;

  @ApiProperty({ example: false, description: 'Whether nominee signed payout agreement' })
  nomineeSigned: boolean;
}

export class AuctionTieBidderDto {
  @ApiProperty({ example: 'tie-uuid-001', description: 'Tie bid record ID' })
  id: string;

  @ApiProperty({ example: 'ticket-uuid-002', description: 'Tied subscriber ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 25000, description: 'Bid ceiling discount amount in whole Rupees' })
  bidDiscount: number;

  @ApiProperty({ example: false, description: 'Whether this ticket won the physical token draw' })
  isLotWinner: boolean;
}

export class AuctionMinutesDto {
  @ApiProperty({ example: 'min-uuid-001', description: 'Auction minutes ID' })
  id: string;

  @ApiProperty({ example: 18, description: 'Number of subscribers physically present at branch' })
  subscribersPresent: number;

  @ApiProperty({ example: 'Auction proceedings conducted...', description: 'Full Form XVII statutory minutes text' })
  minutesText: string;

  @ApiProperty({ example: true, description: 'Foreman signature recorded' })
  signedByForeman: boolean;

  @ApiProperty({ example: false, description: 'Whether filed at Chit Registrar office' })
  filedAtRegistrar: boolean;

  @ApiProperty({ type: String, example: null, description: 'Government challan or filing reference', nullable: true })
  filingReference?: string | null;

  @ApiProperty({ type: String, format: 'date-time', example: null, description: 'Filing date at Registrar office', nullable: true })
  filedDate?: Date | string | null;
}

export class AuctionResponseDto {
  @ApiProperty({ example: 'auc-uuid-001', description: 'Auction unique ID' })
  id: string;

  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group ID' })
  chitGroupId: string;

  @ApiProperty({ example: 2, description: 'Installment month 1..N' })
  installmentMonth: number;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-10T11:00:00.000Z', description: 'Scheduled/Conducted auction timestamp' })
  auctionDate: Date | string;

  @ApiProperty({ enum: AuctionStatus, example: AuctionStatus.COMPLETED, description: 'Auction lifecycle status' })
  status: AuctionStatus;

  @ApiProperty({ type: Number, example: 25000, description: 'Winning bid discount in whole Rupees', nullable: true })
  bidDiscount?: number | null;

  @ApiProperty({ type: Number, example: 4.0, description: 'Foreman commission rate frozen at 4.00%', nullable: true })
  foremanCommissionRate?: number | null;

  @ApiProperty({ type: Number, example: 4000, description: 'Foreman commission in whole Rupees', nullable: true })
  foremanCommissionAmount?: number | null;

  @ApiProperty({ type: Number, example: 21000, description: 'Total universal dividend pool in whole Rupees', nullable: true })
  totalDividend?: number | null;

  @ApiProperty({ type: Number, example: 1050, description: 'Dividend allocated per ticket in whole Rupees', nullable: true })
  dividendPerTicket?: number | null;

  @ApiProperty({ type: Number, example: 75000, description: 'Prize money payable to winner in whole Rupees', nullable: true })
  prizeMoney?: number | null;

  @ApiProperty({ type: String, example: 'user-maker-001', description: 'Maker user ID who entered bid', nullable: true })
  conductedByUserId?: string | null;

  @ApiProperty({ type: String, example: 'user-checker-001', description: 'Checker user ID who finalized auction', nullable: true })
  finalizedByUserId?: string | null;

  @ApiProperty({ type: AuctionWinnerDto, nullable: true, description: 'Winning ticket record' })
  winner?: AuctionWinnerDto | null;

  @ApiProperty({ type: [AuctionTieBidderDto], description: 'List of tied ceiling bidders' })
  tieBidders?: AuctionTieBidderDto[];
}

export class AuctionDetailResponseDto extends AuctionResponseDto {
  @ApiProperty({ type: AuctionMinutesDto, nullable: true, description: 'Statutory Form XVII minutes record' })
  minutes?: AuctionMinutesDto | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Parent chit scheme parameters',
  })
  chitGroup?: any;
}

export class FinalizeAuctionResponseDto {
  @ApiProperty({ example: 'Auction finalized successfully and prize marked', description: 'Status message' })
  message: string;

  @ApiProperty({ type: AuctionResponseDto, description: 'Finalized auction details' })
  auction: AuctionResponseDto;

  @ApiProperty({ type: AuctionWinnerDto, description: 'Winning ticket assignment' })
  winner: AuctionWinnerDto;

  @ApiProperty({ type: AuctionMinutesDto, nullable: true, description: 'Generated minutes record' })
  minutes?: AuctionMinutesDto | null;
}

export class MarkMinutesFiledResponseDto {
  @ApiProperty({ example: 'Auction minutes marked as filed with Registrar', description: 'Status message' })
  message: string;

  @ApiProperty({ type: AuctionMinutesDto, description: 'Updated minutes record' })
  minutes: AuctionMinutesDto;
}
