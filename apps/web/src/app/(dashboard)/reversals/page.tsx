'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  RotateCcw,
  Clock,
  ShieldCheck,
  Ban,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  FileText,
  AlertOctagon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { ReversalRequestModal } from '@/components/reversals/reversal-request-modal';
import { ReversalApprovalTable } from '@/components/reversals/reversal-approval-table';
import {
  ApproveReversalDialog,
  RejectReversalDialog,
  type PendingReversalItem,
} from '@/components/reversals/reversal-action-dialogs';

export default function PaymentReversalsPage() {
  const t = useTranslations('reversals');
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
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const token = getStoredAccessToken();
      const params = new URLSearchParams();
      if (activeBranchId) params.append('branchId', activeBranchId);

      const res = await fetch(`${baseUrl}/api/v1/reports/pending-approvals?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch pending reversal approvals');
      const body = await res.json();
      return body.data || body;
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
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const token = getStoredAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/payments?paymentStatus=REVERSED&limit=50`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch historical reversals');
      const body = await res.json();
      return body.data?.data || body.data || [];
    },
  });

  const reversedPayments: any[] = historyData || [];

  // KPI Calculations
  const pendingTotal = useMemo(() => {
    return pendingReversals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [pendingReversals]);

  const reversedTotal = useMemo(() => {
    return reversedPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [reversedPayments]);

  const handleRefreshAll = () => {
    refetchPending();
    refetchHistory();
  };

  const isSuperAdmin = Boolean(user?.roles?.includes('SUPER_ADMIN'));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-rose-400" />
            {t('reversalsDeskTitle')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('reversalsDeskSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isFetchingPending}
            className="h-9 border-slate-800 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetchingPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            className="h-9 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-rose-950/30"
          >
            <PlusCircle className="h-4 w-4" />
            {t('requestReversalBtn')}
          </Button>
        </div>
      </div>

      {/* 4 Pulse KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {t('kpiPendingRequests')}
          </span>
          <p className="text-2xl font-black text-rose-300 font-mono tracking-tight">
            {pendingReversals.length}
          </p>
          <p className="text-[11px] text-rose-400/80 font-mono font-medium">
            Total {formatRupee(pendingTotal)}
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Ban className="h-4 w-4" />
            {t('kpiVoidedReceipts')}
          </span>
          <p className="text-2xl font-black text-amber-300 font-mono tracking-tight">
            {reversedPayments.length}
          </p>
          <p className="text-[11px] text-amber-400/80 font-medium">Voided & Cancelled</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <RotateCcw className="h-4 w-4" />
            {t('kpiTotalReversed')}
          </span>
          <p className="text-2xl font-black text-slate-100 font-mono tracking-tight">
            {formatRupee(reversedTotal)}
          </p>
          <p className="text-[11px] text-slate-400">Restored to member dues</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            {t('kpiCheckerStatus')}
          </span>
          <p className="text-sm font-bold text-slate-200 pt-1">
            {isSuperAdmin ? 'Partner Authorized' : 'Desk Staff (Maker Only)'}
          </p>
          <p className="text-[10px] text-slate-400">Guardrail 10 Dual Control</p>
        </div>
      </div>

      {/* Segmented Dual Tab Switcher */}
      <div className="flex border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
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
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
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

      {/* Tab 1: Pending Approvals Table */}
      {activeTab === 'pending' && (
        <div>
          {isPendingLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading pending reversals...</div>
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
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {t('tabReversalsLedger')}
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Total Reversed: {formatRupee(reversedTotal)}
            </span>
          </div>

          {isHistoryLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading reversal history...</div>
          ) : reversedPayments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No reversed payments recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">{t('originalReceipt')}</th>
                    <th className="p-3">Subscriber</th>
                    <th className="p-3">Scheme & Ticket</th>
                    <th className="p-3 text-right">{t('amountReversed')}</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">{t('tableChecker')}</th>
                    <th className="p-3">{t('tableReversedAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-[11px]">
                  {reversedPayments.map((p) => {
                    const rev = p.reversal;
                    const alloc = p.allocations?.[0];
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-rose-400 line-through">
                          {p.receipt?.receiptNumber || 'N/A'}
                        </td>
                        <td className="p-3 font-semibold text-slate-200">
                          {alloc?.ticket?.customer?.fullName || 'Subscriber'}
                        </td>
                        <td className="p-3 font-mono">
                          {alloc?.ticket?.chitGroup?.groupCode} T#{alloc?.ticket?.ticketNumber}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-100">
                          {formatRupee(Number(p.amount))}
                        </td>
                        <td className="p-3 text-slate-300 font-mono text-[11px] max-w-xs truncate" title={rev?.reason}>
                          {rev?.reason || 'Payment Reversal'}
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-400">
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
