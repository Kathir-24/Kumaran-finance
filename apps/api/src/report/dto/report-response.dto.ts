import { ApiProperty } from '@nestjs/swagger';

export class ExecutiveDashboardKpiResponseDto {
  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ example: 4, description: 'Active chit schemes count' })
  activeChitsCount: number;

  @ApiProperty({ example: 80, description: 'Active subscriber count' })
  activeSubscribersCount: number;

  @ApiProperty({ description: 'Today collection totals breakdown' })
  todayCollections: any;

  @ApiProperty({ description: 'Today disbursement totals' })
  todayDisbursements: any;

  @ApiProperty({ description: 'Branch vault cash balance status' })
  vaultBalance: any;

  @ApiProperty({ description: 'Arrears aging summary' })
  arrearsSummary: any;

  @ApiProperty({ example: 3, description: 'Maker-checker pending signoffs count' })
  pendingApprovalsCount: number;
}

export class PendingApprovalsSummaryDto {
  @ApiProperty({ example: 1, description: 'Unacknowledged field handovers count' })
  unacknowledgedHandoversCount: number;

  @ApiProperty({ example: 1, description: 'Pending payment reversal requests count' })
  pendingReversalsCount: number;

  @ApiProperty({ example: 1, description: 'Pending prize payout authorizations count' })
  pendingAuthorizationsCount: number;

  @ApiProperty({ example: 0, description: 'Pending safety proof verifications count' })
  pendingSafetyVerificationsCount: number;

  @ApiProperty({ example: 3, description: 'Total pending dual control items' })
  totalPendingCount: number;
}

export class PendingApprovalsResponseDto {
  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ type: PendingApprovalsSummaryDto, description: 'Approval queue metrics' })
  summary: PendingApprovalsSummaryDto;

  @ApiProperty({ isArray: true, description: 'Unacknowledged cash handover batches' })
  handovers: any[];

  @ApiProperty({ isArray: true, description: 'Pending payment reversals awaiting Checker signoff' })
  reversals: any[];

  @ApiProperty({ isArray: true, description: 'Pending prize payouts awaiting Checker authorization' })
  authorizations: any[];

  @ApiProperty({ isArray: true, description: 'Pending safety proofs awaiting Maker verification' })
  safetyProofs: any[];
}

export class DayBookReportResponseDto {
  @ApiProperty({ example: '2026-10-22', description: 'Report date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ description: 'Opening cash in safe' })
  openingCash: any;

  @ApiProperty({ description: 'Total daily collection receipts' })
  totalCollections: any;

  @ApiProperty({ description: 'Total daily disbursements' })
  totalDisbursements: any;

  @ApiProperty({ description: 'Closing cash in safe' })
  closingCash: any;

  @ApiProperty({ isArray: true, description: 'Itemized receipts and payout voucher records' })
  entries: any[];
}

export class FormXxiiReportResponseDto {
  @ApiProperty({ example: '2026-10-22', description: 'Record date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 'HEAD_OFFICE_PERUNDURAI', description: 'Operating branch' })
  scope: string;

  @ApiProperty({ example: 50000, description: 'Opening vault balance in whole Rupees' })
  openingBalance: number;

  @ApiProperty({ example: 35000, description: 'Total physical cash receipts today' })
  cashInflows: number;

  @ApiProperty({ example: 20000, description: 'Total physical cash disbursements today' })
  cashOutflows: number;

  @ApiProperty({ example: 65000, description: 'Closing physical cash in safe in whole Rupees' })
  closingBalance: number;

  @ApiProperty({ isArray: true, description: 'Chronological cash ledger entries' })
  entries: any[];
}

export class FormXviiReportResponseDto {
  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group ID' })
  chitGroupId: string;

  @ApiProperty({ example: 'KCA-1L-20M-01', description: 'Chit group code' })
  groupCode: string;

  @ApiProperty({ example: 20, description: 'Duration in months' })
  durationMonths: number;

  @ApiProperty({ isArray: true, description: 'Chronological list of all auctions and minutes proceedings' })
  auctions: any[];
}

export class FormXxiReportResponseDto {
  @ApiProperty({ example: 'ticket-uuid-001', description: 'Subscriber ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 4, description: 'Ticket number 1..N' })
  ticketNumber: number;

  @ApiProperty({ description: 'Subscriber details' })
  customer: any;

  @ApiProperty({ description: 'Chit scheme parameters' })
  chitGroup: any;

  @ApiProperty({ isArray: true, description: '20-month schedule of dues, dividend credits, payments, and arrears' })
  schedule: any[];
}

export class DefaultersReportResponseDto {
  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ description: 'Pagination details' })
  pagination: any;

  @ApiProperty({ isArray: true, description: 'List of defaulting subscribers categorized by arrears buckets' })
  defaulters: any[];
}

export class AuditLogsReportResponseDto {
  @ApiProperty({ description: 'Pagination details' })
  pagination: any;

  @ApiProperty({ isArray: true, description: 'Append-only audit trail logs' })
  logs: any[];
}
