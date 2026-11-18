'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';
import { toSafeBigInt, type WholeRupeeValue } from './report-bigint';

export interface DefaulterItem {
  ticketId: string;
  chitGroupId?: string;
  groupCode: string;
  ticketNumber: number;
  customerCode: string;
  customerName: string;
  customerNameTamil?: string;
  phone: string;
  consecutiveUnpaidMonths: number;
  riskCategory: 'ATTENTION_1M' | 'MEDIUM_RISK_2M' | 'HIGH_RISK_3M_REMOVAL' | string;
  eligibleForRemovalRights: boolean;
  totalArrearsAmount: WholeRupeeValue;
  unpaidDues: Array<{
    installmentMonth: number;
    dueDate: string;
    netPayableAmount: WholeRupeeValue;
    paidAmount: WholeRupeeValue;
    outstandingDue: WholeRupeeValue;
    status: string;
  }>;
}

interface DefaulterKpiBarProps {
  defaulters: DefaulterItem[];
}

export function DefaulterKpiBar({ defaulters }: DefaulterKpiBarProps) {
  const t = useTranslations('reports.defaulters');

  let count1M = 0;
  let amount1M = 0n;
  let count2M = 0;
  let amount2M = 0n;
  let count3M = 0;
  let amount3M = 0n;
  let grandTotal = 0n;

  defaulters.forEach((d) => {
    const amt = toSafeBigInt(d.totalArrearsAmount);
    grandTotal += amt;
    if (d.consecutiveUnpaidMonths === 1) {
      count1M += 1;
      amount1M += amt;
    } else if (d.consecutiveUnpaidMonths === 2) {
      count2M += 1;
      amount2M += amt;
    } else if (d.consecutiveUnpaidMonths >= 3) {
      count3M += 1;
      amount3M += amt;
    }
  });

  return (
    <div className="space-y-3">
      {/* 4 Risk Bucket KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: 1-Month Attention */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpi1Month')}
            </CardTitle>
            <Clock className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-sky-400 font-mono">
              {count1M}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              {formatRupee(amount1M)}
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: 2-Month Medium Risk */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpi2Months')}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-amber-400 font-mono">
              {count2M}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-1">
              {formatRupee(amount2M)}
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: 3-Month High Risk Removal */}
        <Card className={cn(
          "border-slate-800 bg-slate-900/60 shadow-sm transition-colors",
          count3M > 0 && "border-rose-500/40 bg-rose-950/20"
        )}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpi3Months')}
            </CardTitle>
            <AlertTriangle className={cn(
              "h-4 w-4",
              count3M > 0 ? "text-rose-400 animate-pulse" : "text-slate-500"
            )} />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold tracking-tight font-mono",
              count3M > 0 ? "text-rose-400" : "text-slate-400"
            )}>
              {count3M}
            </div>
            <p className={cn(
              "text-[11px] font-mono mt-1",
              count3M > 0 ? "text-rose-400/90 font-medium" : "text-slate-500"
            )}>
              {formatRupee(amount3M)}
            </p>
          </CardContent>
        </Card>

        {/* KPI 4: Total Overdue Arrears */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('kpiTotalArrears')}
            </CardTitle>
            <Users className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-white font-mono">
              {formatRupee(grandTotal)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {defaulters.length} Total Defaulters
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ADR-07 Removal Alert Banner */}
      {count3M > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-rose-300 text-xs">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
          <div className="flex-1 font-medium">
            {t('removalWarning', { count: count3M })}
          </div>
          <Badge variant="destructive" className="bg-rose-600 text-white shrink-0">
            {count3M} ADR-07 Actionable
          </Badge>
        </div>
      )}
    </div>
  );
}
