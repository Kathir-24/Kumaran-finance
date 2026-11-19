// ==============================================================================
// Kumaran Chits — Pure Guardrail 10 & 11 Report/Dashboard Access & Query Helpers
// Dependency-free TypeScript helpers shared across UI components and Node tests.
// ==============================================================================

export interface ApprovalBannerUserContext {
  roles?: string[];
}

export interface ApprovalBannerAccessState {
  isVerifiedPartner: boolean;
  isNonPartnerSuperAdmin: boolean;
  isReadOnlyAuditor: boolean;
  canApproveFinancial: boolean;
  canVerifyOperational: boolean;
}

export interface ExtendedApprovalsSummary {
  totalPendingCount: number;
  cashHandoversCount: number;
  disbursementAuthorizationsCount: number;
  paymentReversalsCount: number;
  safetyProofVerificationsCount?: number;
  auctionFinalizationsCount?: number;
  auctionCorrectionsCount?: number;
  defaulterRemovalsCount?: number;
  finalMonthSettlementsCount?: number;
}

/**
 * Guardrail 11 / XR-AUC-05: Determines whether the caller is authorized to record
 * statutory Registrar filings (Branch Manager, Accountant, or Verified Partner).
 * Administrative IT Super Admins are barred.
 */
export function canUserRecordRegistrarFiling(
  user: ApprovalBannerUserContext | null | undefined,
): boolean {
  const roles = user?.roles ?? [];
  return (
    roles.includes('BRANCH_MANAGER') ||
    roles.includes('ACCOUNTANT') ||
    roles.includes('PARTNER')
  );
}

/**
 * Guardrails 10 & 11 (SEC-A): Evaluates whether the signed-in user may act as a
 * financial Checker (verified Partner with `Role.PARTNER`), operational verifier
 * (Accountant / Branch Manager), or read-only viewer (IT Super Admin / Auditor).
 */
export function evaluateApprovalBannerAccess(
  user?: ApprovalBannerUserContext | null,
): ApprovalBannerAccessState {
  const roles = user?.roles ?? [];
  const isVerifiedPartner = roles.includes('PARTNER');
  const isNonPartnerSuperAdmin =
    roles.includes('SUPER_ADMIN') && !roles.includes('PARTNER');
  const isReadOnlyAuditor =
    roles.includes('AUDITOR') && !roles.some((r) => r !== 'AUDITOR');
  const hasOperationalRole =
    roles.includes('BRANCH_MANAGER') || roles.includes('ACCOUNTANT');

  return {
    isVerifiedPartner,
    isNonPartnerSuperAdmin,
    isReadOnlyAuditor,
    canApproveFinancial: isVerifiedPartner,
    canVerifyOperational: isVerifiedPartner || hasOperationalRole,
  };
}

/**
 * Routes the primary Pending Approvals CTA to the highest-priority operational queue
 * across all 8 backend Maker-Checker approval queues (`DEF-RPT-05`).
 */
export function resolvePrimaryQueueHref(approvals: ExtendedApprovalsSummary): string {
  if (approvals.paymentReversalsCount > 0) return '/reversals';
  if (
    (approvals.auctionFinalizationsCount ?? 0) > 0 ||
    (approvals.auctionCorrectionsCount ?? 0) > 0
  ) {
    return '/auctions';
  }
  if (
    approvals.disbursementAuthorizationsCount > 0 ||
    (approvals.safetyProofVerificationsCount ?? 0) > 0 ||
    (approvals.finalMonthSettlementsCount ?? 0) > 0
  ) {
    return '/disbursements';
  }
  if (approvals.cashHandoversCount > 0) return '/collections/handover';
  if ((approvals.defaulterRemovalsCount ?? 0) > 0) return '/reports/defaulters';
  return '/reports';
}

/**
 * Checks whether an audit/report date filter range is inverted (`fromDate > toDate`).
 */
export function isInvertedDateRange(fromDate: string, toDate: string): boolean {
  return Boolean(fromDate && toDate && fromDate > toDate);
}

/**
 * Builds IST-safe query parameters for `GET /api/v1/reports/audit-logs`.
 * Sends plain `YYYY-MM-DD` strings so the backend expands them to exact `+05:30` IST
 * day bounds without UTC 5.5-hour shift.
 */
export function buildAuditLogsQueryParams(params: {
  selectedAction: string;
  selectedEntity: string;
  selectedUserId: string;
  fromDate: string;
  toDate: string;
  page: number;
  limit: number;
}) {
  return {
    action: params.selectedAction === 'ALL' ? undefined : params.selectedAction,
    entityType: params.selectedEntity === 'ALL' ? undefined : params.selectedEntity,
    userId: params.selectedUserId === 'ALL' ? undefined : params.selectedUserId,
    fromDate: params.fromDate.trim() || undefined,
    toDate: params.toDate.trim() || undefined,
    page: params.page,
    limit: params.limit,
  };
}

