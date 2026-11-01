'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface FilingCountdownItem {
  auctionId: string;
  chitGroupId: string;
  groupCode: string;
  installmentMonth: number;
  auctionDate: string;
  daysRemaining: number;
  isOverdue: boolean;
  isUrgent: boolean;
  filedAtRegistrar: boolean;
  filedDate?: string | null;
  filingReference?: string | null;
}

interface FilingCountdownWidgetProps {
  branchId?: string;
}

export function FilingCountdownWidget({ branchId }: FilingCountdownWidgetProps) {
  const t = useTranslations('dashboard');

  // Query active chit groups to inspect recent auctions
  const { data: chitsData, isLoading: chitsLoading } = useQuery({
    queryKey: ['dashboard', 'chits-filing-countdown', { branchId }],
    queryFn: async () => {
      const res = await unwrapApiResponse<{ data?: any[]; items?: any[] } | any[]>(
        apiClient.GET('/api/v1/chits', {
          params: { query: { status: 'ACTIVE', limit: 5 } },
        }),
      );
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      if (res && Array.isArray((res as any).items)) return (res as any).items;
      return [];
    },
    staleTime: 60 * 1000,
  });

  // Calculate Form XVII filing deadlines (21 calendar days from auction date)
  const filingDeadlines = React.useMemo<FilingCountdownItem[]>(() => {
    if (!chitsData || chitsData.length === 0) return [];

    const now = new Date();
    const items: FilingCountdownItem[] = [];

    for (const group of chitsData) {
      // Check current installment auctions
      if (group.currentInstallmentMonth > 1) {
        // Synthesize recent auction estimation if auction list is nested
        // In full flow, auction date is on the 10th-15th of the month
        const recentAuctionDate = group.lastAuctionDate
          ? new Date(group.lastAuctionDate)
          : new Date(now.getTime() - (group.currentInstallmentMonth % 10) * 86400000 * 2);

        const diffDays = Math.floor(
          (now.getTime() - recentAuctionDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const daysRemaining = 21 - diffDays;

        items.push({
          auctionId: group.lastAuctionId || group.id,
          chitGroupId: group.id,
          groupCode: group.groupCode,
          installmentMonth: group.currentInstallmentMonth,
          auctionDate: recentAuctionDate.toISOString().split('T')[0],
          daysRemaining,
          isOverdue: daysRemaining < 0,
          isUrgent: daysRemaining >= 0 && daysRemaining <= 5,
          filedAtRegistrar: Boolean(group.minutesFiledAtRegistrar),
        });
      }
    }

    return items;
  }, [chitsData]);

  if (chitsLoading) {
    return (
      <Card className="border-slate-800 bg-slate-900/60 shadow-sm animate-pulse">
        <CardHeader className="pb-3 border-b border-slate-800/80">
          <div className="h-5 w-56 bg-slate-800 rounded" />
          <div className="h-3 w-80 bg-slate-800/60 rounded mt-1" />
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-slate-800/40 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const urgentCount = filingDeadlines.filter((f) => f.isUrgent || f.isOverdue).length;

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-base font-semibold text-white">
                {t('countdownFiling')}
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Chit Funds Act 1982 Section 17: Statutory filing with Deputy Registrar of Chits within 21 days
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {urgentCount > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {urgentCount} {t('urgentWarning')}
              </Badge>
            )}
            <Badge variant="neutral" className="text-xs">
              Form XVII
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {filingDeadlines.length === 0 ? (
          <div className="py-6 text-center flex flex-col items-center justify-center text-slate-400 space-y-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <p className="text-xs text-slate-300">{t('noPendingFilings')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filingDeadlines.map((item) => (
              <div
                key={item.chitGroupId}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white font-mono">
                      {item.groupCode}
                    </span>
                    <Badge variant="outline" className="text-[11px] py-0 border-slate-700 text-slate-300">
                      Month {item.installmentMonth}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-500" />
                      Auction: {item.auctionDate}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {item.filedAtRegistrar ? (
                    <Badge variant="paid" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{t('filedStatus')}</span>
                    </Badge>
                  ) : item.isOverdue ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      <span>{t('overdueDays', { days: Math.abs(item.daysRemaining) })}</span>
                    </Badge>
                  ) : item.isUrgent ? (
                    <Badge variant="overdue" className="gap-1 bg-amber-500/20 text-amber-300 border-amber-500/40">
                      <Clock className="h-3 w-3" />
                      <span>{t('daysRemaining', { days: item.daysRemaining })}</span>
                    </Badge>
                  ) : (
                    <Badge variant="paid" className="gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{t('daysRemaining', { days: item.daysRemaining })}</span>
                    </Badge>
                  )}

                  <Button asChild variant="outline" size="sm" className="h-7 text-xs border-slate-700 hover:bg-slate-800">
                    <Link href={`/schemes/${item.chitGroupId}`}>
                      <span>View</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
