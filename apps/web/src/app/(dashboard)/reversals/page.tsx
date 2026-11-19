'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  RotateCcw,
  Clock,
  ShieldCheck,
  Ban,
  RefreshCw,
  PlusCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import { apiClient, unwrapApiResponse, unwrapPaginatedList } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore, hasAnyRole } from '@/stores/auth-store';
import { ReversalRequestModal } from '@/components/reversals/reversal-request-modal';
import { ReversalApprovalTable } from '@/components/reversals/reversal-approval-table';
import {
  ApproveReversalDialog,
  RejectReversalDialog,
  type PendingReversalItem,
} from '@/components/reversals/reversal-action-dialogs';

interface PendingApprovalsResponse {
  paymentReversals?: PendingReversalItem[];
}

interface ReversedPaymentRecord {
  id: string;
  amount: string | number;
  updatedAt?: string;
  receipt?: {
    receiptNumber?: string | null;
  } | null;
  reversal?: {
    reason?: string;
    approvedByUserId?: string;
    reversedAt?: string;
  } | null;
  allocations?: Array<{
    ticket?: {
      ticketNumber?: number;
      customer?: {
        fullName?: string;
      };
      chitGroup?: {
        groupCode?: string;
      };
    };
  }>;
}

export default function PaymentReversalsPage() {
  const t = useTranslations('reversals');
  const tCommon = useTranslations('common');
  const { user, activeBranchId } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedForApproval, setSelectedForApproval] = useState<PendingReversalItem | null>(null);
  const [selectedForRejection, setSelectedForRejection] = useState<PendingReversalItem | null>(null);

  // 1. Fetch Pending Reversals from Reports Approvals Queue
  const {
    data: pendingData,
    isLoading: isPendingLoading,
    refetch: refetchPending,
    isFetching: isFetchingPending,
  } = useQuery({
    queryKey: queryKeys.reversals.pending(activeBranchId || undefined),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<PendingApprovalsResponse>(
        apiClient.GET('/api/v1/reports/pending-approvals', {
          params: { query: { branchId: activeBranchId || undefined } },
          signal,
        }),
      );
    },
  });

  const pendingReversals: PendingReversalItem[] = useMemo(() => {
    return pendingData?.paymentReversals || [];
  }, [pendingData]);

  // 2. Fetch Historical Reversed Payments
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: queryKeys.reversals.history({ limit: 50 }),
    queryFn: async ({ signal }) => {
      const result = await unwrapApiResponse<ReversedPaymentRecord[] | { data?: ReversedPaymentRecord[] }>(
        apiClient.GET('/api/v1/payments', {
          params: { query: { paymentStatus: 'REVERSED', limit: 50 } },
          signal,
        }),
      );
      return unwrapPaginatedList<ReversedPaymentRecord>(result);
    },
  });

  const reversedPayments = useMemo<ReversedPaymentRecord[]>(
    () => historyData || [],
    [historyData],
  );

  // KPI Calculations
  const pendingTotal = useMemo(() => {
    return pendingReversals.reduce((sum, item) => sum + BigInt(item.amount || 0), 0n);
  }, [pendingReversals]);

  const reversedTotal = useMemo(() => {
    return reversedPayments.reduce((sum, item) => sum + BigInt(item.amount || 0), 0n);
  }, [reversedPayments]);

  const handleRefreshAll = () => {
    refetchPending();
    refetchHistory();
  };

  const isPartner = hasAnyRole(user, ['PARTNER']);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-rose-400 shrink-0" />
            <span>{t('reversalsDeskTitle')}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('reversalsDeskSubtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isFetchingPending}
            className="h-9 border-slate-800 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetchingPending ? 'animate-spin' : ''}`} />
            {tCommon('refresh')}
          </Button>

          <Button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="h-9 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-rose-950/30 shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            {t('requestReversalBtn')}
          </Button>
        </div>
      </div>

      {/* 4 Pulse KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-start gap-1.5 leading-snug">
            <Clock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t('kpiPendingRequests')}</span>
          </span>
          <p className="text-2xl font-black text-rose-300 font-mono tracking-tight">
            {pendingReversals.length}
          </p>
          <p className="text-[11px] text-rose-400/80 font-mono font-medium">
            {t('totalPendingAmount', { amount: formatRupee(pendingTotal) })}
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-start gap-1.5 leading-snug">
            <Ban className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t('kpiVoidedReceipts')}</span>
          </span>
          <p className="text-2xl font-black text-amber-300 font-mono tracking-tight">
            {reversedPayments.length}
          </p>
          <p className="text-[11px] text-amber-400/80 font-medium">{t('voidedReceiptsDesc')}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-start gap-1.5 leading-snug">
            <RotateCcw className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t('kpiTotalReversed')}</span>
          </span>
          <p className="text-2xl font-black text-slate-100 font-mono tracking-tight">
            {formatRupee(reversedTotal)}
          </p>
          <p className="text-[11px] text-slate-400">{t('restoredDuesDesc')}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-start gap-1.5 leading-snug">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t('kpiCheckerStatus')}</span>
          </span>
          <p className="text-sm font-bold text-slate-200 pt-1 leading-snug">
            {isPartner ? t('partnerAuthorized') : t('deskStaffMakerOnly')}
          </p>
          <p className="text-[10px] text-slate-400">{t('guardrail10Label')}</p>
        </div>
      </div>

      {/* Segmented Dual Tab Switcher */}
      <div className="overflow-x-auto scrollbar-none">
        <div className="inline-flex min-w-full border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 shrink-0 whitespace-nowrap ${
              activeTab === 'pending'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>{t('tabPendingReversals')}</span>
            {pendingReversals.length > 0 && (
              <span className="rounded-full bg-rose-500/20 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                {pendingReversals.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 shrink-0 whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>{t('tabReversalsLedger')}</span>
            <span className="rounded-full bg-slate-800 text-slate-400 px-2 py-0.5 text-[10px]">
              {reversedPayments.length}
            </span>
          </button>
        </div>
      </div>

      {/* Tab 1: Pending Approvals Table */}
      {activeTab === 'pending' && (
        <div>
          {isPendingLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">{t('loadingPending')}</div>
          ) : (
            <ReversalApprovalTable
              reversals={pendingReversals}
              currentUser={user}
              onApprove={(item) => setSelectedForApproval(item)}
              onReject={(item) => setSelectedForRejection(item)}
            />
          )}
        </div>
      )}

      {/* Tab 2: Historical Reversals Ledger */}
      {activeTab === 'history' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {t('tabReversalsLedger')}
            </h3>
            <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">
              {t('kpiTotalReversed')}: {formatRupee(reversedTotal)}
            </span>
          </div>

          {isHistoryLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">{t('loadingHistory')}</div>
          ) : reversedPayments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">{t('noHistoryReversals')}</div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[820px] text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="p-3 whitespace-nowrap">{t('originalReceipt')}</th>
                    <th className="p-3 whitespace-nowrap">{t('tableSubscriber')}</th>
                    <th className="p-3 whitespace-nowrap">{t('tableSchemeAndTicket')}</th>
                    <th className="p-3 text-right whitespace-nowrap">{t('amountReversed')}</th>
                    <th className="p-3 whitespace-nowrap">{t('tableReason')}</th>
                    <th className="p-3 whitespace-nowrap">{t('tableChecker')}</th>
                    <th className="p-3 whitespace-nowrap">{t('tableReversedAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-[11px]">
                  {reversedPayments.map((p) => {
                    const rev = p.reversal;
                    const alloc = p.allocations?.[0];
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-rose-400 line-through whitespace-nowrap">
                          {p.receipt?.receiptNumber || 'N/A'}
                        </td>
                        <td className="p-3 font-semibold text-slate-200 whitespace-nowrap">
                          {alloc?.ticket?.customer?.fullName || 'Subscriber'}
                        </td>
                        <td className="p-3 font-mono whitespace-nowrap">
                          {alloc?.ticket?.chitGroup?.groupCode} T#{alloc?.ticket?.ticketNumber}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-100 whitespace-nowrap">
                          {formatRupee(p.amount)}
                        </td>
                        <td className="p-3 text-slate-300 font-mono text-[11px] max-w-xs truncate" title={rev?.reason}>
                          {rev?.reason || 'Payment Reversal'}
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                          {rev?.approvedByUserId?.slice(0, 8) || 'Partner'}
                        </td>
                        <td className="p-3 text-slate-400 whitespace-nowrap">
                          {formatDate(rev?.reversedAt || p.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reversal Modals */}
      <ReversalRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={handleRefreshAll}
      />

      <ApproveReversalDialog
        isOpen={Boolean(selectedForApproval)}
        onClose={() => setSelectedForApproval(null)}
        reversal={selectedForApproval}
        onSuccess={handleRefreshAll}
      />

      <RejectReversalDialog
        isOpen={Boolean(selectedForRejection)}
        onClose={() => setSelectedForRejection(null)}
        reversal={selectedForRejection}
        onSuccess={handleRefreshAll}
      />
    </div>
  );
}
