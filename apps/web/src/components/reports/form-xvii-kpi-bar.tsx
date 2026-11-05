'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Clock,
  FileCheck2,
  Gavel,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FormXviiKpiBarProps {
  totalFinalized: number;
  filedCount: number;
  pendingCount: number;
  overdueCount: number;
}

export function FormXviiKpiBar({
  totalFinalized,
  filedCount,
  pendingCount,
  overdueCount,
}: FormXviiKpiBarProps) {
  const t = useTranslations('reports.minutes');

  return (
    <div className="space-y-3">
      {/* 4 Pulse Statutory Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Auctions Finalized */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('totalFinalized')}
            </CardTitle>
            <Gavel className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-white font-mono">
              {totalFinalized}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Months 2 to N-1
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Filed with Registrar */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('filedCount')}
            </CardTitle>
            <FileCheck2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-400 font-mono">
              {filedCount}
            </div>
            <p className="text-[11px] text-emerald-500/80 mt-1">
              Challan / Ack confirmed
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Pending Filing */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('pendingFiling')}
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-amber-400 font-mono">
              {pendingCount}
            </div>
            <p className="text-[11px] text-amber-500/80 mt-1">
              Within 21 calendar days
            </p>
          </CardContent>
        </Card>

        {/* KPI 4: Statutory Overdue */}
        <Card className={cn(
          "border-slate-800 bg-slate-900/60 shadow-sm transition-colors",
          overdueCount > 0 && "border-rose-500/40 bg-rose-950/20"
        )}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">
              {t('overdueFilings')}
            </CardTitle>
            <AlertTriangle className={cn(
              "h-4 w-4",
              overdueCount > 0 ? "text-rose-400 animate-pulse" : "text-slate-500"
            )} />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold tracking-tight font-mono",
              overdueCount > 0 ? "text-rose-400" : "text-slate-400"
            )}>
              {overdueCount}
            </div>
            <p className={cn(
              "text-[11px] mt-1",
              overdueCount > 0 ? "text-rose-400/90 font-medium" : "text-slate-500"
            )}>
              {overdueCount > 0 ? 'Section 24 default' : '0 overdue items'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Overdue Warning Banner */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-rose-300 text-xs">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
          <div className="flex-1 font-medium">
            {t('overdueAlert', { count: overdueCount })}
          </div>
          <Badge variant="destructive" className="bg-rose-600 text-white shrink-0">
            {overdueCount} Overdue
          </Badge>
        </div>
      )}
    </div>
  );
}
