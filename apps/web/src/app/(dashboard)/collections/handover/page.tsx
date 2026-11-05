'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Vault,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Coins,
  CreditCard,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import {
  HandoverVerificationCard,
  type AgentPendingBatch,
  type HandoverAckResult,
} from '@/components/collections/handover-verification-card';
import { CashSettlementVoucherModal } from '@/components/collections/cash-settlement-voucher-modal';

export default function EveningCashHandoverPage() {
  const t = useTranslations('collections');
  const { user, activeBranchId } = useAuthStore();
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [activeTab, setActiveTab] = useState<'pending' | 'settled'>('pending');
  const [activeVoucher, setActiveVoucher] = useState<HandoverAckResult | null>(null);
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.collections.dailySummary({
      date: selectedDate,
      branchId: activeBranchId || undefined,
    }),
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const token = getStoredAccessToken();
      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (activeBranchId) params.append('branchId', activeBranchId);

      const res = await fetch(`${baseUrl}/api/v1/collections/daily-summary?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch collections daily summary');
      const body = await res.json();
      return body.data || body;
    },
  });

  const totals = data?.totals || {
    totalCollected: 0, cashCollected: 0, cashPendingHandover: 0,
    cashAcknowledgedInVault: 0, digitalCollected: 0,
  };
  const collections: any[] = data?.collections || [];

  const pendingAgentBatches = useMemo<AgentPendingBatch[]>(() => {
    const pendingItems = collections.filter(
      (c) => c.paymentMethod === 'CASH' && c.cashHandoverStatus === 'PENDING_HANDOVER',
    );
    const map = new Map<string, AgentPendingBatch>();
    for (const item of pendingItems) {
      const agentId = item.collectorUserId || 'unassigned-agent';
      if (!map.has(agentId)) {
        map.set(agentId, {
          collectorUserId: agentId,
          collectorName: item.collectorName || 'Field Agent',
          collectorPhone: item.collectorPhone,
          collections: [],
        });
      }
      map.get(agentId)!.collections.push(item);
    }
    return Array.from(map.values());
  }, [collections]);

  const acknowledgedCollections = useMemo(
    () => collections.filter((c) => c.paymentMethod === 'CASH' && c.cashHandoverStatus === 'ACKNOWLEDGED'),
    [collections],
  );

  const handleHandoverSuccess = (result: HandoverAckResult) => {
    setActiveVoucher(result);
    setIsVoucherOpen(true);
    refetch();
  };

  const handleViewHistoricalVoucher = (c: any) => {
    const dateStr = (c.collectedAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
    setActiveVoucher({
      success: true,
      message: 'Acknowledged Vault Deposit',
      collectorUserId: c.collectorUserId || 'agent',
      collectorName: c.collectorName || 'Field Agent',
      acknowledgedByUserId: c.acknowledgedByUserId || 'checker',
      acknowledgedAmount: c.amount,
      totalPaymentsAcknowledged: 1,
      acknowledgedAt: c.acknowledgedAt || c.collectedAt,
      voucherNumber: `KC-VAULT-${dateStr}-${(c.collectorName || 'AGT').slice(0, 3).toUpperCase()}`,
    });
    setIsVoucherOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Vault className="h-6 w-6 text-emerald-400" />
            {t('handoverDeskTitle')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('handoverDeskSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 pl-9 pr-3 text-xs bg-slate-900 border-slate-800 text-slate-200"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 border-slate-800 text-slate-300 hover:bg-slate-800 text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* 4 Pulse KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Coins className="h-4 w-4" />{t('kpiCashPending')}
          </span>
          <p className="text-2xl font-black text-amber-300 font-mono">{formatRupee(totals.cashPendingHandover)}</p>
          <p className="text-[11px] text-amber-400/80 font-medium">{pendingAgentBatches.length} {t('tabPendingHandovers')}</p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <Vault className="h-4 w-4" />{t('kpiCashInVault')}
          </span>
          <p className="text-2xl font-black text-emerald-300 font-mono">{formatRupee(totals.cashAcknowledgedInVault)}</p>
          <p className="text-[11px] text-emerald-400/80 font-medium">{acknowledgedCollections.length} receipts locked</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Banknote className="h-4 w-4" />{t('kpiTotalCash')}
          </span>
          <p className="text-2xl font-black text-slate-100 font-mono">{formatRupee(totals.cashCollected)}</p>
          <p className="text-[11px] text-slate-400">Total cash today</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="h-4 w-4" />{t('kpiDigital')}
          </span>
          <p className="text-2xl font-black text-slate-100 font-mono">{formatRupee(totals.digitalCollected)}</p>
          <p className="text-[11px] text-slate-400">Bank & UPI transfers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'pending' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>{t('tabPendingHandovers')}</span>
          {pendingAgentBatches.length > 0 && (
            <span className="rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-bold">
              {pendingAgentBatches.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settled')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'settled' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>{t('tabSettlementLedger')}</span>
          <span className="rounded-full bg-slate-800 text-slate-400 px-2 py-0.5 text-[10px]">{acknowledgedCollections.length}</span>
        </button>
      </div>

      {/* Tab 1: Pending Batches */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading daily handover batches...</div>
          ) : pendingAgentBatches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-200">{t('noPendingHandovers')}</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">{t('noPendingHandoversDesc')}</p>
            </div>
          ) : (
            pendingAgentBatches.map((batch) => (
              <HandoverVerificationCard
                key={batch.collectorUserId}
                batch={batch}
                currentUser={user}
                onAcknowledged={handleHandoverSuccess}
              />
            ))
          )}
        </div>
      )}

      {/* Tab 2: Settled Ledger */}
      {activeTab === 'settled' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {t('tabSettlementLedger')} ({formatDate(selectedDate)})
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Total: {formatRupee(totals.cashAcknowledgedInVault)}
            </span>
          </div>

          {acknowledgedCollections.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No cash collections acknowledged for {selectedDate}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">{t('tableReceiptNumber')}</th>
                    <th className="p-3">{t('tableCustomer')}</th>
                    <th className="p-3">{t('collector')}</th>
                    <th className="p-3">{t('tableSchemeTicket')}</th>
                    <th className="p-3">{t('tableMonth')}</th>
                    <th className="p-3 text-right">{t('tableAmount')}</th>
                    <th className="p-3 text-center">{t('tableActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-[11px]">
                  {acknowledgedCollections.map((c) => (
                    <tr key={c.paymentId} className="hover:bg-slate-800/30">
                      <td className="p-3 font-mono font-bold text-emerald-400">{c.receiptNumber}</td>
                      <td className="p-3 font-semibold text-slate-200">
                        {c.customerName} <span className="font-mono text-[10px] text-slate-400 font-normal">({c.customerCode})</span>
                      </td>
                      <td className="p-3 text-slate-300">{c.collectorName}</td>
                      <td className="p-3 font-mono">{c.groupCode} T#{c.ticketNumber}</td>
                      <td className="p-3">Month #{c.installmentMonth}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-100">{formatRupee(c.amount)}</td>
                      <td className="p-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewHistoricalVoucher(c)}
                          className="h-7 px-2 text-[11px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />{t('viewVoucherBtn')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CashSettlementVoucherModal
        isOpen={isVoucherOpen}
        onClose={() => setIsVoucherOpen(false)}
        voucher={activeVoucher}
      />
    </div>
  );
}
