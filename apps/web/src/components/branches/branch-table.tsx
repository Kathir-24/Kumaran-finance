'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  Check,
  Copy,
  Landmark,
  MapPin,
  Phone,
  SearchX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BranchItem {
  id: string;
  code: string;
  name: string;
  nameTamil?: string | null;
  address: string;
  phone: string;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

interface BranchTableProps {
  branches: BranchItem[];
  isLoading: boolean;
  searchQuery: string;
  onClearSearch: () => void;
}

export function BranchTable({
  branches,
  isLoading,
  searchQuery,
  onClearSearch,
}: BranchTableProps) {
  const t = useTranslations('branches');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopyPhone = (id: string, phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateStr: string | Date) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(dateStr);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-12 text-center">
        <div className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <p className="mt-4 text-xs font-medium text-slate-400">Loading branch directory...</p>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
        <SearchX className="mx-auto h-12 w-12 text-slate-600" />
        <h3 className="mt-3 text-sm font-semibold text-slate-200">{t('noBranchesFound')}</h3>
        <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">{t('noBranchesDesc')}</p>
        {searchQuery && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearSearch}
            className="mt-4 border-slate-700 bg-slate-850 hover:bg-slate-800 text-xs"
          >
            Clear Search Filter
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 shadow-xl backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/60 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              <th className="py-3.5 px-4">{t('code')}</th>
              <th className="py-3.5 px-4">{t('name')}</th>
              <th className="py-3.5 px-4">{t('address')}</th>
              <th className="py-3.5 px-4">{t('phone')}</th>
              <th className="py-3.5 px-4">{t('status')}</th>
              <th className="py-3.5 px-4 text-right">{t('createdDate')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
            {branches.map((b) => {
              const isHO = b.code === 'PRD' || b.code === 'HO';
              return (
                <tr
                  key={b.id}
                  className="transition-colors hover:bg-slate-800/40 group"
                >
                  {/* Code */}
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-md">
                        {b.code}
                      </span>
                      {isHO && (
                        <Badge
                          variant="secondary"
                          className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-[10px] gap-1 px-1.5 py-0.5"
                        >
                          <Landmark className="h-3 w-3 text-amber-400" />
                          HO
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* Name (English & Tamil) */}
                  <td className="py-4 px-4 min-w-[200px]">
                    <div>
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        <span>{b.name}</span>
                      </div>
                      {b.nameTamil && (
                        <div className="text-[11px] text-slate-400 font-sans mt-0.5 ml-5">
                          {b.nameTamil}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Physical Address */}
                  <td className="py-4 px-4 max-w-[280px]">
                    <div className="flex items-start gap-1.5 text-slate-300">
                      <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2 text-[11px] leading-relaxed">
                        {b.address}
                      </span>
                    </div>
                  </td>

                  {/* Contact Phone & Quick Copy */}
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${b.phone}`}
                        className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-slate-200 hover:text-emerald-400 transition-colors"
                        title={t('quickCall')}
                      >
                        <Phone className="h-3 w-3 text-emerald-400" />
                        <span>+91 {b.phone}</span>
                      </a>
                      <button
                        type="button"
                        onClick={(e) => handleCopyPhone(b.id, b.phone, e)}
                        title={copiedId === b.id ? t('copiedPhone') : t('copyPhone')}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                      >
                        {copiedId === b.id ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="py-4 px-4 whitespace-nowrap">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border',
                        b.isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      )}
                    >
                      <span
                        className={cn(
                          'mr-1.5 h-1.5 w-1.5 rounded-full',
                          b.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        )}
                      />
                      {b.isActive ? t('active') : t('inactive')}
                    </span>
                  </td>

                  {/* Registered Date */}
                  <td className="py-4 px-4 text-right whitespace-nowrap font-mono text-[11px] text-slate-400">
                    {formatDate(b.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
