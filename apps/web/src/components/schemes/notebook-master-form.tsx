'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  Calendar,
  Sparkles,
  Lock,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toSafeIsoDate, projectEndDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

export interface MasterSchemeState {
  groupCode: string;
  groupName: string;
  groupNameTamil: string;
  chitValue: number;
  durationMonths: number;
  totalTickets: number;
  onboardedAtMonth: number;
  startDate: string;
  endDate: string;
  sanctionOrderNumber: string;
  sanctionDate: string;
  branchId: string;
}

interface PresetScheme {
  label: string;
  chitValue: number;
  durationMonths: number;
  intakeMonth: number;
}

const ONBOARD_PRESETS: PresetScheme[] = [
  { label: '₹1 Lakh / 20M (Intake M7)', chitValue: 100000, durationMonths: 20, intakeMonth: 7 },
  { label: '₹2 Lakh / 20M (Intake M5)', chitValue: 200000, durationMonths: 20, intakeMonth: 5 },
  { label: '₹5 Lakh / 20M (Intake M6)', chitValue: 500000, durationMonths: 20, intakeMonth: 6 },
  { label: '₹10 Lakh / 25M (Intake M8)', chitValue: 1000000, durationMonths: 25, intakeMonth: 8 },
];

export interface NotebookMasterFormProps {
  state: MasterSchemeState;
  onChange: (patch: Partial<MasterSchemeState>) => void;
  branches: Array<{ id: string; name: string; branchCode: string }>;
  isLocked?: boolean;
}

