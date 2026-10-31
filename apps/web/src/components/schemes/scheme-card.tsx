'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Calendar, ChevronRight, Lock, ShieldCheck, Users } from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SchemeSummary {
  id: string;
  groupCode: string;
  groupName: string;
  groupNameTamil?: string | null;
  chitValue: number;
  durationMonths: number;
  totalTickets: number;
  baseInstallment: number;
  foremanCommissionRate: number;
  maxDiscountCeiling: number;
  status: 'DRAFT' | 'REGISTERED' | 'ACTIVE' | 'COMPLETED' | 'CLOSED' | string;
  branch?: { id?: string; name: string; code: string } | null;
  startDate: string | Date;
  _count?: { tickets?: number; auctions?: number };
  tickets?: any[];
}

export interface SchemeCardProps {
  scheme: SchemeSummary;
  className?: string;
}

export function SchemeCard({ scheme, className }: SchemeCardProps) {
  const t = useTranslations('schemes');

  const filledTickets = scheme._count?.tickets ?? scheme.tickets?.length ?? 0;
  const isFull = filledTickets >= scheme.totalTickets;
  const progressPercent = Math.min(100, Math.round((filledTickets / scheme.totalTickets) * 100));

  const statusVariant = React.useMemo(() => {
    switch (scheme.status) {
      case 'ACTIVE':
        return 'success';
      case 'DRAFT':
        return 'warning';
      case 'COMPLETED':
        return 'outline';
      default:
        return 'secondary';
    }
  }, [scheme.status]);

  const formattedStartDate = React.useMemo(() => {
    try {
      return new Date(scheme.startDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
      });
    } catch {
      return String(scheme.startDate);
    }
  }, [scheme.startDate]);

  return (
    <Card
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden border-slate-800 bg-slate-900/90 hover:border-slate-700 transition-all shadow-md',
        className
      )}
    >
      <CardHeader className="p-5 pb-3 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-emerald-400 tracking-wider">
                {scheme.groupCode}
              </span>
              <Badge variant={statusVariant} className="text-[10px] uppercase font-bold py-0.5">
                {scheme.status}
              </Badge>
            </div>
            <h3 className="text-base font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors mt-0.5">
              {scheme.groupName}
            </h3>
            {scheme.groupNameTamil && (
              <p className="text-xs text-slate-400 font-tamil mt-0.5">
                {scheme.groupNameTamil}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 rounded-full border border-indigo-500/30 bg-indigo-950/40 px-2.5 py-1 text-[11px] font-semibold text-indigo-300">
            <Lock className="h-3 w-3 text-indigo-400" />
            <span>{t('frozenCommissionBadge')}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-1 space-y-4">
        {/* Financial metrics grid */}
        <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs">
          <div>
            <span className="text-[11px] text-slate-400">{t('chitValue')}</span>
            <p className="font-mono text-sm font-bold text-slate-100">
              {formatRupee(scheme.chitValue)}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-slate-400">{t('baseInstallment')}</span>
            <p className="font-mono text-sm font-bold text-slate-100">
              {formatRupee(scheme.baseInstallment)}/mo
            </p>
          </div>
          <div>
            <span className="text-[11px] text-slate-400">{t('duration')}</span>
            <p className="font-mono text-sm font-semibold text-slate-200">
              {scheme.durationMonths} {t('duration').includes('மாதங்கள்') ? 'மாதங்கள்' : 'Months'}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-slate-400">{t('ceilingDiscount')}</span>
            <p className="font-mono text-sm font-semibold text-indigo-300">
              {formatRupee(scheme.maxDiscountCeiling)}
            </p>
          </div>
        </div>

        {/* Capacity / ticket subscription bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-slate-400">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span>{t('ticketsFilled', { filled: filledTickets, total: scheme.totalTickets })}</span>
            </span>
            <span className={cn('font-mono font-bold', isFull ? 'text-emerald-400' : 'text-slate-300')}>
              {progressPercent}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn(
                'h-full transition-all duration-300',
                isFull ? 'bg-emerald-500' : 'bg-indigo-500'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Metadata info */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-slate-400" />
            <span>{formattedStartDate}</span>
          </span>
          {scheme.branch && (
            <span className="truncate max-w-[150px] font-medium text-slate-400">
              {scheme.branch.name}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button
          variant="outline"
          className="w-full justify-between border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800 hover:text-white"
          asChild
        >
          <Link href={`/schemes/${scheme.id}`}>
            <span>{t('viewRoster')}</span>
            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
