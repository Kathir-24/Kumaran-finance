'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  RotateCw,
  Server,
  XCircle,
  PauseCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface QueueStatusReportDto {
  queueName: string;
  isAvailable: boolean;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface RepeatableScheduleDto {
  key: string;
  name: string;
  cron: string;
  next?: number | null;
}

interface JobsStatusPanelProps {
  queueReports: QueueStatusReportDto[];
  schedules: RepeatableScheduleDto[];
  isLoadingQueues: boolean;
  isLoadingSchedules: boolean;
  onRefresh: () => void;
}

export function JobsStatusPanel({
  queueReports,
  schedules,
  isLoadingQueues,
  isLoadingSchedules,
  onRefresh,
}: JobsStatusPanelProps) {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');

  const formatNextRun = (timestamp?: number | null) => {
    if (!timestamp) return '—';
    try {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  const getQueueDescription = (queueName: string) => {
    if (queueName.includes('daily-maintenance')) return t('queues.dailyMaintenanceDesc');
    if (queueName.includes('reconciliation')) return t('queues.reconciliationDesc');
    if (queueName.includes('notification')) return t('queues.notificationsDesc');
    return queueName;
  };

  const getQueueDisplayName = (queueName: string) => {
    if (queueName.includes('daily-maintenance')) return t('queues.dailyMaintenance');
    if (queueName.includes('reconciliation')) return t('queues.reconciliation');
    if (queueName.includes('notification')) return t('queues.notifications');
    return queueName;
  };

  const getScheduleFrequency = (cron: string) => {
    if (cron === '1 0 * * *' || cron.includes('0 0') || cron.includes('1 0')) {
      return t('schedules.dailyArrears');
    }
    if (cron === '0 6 * * *') return t('schedules.settlementRecon');
    if (cron === '0 9 * * *') return t('schedules.preAuctionReminders');
    return cron;
  };

  return (
    <div className="space-y-6">
      {/* Section 1: BullMQ Production Queues Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              {t('queues.title')}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{t('queues.desc')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoadingQueues || isLoadingSchedules}
            className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-8"
          >
            <RotateCw
              className={cn(
                'h-3.5 w-3.5 mr-1.5 text-emerald-400',
                (isLoadingQueues || isLoadingSchedules) && 'animate-spin'
              )}
            />
            {t('refresh')}
          </Button>
        </div>

        {isLoadingQueues && queueReports.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-xl border border-slate-800 bg-slate-900/60 animate-pulse p-4"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {queueReports.map((q) => {
              const isAvailable = q.isAvailable;
              return (
                <Card
                  key={q.queueName}
                  className="border-slate-800 bg-slate-900/80 shadow-sm hover:border-slate-700 transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[11px] font-mono border font-medium px-2 py-0.5',
                          isAvailable
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        )}
                      >
                        {isAvailable ? (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {q.paused ? t('paused') : t('running')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            {t('redisDisconnected')}
                          </span>
                        )}
                      </Badge>

                      <span className="text-[10px] font-mono text-slate-500">{q.queueName}</span>
                    </div>

                    <CardTitle className="text-sm font-semibold text-slate-100 mt-2">
                      {getQueueDisplayName(q.queueName)}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 line-clamp-2">
                      {getQueueDescription(q.queueName)}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                      <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800/50">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                          {t('activeJobs')}
                        </span>
                        <p className="text-base font-bold text-sky-400 font-mono mt-0.5">
                          {q.active}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800/50">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                          {t('waitingJobs')}
                        </span>
                        <p className="text-base font-bold text-amber-400 font-mono mt-0.5">
                          {q.waiting}
                        </p>
                      </div>

                      <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800/50">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                          {t('failedJobs')}
                        </span>
                        <p
                          className={cn(
                            'text-base font-bold font-mono mt-0.5',
                            q.failed > 0 ? 'text-rose-400' : 'text-slate-400'
                          )}
                        >
                          {q.failed}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span>
                        {t('completedJobs')}:{' '}
                        <strong className="text-slate-200 font-mono">{q.completed}</strong>
                      </span>
                      <span>
                        {t('delayedJobs')}:{' '}
                        <strong className="text-slate-200 font-mono">{q.delayed}</strong>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Repeatable IST Cron Schedules */}
      <Card className="border-slate-800 bg-slate-900/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-400" />
                {t('schedules.title')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                {t('schedules.desc')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoadingSchedules && schedules.length === 0 ? (
            <div className="h-32 rounded-lg bg-slate-950/40 animate-pulse" />
          ) : schedules.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {t('schedules.noSchedules')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">{t('schedules.name')}</th>
                    <th className="py-2.5 px-3">{t('schedules.cron')}</th>
                    <th className="py-2.5 px-3">{t('schedules.frequency')}</th>
                    <th className="py-2.5 px-3">{t('schedules.nextRun')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {schedules.map((s) => (
                    <tr key={s.key} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-200 flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="font-sans">{s.name || s.key}</span>
                      </td>
                      <td className="py-2.5 px-3 text-amber-300">
                        <span className="rounded bg-slate-950 px-1.5 py-0.5 border border-slate-800">
                          {s.cron}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-sans">
                        {getScheduleFrequency(s.cron)}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400 font-sans">
                        {formatNextRun(s.next)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
