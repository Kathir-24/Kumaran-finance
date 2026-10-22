import { ApiProperty } from '@nestjs/swagger';
import { ChitStatus, InitializationMode } from '@prisma/client';
import { BranchSummaryDto } from '../../auth/dto/auth-response.dto';
import { CustomerResponseDto } from '../../customer/dto/customer-response.dto';

export class ChitGroupResponseDto {
  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group unique ID' })
  id: string;

  @ApiProperty({ example: 'KCA-1L-20M-01', description: 'Unique chit group code' })
  groupCode: string;

  @ApiProperty({ example: '₹1 Lakh 20 Months Group A', description: 'Chit group name in English' })
  groupName: string;

  @ApiProperty({ example: 'ரூ 1 லட்சம் 20 மாதங்கள் குழு A', description: 'Chit group name in Tamil', nullable: true })
  groupNameTamil?: string | null;

  @ApiProperty({ example: 100000, description: 'Chit total value in whole Rupees' })
  chitValue: number;

  @ApiProperty({ example: 20, description: 'Duration in months' })
  durationMonths: number;

  @ApiProperty({ example: 20, description: 'Total number of subscriber tickets' })
  totalTickets: number;

  @ApiProperty({ example: 5000, description: 'Base installment amount per month in whole Rupees' })
  baseInstallment: number;

  @ApiProperty({ example: 4.0, description: 'Foreman commission rate permanently frozen for group' })
  foremanCommissionRate: number;

  @ApiProperty({ example: 25000, description: 'Maximum allowable 1/4 (25%) auction bid discount ceiling in whole Rupees' })
  maxDiscountCeiling: number;

  @ApiProperty({ enum: InitializationMode, example: InitializationMode.NEW_GROUP, description: 'Initialization mode' })
  initMode: InitializationMode;

  @ApiProperty({ example: 1, description: 'Month chit was onboarded at' })
  onboardedAtMonth: number;

  @ApiProperty({ enum: ChitStatus, example: ChitStatus.DRAFT, description: 'Chit scheme lifecycle status' })
  status: ChitStatus;

  @ApiProperty({ example: 'DRO/ERD/CHIT/2026/001', description: 'Registrar sanction order number', nullable: true })
  sanctionOrderNumber?: string | null;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z', description: 'Chit commencement start date' })
  startDate: Date | string;

  @ApiProperty({ example: '2028-05-01T00:00:00.000Z', description: 'Chit maturity end date' })
  endDate: Date | string;

  @ApiProperty({ example: 'branch-prd-001', description: 'Branch ID' })
  branchId: string;

  @ApiProperty({ type: BranchSummaryDto, nullable: true, description: 'Operating branch details' })
  branch?: BranchSummaryDto | null;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Creation timestamp' })
  createdAt: Date | string;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Updated timestamp' })
  updatedAt: Date | string;
}

export class TicketResponseDto {
  @ApiProperty({ example: 'ticket-uuid-001', description: 'Ticket unique ID' })
  id: string;

  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group ID' })
  chitGroupId: string;

  @ApiProperty({ example: 'cust-uuid-001', description: 'Subscriber customer ID' })
  customerId: string;

  @ApiProperty({ example: 1, description: 'Ticket number 1..N' })
  ticketNumber: number;

  @ApiProperty({ example: false, description: 'Whether ticket has won an auction' })
  isPrized: boolean;

  @ApiProperty({ example: null, description: 'Prized auction ID if won', nullable: true })
  prizedAuctionId?: string | null;

  @ApiProperty({ example: 0, description: 'Consecutive unpaid installment months count' })
  consecutiveUnpaidMonths: number;

  @ApiProperty({ example: 'ACTIVE', description: 'Ticket enrollment status' })
  status: string;

  @ApiProperty({ example: '2026-10-22T07:28:14.000Z', description: 'Enrollment joining date' })
  joiningDate: Date | string;

  @ApiProperty({ type: CustomerResponseDto, nullable: true, description: 'Subscriber profile details' })
  customer?: CustomerResponseDto | null;
}

export class ChitGroupDetailResponseDto extends ChitGroupResponseDto {
  @ApiProperty({ type: [TicketResponseDto], description: 'List of assigned subscriber tickets' })
  tickets: TicketResponseDto[];

  @ApiProperty({ isArray: true, description: 'Conducted or scheduled auction records' })
  auctions: any[];
}
