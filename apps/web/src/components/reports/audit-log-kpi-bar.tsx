'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, UserCheck, ArrowRightLeft, Users } from 'lucide-react';

interface AuditLogKpiBarProps {
  totalEvents: number;
  dualControlEvents: number;
  financialEvents: number;
  activeActors: number;
  isLoading?: boolean;
}

export function AuditLogKpiBar({
  totalEvents,
  dualControlEvents,
  financialEvents,
  activeActors,
  isLoading = false,
}: AuditLogKpiBarProps) {
  const t = useTranslations('reports.auditTrail');

  const kpis = [
    {
      title: t('kpiTotalEvents'),
      value: isLoading ? '...' : totalEvents.toLocaleString('en-IN'),
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      subtext: 'Append-Only Ledger',
    },
    {
      title: t('kpiDualControlEvents'),
      value: isLoading ? '...' : dualControlEvents.toLocaleString('en-IN'),
      icon: UserCheck,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      subtext: 'Maker != Checker (G10)',
    },
    {
      title: t('kpiFinancialEvents'),
      value: isLoading ? '...' : financialEvents.toLocaleString('en-IN'),
      icon: ArrowRightLeft,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      subtext: 'Cash & Ledger Mutations',
    },
    {
      title: t('kpiActiveActors'),
      value: isLoading ? '...' : activeActors.toLocaleString('en-IN'),
      icon: Users,
      color: 'text-violet-400',
      bgColor: 'bg-violet-500/10',
      borderColor: 'border-violet-500/20',
      subtext: 'Distinct Staff & System',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <Card
            key={idx}
            className={`border ${kpi.borderColor} bg-slate-900/80 backdrop-blur-sm shadow-sm transition-all hover:bg-slate-900`}
          >
            <CardContent className="p-4 sm:p-5 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-400">{kpi.title}</span>
                <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white">
                  {kpi.value}
                </div>
                <span className="text-[11px] text-slate-400 block font-sans">
                  {kpi.subtext}
                </span>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${kpi.bgColor} ${kpi.color} shrink-0`}
              >
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
