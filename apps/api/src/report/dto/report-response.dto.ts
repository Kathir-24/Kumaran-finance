import { ApiProperty } from '@nestjs/swagger';

export class ReportPaginationDto {
  @ApiProperty({ example: 1, description: 'Current page number' })
  page: number;

  @ApiProperty({ example: 20, description: 'Maximum records per page' })
  limit: number;

  @ApiProperty({ example: 45, description: 'Total matching records' })
  totalRecords: number;

  @ApiProperty({ example: 3, description: 'Total available pages' })
  totalPages: number;
}

export class ExecutiveDashboardKpiResponseDto {
  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ example: 4, description: 'Active chit schemes count' })
  activeChitsCount: number;

  @ApiProperty({ example: 80, description: 'Active subscriber count' })
  activeSubscribersCount: number;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Today collection totals breakdown' })
  todayCollections: any;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Today disbursement totals' })
  todayDisbursements: any;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Branch vault cash balance status' })
  vaultBalance: any;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Arrears aging summary' })
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

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Unacknowledged cash handover batches' })
  handovers: any[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending payment reversals awaiting Checker signoff' })
  reversals: any[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending prize payouts awaiting Checker authorization' })
  authorizations: any[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending safety proofs awaiting Maker verification' })
  safetyProofs: any[];
}

export class DayBookReportResponseDto {
  @ApiProperty({ example: '2026-10-22', description: 'Report date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Opening cash in safe' })
  openingCash: any;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Total daily collection receipts' })
  totalCollections: any;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Total daily disbursements' })
  totalDisbursements: any;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Closing cash in safe' })
  closingCash: any;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Itemized receipts and payout voucher records' })
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

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Chronological cash ledger entries' })
  entries: any[];
}

export class FormXviiReportResponseDto {
  @ApiProperty({ example: 'chit-uuid-001', description: 'Chit group ID' })
  chitGroupId: string;

  @ApiProperty({ example: 'KCA-1L-20M-01', description: 'Chit group code' })
  groupCode: string;

  @ApiProperty({ example: 20, description: 'Duration in months' })
  durationMonths: number;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Chronological list of all auctions and minutes proceedings' })
  auctions: any[];
}

export class FormXxiReportResponseDto {
  @ApiProperty({ example: 'ticket-uuid-001', description: 'Subscriber ticket ID' })
  ticketId: string;

  @ApiProperty({ example: 4, description: 'Ticket number 1..N' })
  ticketNumber: number;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Subscriber details' })
  customer: any;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Chit scheme parameters' })
  chitGroup: any;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: '20-month schedule of dues, dividend credits, payments, and arrears' })
  schedule: any[];
}

export class DefaultersReportResponseDto {
  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ type: () => ReportPaginationDto, description: 'Pagination details' })
  pagination: ReportPaginationDto;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'List of defaulting subscribers categorized by arrears buckets' })
  defaulters: any[];
}

export class AuditLogsReportResponseDto {
  @ApiProperty({ type: () => ReportPaginationDto, description: 'Pagination details' })
  pagination: ReportPaginationDto;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Append-only audit trail logs' })
  logs: any[];
}
