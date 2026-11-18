'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Clock,
  ShieldCheck,
  RefreshCw,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import {
  DisbursementsTable,
  WinnerDisbursementRow,
} from '@/components/disbursements/disbursements-table';
import { formatRupee } from '@/lib/currency';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { toSafeWholeRupeeBigInt } from '@/components/auctions/auction-math.util';

type DisbursementsListResponse =
  | WinnerDisbursementRow[]
  | { data?: WinnerDisbursementRow[]; total?: number; totalPages?: number; page?: number; limit?: number };

function extractDisbursementRows(res: DisbursementsListResponse | undefined): WinnerDisbursementRow[] {
  if (!res) return [];
  return Array.isArray(res) ? res : (res.data ?? []);
}

export default function DisbursementsPage() {
  const t = useTranslations('disbursements');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.disbursements.list({
      disbursementStatus: selectedStatus === 'ALL' ? undefined : selectedStatus,
    }),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<DisbursementsListResponse>(
        apiClient.GET('/api/v1/disbursements', {
          params: {
            query: {
              disbursementStatus: selectedStatus === 'ALL' ? undefined : selectedStatus,
              limit: 50,
            },
          },
          signal,
        }),
      );
    },
  });

  // XR-WM-05: Query ALL pages cleanly so KPI cards & tab counts never silently undercount past 100 rows
  const { data: globalData } = useQuery({
    queryKey: queryKeys.disbursements.list(),
    queryFn: async ({ signal }) => {
      try {
        const pageSize = 100;
        const firstPage = await unwrapApiResponse<DisbursementsListResponse>(
          apiClient.GET('/api/v1/disbursements', {
            params: { query: { page: 1, limit: pageSize } },
            signal,
          }),
        );
        const firstRows = extractDisbursementRows(firstPage);
        const reportedTotal =
          !Array.isArray(firstPage) && typeof firstPage?.total === 'number'
            ? firstPage.total
            : firstRows.length;
        const reportedPages =
          !Array.isArray(firstPage) && typeof firstPage?.totalPages === 'number'
            ? firstPage.totalPages
            : Math.ceil(reportedTotal / pageSize);

        if (reportedPages <= 1) {
          return { data: firstRows, total: reportedTotal };
        }

        // Fetch remaining pages sequentially/bounded so global KPI totals are exact across all disbursements
        const allRows: WinnerDisbursementRow[] = [...firstRows];
        for (let p = 2; p <= reportedPages; p += 1) {
          const nextPage = await unwrapApiResponse<DisbursementsListResponse>(
            apiClient.GET('/api/v1/disbursements', {
              params: { query: { page: p, limit: pageSize } },
              signal,
            }),
          );
          allRows.push(...extractDisbursementRows(nextPage));
        }

        return { data: allRows, total: Math.max(reportedTotal, allRows.length) };
      } catch {
        return { data: [], total: 0 };
      }
    },
  });

  const allItems = extractDisbursementRows(globalData);
  const currentItems = extractDisbursementRows(data);

  // Metric counts (backed by authoritative server total + full paginated set)
  const totalWinnersCount =
    globalData && !Array.isArray(globalData) && typeof globalData.total === 'number'
      ? Math.max(globalData.total, allItems.length)
      : allItems.length;
  const pendingCount = allItems.filter(
    (w) => w.disbursementStatus === 'PENDING_VERIFICATION',
  ).length;
  const verifiedCount = allItems.filter(
    (w) => w.disbursementStatus === 'VERIFIED_BY_MAKER',
  ).length;
  const authorizedCount = allItems.filter(
    (w) => w.disbursementStatus === 'AUTHORIZED_BY_CHECKER',
  ).length;
  const disbursedCount = allItems.filter(
    (w) => w.disbursementStatus === 'DISBURSED',
  ).length;

  const totalDisbursedRupees = allItems
    .filter((w) => w.disbursementStatus === 'DISBURSED')
    .reduce<bigint>((sum, w) => {
      const amt = toSafeWholeRupeeBigInt(w.disbursedAmount ?? w.auction?.prizeMoney, 0n);
      return sum + amt;
    }, 0n);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
            <Banknote className="h-7 w-7 text-emerald-400" />
            {t('title')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="w-full sm:w-auto shrink-0 justify-center border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-xs gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{t('refreshQueue')}</span>
        </Button>
      </div>

      {/* ADR-14 & ADR-15 Invariant Rule Banner */}
      <BusinessRuleBanner
        ruleNumber={15}
        title={t('bannerTitle')}
        description={t('bannerDesc')}
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Prize Winners */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">{t('totalWinners')}</span>
            <Coins className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-100 mt-2">
            {totalWinnersCount}
          </div>
        </div>

        {/* Metric 2: Pending Safety Verification */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-300/80">{t('pendingVerification')}</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-300 mt-2">
            {pendingCount}
          </div>
        </div>

        {/* Metric 3: Authorized Pending Release */}
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-300/80">{t('authorizedPending')}</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-purple-300 mt-2">
            {authorizedCount}
          </div>
        </div>

        {/* Metric 4: Total Disbursed Value */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-300/80">{t('totalDisbursed')}</span>
            <Banknote className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-mono font-bold text-emerald-400 mt-2">
            {formatRupee(totalDisbursedRupees)}
          </div>
        </div>
      </div>

      {/* Tabs Filter */}
      <Tabs value={selectedStatus} onValueChange={setSelectedStatus} className="w-full">
        <div className="overflow-x-auto max-w-full pb-1 scrollbar-thin scrollbar-thumb-slate-800">
          <TabsList className="bg-slate-900 border-slate-800 p-1 inline-flex w-max gap-1">
            <TabsTrigger value="ALL" className="text-xs shrink-0 whitespace-nowrap">
              {t('tabAll', { count: totalWinnersCount })}
            </TabsTrigger>
            <TabsTrigger value="PENDING_VERIFICATION" className="text-xs shrink-0 whitespace-nowrap">
              {t('tabPendingVerification', { count: pendingCount })}
            </TabsTrigger>
            <TabsTrigger value="VERIFIED_BY_MAKER" className="text-xs shrink-0 whitespace-nowrap">
              {t('tabVerifiedMaker', { count: verifiedCount })}
            </TabsTrigger>
            <TabsTrigger value="AUTHORIZED_BY_CHECKER" className="text-xs shrink-0 whitespace-nowrap">
              {t('tabAuthorizedChecker', { count: authorizedCount })}
            </TabsTrigger>
            <TabsTrigger value="DISBURSED" className="text-xs shrink-0 whitespace-nowrap">
              {t('tabDisbursed', { count: disbursedCount })}
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* Disbursements Table */}
      <DisbursementsTable items={currentItems} isLoading={isLoading} />
    </div>
  );
}
