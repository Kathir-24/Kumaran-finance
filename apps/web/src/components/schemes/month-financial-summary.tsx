'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { formatRupee } from '@kumaran/api-client';

export interface MonthFinancialSummaryProps {
  grossAmount: number;
  dividendDeduction: number | null;
  netPayable: number | null;
  paidCount: number;
  allCount: number;
  durationMonths: number;
  totalCollectedRupees: number;
  totalPayableRupees: number;
  collectionPercentage: number;
}

export function MonthFinancialSummary({
  grossAmount,
  dividendDeduction,
  netPayable,
  paidCount,
  allCount,
  durationMonths,
  totalCollectedRupees,
  totalPayableRupees,
  collectionPercentage,
}: MonthFinancialSummaryProps) {
  const t = useTranslations('installments');

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {/* Base Gross */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
        <span className="text-[11px] text-slate-400">{t('summaryGrossBase')}</span>
        <p className="font-mono text-base font-bold text-slate-100">
          {formatRupee(grossAmount)}
        </p>
      </div>

      {/* Universal Dividend */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
        <span className="text-[11px] text-slate-400">{t('summaryDividend')}</span>
        <p className="font-mono text-base font-bold text-emerald-400">
          {dividendDeduction !== null ? formatRupee(dividendDeduction) : '—'}
        </p>
      </div>

      {/* Net Installment Payable */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
        <span className="text-[11px] text-slate-400">{t('summaryNetDue')}</span>
        <p className="font-mono text-base font-bold text-cyan-400">
          {netPayable !== null ? formatRupee(netPayable) : '—'}
        </p>
      </div>

      {/* Paid Tickets Count */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
        <span className="text-[11px] text-slate-400">{t('summaryPaidCount')}</span>
        <p className="font-mono text-base font-bold text-indigo-300">
          {paidCount} / {allCount || durationMonths}
        </p>
      </div>

      {/* Collections Rupee Gauge */}
      <div className="col-span-2 md:col-span-4 lg:col-span-1 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-slate-400">{t('summaryCollected')}</span>
          <span className="font-mono font-bold text-emerald-400">{collectionPercentage}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${collectionPercentage}%` }}
          />
        </div>
        <p className="font-mono text-[11px] text-slate-300 text-right">
          {formatRupee(totalCollectedRupees)} / {formatRupee(totalPayableRupees)}
        </p>
      </div>
    </div>
  );
}