export function NotebookMasterForm({
  state,
  onChange,
  branches,
  isLocked = false,
}: NotebookMasterFormProps) {
  const t = useTranslations('onboarding');
  const tSchemes = useTranslations('schemes');

  // Mathematical calculations
  const isDivisible = state.durationMonths > 0 && state.chitValue % state.durationMonths === 0;
  const baseInstallment = isDivisible ? Math.floor(state.chitValue / state.durationMonths) : 0;
  const foremanCommission = Math.floor((state.chitValue * 4) / 100);
  const ceilingDiscount = Math.floor(state.chitValue / 4);

  const applyPreset = (preset: PresetScheme) => {
    if (isLocked) return;
    const projected = projectEndDate(state.startDate || new Date().toISOString(), preset.durationMonths);
    onChange({
      chitValue: preset.chitValue,
      durationMonths: preset.durationMonths,
      totalTickets: preset.durationMonths,
      onboardedAtMonth: preset.intakeMonth,
      groupName: `₹${(preset.chitValue / 100000).toFixed(0)} Lakh ${preset.durationMonths} Months Ongoing Group (Intake M${preset.intakeMonth})`,
      endDate: projected,
    });
  };

  const handleStartDateChange = (val: string) => {
    const safeDate = toSafeIsoDate(val);
    if (safeDate) {
      const projected = projectEndDate(safeDate, state.durationMonths);
      onChange({ startDate: safeDate, endDate: projected });
    } else {
      onChange({ startDate: val });
    }
  };

  return (
    <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
      {/* 1. Header with quick presets */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-400" />
            <span>{t('step1Title')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('step1Desc')}</p>
        </div>

        {/* Quick Presets */}
        {!isLocked && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-400" />
              {t('presetsLabel')}
            </span>
            {ONBOARD_PRESETS.map((p) => {
              const active = state.chitValue === p.chitValue && state.durationMonths === p.durationMonths;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                    active
                      ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Grid of inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Group Code */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {tSchemes('schemeCode')} <span className="text-rose-400">*</span>
          </label>
          <Input
            value={state.groupCode}
            onChange={(e) => onChange({ groupCode: e.target.value.toUpperCase() })}
            placeholder="e.g. KCA-1L-20M-ONGOING-07"
            disabled={isLocked}
            className="text-xs uppercase font-mono tracking-wider bg-slate-950 border-slate-700"
          />
        </div>

        {/* Operating Branch */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
            <Building2 className="h-3 w-3 text-slate-400" />
            <span>{t('branchOfficeLabel')}</span>
          </label>
          <select
            value={state.branchId}
            onChange={(e) => onChange({ branchId: e.target.value })}
            disabled={isLocked}
            className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.branchCode})
              </option>
            ))}
          </select>
        </div>

        {/* Scheme Name English */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-slate-300">
            {tSchemes('groupNameEnLabel')} <span className="text-rose-400">*</span>
          </label>
          <Input
            value={state.groupName}
            onChange={(e) => onChange({ groupName: e.target.value })}
            placeholder="e.g. ₹1 Lakh 20 Months Ongoing Group (Intake Month 7)"
            disabled={isLocked}
            className="text-xs bg-slate-950 border-slate-700"
          />
        </div>

        {/* Total Chit Value (V) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {tSchemes('chitValue')} <span className="text-rose-400">*</span>
          </label>
          <Input
            type="number"
            value={state.chitValue || ''}
            onChange={(e) => {
              const val = Math.max(0, parseInt(e.target.value || '0', 10));
              onChange({ chitValue: val });
            }}
            placeholder="100000"
            disabled={isLocked}
            className="text-xs font-mono bg-slate-950 border-slate-700"
          />
          <p className="text-[11px] text-emerald-400 font-mono">
            {formatRupee(state.chitValue)}
          </p>
        </div>

        {/* Duration / Total Tickets (N) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {tSchemes('duration')} (N) <span className="text-rose-400">*</span>
          </label>
          <Input
            type="number"
            min={2}
            max={120}
            value={state.durationMonths || ''}
            onChange={(e) => {
              const val = Math.max(2, parseInt(e.target.value || '2', 10));
              onChange({ durationMonths: val, totalTickets: val });
            }}
            disabled={isLocked}
            className="text-xs font-mono bg-slate-950 border-slate-700"
          />
          <span className="text-[11px] text-slate-400">
            Total Tickets: {state.durationMonths}
          </span>
        </div>

        {/* Active Digital Intake Month (M) */}
        <div className="space-y-1.5 bg-indigo-950/20 border border-indigo-500/30 rounded-lg p-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-indigo-300">
              Intake Month (M) <span className="text-rose-400">*</span>
            </label>
            <Badge variant="neutral" className="text-[10px] bg-indigo-500/20 text-indigo-300 border-indigo-500/40">
              Current
            </Badge>
          </div>
          <Input
            type="number"
            min={2}
            max={state.durationMonths}
            value={state.onboardedAtMonth || ''}
            onChange={(e) => {
              const val = Math.min(
                state.durationMonths,
                Math.max(2, parseInt(e.target.value || '2', 10))
              );
              onChange({ onboardedAtMonth: val });
            }}
            disabled={isLocked}
            className="text-xs font-mono font-bold text-indigo-200 bg-slate-950 border-indigo-500/40"
          />
          <p className="text-[10px] text-indigo-300/80 leading-tight">
            Historical: M1 to M{state.onboardedAtMonth - 1} | Forward: M{state.onboardedAtMonth} to M{state.durationMonths}
          </p>
        </div>

        {/* Original Start Date (Month 1 Date) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
            <Calendar className="h-3 w-3 text-slate-400" />
            <span>Month 1 Start Date</span> <span className="text-rose-400">*</span>
          </label>
          <Input
            type="date"
            value={state.startDate.split('T')[0] || ''}
            onChange={(e) => handleStartDateChange(e.target.value)}
            disabled={isLocked}
            className="text-xs bg-slate-950 border-slate-700 text-slate-100"
          />
        </div>

        {/* Sanction Order Number (Optional) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {tSchemes('sanctionOrderLabel')}
          </label>
          <Input
            value={state.sanctionOrderNumber}
            onChange={(e) => onChange({ sanctionOrderNumber: e.target.value })}
            placeholder="e.g. ROC/ERD/CHIT/2026/012"
            disabled={isLocked}
            className="text-xs bg-slate-950 border-slate-700"
          />
        </div>

        {/* Sanction Date (Optional) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {tSchemes('sanctionDateLabel')}
          </label>
          <Input
            type="date"
            value={state.sanctionDate.split('T')[0] || ''}
            onChange={(e) => onChange({ sanctionDate: toSafeIsoDate(e.target.value) || e.target.value })}
            disabled={isLocked}
            className="text-xs bg-slate-950 border-slate-700 text-slate-100"
          />
        </div>
      </div>

      {/* 3. Invariants quick glance bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs">
        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">{tSchemes('baseInstallment')} (Ibase)</span>
          <span className="font-mono font-semibold text-emerald-400">{formatRupee(baseInstallment)}</span>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
          <span className="text-[11px] text-slate-400 block flex items-center gap-1">
            <Lock className="h-3 w-3 text-amber-400" />
            <span>Foreman Commission (4%)</span>
          </span>
          <span className="font-mono font-semibold text-amber-300">{formatRupee(foremanCommission)}</span>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">{tSchemes('ceilingDiscount')} (V/4)</span>
          <span className="font-mono font-semibold text-rose-300">{formatRupee(ceilingDiscount)}</span>
        </div>
        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
          <span className="text-[11px] text-slate-400 block">Historical Auctions</span>
          <span className="font-mono font-semibold text-indigo-300">
            {Math.max(0, state.onboardedAtMonth - 2)} Months (M2 to M{state.onboardedAtMonth - 1})
          </span>
        </div>
      </div>
    </div>
  );
}
