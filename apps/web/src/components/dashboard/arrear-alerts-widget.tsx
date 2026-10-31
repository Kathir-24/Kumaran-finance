'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  UserX,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { formatRupee } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ArrearAlertsWidgetProps {
  arrearsAging?: {
    bucket1Month?: { count: number; totalAmount: number | bigint | string };
    bucket2Months?: { count: number; totalAmount: number | bigint | string };
    bucket3MonthsAndAbove?: {
      count: number;
      totalAmount: number | bigint | string;
      note?: string;
    };
  };
  isLoading: boolean;
}

export function ArrearAlertsWidget({ arrearsAging, isLoading }: ArrearAlertsWidgetProps) {
  const t = useTranslations('dashboard');

  if (isLoading) {
    return (
      <Card className="border-slate-800 bg-slate-900/60 shadow-sm animate-pulse">
        <CardHeader className="pb-3 border-b border-slate-800/80">
          <div className="h-5 w-48 bg-slate-800 rounded" />
          <div className="h-3 w-64 bg-slate-800/60 rounded mt-1" />
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-800/40 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const b1 = arrearsAging?.bucket1Month ?? { count: 0, totalAmount: 0 };
  const b2 = arrearsAging?.bucket2Months ?? { count: 0, totalAmount: 0 };
  const b3 = arrearsAging?.bucket3MonthsAndAbove ?? { count: 0, totalAmount: 0 };

  const totalCount = b1.count + b2.count + b3.count;
  const totalAmount =
    BigInt(b1.totalAmount || 0) +
    BigInt(b2.totalAmount || 0) +
    BigInt(b3.totalAmount || 0);

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm flex flex-col justify-between">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-base font-semibold text-white">
                {t('arrearsAgingTitle')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              {t('arrearAlertSubtitle')}
            </CardDescription>
          </div>

          <Badge variant={b3.count > 0 ? 'destructive' : totalCount > 0 ? 'overdue' : 'paid'}>
            {totalCount} {t('arrearCount')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        {totalCount === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center text-slate-400 space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-200">{t('noArrears')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Bucket 1: 1 Month Due */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/80">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-200">
                    {t('bucket1Month')}
                  </span>
                  <p className="text-[11px] text-slate-400">{b1.count} subscribers</p>
                </div>
              </div>
              <span className="text-sm font-mono font-semibold text-slate-200">
                {formatRupee(b1.totalAmount)}
              </span>
            </div>

            {/* Bucket 2: 2 Months Due */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/80">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                  <UserX className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-200">
                    {t('bucket2Months')}
                  </span>
                  <p className="text-[11px] text-slate-400">{b2.count} subscribers</p>
                </div>
              </div>
              <span className="text-sm font-mono font-semibold text-orange-300">
                {formatRupee(b2.totalAmount)}
              </span>
            </div>

            {/* Bucket 3: 3+ Months Consecutive Due (Critical ADR-07) */}
            <div className={`flex items-center justify-between p-3 rounded-lg border ${
              b3.count > 0
                ? 'border-rose-500/40 bg-rose-950/20'
                : 'border-slate-800 bg-slate-900/80'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                  b3.count > 0
                    ? 'bg-rose-500/20 border border-rose-500/30 text-rose-400 animate-pulse'
                    : 'bg-slate-800 border border-slate-700 text-slate-400'
                }`}>
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-rose-300">
                      {t('bucket3Months')}
                    </span>
                    {b3.count > 0 && (
                      <Badge variant="destructive" className="text-[9px] py-0 px-1">
                        ADR-07
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-rose-200/80">{b3.count} subscribers</p>
                </div>
              </div>
              <span className="text-sm font-mono font-bold text-rose-400">
                {formatRupee(b3.totalAmount)}
              </span>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">
            Total Arrears: <strong className="text-white">{formatRupee(totalAmount)}</strong>
          </span>
          <Button asChild variant="ghost" size="sm" className="text-xs text-amber-400 hover:text-amber-300 p-0 h-auto">
            <Link href="/reports" className="flex items-center gap-1">
              <span>{t('viewDefaulters')}</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
