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
} from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatIstDateString } from '@/components/reports/report-bigint';

interface ActiveChitGroupForFiling {
  id: string;
  groupCode: string;
  branchId?: string;
  currentInstallmentMonth?: number;
}

interface FormXviiAuctionSummary {
  auctionId: string;
  installmentMonth: number;
  auctionDate: string;
  filedAtRegistrar: boolean;
  filedDate?: string | null;
  filingReference?: string | null;
  filingDaysRemaining?: number | null;
  isFilingOverdue?: boolean;
  filingStatus?: string;
}

interface FormXviiCountdownPayload {
  chitGroup?: {
    id: string;
    groupCode: string;
  };
  auctions?: FormXviiAuctionSummary[];
}

export interface FilingCountdownItem {
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
  enabled?: boolean;
}

export function FilingCountdownWidget({ branchId, enabled = true }: FilingCountdownWidgetProps) {
  const t = useTranslations('dashboard');

  // Query active chit groups and load real Form XVII auction records (zero fabricated dates)
  const { data: filingDeadlines = [], isLoading: chitsLoading } = useQuery<FilingCountdownItem[]>({
    queryKey: ['dashboard', 'chits-filing-countdown', { branchId }],
    queryFn: async ({ signal }) => {
      const chitsRes = await unwrapApiResponse<
        { data?: ActiveChitGroupForFiling[]; items?: ActiveChitGroupForFiling[] } | ActiveChitGroupForFiling[]
      >(
        apiClient.GET('/api/v1/chits', {
          params: { query: { status: 'ACTIVE', limit: 50 } },
          signal,
        }),
      );

      const rawGroups: ActiveChitGroupForFiling[] = Array.isArray(chitsRes)
        ? chitsRes
        : Array.isArray(chitsRes?.data)
          ? chitsRes.data
          : Array.isArray(chitsRes?.items)
            ? chitsRes.items
            : [];

      const scopedGroups = (
        branchId
          ? rawGroups.filter((g) => g.branchId === branchId)
          : rawGroups
      ).slice(0, 5);

      if (scopedGroups.length === 0) return [];

      const formXviiResults = await Promise.allSettled(
        scopedGroups.map((group) =>
          unwrapApiResponse<FormXviiCountdownPayload>(
            apiClient.GET('/api/v1/reports/form-xvii', {
              params: { query: { chitGroupId: group.id } },
              signal,
            }),
          ).then((payload) => ({ group, payload })),
        ),
      );

      const nowMs = Date.now();
      const items: FilingCountdownItem[] = [];

      for (const settled of formXviiResults) {
        if (settled.status !== 'fulfilled') continue;
        const { group, payload } = settled.value;
        const auctions = payload?.auctions ?? [];
        if (auctions.length === 0) continue;

        // Prioritize the most urgent unfiled finalized auction, otherwise latest finalized auction
        const unfiled = auctions.filter((a) => !a.filedAtRegistrar);
        const targetAuction =
          unfiled.length > 0
            ? unfiled.sort((a, b) => new Date(a.auctionDate).getTime() - new Date(b.auctionDate).getTime())[0]
            : auctions[auctions.length - 1];

        const auctionDateObj = new Date(targetAuction.auctionDate);
        if (Number.isNaN(auctionDateObj.getTime())) continue;

        const deadlineMs = auctionDateObj.getTime() + 21 * 24 * 60 * 60 * 1000;
        const fallbackDaysRemaining = Math.ceil((deadlineMs - nowMs) / (24 * 60 * 60 * 1000));
        const filedAtRegistrar = Boolean(targetAuction.filedAtRegistrar);
        const daysRemaining =
          typeof targetAuction.filingDaysRemaining === 'number' &&
          Number.isFinite(targetAuction.filingDaysRemaining)
            ? targetAuction.filingDaysRemaining
            : fallbackDaysRemaining;
        const isOverdue =
          !filedAtRegistrar &&
          (typeof targetAuction.isFilingOverdue === 'boolean'
            ? targetAuction.isFilingOverdue
            : daysRemaining < 0);

        items.push({
          auctionId: targetAuction.auctionId,
          chitGroupId: group.id,
          groupCode: payload?.chitGroup?.groupCode || group.groupCode,
          installmentMonth: targetAuction.installmentMonth,
          auctionDate: formatIstDateString(auctionDateObj),
          daysRemaining,
          isOverdue,
          isUrgent: !filedAtRegistrar && !isOverdue && daysRemaining >= 0 && daysRemaining <= 5,
          filedAtRegistrar,
          filedDate: targetAuction.filedDate,
          filingReference: targetAuction.filingReference,
        });
      }

      return items.sort((a, b) => {
        if (a.filedAtRegistrar !== b.filedAtRegistrar) return a.filedAtRegistrar ? 1 : -1;
        return a.daysRemaining - b.daysRemaining;
      });
    },
    enabled,
    staleTime: 60 * 1000,
  });

  if (!enabled) {
    return null;
  }

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

  const urgentCount = filingDeadlines.filter((f) => !f.filedAtRegistrar && (f.isUrgent || f.isOverdue)).length;

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
              Chit Funds Act 1982 Section 24: Statutory Form XVII filing with Deputy Registrar of Chits within 21 days
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
                key={`${item.chitGroupId}-${item.auctionId}`}
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

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
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
                    <Link href={`/reports/minutes?chitGroupId=${encodeURIComponent(item.chitGroupId)}`}>
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
