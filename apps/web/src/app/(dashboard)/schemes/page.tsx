'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileSpreadsheet, Loader2, Plus, Search, Layers } from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SchemeCard, type SchemeSummary } from '@/components/schemes/scheme-card';
import { cn } from '@/lib/utils';

type FilterTab = 'ALL' | 'ACTIVE' | 'DRAFT' | 'COMPLETED';

export default function SchemesDirectoryPage() {
  const t = useTranslations('schemes');
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = React.useState<FilterTab>('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryParams = React.useMemo(() => {
    const params: { status?: any; search?: string; limit: number } = { limit: 50 };
    if (activeTab !== 'ALL') {
      params.status = activeTab;
    }
    if (debouncedSearch) {
      params.search = debouncedSearch;
    }
    return params;
  }, [activeTab, debouncedSearch]);

  const { data: schemesResponse, isLoading } = useQuery({
    queryKey: queryKeys.schemes.list(queryParams),
    queryFn: async () => {
      return unwrapApiResponse<{
        data: SchemeSummary[];
        total: number;
        page: number;
        limit: number;
      }>(
        apiClient.GET('/api/v1/chits', {
          params: { query: queryParams },
        })
      );
    },
    staleTime: 30_000,
  });

  const schemes = schemesResponse?.data || [];
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

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            asChild
          >
            <Link href="/schemes/onboard">
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-400" />
              <span>{t('onboardNotebook')}</span>
            </Link>
          </Button>

          {isSuperAdmin && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              asChild
            >
              <Link href="/schemes/new">
                <Plus className="mr-1.5 h-4 w-4" />
                <span>{t('newScheme')}</span>
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
        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-xs shadow-sm">
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
                'rounded-lg px-3.5 py-1.5 font-semibold transition-all',
                activeTab === tab.key
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              )}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {schemes.map((scheme) => (
            <SchemeCard key={scheme.id} scheme={scheme} />
          ))}
        </div>
      )}
    </div>
  );
}
