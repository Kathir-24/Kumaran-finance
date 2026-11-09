'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Coins,
  ShieldCheck,
  TrendingUp,
  Percent,
  CheckCircle,
} from 'lucide-react';
import { formatRupee } from '@/lib/currency';
import type { ChitGroupSummary } from './auction-scheme-selector';

export interface AuctionScheduleItem {
  id: string;
  installmentMonth: number;
  auctionDate: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'MINUTES_FILED' | string;
  bidDiscount?: bigint | number | string | null;
  foremanCommissionAmount?: bigint | number | string | null;
  totalDividend?: bigint | number | string | null;
  dividendPerTicket?: bigint | number | string | null;
  prizeMoney?: bigint | number | string | null;
  winner?: {
    wasTieBreakWinner?: boolean;
    ticket?: {
      ticketNumber: number;
      customer?: {
        fullName: string;
        customerCode: string;
        phone: string;
      } | null;
    } | null;
  } | null;
  tieBidders?: Array<{
    id: string;
    tokenNumber?: number | null;
    isWinner: boolean;
    ticket?: {
      ticketNumber: number;
      customer?: { fullName: string; phone: string } | null;
    } | null;
  }>;
}

export interface AuctionMetricsCardsProps {
  scheme: ChitGroupSummary;
  auctions: AuctionScheduleItem[];
}

export function AuctionMetricsCards({ scheme, auctions }: AuctionMetricsCardsProps) {
  const t = useTranslations('auctions');

  const chitValueNum = Number(scheme.chitValue);
  const duration = scheme.durationMonths || 1;
  const baseInstallment = Math.floor(chitValueNum / duration);

  // Ceiling: 1/4 of total chit value (Guardrail 6)
  const ceilingDiscount = Math.floor(chitValueNum / 4);

  // Floor: 4.00% Foreman Commission (Guardrail 3)
  const commissionFloor = Math.floor(chitValueNum * 0.04);

  // Auctions count: Total auctionable months is N - 2 (Months 2 through N-1)
  const totalAuctionMonths = Math.max(0, duration - 2);
  const completedAuctionsCount = auctions.filter(
    (a) => a.status === 'COMPLETED' || a.status === 'MINUTES_FILED',
  ).length;

  // Cumulative dividends distributed so far
  const totalDividends = auctions.reduce((sum, a) => {
    return sum + (a.totalDividend ? Number(a.totalDividend) : 0);
  }, 0);

  const progressPercentage =
    totalAuctionMonths > 0
      ? Math.min(100, Math.round((completedAuctionsCount / totalAuctionMonths) * 100))
      : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* 1. Chit Value & Base */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {t('chitValueLabel')}
            </span>
            <Coins className="h-4 w-4 text-emerald-400 shrink-0" />
          </div>
          <div className="font-mono text-base font-bold text-white mt-1">
            {formatRupee(scheme.chitValue)}
          </div>
        </div>
        <p className="text-[11px] font-mono text-slate-400 pt-1">
          {t('baseInstallmentLabel')}: {formatRupee(baseInstallment)}
        </p>
      </div>

      {/* 2. Ceiling Boundary (V/4) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
              {t('ceilingDiscountLabel')}
            </span>
            <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
          </div>
          <div className="font-mono text-base font-bold text-amber-300 mt-1">
            {formatRupee(ceilingDiscount)}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 pt-1">
          {t('ceilingDiscountDesc')}
        </p>
      </div>

      {/* 3. Minimum Floor (4.00%) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
              {t('minimumFloorLabel')}
            </span>
            <Percent className="h-4 w-4 text-indigo-400 shrink-0" />
          </div>
          <div className="font-mono text-base font-bold text-indigo-300 mt-1">
            {formatRupee(commissionFloor)}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 pt-1">
          {t('minimumFloorDesc')}
        </p>
      </div>

      {/* 4. Total Dividends Distributed */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              {t('totalDividendsLabel')}
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
          </div>
          <div className="font-mono text-base font-bold text-emerald-400 mt-1">
            {formatRupee(totalDividends)}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 pt-1">
          {t('acrossAuctionsCount', { count: completedAuctionsCount })}
        </p>
      </div>

      {/* 5. Auctions Conducted Progress */}
      <div className="col-span-2 sm:col-span-1 lg:col-span-1 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1.5 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {t('completedAuctionsLabel')}
            </span>
            <CheckCircle className="h-4 w-4 text-indigo-400 shrink-0" />
          </div>
          <div className="font-mono text-base font-bold text-slate-200 mt-1">
            {t('progressCount', {
              completed: completedAuctionsCount,
              total: totalAuctionMonths,
            })}
          </div>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
