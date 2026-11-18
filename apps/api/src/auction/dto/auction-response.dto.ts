import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionStatus } from '@prisma/client';

export class EligibleBidderCustomerDto {
  @ApiProperty({ example: 'cust-uuid-001', description: 'Customer ID' })
  id: string;

  @ApiProperty({ example: 'KC-CUST-00101', description: 'Customer code' })
  customerCode: string;

  @ApiProperty({ example: 'Sundaram S', description: 'Customer full name' })
  fullName: string;

  @ApiPropertyOptional({ example: 'சுந்தரம் எஸ்', description: 'Customer full name in Tamil', nullable: true })
  fullNameTamil?: string | null;

  @ApiProperty({ example: '9842712345', description: 'Customer phone number' })
  phone: string;
}

export class EligibleBidderResponseDto {
  @ApiProperty({ example: 'ticket-uuid-001', description: 'Subscriber ticket unique ID' })
  id: string;

  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group ID' })
  chitGroupId: string;

  @ApiProperty({ example: 5, description: 'Ticket number 1..N' })
  ticketNumber: number;

  @ApiProperty({ example: 'cust-uuid-001', description: 'Customer ID' })
  customerId: string;

  @ApiProperty({ example: false, description: 'Whether the ticket has already won a prize' })
  isPrized: boolean;

  @ApiProperty({ example: 'ACTIVE', description: 'Subscriber ticket status' })
  status: string;

  @ApiProperty({ example: 0, description: 'Consecutive unpaid months count' })
  consecutiveUnpaidMonths: number;

  @ApiProperty({ type: EligibleBidderCustomerDto, description: 'Subscribed customer summary' })
  customer: EligibleBidderCustomerDto;
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

  @ApiPropertyOptional({ type: Number, example: 2, description: 'Physical paper token number drawn at branch', nullable: true })
  tokenNumber?: number | null;

  @ApiProperty({ example: false, description: 'Whether this ticket won the physical token draw' })
  isWinner: boolean;
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

export class PendingAuctionCorrectionDto {
  @ApiProperty({ example: 'audit-uuid-001', description: 'Pending correction request audit ID' })
  requestId: string;

  @ApiProperty({ example: 'partner-maker-001', description: 'Partner user ID who requested the correction' })
  requestedByUserId: string;

  @ApiProperty({ example: 24000, description: 'Requested corrected winning bid discount in whole Rupees' })
  correctedBidDiscount: number;

  @ApiPropertyOptional({ type: String, example: 'ticket-uuid-002', nullable: true })
  correctedWinningTicketId?: string | null;

  @ApiPropertyOptional({ type: Number, example: 5, nullable: true })
  correctedTicketNumber?: number | null;

  @ApiProperty({ example: 'Clerical transcription correction per branch token sheet' })
  reason: string;

  @ApiPropertyOptional({ type: String, example: 'Witnessed by 4 members', nullable: true })
  notes?: string | null;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-18T10:00:00.000Z' })
  requestedAt: string;
}

export class AuctionDetailResponseDto extends AuctionResponseDto {
  @ApiProperty({ type: AuctionMinutesDto, nullable: true, description: 'Statutory Form XVII minutes record (null for subscribers)' })
  minutes?: AuctionMinutesDto | null;

  @ApiPropertyOptional({
    type: PendingAuctionCorrectionDto,
    nullable: true,
    description: 'Pending unapproved correction request metadata for dual-control checker review (staff/auditor only)',
  })
  pendingCorrection?: PendingAuctionCorrectionDto | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Parent chit scheme parameters',
  })
  chitGroup?: any;
}

export class CorrectedAuctionMathDto {
  @ApiProperty({ example: 24000 })
  bidDiscount: number;

  @ApiProperty({ example: 4000 })
  foremanCommission: number;

  @ApiProperty({ example: 20000 })
  totalDividend: number;

  @ApiProperty({ example: 1000 })
  dividendPerTicket: number;

  @ApiProperty({ example: 76000 })
  prizeMoney: number;
}

export class RequestAuctionCorrectionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Auction Month 3 correction requested. An independent Partner must review and authorize approval.' })
  message: string;

  @ApiProperty({ example: 'audit-uuid-001' })
  correctionRequestId: string;

  @ApiProperty({ example: 'auc-uuid-001' })
  auctionId: string;

  @ApiProperty({ type: CorrectedAuctionMathDto })
  correctedMath: CorrectedAuctionMathDto;
}

export class ApproveAuctionCorrectionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Auction Month 3 correction approved by Partner. Dividends and subsequent dues reconciled.' })
  message: string;

  @ApiProperty({ type: AuctionResponseDto })
  auction: AuctionResponseDto;
}

export class FinalizeAuctionResponseDto extends AuctionDetailResponseDto {}

export class MarkMinutesFiledResponseDto {
  @ApiProperty({ example: 'Auction minutes marked as filed with Registrar', description: 'Status message' })
  message: string;

  @ApiProperty({ type: AuctionMinutesDto, description: 'Updated minutes record' })
  minutes: AuctionMinutesDto;
}
