import { ApiProperty } from '@nestjs/swagger';

export class ReportPaginationDto {
  @ApiProperty({ example: 1, description: 'Current page number' })
  page: number;

  @ApiProperty({ example: 20, description: 'Maximum records per page (max 100)' })
  limit: number;

  @ApiProperty({ example: 45, description: 'Total matching records' })
  totalRecords: number;

  @ApiProperty({ example: 3, description: 'Total available pages' })
  totalPages: number;
}

export class ExecutiveDashboardKpiResponseDto {
  @ApiProperty({ example: 'COMPANY_WIDE', description: 'Reporting scope (COMPANY_WIDE or BRANCH_<uuid>)' })
  scope: string;

  @ApiProperty({ example: 4, description: 'Active chit schemes count' })
  activeChitsCount: number;

  @ApiProperty({ example: 80, description: 'Total subscriber profiles count' })
  totalSubscribersCount: number;

  @ApiProperty({ example: 80, description: 'Active subscriber tickets count' })
  activeTicketsCount: number;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Today IST collection totals breakdown in whole Rupees (BigInt decimal strings)' })
  todayCollections: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Today IST disbursement total in whole Rupees (BigInt decimal string)' })
  todayDisbursements: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Branch vault cash balance in whole Rupees (BigInt decimal string)' })
  branchVault: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Pending dual-control operational action counters' })
  pendingActions: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Arrears aging buckets (1M, 2M, 3M+) with whole Rupee totals' })
  arrearsAging: Record<string, unknown>;
}

export class PendingApprovalsSummaryDto {
  @ApiProperty({ example: 6, description: 'Total pending dual-control items across all queues' })
  totalPendingCount: number;

  @ApiProperty({ example: 4, description: 'Pending items eligible for approval by current caller under Guardrails 10 & 11' })
  actionableByCurrentUserCount: number;

  @ApiProperty({ example: 1, description: 'Unacknowledged field cash handover batches count' })
  cashHandoversCount: number;

  @ApiProperty({ example: 1, description: 'Pending prize payout authorizations count (VERIFIED_BY_MAKER)' })
  disbursementAuthorizationsCount: number;

  @ApiProperty({ example: 1, description: 'Pending payment reversal requests count' })
  paymentReversalsCount: number;

  @ApiProperty({ example: 1, description: 'Pending safety proof verifications count (finalized auctions)' })
  safetyProofVerificationsCount: number;

  @ApiProperty({ example: 1, description: 'Pending offline auction finalizations awaiting Checker Partner' })
  auctionFinalizationsCount: number;

  @ApiProperty({ example: 0, description: 'Pending finalized auction correction requests awaiting Checker Partner' })
  auctionCorrectionsCount: number;

  @ApiProperty({ example: 1, description: 'Pending 3-month defaulter removal approvals awaiting Checker Partner' })
  defaulterRemovalsCount: number;

  @ApiProperty({ example: 0, description: 'Pending Month N final settlement authorizations awaiting Checker Partner' })
  finalMonthSettlementsCount: number;

  @ApiProperty({ example: '7900', description: 'Total pending cash handover amount in whole Rupees' })
  cashHandoversTotalAmount: string;

  @ApiProperty({ example: '75000', description: 'Total pending prize disbursement authorization amount in whole Rupees' })
  disbursementsTotalAmount: string;

  @ApiProperty({ example: '3950', description: 'Total pending payment reversal amount in whole Rupees' })
  reversalsTotalAmount: string;

  @ApiProperty({ example: '91000', description: 'Total pending Month N final settlement amount in whole Rupees' })
  finalMonthSettlementsTotalAmount: string;
}

export class PendingApprovalsResponseDto {
  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope (ALL_BRANCHES or BRANCH_<uuid>)' })
  scope: string;

