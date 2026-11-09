'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Calculator,
  ArrowRight,
  Loader2,
  AlertCircle,
  FileCheck2,
} from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GridMemberRow, HistoricalAuctionState } from './notebook-entry-grid';

export interface NotebookValidationPanelProps {
  chitValue: number;
  durationMonths: number;
  onboardedAtMonth: number;
  members: GridMemberRow[];
  historicalWinners: HistoricalAuctionState[];
  physicalNotebookTotal: number;
  onPhysicalNotebookTotalChange: (val: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isLocked?: boolean;
}

export function NotebookValidationPanel({
  chitValue,
  durationMonths,
  onboardedAtMonth,
  members,
  historicalWinners,
  physicalNotebookTotal,
  onPhysicalNotebookTotalChange,
  onSubmit,
  isSubmitting,
  isLocked = false,
}: NotebookValidationPanelProps) {
  const t = useTranslations('onboarding');

  const baseInstallment = durationMonths > 0 ? Math.floor(chitValue / durationMonths) : 0;
  const foremanCommission = Math.floor((chitValue * 4) / 100);
  const maxCeilingDiscount = Math.floor(chitValue / 4);

  // 1. Calculate system total historical collections (sum of all PAID cells)
  const systemCalculatedTotal = React.useMemo(() => {
    let total = 0;

    // Month 1 collections
    const month1Net = baseInstallment;
    for (const m of members) {
      if (m.payments[1]?.status === 'PAID') {
        total += month1Net;
      }
    }

    // Months 2 to onboardedAtMonth - 1
    for (let month = 2; month < onboardedAtMonth; month++) {
      const auction = historicalWinners.find((w) => w.month === month);
      const discount = auction?.bidDiscount || 0;
      const totalDividend = Math.max(0, discount - foremanCommission);
      const divPerTicket = durationMonths > 0 ? Math.floor(totalDividend / durationMonths) : 0;
      const netDue = Math.max(0, baseInstallment - divPerTicket);

      for (const m of members) {
        if (m.payments[month]?.status === 'PAID') {
          total += netDue;
        }
      }
    }

    return total;
  }, [members, historicalWinners, baseInstallment, foremanCommission, durationMonths, onboardedAtMonth]);

  // Difference between system and physical notebook
  const discrepancy = systemCalculatedTotal - physicalNotebookTotal;
  const isBalanced = physicalNotebookTotal > 0 && discrepancy === 0;

  // 2. Validate all checklist items
  // Check 1: All N tickets assigned
  const unassignedCount = members.filter((m) => !m.customerId).length;
  const isRosterComplete = members.length === durationMonths && unassignedCount === 0;

  // Check 2: ADR-13 unique customer check
  const customerIdMap = new Map<string, number[]>();
  for (const m of members) {
    if (m.customerId) {
      const list = customerIdMap.get(m.customerId) || [];
      list.push(m.ticketNumber);
      customerIdMap.set(m.customerId, list);
    }
  }
  const duplicates = Array.from(customerIdMap.entries()).filter(([_, tickets]) => tickets.length > 1);
  const isAdr13Compliant = duplicates.length === 0;

  // Check 3: All past auctions have valid ticket and discount <= ceiling
  let pastAuctionsValid = true;
  let ceilingViolation = false;
  let invalidDiscount = false;
  let companyTicketWon = false;
  const winningTicketsSeen = new Set<number>();
  let duplicateWinner = false;

  for (let m = 2; m < onboardedAtMonth; m++) {
    const auc = historicalWinners.find((w) => w.month === m);
    if (!auc || !auc.ticketNumber) {
      pastAuctionsValid = false;
      break;
    }
    if (!auc.bidDiscount || auc.bidDiscount <= 0) {
      invalidDiscount = true;
      pastAuctionsValid = false;
    }
    if (auc.bidDiscount > maxCeilingDiscount) {
      ceilingViolation = true;
      pastAuctionsValid = false;
    }
    if (auc.ticketNumber === 1) {
      companyTicketWon = true;
      pastAuctionsValid = false;
    }
    if (winningTicketsSeen.has(auc.ticketNumber)) {
      duplicateWinner = true;
      pastAuctionsValid = false;
    }
    winningTicketsSeen.add(auc.ticketNumber);
  }

  const isAllValid =
    isRosterComplete &&
    isAdr13Compliant &&
    pastAuctionsValid &&
    !ceilingViolation &&
    !invalidDiscount &&
    !companyTicketWon &&
    !duplicateWinner &&
    isBalanced;

  return (
    <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-400" />
            <span>{t('step3Title')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('step3Desc')}</p>
        </div>

        <Badge variant={isBalanced ? 'paid' : 'unpaid'} className="gap-1.5 py-1 px-3">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{isBalanced ? t('balancedSuccess') : t('balancingGuardRequired')}</span>
        </Badge>
      </div>

      {/* Balancing Input & Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Physical Notebook Total Input */}
        <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-3.5">
          <label className="text-xs font-semibold text-slate-300">
            {t('physicalNotebookTotalLabel')} <span className="text-rose-400">*</span>
          </label>
          <Input
            type="number"
            value={physicalNotebookTotal || ''}
            onChange={(e) => onPhysicalNotebookTotalChange(parseInt(e.target.value || '0', 10))}
            placeholder="e.g. 450000"
            disabled={isLocked}
            className="text-sm font-mono font-bold text-amber-300 bg-slate-900 border-slate-700"
          />
          <p className="text-[11px] text-slate-400">{t('physicalNotebookTotalHelp')}</p>
        </div>

        {/* System Transcribed Total Display */}
        <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-3.5">
          <span className="text-xs font-semibold text-slate-300 block">
            {t('systemCalculatedTotalLabel')}
          </span>
          <div className="text-lg font-mono font-bold text-emerald-400 pt-1">
            {formatRupee(systemCalculatedTotal)}
          </div>
          <p className="text-[11px] text-slate-400">{t('sumOfPaidCellsHelp', { prevMonth: onboardedAtMonth - 1 })}</p>
        </div>

        {/* Difference / Diagnostic Box */}
        <div
          className={cn(
            'space-y-1.5 rounded-lg border p-3.5 transition-colors',
            isBalanced
              ? 'border-emerald-500/40 bg-emerald-950/20'
              : 'border-rose-500/40 bg-rose-950/20'
          )}
        >
          <span className="text-xs font-semibold text-slate-300 block">
            {t('discrepancyLabel')}
          </span>
          <div
            className={cn(
              'text-lg font-mono font-bold pt-1',
              isBalanced ? 'text-emerald-400' : 'text-rose-400'
            )}
          >
            {formatRupee(Math.abs(discrepancy))} {discrepancy !== 0 && (discrepancy > 0 ? t('systemHigher') : t('notebookHigher'))}
          </div>
          <p className="text-[11px] text-slate-400">
            {isBalanced ? t('balancedSuccess') : t('mustBeZero')}
          </p>
        </div>
      </div>

      {/* Validation Checklist */}
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-2.5">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          {t('checklistTitle')}
        </h4>

        {/* Item 1: Roster complete */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
          <span className="text-slate-300 flex items-center gap-2">
            {isRosterComplete ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{t('rosterAllocated', { count: durationMonths })}</span>
          </span>
          <span className={isRosterComplete ? 'text-emerald-400' : 'text-rose-400'}>
            {isRosterComplete ? t('rosterCompleteBadge', { count: durationMonths }) : t('rosterUnassignedBadge', { count: unassignedCount })}
          </span>
        </div>

        {/* Item 2: ADR-13 Unique customer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
          <span className="text-slate-300 flex items-center gap-2">
            {isAdr13Compliant ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{t('adr13Label')}</span>
          </span>
          <span className={isAdr13Compliant ? 'text-emerald-400' : 'text-rose-400 font-semibold'}>
            {isAdr13Compliant ? t('adr13CompliantBadge') : t('adr13ViolationBadge', { count: duplicates.length })}
          </span>
        </div>

        {/* Item 3: Past auctions valid */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
          <span className="text-slate-300 flex items-center gap-2">
            {pastAuctionsValid && !ceilingViolation && !invalidDiscount && !companyTicketWon && !duplicateWinner ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>
              {t('guardrail6Checklist', { ceiling: formatRupee(maxCeilingDiscount) })}
            </span>
          </span>
          <span
            className={
              pastAuctionsValid && !ceilingViolation && !invalidDiscount && !companyTicketWon && !duplicateWinner
                ? 'text-emerald-400'
                : 'text-rose-400'
            }
          >
            {ceilingViolation
              ? t('ceilingExceededBadge')
              : invalidDiscount
              ? 'Enter Positive Discount'
              : companyTicketWon
              ? 'Ticket #1 Cannot Bid'
              : duplicateWinner
              ? 'Duplicate Winner'
              : pastAuctionsValid
              ? t('validDiscountsBadge')
              : 'Incomplete'}
          </span>
        </div>

        {/* Item 4: Balancing match */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
          <span className="text-slate-300 flex items-center gap-2">
            {isBalanced ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{t('guardrail8Checklist')}</span>
          </span>
          <span className={isBalanced ? 'text-emerald-400' : 'text-rose-400'}>
            {isBalanced ? t('balancedBadge') : t('discrepancyBadge', { diff: formatRupee(Math.abs(discrepancy)) })}
          </span>
        </div>
      </div>

      {/* Submission Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-slate-800">
        <div className="text-xs text-slate-400">
          <p className="flex items-center gap-1.5 font-medium text-slate-300">
            <FileCheck2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span>Maker-Checker Governance (Guardrail 10)</span>
          </p>
          <p className="mt-0.5">
            Onboarding submits scheme in <span className="text-amber-400 font-semibold">DRAFT</span> status. An independent Partner Checker must confirm & activate.
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          disabled={!isAllValid || isSubmitting || isLocked}
          onClick={onSubmit}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shrink-0 shadow-lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('submitting')}</span>
            </>
          ) : (
            <>
              <span>{t('submitMakerButton')}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
