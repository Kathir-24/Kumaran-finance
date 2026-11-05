'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Search, X, Loader2, ShieldCheck, Clock, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type KycFilterOption = 'ALL' | 'VERIFIED' | 'PENDING';

export interface CustomerFilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  kycFilter: KycFilterOption;
  onKycFilterChange: (val: KycFilterOption) => void;
  limit: number;
  onLimitChange: (val: number) => void;
  onReset: () => void;
  isSearching?: boolean;
}

export function CustomerFilterBar({
  search,
  onSearchChange,
  kycFilter,
  onKycFilterChange,
  limit,
  onLimitChange,
  onReset,
  isSearching = false,
}: CustomerFilterBarProps) {
  const t = useTranslations('customers');

  const hasActiveFilters = search.trim().length > 0 || kycFilter !== 'ALL';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between shadow-sm">
      {/* Search Input Box */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-9 h-9 text-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500/50"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-emerald-400" />
        )}
        {!isSearching && search.length > 0 && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-2.5 rounded text-slate-400 hover:text-slate-200"
            aria-label={t('clearFilters')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* KYC Status Filter Pills & Page Size Selector */}
      <div className="flex flex-wrap items-center gap-2">
        {/* KYC Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onKycFilterChange('ALL')}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              kycFilter === 'ALL'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {t('allKyc')}
          </button>

          <button
            type="button"
            onClick={() => onKycFilterChange('VERIFIED')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              kycFilter === 'VERIFIED'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            <span>{t('kycVerified')}</span>
          </button>

          <button
            type="button"
            onClick={() => onKycFilterChange('PENDING')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              kycFilter === 'PENDING'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <Clock className="h-3 w-3 text-amber-400" />
            <span>{t('kycPending')}</span>
          </button>
        </div>

        {/* Rows Per Page Select */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1 text-xs">
          <span className="text-slate-500 text-[11px] hidden md:inline">{t('rowsPerPage')}:</span>
          {[10, 20, 50].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onLimitChange(size)}
              className={cn(
                'rounded px-1.5 py-0.5 text-xs font-semibold transition-colors',
                limit === size
                  ? 'bg-slate-800 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Reset Button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 px-2 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            <span className="hidden sm:inline">{t('clearFilters')}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
