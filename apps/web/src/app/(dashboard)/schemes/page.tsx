'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileSpreadsheet, Loader2, Plus, Search, Layers } from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { useDebounce } from '@/hooks/use-debounce';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomerPagination } from '@/components/customers/customer-pagination';
import { SchemeCard, type SchemeSummary } from '@/components/schemes/scheme-card';
import { cn } from '@/lib/utils';

type FilterTab = 'ALL' | 'ACTIVE' | 'DRAFT' | 'COMPLETED';
const SCHEMES_PAGE_LIMIT = 20;

export default function SchemesDirectoryPage() {
  const t = useTranslations('schemes');
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = React.useState<FilterTab>('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounce(searchTerm.trim(), 300);

  React.useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch]);

  const queryParams = React.useMemo(() => {
    const params: { status?: any; search?: string; page: number; limit: number } = {
      page,
      limit: SCHEMES_PAGE_LIMIT,
    };
    if (activeTab !== 'ALL') {
      params.status = activeTab;
    }
    if (debouncedSearch) {
      params.search = debouncedSearch;
    }
    return params;
  }, [activeTab, debouncedSearch, page]);

  const { data: schemesResponse, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.schemes.list(queryParams),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<{
        data: SchemeSummary[];
        total: number;
        page: number;
        limit: number;
        totalPages?: number;
      }>(
        apiClient.GET('/api/v1/chits', {
          params: { query: queryParams },
          signal,
        })
      );
    },
    staleTime: 30_000,
  });

  const schemes = schemesResponse?.data || [];
  const totalSchemes = Number(schemesResponse?.total ?? schemes.length);
  const totalPages = Number(
    schemesResponse?.totalPages ?? Math.max(1, Math.ceil(totalSchemes / SCHEMES_PAGE_LIMIT)),
  );
  const isSuperAdmin = user?.roles?.includes('SUPER_ADMIN');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-initial border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs h-9"
            asChild
          >
            <Link href="/schemes/onboard">
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-400 shrink-0" />
              <span className="truncate">{t('onboardNotebook')}</span>
            </Link>
          </Button>

          {isSuperAdmin && (
            <Button
              size="sm"
              className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9"
              asChild
            >
              <Link href="/schemes/new">
                <Plus className="mr-1.5 h-4 w-4 shrink-0" />
                <span className="truncate">{t('newScheme')}</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Embedded In-Page Guardrail Banner: Rule #3 (4.00% Commission Freeze) */}
      <BusinessRuleBanner
        ruleNumber={3}
        title="Foreman Commission Locked at 4.00% (ADR-04 & Guardrail 3)"
        description="Foreman commission is legally and mathematically frozen at 4.00% upon scheme activation. Universal equal dividend is deducted across ALL members in that chit group."
        referencePath="/instructions?rule=3"
        defaultExpanded={false}
      />

      {/* Toolbar: Status Tabs & Search Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Status Filter Tabs */}
        <div className="w-full md:w-auto overflow-x-auto no-scrollbar py-0.5">
          <div className="inline-flex min-w-full sm:min-w-0 items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-xs shadow-sm">
            {(
              [
                { key: 'ALL', labelKey: 'tabAll' },
                { key: 'ACTIVE', labelKey: 'tabActive' },
                { key: 'DRAFT', labelKey: 'tabPlanned' },
                { key: 'COMPLETED', labelKey: 'tabCompleted' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'whitespace-nowrap shrink-0 rounded-lg px-3.5 py-1.5 font-semibold transition-all',
                  activeTab === tab.key
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                )}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-xs border-slate-800 bg-slate-900/90 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 rounded-xl"
          />
        </div>
      </div>

      {/* Schemes Grid or State */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 rounded-xl border border-slate-800 bg-slate-900/50 p-5 animate-pulse space-y-4"
            >
              <div className="h-5 w-32 bg-slate-800 rounded" />
              <div className="h-6 w-48 bg-slate-800 rounded" />
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div className="h-12 bg-slate-800 rounded" />
                <div className="h-12 bg-slate-800 rounded" />
              </div>
              <div className="h-8 bg-slate-800 rounded mt-4" />
            </div>
          ))}
        </div>
      ) : schemes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400 mb-3">
            <Layers className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">{t('emptyTitle')}</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">{t('emptyDesc')}</p>
          {isSuperAdmin && (
            <Button
              size="sm"
              className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              asChild
            >
              <Link href="/schemes/new">
                <Plus className="mr-1.5 h-4 w-4" />
                <span>{t('newScheme')}</span>
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {schemes.map((scheme) => (
              <SchemeCard key={scheme.id} scheme={scheme} />
            ))}
          </div>

          <CustomerPagination
            page={page}
            totalPages={totalPages}
            limit={SCHEMES_PAGE_LIMIT}
            total={totalSchemes}
            onPageChange={setPage}
            isLoading={isFetching}
          />
        </div>
      )}
    </div>
  );
}
