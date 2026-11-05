'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  QrCode,
  FileCheck,
  RefreshCw,
  Plus,
  CreditCard,
  Building2,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { PaymentsTable } from '@/components/collections/payments-table';
import { CounterPaymentModal } from '@/components/collections/counter-payment-modal';
import { BilingualReceiptModal } from '@/components/collections/bilingual-receipt-modal';
import { formatRupee } from '@/lib/currency';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export default function CollectionsPage() {
  const t = useTranslations('collections');

  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Fetch payments list
  const { data: paymentsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.payments.list({
      paymentMethod: selectedMethod === 'ALL' ? undefined : selectedMethod,
      paymentStatus: selectedStatus === 'ALL' ? undefined : selectedStatus,
    }),
    queryFn: async () => {
      const token = getStoredAccessToken();
      const params = new URLSearchParams();
      if (selectedMethod !== 'ALL') params.append('paymentMethod', selectedMethod);
      if (selectedStatus !== 'ALL') params.append('paymentStatus', selectedStatus);
      params.append('limit', '100');

      const res = await fetch(`${getApiBaseUrl()}/api/v1/payments?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch payments');
      const json = await res.json();
      return json?.data ?? json;
    },
  });

  // Query global metrics for today's collections
  const { data: globalData } = useQuery({
    queryKey: queryKeys.payments.list(),
    queryFn: async () => {
      const token = getStoredAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/payments?limit=200`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return { data: [], total: 0 };
      const json = await res.json();
      return json?.data ?? json;
    },
  });

  const allItems: any[] = useMemo(() => {
    const raw = globalData?.data || globalData;
    return Array.isArray(raw) ? raw : [];
  }, [globalData]);

  const currentItems: any[] = useMemo(() => {
    const raw = paymentsData?.data || paymentsData;
    return Array.isArray(raw) ? raw : [];
  }, [paymentsData]);

  // Aggregate Metrics (Pure Whole Rupee Math)
  const totalCollectionsToday = allItems.length;

  const totalCashToday = useMemo(() => {
    return allItems
      .filter((p) => p.paymentMethod === 'CASH' && p.paymentStatus !== 'REVERSED')
      .reduce((sum, p) => sum + BigInt(p.amount ?? 0), 0n);
  }, [allItems]);

  const totalUpiToday = useMemo(() => {
    return allItems
      .filter((p) => p.paymentMethod === 'UPI' && p.paymentStatus !== 'REVERSED')
      .reduce((sum, p) => sum + BigInt(p.amount ?? 0), 0n);
  }, [allItems]);

  const totalChequeToday = useMemo(() => {
    return allItems
      .filter((p) => p.paymentMethod === 'CHEQUE' && p.paymentStatus !== 'REVERSED')
      .reduce((sum, p) => sum + BigInt(p.amount ?? 0), 0n);
  }, [allItems]);

  const handleOpenReceipt = (paymentId: string) => {
    setActiveReceiptId(paymentId);
    setIsReceiptOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Banknote className="h-7 w-7 text-emerald-400" />
            {t('title')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCollectOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs gap-1.5 shadow-md shadow-emerald-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>{t('collectPaymentBtn')}</span>
          </Button>
        </div>
      </div>

      {/* ADR-07 Business Rule Banner */}
      <BusinessRuleBanner
        ruleNumber={8}
        title={t('bannerTitle')}
        description={t('bannerDesc')}
      />

      {/* 4 Daily Pulse Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('totalCollectionsToday')}</span>
            <FileCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {totalCollectionsToday}
          </div>
          <p className="text-[11px] text-slate-500">Discrete receipts issued</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('totalCashToday')}</span>
            <Banknote className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {formatRupee(totalCashToday)}
          </div>
          <p className="text-[11px] text-slate-500">In counter drawer / safe</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('totalUpiToday')}</span>
            <QrCode className="h-4 w-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-sky-400">
            {formatRupee(totalUpiToday)}
          </div>
          <p className="text-[11px] text-slate-500">NPCI Dynamic QR settlements</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('totalChequeToday')}</span>
            <CreditCard className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {formatRupee(totalChequeToday)}
          </div>
          <p className="text-[11px] text-slate-500">Cheques in clearance</p>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/30">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Method:</span>
          {['ALL', 'CASH', 'UPI', 'CHEQUE', 'BANK_TRANSFER'].map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMethod(m)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedMethod === m
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {m.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          {['ALL', 'SUCCESS', 'INITIATED', 'REVERSED'].map((s) => (
            <button
              key={s}
              onClick={() => setSelectedStatus(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
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

      {/* Payments Ledger Table */}
      <PaymentsTable
        payments={currentItems}
        isLoading={isLoading}
        onViewReceipt={handleOpenReceipt}
      />

      {/* Modals */}
      <CounterPaymentModal
        isOpen={isCollectOpen}
        onClose={() => setIsCollectOpen(false)}
        onPaymentSuccess={(id) => handleOpenReceipt(id)}
      />

      <BilingualReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        paymentId={activeReceiptId}
      />
    </div>
  );
}
