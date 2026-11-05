'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  Vault,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';

interface CashBookKpiBarProps {
  openingBalance: number;
  todayInflows: number;
  todayOutflows: number;
  closingBalance: number;
}

export function CashBookKpiBar({
  openingBalance,
  todayInflows,
  todayOutflows,
  closingBalance,
}: CashBookKpiBarProps) {
  const t = useTranslations('reports');

  // Mathematical Reconciliation Check
  // Formula: Closing === Opening + Inflows - Outflows
  const expectedClosing = openingBalance + todayInflows - todayOutflows;
  const isBalanced = expectedClosing === closingBalance;

  return (
    <div className="space-y-3">
      {/* 4 Pulse Vault Cash Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Opening Safe Balance */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpi.openingCash')}
            </CardTitle>
            <Vault className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-slate-100">
              {formatRupee(openingBalance)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Carried forward from yesterday</p>
          </CardContent>
        </Card>

        {/* KPI 2: Today Cash Inflows */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpi.todayInflows')}
            </CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-emerald-400">
              +{formatRupee(todayInflows)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Counter + acknowledged field cash</p>
          </CardContent>
        </Card>

        {/* KPI 3: Today Cash Outflows */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpi.todayOutflows')}
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-rose-400">
              -{formatRupee(todayOutflows)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Cash prize payout vouchers</p>
          </CardContent>
        </Card>

        {/* KPI 4: Closing Safe Balance */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpi.closingCash')}
            </CardTitle>
            <Landmark className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-emerald-300">
              {formatRupee(closingBalance)}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isBalanced ? 'bg-emerald-400' : 'bg-rose-400'
                )}
              />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isBalanced ? 'text-emerald-400' : 'text-rose-400'
                )}
              >
                {isBalanced ? t('kpi.vaultBalanced') : t('kpi.vaultDiscrepancy')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discrepancy Alert Banner (if unbalanced) */}
      {!isBalanced && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>
            {t('kpi.vaultDiscrepancy')}: Safe balance ({formatRupee(closingBalance)}) does not
            identically match calculated expected cash ({formatRupee(expectedClosing)}). Please
            audit unacknowledged field collections or unrecorded prize payments.
          </span>
        </div>
      )}
    </div>
  );
}