/**
 * Safely parses `?ticketNumber=` query string into a positive integer or `'ALL'`.
 * Prevents `NaN` or non-positive numbers from triggering 400 Bad Request errors.
 */
export function parseTicketFilterParam(raw: string | null | undefined): number | 'ALL' {
  if (!raw) return 'ALL';
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return 'ALL';
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 'ALL';
}

/**
 * XR-M7-WEB-01: Resolves initial branch filter for the Defaulters Register.
 * Non-global roles (`BRANCH_MANAGER`, `COLLECTION_AGENT`) are strictly locked to
 * `user.branchId` (matching `cash-book/page.tsx`), preventing 403s from stale
 * Zustand `activeBranchId` values left over from another session.
 */
export function resolveDefaultersInitialBranchId(
  user: { roles?: string[]; branchId?: string | null } | null | undefined,
  activeBranchId?: string | null,
): string {
  const roles = user?.roles ?? [];
  const isGlobalScopeRole = roles.some((r) =>
    ['PARTNER', 'SUPER_ADMIN', 'ACCOUNTANT', 'AUDITOR'].includes(r),
  );
  if (isGlobalScopeRole) {
    return activeBranchId || '';
  }
  return user?.branchId || '';
}

/**
 * XR-M7-WEB-04: Determines whether the signed-in user holds a role authorized for
 * `/api/v1/reports/dashboard` and `/api/v1/reports/pending-approvals`.
 * Prevents `COLLECTION_AGENT` and pure `SUPER_ADMIN` from firing unauthorized 403 requests.
 */
export function canQueryDashboardReports(
  user: { roles?: string[] } | null | undefined,
): boolean {
  const roles = user?.roles ?? [];
  return roles.some((r) =>
    ['PARTNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'].includes(r),
  );
}

/**
 * XR-M7-WEB-02: Resolves statutory Form XVII 21-day filing countdown, preferring
 * authoritative backend IST fields (`filingDaysRemaining`, `isFilingOverdue`)
 * and falling back to deterministic calendar-day calculation only when absent.
 */
export function resolveFormXviiFilingCountdown(
  auction: {
    auctionDate: string;
    filedAtRegistrar: boolean;
    filingDaysRemaining?: number | null;
    isFilingOverdue?: boolean;
  },
  nowMs: number = Date.now(),
): { daysRemaining: number; isOverdue: boolean; isUrgent: boolean } {
  if (auction.filedAtRegistrar) {
    return { daysRemaining: 0, isOverdue: false, isUrgent: false };
  }

  let daysRemaining: number;
  if (
    typeof auction.filingDaysRemaining === 'number' &&
    Number.isFinite(auction.filingDaysRemaining)
  ) {
    daysRemaining = auction.filingDaysRemaining;
  } else {
    const auctionDate = new Date(auction.auctionDate);
    const deadlineMs = auctionDate.getTime() + 21 * 24 * 60 * 60 * 1000;
    daysRemaining = Number.isNaN(deadlineMs)
      ? 0
      : Math.ceil((deadlineMs - nowMs) / (24 * 60 * 60 * 1000));
  }

  const isOverdue =
    typeof auction.isFilingOverdue === 'boolean'
      ? auction.isFilingOverdue
      : daysRemaining < 0;
  const isUrgent = !isOverdue && daysRemaining >= 0 && daysRemaining <= 5;

  return { daysRemaining, isOverdue, isUrgent };
}

/**
 * XR-M7-WEB-02: Computes Form XVII KPI bar counts, preferring authoritative backend
 * `filingSummary` when present and falling back to per-auction IST countdowns.
 */
export function resolveFormXviiKpiCounts(
  auctions: Array<{
    auctionDate: string;
    filedAtRegistrar: boolean;
    filingDaysRemaining?: number | null;
    isFilingOverdue?: boolean;
  }>,
  filingSummary?: {
    totalFinalized?: number;
    filedCount?: number;
    pendingCount?: number;
    overdueCount?: number;
  } | null,
  nowMs: number = Date.now(),
): {
  totalFinalized: number;
  filedCount: number;
  pendingCount: number;
  overdueCount: number;
} {
  if (
    filingSummary &&
    typeof filingSummary.filedCount === 'number' &&
    typeof filingSummary.pendingCount === 'number' &&
    typeof filingSummary.overdueCount === 'number'
  ) {
    return {
      totalFinalized:
        typeof filingSummary.totalFinalized === 'number'
          ? filingSummary.totalFinalized
          : auctions.length,
      filedCount: filingSummary.filedCount,
      pendingCount: filingSummary.pendingCount,
      overdueCount: filingSummary.overdueCount,
    };
  }

  let filedCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const a of auctions) {
    if (a.filedAtRegistrar) {
      filedCount += 1;
    } else {
      const { isOverdue } = resolveFormXviiFilingCountdown(a, nowMs);
      if (isOverdue) {
        overdueCount += 1;
      } else {
        pendingCount += 1;
      }
    }
  }

  return {
    totalFinalized: auctions.length,
    filedCount,
    pendingCount,
    overdueCount,
  };
}
