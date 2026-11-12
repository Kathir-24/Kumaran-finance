'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Landmark,
  TrendingUp,
  Vault,
  AlertTriangle,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { formatRupee } from '@/lib/currency';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface DashboardKpiData {
  scope?: string;
  activeChitsCount?: number;
  totalSubscribersCount?: number;
  activeTicketsCount?: number;
  todayCollections?: {
    total: number | string | bigint;
    cash: number | string | bigint;
    upi: number | string | bigint;
    bankTransfer: number | string | bigint;
    cheque: number | string | bigint;
  };
  todayDisbursements?: {
    total: number | string | bigint;
  };
  branchVault?: {
    currentCashInSafe: number | string | bigint;
  };
  arrearsAging?: {
    bucket1Month?: { count: number; totalAmount: number | string | bigint };
    bucket2Months?: { count: number; totalAmount: number | string | bigint };
    bucket3MonthsAndAbove?: {
      count: number;
      totalAmount: number | string | bigint;
      note?: string;
    };
  };
}

interface KpiSummaryCardsProps {
  data?: DashboardKpiData | null;
  isLoading: boolean;
}

export function KpiSummaryCards({ data, isLoading }: KpiSummaryCardsProps) {
  const t = useTranslations('dashboard');

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse bg-slate-900/60 border-slate-800">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-28 bg-slate-800 rounded" />
                <div className="h-9 w-9 bg-slate-800 rounded-lg" />
              </div>
              <div className="h-8 w-36 bg-slate-800 rounded" />
              <div className="h-3 w-44 bg-slate-800 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activeChits = data?.activeChitsCount ?? 0;
  const activeTickets = data?.activeTicketsCount ?? 0;
  const totalSubscribers = data?.totalSubscribersCount ?? 0;

  const todayTotal = data?.todayCollections?.total ?? 0;
  const todayCash = data?.todayCollections?.cash ?? 0;
  const todayUpi = data?.todayCollections?.upi ?? 0;
  const todayBank = data?.todayCollections?.bankTransfer ?? 0;
  const todayCheque = data?.todayCollections?.cheque ?? 0;

  const vaultBalance = data?.branchVault?.currentCashInSafe ?? 0;

  const b1Count = data?.arrearsAging?.bucket1Month?.count ?? 0;
  const b2Count = data?.arrearsAging?.bucket2Months?.count ?? 0;
  const b3Count = data?.arrearsAging?.bucket3MonthsAndAbove?.count ?? 0;
  const totalDefaulters = b1Count + b2Count + b3Count;

  const b1Total = BigInt(data?.arrearsAging?.bucket1Month?.totalAmount ?? 0);
  const b2Total = BigInt(data?.arrearsAging?.bucket2Months?.totalAmount ?? 0);
  const b3Total = BigInt(data?.arrearsAging?.bucket3MonthsAndAbove?.totalAmount ?? 0);
  const totalArrearsAmount = b1Total + b2Total + b3Total;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Live Schemes Card */}
      <Link href="/schemes" className="group block focus:outline-none">
        <Card className="h-full border-slate-800 bg-slate-900/70 backdrop-blur-sm transition-all duration-200 hover:border-emerald-500/40 hover:bg-slate-900 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t('liveChits')}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform">
                  <Landmark className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-white mb-1">
                {activeChits}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 gap-2">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 flex-1">
                <span><span className="font-medium text-slate-300">{activeTickets}</span> {t('activeTickets')}</span>
                <span className="text-slate-600 hidden sm:inline">•</span>
                <span><span className="font-medium text-slate-300">{totalSubscribers}</span> {t('activeSubscribers')}</span>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* 2. Today's Collections Card */}
      <Link href="/collections" className="group block focus:outline-none">
        <Card className="h-full border-slate-800 bg-slate-900/70 backdrop-blur-sm transition-all duration-200 hover:border-blue-500/40 hover:bg-slate-900 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t('todayCollections')}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-white mb-1">
                {formatRupee(todayTotal)}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono">
                {t('modeCash')}: {formatRupee(todayCash)}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono">
                {t('modeUpi')}: {formatRupee(todayUpi)}
              </span>
              {(BigInt(todayBank) > 0n || BigInt(todayCheque) > 0n) && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
                  {t('modeBank')}: {formatRupee(todayBank)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* 3. Branch Safe Vault Balance */}
      <Link href="/reports" className="group block focus:outline-none">
        <Card className="h-full border-slate-800 bg-slate-900/70 backdrop-blur-sm transition-all duration-200 hover:border-purple-500/40 hover:bg-slate-900 shadow-sm">
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t('vaultCash')}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform">
                  <Vault className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-white mb-1 font-mono">
                {formatRupee(vaultBalance)}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs text-slate-400">
              <span className="leading-snug">{t('cashInSafe')}</span>
              <Badge variant="neutral" className="text-[10px] py-0 px-1.5 shrink-0">
                Form XXII
              </Badge>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* 4. Arrears & Defaulters Card */}
      <Link href="/reports" className="group block focus:outline-none">
        <Card className={`h-full border transition-all duration-200 hover:bg-slate-900 shadow-sm ${
          b3Count > 0
            ? 'border-rose-500/40 bg-rose-950/10 hover:border-rose-500/60'
            : totalDefaulters > 0
            ? 'border-amber-500/40 bg-slate-900/70 hover:border-amber-500/60'
            : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
        }`}>
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t('arrearCount')}
                </span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-transform group-hover:scale-105 ${
                  b3Count > 0
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                }`}>
                  {b3Count > 0 ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-bold tracking-tight text-white">
                  {totalDefaulters}
                </span>
                <span className="text-xs font-medium text-slate-400 font-mono">
                  ({formatRupee(totalArrearsAmount)})
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              {b3Count > 0 ? (
                <span className="text-rose-400 font-medium flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                  {b3Count} {t('bucket3Months')}
                </span>
              ) : (
                <span className="text-slate-400">{t('arrearAlertSubtitle')}</span>
              )}
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
