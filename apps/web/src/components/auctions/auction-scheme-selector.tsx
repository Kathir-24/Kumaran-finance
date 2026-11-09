'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Layers, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@/lib/currency';

export interface ChitGroupSummary {
  id: string;
  groupCode: string;
  groupName: string;
  chitValue: bigint | number | string;
  durationMonths: number;
  status: string;
}

export interface AuctionSchemeSelectorProps {
  schemes: ChitGroupSummary[];
  selectedGroupId?: string;
  onSelectGroup: (groupId: string) => void;
  isLoading?: boolean;
}

export function AuctionSchemeSelector({
  schemes,
  selectedGroupId,
  onSelectGroup,
  isLoading,
}: AuctionSchemeSelectorProps) {
  const t = useTranslations('auctions');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 w-48 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60"
          />
        ))}
      </div>
    );
  }

  if (!schemes || schemes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <Layers className="h-3.5 w-3.5 text-emerald-400" />
          <span>{t('selectScheme')}</span>
        </label>
        <span className="text-[11px] text-slate-400 font-mono">
          {schemes.length} {t('allSchemes')}
        </span>
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto max-w-full pb-2 scrollbar-thin scrollbar-thumb-slate-800">
        {schemes.map((scheme) => {
          const isSelected = scheme.id === selectedGroupId;

          return (
            <button
              key={scheme.id}
              onClick={() => onSelectGroup(scheme.id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all shrink-0 min-w-[220px] max-w-[280px] ${
                isSelected
                  ? 'border-emerald-500/50 bg-emerald-950/20 shadow-md shadow-emerald-950/20'
                  : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-emerald-400">
                    {scheme.groupCode}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 border-slate-700 bg-slate-800/80 text-slate-400"
                  >
                    {scheme.durationMonths}M
                  </Badge>
                </div>
                <h4 className="text-xs font-semibold text-slate-200 truncate" title={scheme.groupName}>
                  {scheme.groupName}
                </h4>
                <div className="text-[11px] font-mono text-slate-400">
                  {formatRupee(scheme.chitValue)}
                </div>
              </div>

              {isSelected && (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
