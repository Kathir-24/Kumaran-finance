'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MonthSelectorBarProps {
  durationMonths: number;
  selectedMonth: number;
  currentInstallmentMonth: number;
  isFetching: boolean;
  isSchemeActive: boolean;
  canManage: boolean;
  onSelectMonth: (month: number) => void;
  onRefresh: () => void;
  onOpenGenerate: () => void;
}

export function MonthSelectorBar({
  durationMonths,
  selectedMonth,
  currentInstallmentMonth,
  isFetching,
  isSchemeActive,
  canManage,
  onSelectMonth,
  onRefresh,
  onOpenGenerate,
}: MonthSelectorBarProps) {
  const t = useTranslations('installments');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {t('selectMonthLabel')}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="h-7 px-2 text-xs text-slate-400 hover:text-white"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isFetching && 'animate-spin')} />
            <span>Refresh</span>
          </Button>
          {isSchemeActive && canManage && (
            <Button
              size="sm"
              onClick={onOpenGenerate}
              className="h-7 px-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{t('generateDuesButton')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable Month Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
        {Array.from({ length: durationMonths }, (_, i) => i + 1).map((m) => {
          const isSelected = m === selectedMonth;
          const isCurrent = m === currentInstallmentMonth;
          const isM1 = m === 1;
          const isFinal = m === durationMonths;

          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelectMonth(m)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border cursor-pointer',
                isSelected
                  ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50 shadow-sm shadow-emerald-900/20 font-bold'
                  : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-850 hover:text-white'
              )}
            >
              <span>
                {isM1
                  ? t('month1Chip')
                  : isFinal
                  ? t('monthFinalChip', { n: durationMonths })
                  : t('monthChip', { m })}
              </span>
              {isCurrent && (
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" title="Current Active Month" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
