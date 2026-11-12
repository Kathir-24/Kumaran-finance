'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Building,
  Calendar,
  FileCheck2,
  Loader2,
  Lock,
  Plus,
  Sparkles,
} from 'lucide-react';
import { formatRupee, parseWholeRupees } from '@kumaran/api-client';
import { apiClient, unwrapApiResponse, KumaranApiError, getErrorMessage } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { toSafeIsoDate, getDefaultStartDate, projectEndDate } from '@/lib/date-utils';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SchemeMathPreview } from './scheme-math-preview';

interface PresetScheme {
  label: string;
  chitValue: number;
  durationMonths: number;
}

const PRESETS: PresetScheme[] = [
  { label: '₹1 Lakh / 20M', chitValue: 100000, durationMonths: 20 },
  { label: '₹2 Lakh / 20M', chitValue: 200000, durationMonths: 20 },
  { label: '₹5 Lakh / 20M', chitValue: 500000, durationMonths: 20 },
  { label: '₹10 Lakh / 25M', chitValue: 1000000, durationMonths: 25 },
];

export function SchemeForm() {
  const t = useTranslations('schemes');
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);

  // Form State
  const [groupCode, setGroupCode] = React.useState('');
  const [groupName, setGroupName] = React.useState('');
  const [groupNameTamil, setGroupNameTamil] = React.useState('');
  const [chitValueStr, setChitValueStr] = React.useState('100000');
  const [durationMonthsStr, setDurationMonthsStr] = React.useState('20');
  const [startDate, setStartDate] = React.useState(getDefaultStartDate);
  const [endDate, setEndDate] = React.useState(() => projectEndDate(getDefaultStartDate(), 20));
  const [sanctionOrderNumber, setSanctionOrderNumber] = React.useState('');
  const [sanctionDate, setSanctionDate] = React.useState('');
  const [selectedBranchId, setSelectedBranchId] = React.useState(activeBranchId || user?.branchId || '');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Auto-project end date when start date or duration changes
  const handleStartDateChange = (newStart: string) => {
    setStartDate(newStart);
    const duration = Number(durationMonthsStr) || 20;
    setEndDate(projectEndDate(newStart, duration));
  };

  const handleDurationChange = (newDurationStr: string) => {
    setDurationMonthsStr(newDurationStr);
    const duration = Number(newDurationStr) || 20;
    if (startDate) {
      setEndDate(projectEndDate(startDate, duration));
    }
  };

  // Quick preset applicator
  const applyPreset = (preset: PresetScheme) => {
    setChitValueStr(String(preset.chitValue));
    setDurationMonthsStr(String(preset.durationMonths));
    if (!groupCode) {
      const codeSuffix = `${Math.floor(preset.chitValue / 100000)}L-${preset.durationMonths}M-01`;
      setGroupCode(`KCA-${codeSuffix}`);
    }
    if (!groupName) {
      setGroupName(`₹${preset.chitValue / 100000} Lakh ${preset.durationMonths} Months Group A`);
    }
    if (startDate) {
      setEndDate(projectEndDate(startDate, preset.durationMonths));
    }
    setErrorMsg(null);
  };

  // Fetch branches for operating branch selector
  const { data: branchesResponse } = useQuery({
    queryKey: queryKeys.branches.list(),
    queryFn: async () => {
      return unwrapApiResponse<Array<{ id: string; name: string; code: string }>>(
        apiClient.GET('/api/v1/branches', {
          params: { query: { activeOnly: 'true' } },
        })
      );
    },
    staleTime: 60_000,
  });

  const branches = branchesResponse || [];

  // Parse numerical values
  const chitValue = parseWholeRupees(chitValueStr);
  const durationMonths = Number(durationMonthsStr) || 20;
  const isDivisible = chitValue > 0 && durationMonths >= 2 && chitValue % durationMonths === 0;

  // Mutation to create fresh chit scheme
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!groupCode.trim()) throw new Error('Scheme Group Code is required');
      if (!groupName.trim()) throw new Error('Scheme Name is required');
      if (chitValue <= 0) throw new Error('Total Chit Value must be a positive whole number');
      if (durationMonths < 2) throw new Error('Duration must be at least 2 months');
      if (!isDivisible) {
        throw new Error(
          t('divisibilityError', {
            value: formatRupee(chitValue).replace('₹', ''),
            duration: durationMonths,
          })
        );
      }
      const safeStartDate = toSafeIsoDate(startDate);
      const safeEndDate = toSafeIsoDate(endDate);
      if (!safeStartDate) throw new Error('Valid scheduled start date is required');
      if (!safeEndDate) throw new Error('Valid scheduled maturity date is required');

      const body = {
        groupCode: groupCode.trim().toUpperCase(),
        groupName: groupName.trim(),
        groupNameTamil: groupNameTamil.trim() || undefined,
        chitValue,
        durationMonths,
        totalTickets: durationMonths, // Strictly locked to duration
        startDate: safeStartDate,
        endDate: safeEndDate,
        sanctionOrderNumber: sanctionOrderNumber.trim() || undefined,
        sanctionDate: toSafeIsoDate(sanctionDate),
        branchId: selectedBranchId || undefined,
      };

      return unwrapApiResponse<{ id: string; groupCode: string }>(
        apiClient.POST('/api/v1/chits/new', { body })
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.list() });
      router.push(`/schemes/${data.id}`);
    },
    onError: (err: unknown) => {
      if (err instanceof KumaranApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(getErrorMessage(err, 'Failed to create chit scheme'));
      }
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column: Comprehensive Scheme Form (2 cols) */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="border-slate-800 bg-slate-900/90 shadow-md">
          <CardHeader className="pb-4 border-b border-slate-800/80">
            <CardTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-400" />
              <span>{t('createTitle')}</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t('createSubtitle')}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs font-bold">Error</AlertTitle>
                <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}

            {/* Quick Presets Bar */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span>{t('presetsLabel')}</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(preset)}
                    className="border-slate-700 bg-slate-950/60 hover:bg-slate-800 hover:border-emerald-500/50 text-xs text-slate-200"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Group Code & Operating Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {t('groupCodeLabel')} *
                </label>
                <Input
                  type="text"
                  placeholder={t('groupCodePlaceholder')}
                  value={groupCode}
                  onChange={(e) => {
                    setGroupCode(e.target.value.toUpperCase());
                    setErrorMsg(null);
                  }}
                  className="font-mono text-xs uppercase border-slate-700 bg-slate-950 text-emerald-400 font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Building className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('selectBranchLabel')}</span>
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Default Branch (Head Office - Perundurai)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scheme Names: English & Tamil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {t('groupNameEnLabel')} *
                </label>
                <Input
                  type="text"
                  placeholder={t('groupNameEnPlaceholder')}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="text-xs border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {t('groupNameTaLabel')}
                </label>
                <Input
                  type="text"
                  placeholder={t('groupNameTaPlaceholder')}
                  value={groupNameTamil}
                  onChange={(e) => setGroupNameTamil(e.target.value)}
                  className="text-xs font-tamil border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>
            </div>

            {/* Financial Parameters: Chit Value & Duration Months */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {t('chitValueLabel')} (₹ Whole Rupees) *
                </label>
                <Input
                  type="number"
                  min="1000"
                  step="1000"
                  value={chitValueStr}
                  onChange={(e) => {
                    setChitValueStr(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="font-mono text-xs border-slate-700 bg-slate-950 text-slate-100 font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {t('durationLabel')} & Total Tickets *
                </label>
                <Input
                  type="number"
                  min="2"
                  max="100"
                  step="1"
                  value={durationMonthsStr}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="font-mono text-xs border-slate-700 bg-slate-950 text-slate-100 font-bold"
                />
                <p className="text-[11px] text-slate-400">
                  {t('durationHelper')}
                </p>
              </div>
            </div>

            {/* Locked Statutory Invariants: 4.00% Commission & 1/4 Ceiling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-300">
                    {t('commissionLocked')}
                  </span>
                  <Lock className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <Input
                  disabled
                  value="4.00% (Permanently Frozen)"
                  className="text-xs font-mono font-bold bg-slate-950/80 border-indigo-500/40 text-indigo-300 cursor-not-allowed"
                />
                <p className="text-[10px] text-indigo-400/80">
                  {t('commissionLockedNotice')}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-indigo-300">
                  {t('ceilingDiscount')}
                </span>
                <Input
                  disabled
                  value={`${formatRupee(Math.floor(chitValue / 4))} (Fixed 25.00%)`}
                  className="text-xs font-mono font-bold bg-slate-950/80 border-indigo-500/40 text-indigo-300 cursor-not-allowed"
                />
                <p className="text-[10px] text-indigo-400/80">
                  {t('ceilingNotice')}
                </p>
              </div>
            </div>

            {/* Dates: Start Date & Projected End Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('startDateLabel')} *</span>
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="text-xs border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('endDateLabel')} *</span>
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>
            </div>

            {/* Optional Prior Sanction Order Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <FileCheck2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('sanctionOrderLabel')}</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. ROC/ERD/CHIT/2026/045"
                  value={sanctionOrderNumber}
                  onChange={(e) => setSanctionOrderNumber(e.target.value)}
                  className="font-mono text-xs border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('sanctionDateLabel')}</span>
                </label>
                <Input
                  type="date"
                  value={sanctionDate}
                  onChange={(e) => setSanctionDate(e.target.value)}
                  className="text-xs border-slate-700 bg-slate-950 text-slate-100"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={createMutation.isPending}
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!isDivisible || !groupCode.trim() || !groupName.trim() || createMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('creating')}
                  </>
                ) : (
                  <>
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t('submitCreate')}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Live Math & Financial Invariants Preview */}
      <div className="space-y-6">
        <SchemeMathPreview
          chitValue={chitValue}
          durationMonths={durationMonths}
        />
      </div>
    </div>
  );
}