  @ApiProperty({ type: PendingApprovalsSummaryDto, description: 'Aggregated dual-control approval queue metrics' })
  summary: PendingApprovalsSummaryDto;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Unacknowledged cash handover batches grouped by collector and branch' })
  cashHandovers: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending prize payouts awaiting Checker Partner authorization' })
  disbursementAuthorizations: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending payment reversals awaiting Checker Partner signoff' })
  paymentReversals: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending safety proofs awaiting Maker verification (finalized auctions only)' })
  safetyProofVerifications: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending offline auctions awaiting Checker Partner finalization' })
  auctionFinalizations: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending finalized auction correction requests awaiting Checker Partner approval' })
  auctionCorrections: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending 3-month defaulter removal requests awaiting Checker Partner approval' })
  defaulterRemovals: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Pending Month N maturity settlements awaiting Checker Partner approval' })
  finalMonthSettlements: Record<string, unknown>[];
}

export class DayBookReportResponseDto {
  @ApiProperty({ example: '2026-10-22', description: 'IST report calendar date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Branch ID or ALL_BRANCHES' })
  branchId: string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Daily inflow, outflow, net cash flow, and payment mode summary in whole Rupees' })
  summary: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Itemized collection receipt inflows' })
  inflows: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Itemized prize payout voucher outflows' })
  outflows: Record<string, unknown>[];
}

export class FormXxiiReportResponseDto {
  @ApiProperty({ example: 'UNVERIFIED-LEGAL', description: 'Statutory review status tag' })
  statutoryStatus: string;

  @ApiProperty({ example: 'Form XXII: Cash Book Register', description: 'Statutory register title' })
  registerName: string;

  @ApiProperty({ example: 'Daily register of physical currency notes and coins held in the branch safe / vault.' })
  description: string;

  @ApiProperty({ example: '2026-10-22', description: 'IST calendar date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Branch ID or ALL_BRANCHES' })
  branchId: string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Safe cash reconciliation (openingCashInSafe, todayCashInflows, todayCashOutflows, closingCashInSafe) in whole Rupees' })
  reconciliation: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Chronological physical cash receipt inflows' })
  inflows: Record<string, unknown>[];

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Chronological physical cash disbursement outflows' })
  outflows: Record<string, unknown>[];
}

export class FormXviiReportResponseDto {
  @ApiProperty({ example: 'UNVERIFIED-LEGAL', description: 'Statutory review status tag' })
  statutoryStatus: string;

  @ApiProperty({ example: 'Form XVII: Auction Minutes Consolidated Register', description: 'Statutory register title' })
  registerName: string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Chit group metadata including frozen foremanCommissionRate' })
  chitGroup: Record<string, unknown>;

  @ApiProperty({ example: 5, description: 'Total finalized auctions (Months 2..N-1)' })
  totalAuctionsFinalized: number;

  @ApiProperty({ type: 'object', additionalProperties: true, description: '21-day Registrar filing compliance summary (totalAuctions, filedCount, pendingCount, overdueCount)' })
  filingSummary: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Chronological auction proceedings with frozen commission rate and 21-day filing deadline countdown' })
  auctions: Record<string, unknown>[];
}

export class FormXxiReportResponseDto {
  @ApiProperty({ example: 'UNVERIFIED-LEGAL', description: 'Statutory review status tag' })
  statutoryStatus: string;

  @ApiProperty({ example: 'Form XXI: Subscriber Ledger Register', description: 'Statutory register title' })
  registerName: string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Chit scheme parameters' })
  chitGroup: Record<string, unknown>;

  @ApiProperty({ example: 1, description: 'Number of subscriber ticket ledgers returned' })
  totalTicketsReturned: number;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Per-ticket continuous N-month schedule of dues, dividends, payments, and arrears' })
  ledgers: Record<string, unknown>[];
}

export class DefaultersReportResponseDto {
  @ApiProperty({ example: 'ALL_BRANCHES', description: 'Reporting scope' })
  scope: string;

  @ApiProperty({ type: () => ReportPaginationDto, description: 'Pagination details' })
  pagination: ReportPaginationDto;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'List of defaulting subscribers categorized by arrears buckets' })
  defaulters: Record<string, unknown>[];
}

export class AuditLogsReportResponseDto {
  @ApiProperty({ type: () => ReportPaginationDto, description: 'Pagination details' })
  pagination: ReportPaginationDto;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Append-only sanitized audit trail logs (SUPER_ADMIN only)' })
  logs: Record<string, unknown>[];
}
