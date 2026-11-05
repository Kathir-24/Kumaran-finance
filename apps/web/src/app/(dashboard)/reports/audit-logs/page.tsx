'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { downloadCsv } from '@/lib/csv-export';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AuditLogKpiBar } from '@/components/reports/audit-log-kpi-bar';
import { AuditLogFilters } from '@/components/reports/audit-log-filters';
import { AuditLogTable, type AuditLogItem } from '@/components/reports/audit-log-table';
import { AuditDiffModal } from '@/components/reports/audit-diff-modal';
import {
  ShieldCheck,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Lock,
  ArrowLeft,
  UserCheck,
} from 'lucide-react';

interface StaffUserRaw {
  id: string;
  name: string;
  roles: string[];
}

export default function AuditLogsReportPage() {
  const t = useTranslations('reports.auditTrail');
  const user = useAuthStore((s) => s.user);

  // Filters state
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);

  // Diff inspection modal state
  const [activeDiffLog, setActiveDiffLog] = useState<AuditLogItem | null>(null);

  const isCustomer = user?.roles?.includes('CUSTOMER') && !user?.roles?.includes('SUPER_ADMIN');
  const hasAccess = Boolean(
    user?.roles?.some((r) =>
      ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR', 'CUSTOMER'].includes(r)
    )
  );

  // 1. Fetch Staff Users for Actor Filter Dropdown
  const { data: staffUsers = [] } = useQuery<StaffUserRaw[]>({
    queryKey: queryKeys.users.list({ limit: 100 }),
    queryFn: async () => {
      const res = await unwrapApiResponse<any>(
        apiClient.GET('/api/v1/users', {
          params: { query: { limit: 100 } },
        })
      );
      return res?.users || res || [];
    },
    enabled: hasAccess && !isCustomer,
  });

  // 2. Fetch Audit Logs with Query Filters
  const queryParams = {
    action: selectedAction === 'ALL' ? undefined : selectedAction,
    entityType: selectedEntity === 'ALL' ? undefined : selectedEntity,
    userId: selectedUserId === 'ALL' ? undefined : selectedUserId,
    fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
    toDate: toDate ? new Date(`${toDate}T23:59:59.999Z`).toISOString() : undefined,
    page,
    limit,
  };

  const {
    data: auditReport,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.reports.auditLogs(queryParams),
    queryFn: async () => {
      const res = await unwrapApiResponse<{
        pagination: {
          page: number;
          limit: number;
          totalRecords: number;
          totalPages: number;
        };
        logs: AuditLogItem[];
      }>(
        apiClient.GET('/api/v1/reports/audit-logs', {
          params: { query: queryParams },
        })
      );
      return res;
    },
    enabled: hasAccess,
  });

  const logs: AuditLogItem[] = auditReport?.logs || [];
  const pagination = auditReport?.pagination || {
    page: 1,
    limit: 50,
    totalRecords: 0,
    totalPages: 1,
  };

  // Summary Metrics calculations
  const isDualControl = (action: string) =>
    [
      'AUCTION_FINALIZED',
      'PAYMENT_REVERSED',
      'PAYMENT_REVERSAL_REJECTED',
      'CASH_HANDOVER_ACKNOWLEDGED',
      'PRIZE_PAYOUT_AUTHORIZED',
      'SAFETY_PROOF_VERIFIED',
      'UPI_CLAIM_VERIFIED',
    ].includes(action);

  const isFinancial = (action: string) =>
    [
      'PAYMENT_REVERSED',
      'CASH_HANDOVER_ACKNOWLEDGED',
      'PRIZE_PAYOUT_DISBURSED',
      'FINAL_MONTH_SETTLEMENT_EXECUTED',
      'DEF_SETTLEMENT_PROCESSED',
      'UPI_CLAIM_VERIFIED',
    ].includes(action);

  const dualCount = logs.filter((l) => isDualControl(l.action)).length;
  const financialCount = logs.filter((l) => isFinancial(l.action)).length;
  const distinctActors = new Set(logs.map((l) => l.performedBy?.id || 'system')).size;

  const handleResetFilters = () => {
    setSelectedAction('ALL');
    setSelectedEntity('ALL');
    setSelectedUserId('ALL');
    setFromDate('');
    setToDate('');
    setPage(1);
    setLimit(50);
  };

  // CSV Export Handler (RFC 4180 with UTF-8 BOM)
  const handleExportCsv = () => {
    if (logs.length === 0) return;

    const headers = [
      'Timestamp (IST)',
      'Action',
      'Entity Type',
      'Entity ID',
      'Actor Name',
      'Actor Roles',
      'Client IP',
      'Pre-Mutation State (Before)',
      'Post-Mutation State (After)',
    ];

    const rows = logs.map((l) => [
      new Date(l.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      l.action,
      l.entityType,
      l.entityId,
      l.performedBy?.name || 'System Automated',
      l.performedBy?.roles?.join('; ') || 'SYSTEM',
      l.ipAddress || '127.0.0.1',
      l.oldValue ? JSON.stringify(l.oldValue) : '',
      l.newValue ? JSON.stringify(l.newValue) : '',
    ]);

    const todayStr = new Date().toISOString().split('T')[0];
    downloadCsv({
      filename: `kumaran-chits-audit-trail-${todayStr}`,
      headers,
      rows,
    });
  };

  if (!hasAccess) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-12">
        <Card className="border-rose-900/50 bg-rose-950/20 text-center p-6">
          <CardHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-900/30 flex items-center justify-center text-rose-400 mb-2">
              <Lock className="w-6 h-6" />
            </div>
            <CardTitle className="text-white text-base">Access Restricted</CardTitle>
            <CardDescription className="text-rose-200/70 text-xs mt-1">
              Only authorized staff or verified subscribers can inspect forensic audit registers.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-white">{t('title')}</h1>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
                Tamper-Evident
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
            {t('printAudit')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="h-8 border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            {t('exportCsv')}
          </Button>
        </div>
      </div>

      {/* Statutory CA Forensic Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-200 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{t('statutoryBannerTitle')}</span>
        </div>
        <p className="leading-relaxed">{t('statutoryBannerDesc')}</p>
      </div>

      {/* Customer Self-Isolation Notice */}
      {isCustomer && (
        <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 text-xs text-blue-300 space-y-1">
          <div className="font-semibold flex items-center gap-2 text-blue-200">
            <UserCheck className="h-4 w-4 text-blue-400 shrink-0" />
            <span>{t('customerNoticeTitle')}</span>
          </div>
          <p>{t('customerNoticeDesc')}</p>
        </div>
      )}

      {/* KPI Summary Bar */}
      <AuditLogKpiBar
        totalEvents={pagination.totalRecords || logs.length}
        dualControlEvents={dualCount}
        financialEvents={financialCount}
        activeActors={distinctActors}
        isLoading={isLoading}
      />

      {/* Filter Controls (Hidden for Customer self-view) */}
      {!isCustomer && (
        <AuditLogFilters
          selectedAction={selectedAction}
          onActionChange={(val) => {
            setSelectedAction(val);
            setPage(1);
          }}
          selectedEntity={selectedEntity}
          onEntityChange={(val) => {
            setSelectedEntity(val);
            setPage(1);
          }}
          selectedUserId={selectedUserId}
          onUserIdChange={(val) => {
            setSelectedUserId(val);
            setPage(1);
          }}
          fromDate={fromDate}
          onFromDateChange={(val) => {
            setFromDate(val);
            setPage(1);
          }}
          toDate={toDate}
          onToDateChange={(val) => {
            setToDate(val);
            setPage(1);
          }}
          limit={limit}
          onLimitChange={(val) => {
            setLimit(val);
            setPage(1);
          }}
          onReset={handleResetFilters}
          staffUsers={staffUsers}
        />
      )}

      {/* Main Immutable Audit Table */}
      <AuditLogTable
        logs={logs}
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalRecords={pagination.totalRecords}
        onPageChange={(p) => setPage(p)}
        onInspectDiff={(log) => setActiveDiffLog(log)}
        isLoading={isLoading}
      />

      {/* Before / After State Diff Inspection Modal */}
      {activeDiffLog && (
        <AuditDiffModal
          isOpen={Boolean(activeDiffLog)}
          onClose={() => setActiveDiffLog(null)}
          action={activeDiffLog.action}
          entityType={activeDiffLog.entityType}
          entityId={activeDiffLog.entityId}
          timestamp={activeDiffLog.timestamp}
          oldValue={activeDiffLog.oldValue}
          newValue={activeDiffLog.newValue}
        />
      )}
    </div>
  );
}
