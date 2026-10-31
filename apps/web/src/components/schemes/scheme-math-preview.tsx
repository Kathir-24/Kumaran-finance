'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, AlertTriangle, ShieldCheck, Lock, Calculator } from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface SchemeMathPreviewProps {
  chitValue: number;
  durationMonths: number;
  className?: string;
}

export function SchemeMathPreview({
  chitValue,
  durationMonths,
  className,
}: SchemeMathPreviewProps) {
  const t = useTranslations('schemes');

  const isValidValue = chitValue > 0;
  const isValidDuration = durationMonths >= 2;
  const isDivisible = isValidValue && isValidDuration && chitValue % durationMonths === 0;

  const baseInstallment = isDivisible ? Math.floor(chitValue / durationMonths) : 0;
  const foremanCommission = isValidValue ? Math.floor((chitValue * 4) / 100) : 0; // 4.00%
  const maxDiscountCeiling = isValidValue ? Math.floor(chitValue / 4) : 0; // 1/4 Ceiling
  const minPrizeMoney = isValidValue ? chitValue - maxDiscountCeiling : 0; // 3V / 4
  const maxTotalDividend = Math.max(0, maxDiscountCeiling - foremanCommission);
  const maxDividendPerTicket = isDivisible && durationMonths > 0 ? Math.floor(maxTotalDividend / durationMonths) : 0;
  const minNetInstallment = baseInstallment - maxDividendPerTicket;

  return (
    <Card className={cn('border-slate-800 bg-slate-900/90 shadow-md', className)}>
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-400" />
            <span>{t('summaryPreview')}</span>
          </CardTitle>

          {isDivisible ? (
            <Badge variant="success" className="text-[11px] py-0.5 font-semibold">
              <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
              <span>{t('divisibleValid')}</span>
            </Badge>
          ) : isValidValue && isValidDuration ? (
            <Badge variant="destructive" className="text-[11px] py-0.5 font-bold">
              <AlertTriangle className="h-3 w-3 mr-1 text-rose-300" />
              <span>Fractional Paise Detected</span>
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Divisibility Invariant Error Banner if not divisible */}
        {!isDivisible && isValidValue && isValidDuration && (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <p>
              {t('divisibilityError', {
                value: formatRupee(chitValue).replace('₹', ''),
                duration: durationMonths,
              })}
            </p>
          </div>
        )}

        {/* 6-Metric Invariant Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {/* 1. Chit Value */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-0.5">
            <span className="text-[11px] text-slate-400">{t('chitValue')}</span>
            <p className="font-mono text-sm font-bold text-slate-100">
              {formatRupee(chitValue)}
            </p>
          </div>

          {/* 2. Base Installment */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-0.5">
            <span className="text-[11px] text-slate-400">{t('baseInstallment')}</span>
            <p className="font-mono text-sm font-bold text-slate-100">
              {isDivisible ? `${formatRupee(baseInstallment)}/mo` : '—'}
            </p>
          </div>

          {/* 3. 4.00% Commission Lock */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{t('commissionLocked')}</span>
              <Lock className="h-3 w-3 text-indigo-400" />
            </div>
            <p className="font-mono text-sm font-bold text-indigo-300">
              {formatRupee(foremanCommission)} (4%)
            </p>
          </div>

          {/* 4. Fixed 1/4 Ceiling */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-0.5">
            <span className="text-[11px] text-slate-400">{t('ceilingDiscount')}</span>
            <p className="font-mono text-sm font-bold text-indigo-300">
              {formatRupee(maxDiscountCeiling)} (25%)
            </p>
          </div>

          {/* 5. Min Prize Money at Ceiling */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-0.5">
            <span className="text-[11px] text-slate-400">{t('minPrizeMoney')}</span>
            <p className="font-mono text-sm font-bold text-emerald-400">
              {formatRupee(minPrizeMoney)}
            </p>
          </div>

          {/* 6. Lowest Net Installment at Ceiling */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-0.5">
            <span className="text-[11px] text-slate-400">Min Due at Ceiling</span>
            <p className="font-mono text-sm font-bold text-emerald-400">
              {isDivisible ? `${formatRupee(minNetInstallment)}/mo` : '—'}
            </p>
          </div>
        </div>

        {/* Informative Guardrail Note */}
        <div className="flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 p-2.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400 mt-0.5" />
          <p>
            <span className="font-semibold text-slate-300">Passbook Invariant:</span> Every month,{' '}
            <span className="font-mono text-slate-200">I_net + Div_ticket === I_base</span> strictly holds.
            Month 1 has ₹0 dividend; Ticket #1 (Foreman) receives the full pool of {formatRupee(chitValue)}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
