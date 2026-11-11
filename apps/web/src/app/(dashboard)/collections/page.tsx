'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote, QrCode, FileCheck, RefreshCw, Plus, CreditCard, FileCheck2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { PaymentsTable } from '@/components/collections/payments-table';
import { CounterPaymentModal } from '@/components/collections/counter-payment-modal';
import { BilingualReceiptModal } from '@/components/collections/bilingual-receipt-modal';
import { UpiClaimsTable, type PendingUpiClaimItem } from '@/components/collections/upi-claims-table';
import { VerifyClaimDialog } from '@/components/collections/verify-claim-dialog';
import { formatRupee } from '@/lib/currency';
import { getApiBaseUrl, getStoredAccessToken, unwrapPaginatedList } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export default function CollectionsPage() {
  const t = useTranslations('collections');

  const [activeTab, setActiveTab] = useState<'COUNTER' | 'UPI_CLAIMS'>('COUNTER');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const [selectedClaimForVerify, setSelectedClaimForVerify] = useState<PendingUpiClaimItem | null>(null);
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Fetch payments list
  const { data: paymentsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.payments.list({
      paymentMethod: selectedMethod === 'ALL' ? undefined : selectedMethod,
      paymentStatus: selectedStatus === 'ALL' ? undefined : selectedStatus,
    }),
    queryFn: async ({ signal }) => {
      const token = getStoredAccessToken();
      const params = new URLSearchParams();
      if (selectedMethod !== 'ALL') params.append('paymentMethod', selectedMethod);
      if (selectedStatus !== 'ALL') params.append('paymentStatus', selectedStatus);
      params.append('limit', '100');

      const res = await fetch(`${getApiBaseUrl()}/api/v1/payments?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      });
      if (!res.ok) throw new Error('Failed to fetch payments');
      const json = await res.json();
      return json?.data ?? json;
    },
  });

  // Query global metrics
  const { data: globalData } = useQuery({
    queryKey: queryKeys.payments.list(),
    queryFn: async ({ signal }) => {
      const token = getStoredAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/payments?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      });
      if (!res.ok) return { data: [], total: 0 };
      const json = await res.json();
      return json?.data ?? json;
    },
  });

  // Query pending self-reported UPI claims
  const { data: claimsData, isLoading: claimsLoading, refetch: refetchClaims, isFetching: claimsFetching } = useQuery({
    queryKey: queryKeys.payments.pendingUpiClaims(),
    queryFn: async ({ signal }) => {
      const token = getStoredAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/payments/pending-upi-claims?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json?.data ?? json ?? [];
    },
  });

  const allItems: any[] = useMemo(() => unwrapPaginatedList(globalData), [globalData]);
  const currentItems: any[] = useMemo(() => unwrapPaginatedList(paymentsData), [paymentsData]);
  const pendingClaims: PendingUpiClaimItem[] = useMemo(
    () => unwrapPaginatedList<PendingUpiClaimItem>(claimsData),
    [claimsData],
  );

  const totalCollectionsToday = allItems.length;
  const totalCashToday = useMemo(() => allItems.filter((p) => p.paymentMethod === 'CASH' && p.paymentStatus !== 'REVERSED').reduce((sum, p) => sum + BigInt(p.amount ?? 0), 0n), [allItems]);
  const totalUpiToday = useMemo(() => allItems.filter((p) => p.paymentMethod === 'UPI' && p.paymentStatus !== 'REVERSED').reduce((sum, p) => sum + BigInt(p.amount ?? 0), 0n), [allItems]);
  const totalChequeToday = useMemo(() => allItems.filter((p) => p.paymentMethod === 'CHEQUE' && p.paymentStatus !== 'REVERSED').reduce((sum, p) => sum + BigInt(p.amount ?? 0), 0n), [allItems]);

  const handleOpenReceipt = (paymentId: string) => {
    setActiveReceiptId(paymentId);
    setIsReceiptOpen(true);
  };

  const handleRefresh = () => {
    if (activeTab === 'COUNTER') refetch();
    else refetchClaims();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Banknote className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-400 shrink-0" />
            <span className="truncate">{t('title')}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching || claimsFetching}
            className="flex-1 sm:flex-initial border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isFetching || claimsFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCollectOpen(true)}
            className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs gap-1.5 shadow-md shadow-emerald-950/40 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t('collectPaymentBtn')}</span>
          </Button>
        </div>
      </div>

      {/* Desk View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab('COUNTER')}
          className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'COUNTER'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('tabCounter')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('UPI_CLAIMS')}
          className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'UPI_CLAIMS'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>{t('tabUpiClaims')}</span>
          {pendingClaims.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              {pendingClaims.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'COUNTER' ? (
        <>
          <BusinessRuleBanner ruleNumber={8} title={t('bannerTitle')} description={t('bannerDesc')} />

          {/* 4 Daily Pulse Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs gap-1">
                <span className="truncate">{t('totalCollectionsToday')}</span>
                <FileCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-slate-100">{totalCollectionsToday}</div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Discrete receipts issued</p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs gap-1">
                <span className="truncate">{t('totalCashToday')}</span>
                <Banknote className="h-4 w-4 text-emerald-400 shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 truncate">{formatRupee(totalCashToday)}</div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">In counter drawer / safe</p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs gap-1">
                <span className="truncate">{t('totalUpiToday')}</span>
                <QrCode className="h-4 w-4 text-sky-400 shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-sky-400 truncate">{formatRupee(totalUpiToday)}</div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">NPCI Dynamic QR settlements</p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs gap-1">
                <span className="truncate">{t('totalChequeToday')}</span>
                <CreditCard className="h-4 w-4 text-amber-400 shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400 truncate">{formatRupee(totalChequeToday)}</div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Cheques in clearance</p>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-2 overflow-x-auto max-w-full py-0.5">
              <span className="text-xs text-slate-400 font-medium shrink-0">Method:</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {['ALL', 'CASH', 'UPI', 'CHEQUE', 'BANK_TRANSFER'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMethod(m)}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedMethod === m
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto max-w-full py-0.5">
              <span className="text-xs text-slate-400 font-medium shrink-0">Status:</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {['ALL', 'SUCCESS', 'INITIATED', 'REVERSED'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedStatus(s)}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedStatus === s
                        ? 'bg-slate-700 text-slate-100 border border-slate-600'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Payments Ledger Table */}
          <PaymentsTable payments={currentItems} isLoading={isLoading} onViewReceipt={handleOpenReceipt} />
        </>
      ) : (
        <>
          {/* Bank Statement Verification Notice */}
          <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-950/20 text-xs text-slate-300 flex items-start gap-3">
            <FileCheck2 className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0 flex-1">
              <div className="font-semibold text-sky-300 truncate">{t('upiClaimsTitle')}</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{t('bankStatementNotice')}</p>
            </div>
          </div>

          {/* Pending UPI Claims Queue Table */}
          <UpiClaimsTable
            claims={pendingClaims}
            isLoading={claimsLoading}
            onVerifyClaim={(claim) => setSelectedClaimForVerify(claim)}
          />
        </>
      )}

      {/* Modals */}
      <CounterPaymentModal
        isOpen={isCollectOpen}
        onClose={() => setIsCollectOpen(false)}
        onPaymentSuccess={(id) => handleOpenReceipt(id)}
      />

      <VerifyClaimDialog
        isOpen={Boolean(selectedClaimForVerify)}
        onClose={() => setSelectedClaimForVerify(null)}
        claim={selectedClaimForVerify}
        onVerified={(id) => handleOpenReceipt(id)}
      />

      <BilingualReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        paymentId={activeReceiptId}
      />
    </div>
  );
}
