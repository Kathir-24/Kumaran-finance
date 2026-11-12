'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ReportDateNavigatorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  branchId?: string;
  onBranchChange?: (branchId: string | undefined) => void;
  branches?: Array<{ id: string; name: string; code: string }>;
  isSuperAdminOrAccountant: boolean;
}

export function ReportDateNavigator({
  selectedDate,
  onDateChange,
  branchId,
  onBranchChange,
  branches = [],
  isSuperAdminOrAccountant,
}: ReportDateNavigatorProps) {
  const t = useTranslations('reports');

  const shiftDate = (days: number) => {
    try {
      const current = new Date(selectedDate);
      if (isNaN(current.getTime())) return;
      current.setDate(current.getDate() + days);
      onDateChange(current.toISOString().split('T')[0]);
    } catch {
      // Ignore invalid date
    }
  };

  const setToday = () => {
    onDateChange(new Date().toISOString().split('T')[0]);
  };

  const setYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    onDateChange(yesterday.toISOString().split('T')[0]);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      {/* Date Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => shiftDate(-1)}
            className="h-8 w-8 p-0 border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
            title={t('date.prevDay')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="relative">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="h-8 text-xs bg-slate-950 border-slate-800 text-slate-200 font-mono w-[145px]"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => shiftDate(1)}
            className="h-8 w-8 p-0 border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
            title={t('date.nextDay')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={setToday}
            className="h-8 text-xs border-slate-800 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {t('date.today')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={setYesterday}
            className="h-8 text-xs border-slate-800 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {t('date.yesterday')}
          </Button>
        </div>
      </div>

      {/* Branch Selector (For Super Admin / Accountant) */}
      {isSuperAdminOrAccountant && branches.length > 0 && (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <select
            value={branchId || ''}
            onChange={(e) => onBranchChange?.(e.target.value || undefined)}
            className="h-8 rounded-lg bg-slate-950 border border-slate-800 px-2.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          >
            <option value="">{t('allBranches')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
