'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Clock,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient, getErrorMessage, unwrapApiResponse } from '@/lib/api-client';
import { TriggerResultAlert } from './trigger-result-alert';

interface ArrearsTriggerResult {
  jobId?: string;
  totalDuesChecked?: number;
  overdueCount?: number;
  newlyOverdueCount?: number;
  defaults3MonthsCount?: number;
  executionTimeMs?: number;
}

interface PreAuctionTriggerResult {
  jobId?: string;
  auctionsFound?: number;
  totalRemindersBroadcasted?: number;
}

interface ReconTriggerResult {
  jobId?: string;
  matchedCount?: number;
  ghostDropsResolvedCount?: number;
  exceptionsCount?: number;
}

interface JobTriggersPanelProps {
  isSuperAdmin: boolean;
  onJobExecuted?: () => void;
}

export function JobTriggersPanel({ isSuperAdmin, onJobExecuted }: JobTriggersPanelProps) {
  const t = useTranslations('jobs');

  // Arrears trigger state
  const [arrearsCutoff, setArrearsCutoff] = React.useState('');
  const [isRunningArrears, setIsRunningArrears] = React.useState(false);
  const [isEnqueuingArrears, setIsEnqueuingArrears] = React.useState(false);
  const [arrearsResult, setArrearsResult] = React.useState<ArrearsTriggerResult | null>(null);
  const [arrearsError, setArrearsError] = React.useState<string | null>(null);

  // Pre-auction trigger state
  const [auctionTargetDate, setAuctionTargetDate] = React.useState('');
  const [isRunningAuctionScan, setIsRunningAuctionScan] = React.useState(false);
  const [auctionScanResult, setAuctionScanResult] = React.useState<PreAuctionTriggerResult | null>(null);
  const [auctionScanError, setAuctionScanError] = React.useState<string | null>(null);

  // Reconciliation trigger state
  const [isRunningRecon, setIsRunningRecon] = React.useState(false);
  const [isEnqueuingRecon, setIsEnqueuingRecon] = React.useState(false);
  const [reconResult, setReconResult] = React.useState<ReconTriggerResult | null>(null);
  const [reconError, setReconError] = React.useState<string | null>(null);

  // Generic trigger executor
  const executeTrigger = async <TResult,>(
    setLoading: (l: boolean) => void,
    setError: (e: string | null) => void,
    setResult: (r: TResult | null) => void,
    apiFn: () => Promise<TResult>,
    fallbackMsg: string
  ) => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFn();
      setResult(res);
      onJobExecuted?.();
    } catch (err: unknown) {
      setError(getErrorMessage(err, fallbackMsg));
    } finally {
      setLoading(false);
    }
  };

  // 1. Run Daily Arrears Scan (Sync)
  const handleRunArrears = () =>
    executeTrigger(
      setIsRunningArrears,
      setArrearsError,
      setArrearsResult,
      () =>
        unwrapApiResponse<ArrearsTriggerResult>(
          apiClient.POST('/api/v1/jobs/run-daily-arrears', {
            params: { query: { cutoffDate: arrearsCutoff || undefined } },
          })
        ),
      'Failed to execute arrears scan'
    );

  // 1b. Enqueue Daily Arrears Scan (Async)
  const handleEnqueueArrears = () =>
    executeTrigger(
      setIsEnqueuingArrears,
      setArrearsError,
      setArrearsResult,
      () =>
        unwrapApiResponse<ArrearsTriggerResult>(
          apiClient.POST('/api/v1/jobs/enqueue-daily-arrears', {
            params: { query: { cutoffDate: arrearsCutoff || undefined } },
          })
        ),
      'Failed to enqueue arrears job'
    );

  // 2. Run Pre-Auction Scan
  const handleRunPreAuctionScan = () =>
    executeTrigger(
      setIsRunningAuctionScan,
      setAuctionScanError,
      setAuctionScanResult,
      () =>
        unwrapApiResponse<PreAuctionTriggerResult>(
          apiClient.POST('/api/v1/jobs/run-pre-auction-scan', {
            params: { query: { targetDate: auctionTargetDate || undefined } },
          })
        ),
      'Failed to execute pre-auction scan'
    );

  // 3. Run Reconciliation
  const handleRunRecon = () =>
    executeTrigger(
      setIsRunningRecon,
      setReconError,
      setReconResult,
      () =>
        unwrapApiResponse<ReconTriggerResult>(
          apiClient.POST('/api/v1/jobs/run-reconciliation', {
            body: { records: [] },
          })
        ),
      'Failed to execute settlement reconciliation'
    );

  // 3b. Enqueue Reconciliation
  const handleEnqueueRecon = () =>
    executeTrigger(
      setIsEnqueuingRecon,
      setReconError,
      setReconResult,
      () =>
        unwrapApiResponse<ReconTriggerResult>(
          apiClient.POST('/api/v1/jobs/enqueue-reconciliation', {
            body: { records: [] },
          })
        ),
      'Failed to enqueue reconciliation job'
    );

  return (
    <div className="space-y-6">
      {/* Super Admin Notice if unauthorized */}
      {!isSuperAdmin && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <strong className="font-semibold block">{t('triggers.superAdminOnly')}</strong>
            <p className="text-amber-200/80 mt-0.5">{t('triggers.superAdminHelp')}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Trigger Card 1: Daily Arrears & Default Tagging */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-400 shrink-0" />
                {t('triggers.arrearsTitle')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-1">
                {t('triggers.arrearsDesc')}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">
                  {t('triggers.cutoffDate')}
                </label>
                <Input
                  type="date"
                  value={arrearsCutoff}
                  onChange={(e) => setArrearsCutoff(e.target.value)}
                  disabled={!isSuperAdmin}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
                <p className="text-[10px] text-slate-500 mt-1">{t('triggers.cutoffDateHelp')}</p>
              </div>

              {arrearsError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-300">
                  {arrearsError}
                </div>
              )}

              <TriggerResultAlert
                result={arrearsResult}
                successMsg={t('triggers.executionSuccess')}
                enqueueMsg={t('triggers.enqueueSuccess')}
                fields={
                  arrearsResult && !arrearsResult.jobId
                    ? [
                        { label: t('triggers.totalDuesChecked'), value: arrearsResult.totalDuesChecked },
                        { label: t('triggers.overdueCount'), value: arrearsResult.overdueCount },
                        { label: t('triggers.newlyOverdueCount'), value: arrearsResult.newlyOverdueCount },
                        { label: t('triggers.defaults3Months'), value: arrearsResult.defaults3MonthsCount },
                        { label: t('triggers.executionDuration'), value: `${arrearsResult.executionTimeMs}ms` },
                      ]
                    : undefined
                }
              />
            </CardContent>
          </div>

          <div className="p-6 pt-0 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleRunArrears}
              disabled={!isSuperAdmin || isRunningArrears || isEnqueuingArrears}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs h-9"
            >
              <Play className="h-3.5 w-3.5 mr-1 shrink-0" />
              {isRunningArrears ? t('triggers.runningArrears') : t('triggers.runArrears')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEnqueueArrears}
              disabled={!isSuperAdmin || isRunningArrears || isEnqueuingArrears}
              className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 text-xs h-9"
            >
              <Send className="h-3 w-3 mr-1 text-amber-400 shrink-0" />
              {isEnqueuingArrears ? '...' : t('triggers.enqueueArrears')}
            </Button>
          </div>
        </Card>

        {/* Trigger Card 2: Pre-Auction Reminders Scan */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Send className="h-5 w-5 text-indigo-400 shrink-0" />
                {t('triggers.preAuctionTitle')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-1">
                {t('triggers.preAuctionDesc')}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">
                  {t('triggers.targetDate')}
                </label>
                <Input
                  type="date"
                  value={auctionTargetDate}
                  onChange={(e) => setAuctionTargetDate(e.target.value)}
                  disabled={!isSuperAdmin}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs h-9"
                />
                <p className="text-[10px] text-slate-500 mt-1">{t('triggers.targetDateHelp')}</p>
              </div>

              {auctionScanError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-300">
                  {auctionScanError}
                </div>
              )}

              <TriggerResultAlert
                result={auctionScanResult}
                successMsg={t('triggers.executionSuccess')}
                enqueueMsg={t('triggers.enqueueSuccess')}
                fields={
                  auctionScanResult
                    ? [
                        { label: t('triggers.auctionsFound'), value: auctionScanResult.auctionsFound },
                        {
                          label: t('triggers.remindersBroadcasted'),
                          value: auctionScanResult.totalRemindersBroadcasted,
                        },
                      ]
                    : undefined
                }
              />
            </CardContent>
          </div>

          <div className="p-6 pt-0">
            <Button
              type="button"
              size="sm"
              onClick={handleRunPreAuctionScan}
              disabled={!isSuperAdmin || isRunningAuctionScan}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs h-9"
            >
              <Play className="h-3.5 w-3.5 mr-1 shrink-0" />
              {isRunningAuctionScan ? t('triggers.runningPreAuction') : t('triggers.runPreAuction')}
            </Button>
          </div>
        </Card>

        {/* Trigger Card 3: Digital Payment Settlement Reconciliation */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
                {t('triggers.reconTitle')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-1">
                {t('triggers.reconDesc')}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-[11px] text-slate-400">
                <p>{t('triggers.reconDesc')}</p>
              </div>

              {reconError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-300">
                  {reconError}
                </div>
              )}

              <TriggerResultAlert
                result={reconResult}
                successMsg={t('triggers.executionSuccess')}
                enqueueMsg={t('triggers.enqueueSuccess')}
                fields={
                  reconResult && !reconResult.jobId
                    ? [
                        { label: t('triggers.matchedCount'), value: reconResult.matchedCount },
                        {
                          label: t('triggers.ghostDropsResolved'),
                          value: reconResult.ghostDropsResolvedCount,
                        },
                        { label: t('triggers.exceptionsCount'), value: reconResult.exceptionsCount },
                      ]
                    : undefined
                }
              />
            </CardContent>
          </div>

          <div className="p-6 pt-0 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleRunRecon}
              disabled={!isSuperAdmin || isRunningRecon || isEnqueuingRecon}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs h-9"
            >
              <Play className="h-3.5 w-3.5 mr-1 shrink-0" />
              {isRunningRecon ? t('triggers.runningRecon') : t('triggers.runRecon')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEnqueueRecon}
              disabled={!isSuperAdmin || isRunningRecon || isEnqueuingRecon}
              className="border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800 text-xs h-9"
            >
              <Send className="h-3 w-3 mr-1 text-emerald-400 shrink-0" />
              {isEnqueuingRecon ? '...' : t('triggers.enqueueRecon')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
