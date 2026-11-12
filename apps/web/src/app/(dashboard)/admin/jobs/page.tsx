'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Activity,
  AlertTriangle,
  Bell,
  Cpu,
  ExternalLink,
  Layers,
  RotateCw,
  Server,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  JobsStatusPanel,
  type QueueStatusReportDto,
  type RepeatableScheduleDto,
} from '@/components/admin/jobs-status-panel';
import { JobTriggersPanel } from '@/components/admin/job-triggers-panel';
import {
  NotificationAuditTable,
  type NotificationLogItemDto,
} from '@/components/admin/notification-audit-table';
import { cn } from '@/lib/utils';

export default function BackgroundJobsPage() {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');

  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = Boolean(user?.roles?.includes('SUPER_ADMIN'));
  const isAuditor = Boolean(user?.roles?.includes('AUDITOR'));
  const hasAccess = isSuperAdmin || isAuditor;

  const [auditLimit, setAuditLimit] = React.useState(50);
  const [_lastRefreshedAt, setLastRefreshedAt] = React.useState<Date>(new Date());

  // 1. Fetch Queue Status Reports
  const {
    data: queueReports = [],
    isLoading: isLoadingQueues,
    refetch: refetchQueues,
  } = useQuery<QueueStatusReportDto[]>({
    queryKey: queryKeys.jobs.queueStatus(),
    queryFn: async () => {
      const res = await unwrapApiResponse<QueueStatusReportDto[]>(
        apiClient.GET('/api/v1/jobs/queue-status')
      );
      return res || [];
    },
    enabled: hasAccess,
    refetchInterval: 15000, // Auto-refresh telemetry every 15s
  });

  // 2. Fetch Repeatable Cron Schedules
  const {
    data: schedules = [],
    isLoading: isLoadingSchedules,
    refetch: refetchSchedules,
  } = useQuery<RepeatableScheduleDto[]>({
    queryKey: queryKeys.jobs.repeatableSchedules(),
    queryFn: async () => {
      const res = await unwrapApiResponse<RepeatableScheduleDto[]>(
        apiClient.GET('/api/v1/jobs/repeatable-schedules')
      );
      return res || [];
    },
    enabled: hasAccess,
    staleTime: 60000,
  });

  // 3. Fetch Notification Audit Logs
  const {
    data: auditLogs = [],
    isLoading: isLoadingAuditLogs,
    refetch: refetchAuditLogs,
  } = useQuery<NotificationLogItemDto[]>({
    queryKey: queryKeys.jobs.notificationAuditLogs({ limit: auditLimit }),
    queryFn: async () => {
      const res = await unwrapApiResponse<NotificationLogItemDto[]>(
        apiClient.GET('/api/v1/jobs/notification-audit-logs', {
          params: { query: { limit: auditLimit } },
        })
      );
      return res || [];
    },
    enabled: hasAccess,
  });

  const handleManualRefresh = async () => {
    setLastRefreshedAt(new Date());
    await Promise.all([refetchQueues(), refetchSchedules(), refetchAuditLogs()]);
  };

  // Aggregated KPI Metrics
  const isRedisAvailable = queueReports.length > 0 && queueReports.every((q) => q.isAvailable);
  const totalActiveJobs = queueReports.reduce((acc, q) => acc + (q.active || 0), 0);
  const totalWaitingJobs = queueReports.reduce((acc, q) => acc + (q.waiting || 0), 0);
  const totalFailedJobs = queueReports.reduce((acc, q) => acc + (q.failed || 0), 0);

  // Bull Board link from env or fallback
  const bullBoardUrl =
    process.env.NEXT_PUBLIC_BULL_BOARD_URL || 'http://localhost:3000/admin/queues';

  if (!hasAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-white">{t('accessDeniedTitle')}</h2>
              <p className="text-sm text-rose-200/90 mt-1">{t('accessDeniedDesc')}</p>
            </div>
          </div>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm" className="border-rose-500/30 text-rose-200">
              <Link href="/">{tCommon('back')}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/" className="hover:text-slate-200 transition-colors">
          {tCommon('home')}
        </Link>
        <span>/</span>
        <span className="text-slate-200 font-medium">{t('title')}</span>
      </nav>

      {/* Top Header & Telemetry Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">{t('title')}</h1>
              <p className="text-xs text-slate-400 mt-0.5">{t('subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Redis Live Connectivity Indicator */}
          <Badge
            variant="outline"
            className={cn(
              'px-2.5 py-1 text-xs font-mono font-medium border flex items-center gap-1.5 shrink-0',
              isRedisAvailable
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            )}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                isRedisAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              )}
            />
            {isRedisAvailable ? t('redisConnected') : t('redisDisconnected')}
          </Badge>

          {/* External Link to Bull Board */}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-8 gap-1.5 shrink-0"
          >
            <a href={bullBoardUrl} target="_blank" rel="noopener noreferrer">
              <span>{t('bullBoardLink')}</span>
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </a>
          </Button>

          {/* Manual Refresh Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isLoadingQueues}
            className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-8 shrink-0"
          >
            <RotateCw
              className={cn('h-3.5 w-3.5 mr-1 text-emerald-400', isLoadingQueues && 'animate-spin')}
            />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {/* 4 Pulse KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Redis Broker Health */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">{t('redisBrokerTitle')}</CardTitle>
            <Server className="h-4 w-4 text-emerald-400 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-white">
              {isRedisAvailable ? 'Port 6379' : 'Down'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('redisBrokerDesc')}</p>
          </CardContent>
        </Card>

        {/* KPI 2: Active Running Tasks */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">{t('activeJobs')}</CardTitle>
            <Cpu className="h-4 w-4 text-sky-400 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-sky-400">{totalActiveJobs}</div>
            <p className="text-[11px] text-slate-400 mt-1">{t('runningDesc')}</p>
          </CardContent>
        </Card>

        {/* KPI 3: Waiting / Queued Tasks */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">{t('waitingJobs')}</CardTitle>
            <Layers className="h-4 w-4 text-amber-400 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-amber-400">{totalWaitingJobs}</div>
            <p className="text-[11px] text-slate-400 mt-1">{t('waitingDesc')}</p>
          </CardContent>
        </Card>

        {/* KPI 4: Failed / Dead-Letter Tasks */}
        <Card className="border-slate-800 bg-slate-900/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-slate-400">{t('failedJobs')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-xl font-bold font-mono',
                totalFailedJobs > 0 ? 'text-rose-400' : 'text-slate-400'
              )}
            >
              {totalFailedJobs}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('failedDesc')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabbed Operations Interface */}
      <Tabs defaultValue="telemetry" className="space-y-4">
        <div className="overflow-x-auto scrollbar-none pb-1">
          <TabsList className="bg-slate-900/80 border border-slate-800 p-1 inline-flex w-max min-w-full sm:min-w-0 sm:w-auto">
            <TabsTrigger value="telemetry" className="text-xs gap-1.5 shrink-0 whitespace-nowrap">
              <Activity className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              {t('tabs.telemetry')}
            </TabsTrigger>
            <TabsTrigger value="triggers" className="text-xs gap-1.5 shrink-0 whitespace-nowrap">
              <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              {t('tabs.triggers')}
            </TabsTrigger>
            <TabsTrigger value="auditLogs" className="text-xs gap-1.5 shrink-0 whitespace-nowrap">
              <Bell className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              {t('tabs.auditLogs')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="telemetry" className="space-y-4">
          <JobsStatusPanel
            queueReports={queueReports}
            schedules={schedules}
            isLoadingQueues={isLoadingQueues}
            isLoadingSchedules={isLoadingSchedules}
            onRefresh={handleManualRefresh}
          />
        </TabsContent>

        <TabsContent value="triggers" className="space-y-4">
          <JobTriggersPanel isSuperAdmin={isSuperAdmin} onJobExecuted={handleManualRefresh} />
        </TabsContent>

        <TabsContent value="auditLogs" className="space-y-4">
          <NotificationAuditTable
            logs={auditLogs}
            isLoading={isLoadingAuditLogs}
            limit={auditLimit}
            onLimitChange={(newLimit) => setAuditLimit(newLimit)}
            onRefresh={handleManualRefresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
