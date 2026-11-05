'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Download,
  Filter,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/query-keys';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { useAuthStore, type AuthState } from '@/stores/auth-store';
import { downloadCsv } from '@/lib/csv-export';
import { DefaulterItem, DefaulterKpiBar } from '@/components/reports/defaulter-kpi-bar';
import { DefaulterAnalysisTable } from '@/components/reports/defaulter-analysis-table';
import { cn } from '@/lib/utils';

export default function DefaultersRegisterPage() {
  const t = useTranslations('reports.defaulters');
  const tCommon = useTranslations('common');

  const user = useAuthStore((s: AuthState) => s.user);
  const activeBranchId = useAuthStore((s: AuthState) => s.activeBranchId);
  const roles = user?.roles || [];
  const hasAccess = roles.some((r: string) =>
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT', 'AUDITOR'].includes(r)
  );
  const isSuperAdminOrAccountant = roles.some((r: string) =>
    ['SUPER_ADMIN', 'ACCOUNTANT'].includes(r)
  );

  // Filter States
  const [minArrears, setMinArrears] = React.useState<number>(1);
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>(activeBranchId || '');
  const [page, setPage] = React.useState<number>(1);
  const limit = 20;

  // 1. Fetch Company Branches for Filter
  const { data: branches = [] } = useQuery({
    queryKey: queryKeys.branches.list({ activeOnly: true }),
    queryFn: async () => {
      const res = await unwrapApiResponse<Array<{ id: string; name: string; code: string }>>(
        apiClient.GET('/api/v1/branches', { params: { query: { activeOnly: 'true' } } })
      );
      return res || [];
    },
    enabled: isSuperAdminOrAccountant,
  });

  // 2. Fetch Chit Schemes for Filter
  const { data: schemes = [] } = useQuery<Array<{ id: string; groupCode: string; groupName: string }>>({
    queryKey: queryKeys.schemes.list(),
    queryFn: async () => {
      const res = await unwrapApiResponse<any>(
        apiClient.GET('/api/v1/chits')
      );
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    },
    enabled: hasAccess,
  });

  // 3. Fetch Defaulters Report
  const { data: reportData, isLoading } = useQuery({
    queryKey: queryKeys.reports.defaulters({
      chitGroupId: selectedGroupId || undefined,
      minArrearsMonths: minArrears,
      branchId: selectedBranchId || undefined,
      page,
      limit,
    }),
    queryFn: async () => {
      const res = await unwrapApiResponse<any>(
        apiClient.GET('/api/v1/reports/defaulters', {
          params: {
            query: {
              chitGroupId: selectedGroupId || undefined,
              minArrearsMonths: minArrears,
              branchId: selectedBranchId || undefined,
              page,
              limit,
            },
          },
        })
      );
      return res;
    },
    enabled: hasAccess,
  });

  const defaulters: DefaulterItem[] = reportData?.defaulters || [];
  const pagination = reportData?.pagination || { page: 1, totalPages: 1, totalRecords: 0 };

  // Handle CSV Export
  const handleExportCsv = () => {
    if (defaulters.length === 0) return;

    const rows: (string | number)[][] = defaulters.map((d) => [
      d.customerCode,
      d.customerName,
      d.phone,
      d.groupCode,
      `#${d.ticketNumber}`,
      d.consecutiveUnpaidMonths,
      d.riskCategory,
      d.eligibleForRemovalRights ? 'YES (ADR-07)' : 'NO',
      d.totalArrearsAmount,
      d.unpaidDues.length,
    ]);

    downloadCsv({
      filename: `${t('exportFilename')}_${new Date().toISOString().split('T')[0]}`,
      headers: [
        'Customer Code',
        'Customer Name',
        'Phone',
        'Chit Group',
        'Ticket #',
        'Consecutive Unpaid Months',
        'Risk Category',
        'ADR-07 Removal Eligible',
        'Total Arrears (INR)',
        'Unpaid Installments Count',
      ],
      rows,
    });
  };

  if (!hasAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-white">Access Restricted</h2>
              <p className="text-sm text-rose-200/90 mt-1">
                Only authorized office staff, collection agents, and auditors can view defaulter registers.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm" className="border-rose-500/30 text-rose-200">
              <Link href="/reports">{tCommon('back')}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400 print:hidden">
        <Link href="/" className="hover:text-slate-200 transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link href="/reports" className="hover:text-slate-200 transition-colors">
          Reports
        </Link>
        <span>/</span>
        <span className="text-white font-medium">Defaulters & Arrears Register</span>
      </nav>

      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-sm">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{t('title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Branch Filter (Super Admin / Accountant) */}
          {isSuperAdminOrAccountant && branches.length > 0 && (
            <div className="relative min-w-[150px]">
              <select
                aria-label={t('filterBranch')}
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Scheme Filter */}
          <div className="relative min-w-[170px]">
            <select
              aria-label={t('filterScheme')}
              value={selectedGroupId}
              onChange={(e) => {
                setSelectedGroupId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="">{t('allSchemes')}</option>
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.groupCode} — {s.groupName}
                </option>
              ))}
            </select>
          </div>

          {/* Export CSV Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={defaulters.length === 0}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white text-xs h-9 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('exportCsv')}</span>
          </Button>
        </div>
      </div>

      {/* Arrears Risk Category Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800 w-fit print:hidden">
        <button
          type="button"
          onClick={() => {
            setMinArrears(1);
            setPage(1);
          }}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
            minArrears === 1 ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-white"
          )}
        >
          {t('tabAll')}
        </button>
        <button
          type="button"
          onClick={() => {
            setMinArrears(2);
            setPage(1);
          }}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
            minArrears === 2 ? "bg-amber-600/30 text-amber-200 border border-amber-500/30 shadow-sm" : "text-slate-400 hover:text-white"
          )}
        >
          {t('tab2Months')}
        </button>
        <button
          type="button"
          onClick={() => {
            setMinArrears(3);
            setPage(1);
          }}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
            minArrears === 3 ? "bg-rose-600/30 text-rose-200 border border-rose-500/40 shadow-sm" : "text-slate-400 hover:text-white"
          )}
        >
          {t('tab3Months')}
        </button>
      </div>

      {/* Risk KPI Telemetry Bar */}
      <DefaulterKpiBar defaulters={defaulters} />

      {/* Defaulters Directory Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-sm">
          Loading defaulters & arrears telemetry...
        </div>
      ) : (
        <div className="space-y-4">
          <DefaulterAnalysisTable defaulters={defaulters} />

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 print:hidden">
              <span>{t('pagination', { page: pagination.page, pages: pagination.totalPages, total: pagination.totalRecords })}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 border-slate-700 text-slate-300"
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 border-slate-700 text-slate-300"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
