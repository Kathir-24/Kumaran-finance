'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { UserTable, type UserItem } from '@/components/users/user-table';
import { cn } from '@/lib/utils';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export default function UsersDirectoryPage() {
  const t = useTranslations('users');
  const currentUser = useAuthStore((s) => s.user);

  // Filter States
  const [activeTab, setActiveTab] = React.useState<StatusFilter>('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedRole, setSelectedRole] = React.useState<string>('ALL');
  const [selectedBranch, setSelectedBranch] = React.useState<string>('ALL');
  const [page, setPage] = React.useState(1);
  const limit = 20;

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const isSuperAdmin = Boolean(currentUser?.roles?.includes('SUPER_ADMIN'));

  // Fetch Branches for filter
  const { data: branches = [] } = useQuery<{ id: string; code: string; name: string }[]>({
    queryKey: queryKeys.branches.all,
    queryFn: async () => {
      return unwrapApiResponse(
        apiClient.GET('/api/v1/branches', {
          params: { query: { activeOnly: 'false' } },
        })
      );
    },
  });

  // Query Params for users
  const queryParams = React.useMemo(() => {
    const q: {
      search?: string;
      role?: any;
      branchId?: string;
      isActive?: string;
      page: number;
      limit: number;
    } = { page, limit };

    if (debouncedSearch) q.search = debouncedSearch;
    if (selectedRole !== 'ALL') q.role = selectedRole;
    if (selectedBranch !== 'ALL') q.branchId = selectedBranch;
    if (activeTab === 'ACTIVE') q.isActive = 'true';
    if (activeTab === 'INACTIVE') q.isActive = 'false';

    return q;
  }, [debouncedSearch, selectedRole, selectedBranch, activeTab, page]);

  // Live Query Users
  const { data: usersResponse, isLoading } = useQuery<{
    data: UserItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    queryKey: queryKeys.users.list(queryParams),
    queryFn: async () => {
      return unwrapApiResponse(
        apiClient.GET('/api/v1/users', {
          params: { query: queryParams },
        })
      );
    },
    staleTime: 30_000,
  });

  const users = usersResponse?.data || [];
  const total = usersResponse?.total || 0;
  const totalPages = usersResponse?.totalPages || 1;

  // KPI Calculations
  const activeCount = users.filter((u) => u.isActive).length;
  const partnerCount = users.filter((u) => u.roles.includes('SUPER_ADMIN')).length;
  const agentCount = users.filter((u) => u.roles.includes('COLLECTION_AGENT')).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('subtitle')}</p>
        </div>

        {isSuperAdmin && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-950 self-start sm:self-auto"
            asChild
          >
            <Link href="/users/new">
              <Plus className="mr-1.5 h-4 w-4" />
              <span>{t('onboardNewStaff')}</span>
            </Link>
          </Button>
        )}
      </div>

      {/* 4 Pulse KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">{t('kpiTotal')}</p>
              <h3 className="text-xl font-bold text-slate-100 mt-0.5">{total}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiTotalDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">{t('kpiActive')}</p>
              <h3 className="text-xl font-bold text-emerald-400 mt-0.5">{activeCount}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiActiveDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">{t('kpiPartners')}</p>
              <h3 className="text-xl font-bold text-purple-300 mt-0.5">{partnerCount}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiPartnersDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Shield className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/80 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-400">{t('kpiFieldAgents')}</p>
              <h3 className="text-xl font-bold text-indigo-300 mt-0.5">{agentCount}</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">{t('kpiFieldAgentsDesc')}</p>
            </div>
            <div className="rounded-xl p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Embedded ADR-18 & Permissions Banner */}
      <BusinessRuleBanner
        ruleNumber={10}
        title={t('adr18BannerTitle')}
        description={t('adr18BannerDesc')}
        referencePath="/instructions?rule=10"
        defaultExpanded={false}
      />

      {/* Filters Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-9 bg-slate-950 border-slate-800 text-xs h-9 text-slate-100 focus:border-emerald-500"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Dropdown */}
          <select
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">{t('filterRoleAll')}</option>
            <option value="SUPER_ADMIN">{t('roleSuperAdmin')}</option>
            <option value="BRANCH_MANAGER">{t('roleBranchManager')}</option>
            <option value="ACCOUNTANT">{t('roleAccountant')}</option>
            <option value="COLLECTION_AGENT">{t('roleCollectionAgent')}</option>
            <option value="AUDITOR">{t('roleAuditor')}</option>
          </select>

          {/* Branch Dropdown */}
          <select
            value={selectedBranch}
            onChange={(e) => {
              setSelectedBranch(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">{t('filterBranchAll')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} - {b.name}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as StatusFilter[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setPage(1);
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  activeTab === tab
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {tab === 'ALL'
                  ? t('filterStatusAll', { count: total })
                  : tab === 'ACTIVE'
                  ? t('statusActive', { count: activeCount })
                  : t('statusInactive', { count: total - activeCount })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <UserTable
        users={users}
        isLoading={isLoading}
        searchQuery={debouncedSearch}
        onClearSearch={() => setSearchTerm('')}
        currentUserId={currentUser?.id}
      />

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
          <div>
            {t('showingResults', {
              from: (page - 1) * limit + 1,
              to: Math.min(page * limit, total),
              total,
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs border-slate-800 bg-slate-900"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              <span>{t('prevPage')}</span>
            </Button>
            <span className="font-mono text-xs text-slate-300 px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 text-xs border-slate-800 bg-slate-900"
            >
              <span>{t('nextPage')}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
