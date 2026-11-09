'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Gavel,
  Layers,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import {
  AuctionSchemeSelector,
  type ChitGroupSummary,
} from '@/components/auctions/auction-scheme-selector';
import {
  AuctionMetricsCards,
  type AuctionScheduleItem,
} from '@/components/auctions/auction-metrics-cards';
import { AuctionScheduleTable } from '@/components/auctions/auction-schedule-table';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export default function AuctionsPage() {
  const t = useTranslations('auctions');
  const searchParams = useSearchParams();
  const initialGroupId = searchParams.get('group');

  const [selectedGroupId, setSelectedGroupId] = React.useState<string | undefined>(
    initialGroupId || undefined,
  );
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  // 1. Fetch all chit schemes
  const {
    data: schemesData,
    isLoading: isSchemesLoading,
    isError: isSchemesError,
  } = useQuery<{ data: ChitGroupSummary[] }>({
    queryKey: queryKeys.schemes.list(),
    queryFn: async () => {
      return unwrapApiResponse<{ data: ChitGroupSummary[] }>(
        apiClient.GET('/api/v1/chits' as any, {}),
      );
    },
  });

  const schemes = schemesData?.data || [];

  // Automatically select first scheme if none selected
  React.useEffect(() => {
    if (!selectedGroupId && schemes.length > 0) {
      setSelectedGroupId(schemes[0].id);
    }
  }, [schemes, selectedGroupId]);

  const activeScheme = schemes.find((s) => s.id === selectedGroupId) || schemes[0];

  // 2. Fetch auctions for the selected chit group
  const {
    data: auctions,
    isLoading: isAuctionsLoading,
    isError: isAuctionsError,
  } = useQuery<AuctionScheduleItem[]>({
    queryKey: queryKeys.auctions.list(activeScheme?.id),
    queryFn: async () => {
      if (!activeScheme?.id) return [];
      return unwrapApiResponse<AuctionScheduleItem[]>(
        apiClient.GET('/api/v1/auctions/group/{chitGroupId}' as any, {
          params: { path: { chitGroupId: activeScheme.id } },
        }),
      );
    },
    enabled: Boolean(activeScheme?.id),
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Gavel className="h-6 w-6 text-emerald-400" />
            <span>{t('title')}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t('subtitle')}
          </p>
        </div>
      </div>

      {/* Embedded Business Rule Banners: Guardrail 6 & Guardrail 5 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
        <BusinessRuleBanner
          ruleNumber={6}
          title={t('guardrail6BannerTitle')}
          description={t('guardrail6BannerDesc')}
          referencePath="/instructions?rule=6"
          className="h-full"
          defaultExpanded={false}
        />
        <BusinessRuleBanner
          ruleNumber={5}
          title={t('guardrail5BannerTitle')}
          description={t('guardrail5BannerDesc')}
          referencePath="/instructions?rule=5"
          className="h-full"
          defaultExpanded={false}
        />
      </div>

      {/* Loading state for schemes */}
      {isSchemesLoading && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      )}

      {/* Error state */}
      {isSchemesError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-6 text-center text-xs text-red-300 flex flex-col items-center gap-2">
          <AlertCircle className="h-6 w-6 text-red-400" />
          <span>Failed to load chit schemes for auctions console.</span>
        </div>
      )}

      {/* Empty State: No Schemes available */}
      {!isSchemesLoading && schemes.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-3">
          <Layers className="mx-auto h-10 w-10 text-slate-500" />
          <h3 className="text-base font-semibold text-white">{t('noSchemesAvailable')}</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">{t('noSchemesDesc')}</p>
          <Button size="sm" variant="outline" asChild className="border-slate-700 bg-slate-800 text-xs text-slate-200">
            <Link href="/schemes/new">
              <span>{t('goToSchemes')}</span>
            </Link>
          </Button>
        </div>
      )}

      {/* Main Console Content */}
      {!isSchemesLoading && activeScheme && (
        <div className="space-y-5">
          {/* Scheme Selector */}
          <AuctionSchemeSelector
            schemes={schemes}
            selectedGroupId={activeScheme.id}
            onSelectGroup={(groupId) => setSelectedGroupId(groupId)}
          />

          {/* Metrics & Boundary KPI Cards */}
          <AuctionMetricsCards
            scheme={activeScheme}
            auctions={auctions || []}
          />

          {/* Schedule & Lifecycle Table */}
          <AuctionScheduleTable
            scheme={activeScheme}
            auctions={auctions || []}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            isLoading={isAuctionsLoading}
          />
        </div>
      )}
    </div>
  );
}
