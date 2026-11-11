'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  Landmark,
  Layers,
  Network,
  Plus,
  Search,
} from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BranchTable, type BranchItem } from '@/components/branches/branch-table';
import { cn } from '@/lib/utils';

type FilterTab = 'ALL' | 'ACTIVE' | 'INACTIVE';

export default function BranchesPage() {
  const t = useTranslations('branches');
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = React.useState<FilterTab>('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const isSuperAdmin = Boolean(user?.roles?.includes('SUPER_ADMIN'));

  // Live Query
  const { data: branches = [], isLoading } = useQuery<BranchItem[]>({
    queryKey: queryKeys.branches.all,
    queryFn: async () => {
      return unwrapApiResponse<BranchItem[]>(
        apiClient.GET('/api/v1/branches', {
          params: { query: { activeOnly: 'false' } },
        })
      );
    },
    staleTime: 60_000,
  });

  // Client-side filtering & search
  const filteredBranches = React.useMemo(() => {
    return branches.filter((b) => {
      // Status filter
      if (activeTab === 'ACTIVE' && !b.isActive) return false;
      if (activeTab === 'INACTIVE' && b.isActive) return false;

      // Keyword search
      if (debouncedSearch) {
        const matchesCode = b.code.toLowerCase().includes(debouncedSearch);
        const matchesName = b.name.toLowerCase().includes(debouncedSearch);
        const matchesTamil = b.nameTamil?.toLowerCase().includes(debouncedSearch);
        const matchesPhone = b.phone.includes(debouncedSearch);
        const matchesAddress = b.address.toLowerCase().includes(debouncedSearch);

        return matchesCode || matchesName || matchesTamil || matchesPhone || matchesAddress;
      }

      return true;
    });
  }, [branches, activeTab, debouncedSearch]);

  // KPI Calculations
  const totalCount = branches.length;
  const activeCount = branches.filter((b) => b.isActive).length;
  const inactiveCount = totalCount - activeCount;
  const headOffice = branches.find((b) => b.code === 'PRD' || b.code === 'HO');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t('subtitle')}
          </p>
        </div>

        {isSuperAdmin && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-950 self-start sm:self-auto"
            asChild
          >
            <Link href="/branches/new">
              <Plus className="mr-1.5 h-4 w-4" />
              <span>{t('newBranch')}</span>
            </Link>
          </Button>
        )}
      </div>

      {/* 4 Pulse KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Branches */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">{t('kpiTotal')}</p>
              <h3 className="text-xl font-bold text-slate-100 mt-0.5">{totalCount}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiTotalDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Active Operations */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">{t('kpiActive')}</p>
              <h3 className="text-xl font-bold text-emerald-400 mt-0.5">{activeCount}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiActiveDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Head Office Anchor */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-400">{t('kpiHeadOffice')}</p>
              <h3 className="text-xs font-bold text-amber-300 mt-1 leading-snug break-words">
                {headOffice ? headOffice.name : t('defaultHeadOffice')}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiHeadOfficeDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Landmark className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Scalability Status */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">{t('kpiExpansion')}</p>
              <h3 className="text-xs font-bold text-purple-300 mt-1">{t('multiBranchBadge')}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiExpansionDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              <Network className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guardrail 1 & ADR-01 / ADR-02 Business Rule Banner */}
      <BusinessRuleBanner
        ruleNumber={1}
        title={t('rule1Title')}
        description={t('rule1Desc')}
        referencePath="/instructions?rule=1"
        defaultExpanded={false}
      />

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Segmented Filter Tabs */}
        <div className="inline-flex w-full sm:w-auto justify-between sm:justify-start overflow-x-auto scrollbar-none rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs shrink-0">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as FilterTab[]).map((tab) => {
            const count =
              tab === 'ALL'
                ? totalCount
                : tab === 'ACTIVE'
                ? activeCount
                : inactiveCount;
            const labelKey =
              tab === 'ALL'
                ? 'filterAll'
                : tab === 'ACTIVE'
                ? 'filterActive'
                : 'filterInactive';

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors shrink-0 whitespace-nowrap',
                  activeTab === tab
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {t(labelKey, { count })}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9 bg-slate-950 border-slate-800 text-xs h-9 text-slate-100 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Directory Table */}
      <BranchTable
        branches={filteredBranches}
        isLoading={isLoading}
        searchQuery={debouncedSearch}
        onClearSearch={() => setSearchTerm('')}
      />
    </div>
  );
}
