'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Receipt,
  Scale,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';

interface FormXxiKpiBarProps {
  totalGrossDue: number;
  totalDividendCredit: number;
  totalNetPayable: number;
  totalPaid: number;
  totalOutstandingArrears: number;
}

export function FormXxiKpiBar({
  totalGrossDue,
  totalDividendCredit,
  totalNetPayable,
  totalPaid,
  totalOutstandingArrears,
}: FormXxiKpiBarProps) {
  const t = useTranslations('reports.ledger');

  // Mathematical Reconciliation: Net === Gross - Dividend
  const expectedNet = totalGrossDue - totalDividendCredit;
  const _isNetBalanced = expectedNet === totalNetPayable;

  return (
    <div className="space-y-3">
      {/* 5 Cumulative Ledger Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* KPI 1: Gross Base Due */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('summaryGross')}
            </CardTitle>
            <Banknote className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono">
              {formatRupee(totalGrossDue)}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Ibase cumulative</p>
          </CardContent>
        </Card>

        {/* KPI 2: Dividend Savings */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('summaryDividend')}
            </CardTitle>
            <Sparkles className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-xl font-bold tracking-tight text-sky-400 font-mono">
              {formatRupee(totalDividendCredit)}
            </div>
            <p className="text-[10px] text-sky-500/80 mt-0.5">Equal member credits</p>
          </CardContent>
        </Card>

        {/* KPI 3: Net Payable */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('summaryNet')}
            </CardTitle>
            <Scale className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-xl font-bold tracking-tight text-purple-400 font-mono">
              {formatRupee(totalNetPayable)}
            </div>
            <p className="text-[10px] text-purple-500/80 mt-0.5">Gross - Dividends</p>
          </CardContent>
        </Card>

        {/* KPI 4: Total Paid */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('summaryPaid')}
            </CardTitle>
            <Receipt className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-xl font-bold tracking-tight text-emerald-400 font-mono">
              {formatRupee(totalPaid)}
            </div>
            <p className="text-[10px] text-emerald-500/80 mt-0.5">Cleared installments</p>
          </CardContent>
        </Card>

        {/* KPI 5: Outstanding Arrears */}
        <Card className={cn(
          "border-slate-800 bg-slate-900/60 shadow-sm col-span-2 sm:col-span-1",
          totalOutstandingArrears > 0 ? "border-rose-500/40 bg-rose-950/20" : "border-emerald-500/30"
        )}>
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('summaryArrears')}
            </CardTitle>
            {totalOutstandingArrears > 0 ? (
              <AlertCircle className="h-4 w-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-lg sm:text-xl font-bold tracking-tight font-mono",
              totalOutstandingArrears > 0 ? "text-rose-400" : "text-emerald-400"
            )}>
              {formatRupee(totalOutstandingArrears)}
            </div>
            <p className={cn(
              "text-[10px] mt-0.5",
              totalOutstandingArrears > 0 ? "text-rose-400/90 font-medium" : "text-emerald-500/80"
            )}>
              {totalOutstandingArrears > 0 ? 'Action required' : t('paidInFull')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
