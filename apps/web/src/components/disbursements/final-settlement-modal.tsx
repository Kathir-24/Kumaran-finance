'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatRupee } from '@/lib/currency';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore, hasAnyRole } from '@/stores/auth-store';
import { isSelfApproval } from '@kumaran/api-client';
import {
  computeForemanCommissionBigInt,
  toSafeWholeRupeeBigInt,
} from '@/components/auctions/auction-math.util';

export interface PreparedStage1SettlementMeta {
  disbursedAmount?: number | bigint | string | null;
  disbursementMode?: string | null;
  paymentReference?: string | null;
  preparedByUserId?: string | null;
}

export interface FinalSettlementChitTarget {
  id: string;
  groupCode: string;
  chitValue: number | bigint | string;
  durationMonths: number;
  baseInstallment?: number | bigint | string;
  foremanCommissionRate?: number | string | null;
  currentMonth?: number;
  preparedByUserId?: string | null;
  isSettlementPrepared?: boolean;
  preparedSettlement?: PreparedStage1SettlementMeta | null;
  tickets?: Array<{
    id: string;
    ticketNumber: number;
    isPrized: boolean;
    customer?: {
      fullName: string;
      customerCode: string;
      phone: string;
    };
  }>;
}

interface PreparedSettlementPreview {
  grossPrize?: number | bigint | string;
  commissionAmount?: number | bigint | string;
  finalMonthInstallment?: number | bigint | string;
  priorArrears?: number | bigint | string;
  netPayablePrize?: number | bigint | string;
  disbursedAmount?: number | bigint | string | null;
  disbursementMode?: string | null;
  paymentReference?: string | null;
  preparedByUserId?: string | null;
}

interface FinalSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  chitGroup: FinalSettlementChitTarget | null;
  onSuccess?: () => void;
}

export function FinalSettlementModal({
  isOpen,
  onClose,
  chitGroup,
  onSuccess,
}: FinalSettlementModalProps) {
  const t = useTranslations('disbursements');
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [disbursementMode, setDisbursementMode] = useState<string>('ACCOUNT_PAYEE_CHEQUE');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [disbursedAt, setDisbursedAt] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const unprizedTicket = chitGroup?.tickets?.find((ticket) => !ticket.isPrized);

  const grossPool = toSafeWholeRupeeBigInt(chitGroup?.chitValue, 0n);
  const durationBig = BigInt(Math.max(1, chitGroup?.durationMonths || 1));
  const commission = computeForemanCommissionBigInt(grossPool, chitGroup?.foremanCommissionRate);
  const estimatedBaseInstallment =
    chitGroup?.baseInstallment !== undefined && chitGroup?.baseInstallment !== null
      ? toSafeWholeRupeeBigInt(chitGroup.baseInstallment, grossPool / durationBig)
      : grossPool / durationBig;
  const maxPossiblePayout = grossPool >= commission ? grossPool - commission : 0n;

  const [isPrepared, setIsPrepared] = useState<boolean>(Boolean(chitGroup?.isSettlementPrepared));
  const [preparedByUserId, setPreparedByUserId] = useState<string | null>(
    chitGroup?.preparedByUserId ?? null,
  );
  const [preparedPreview, setPreparedPreview] = useState<PreparedSettlementPreview | null>(null);
  const [preparedSummary, setPreparedSummary] = useState<string | null>(null);

  // Guardrail 10 & 11 (SEC-A) & ADR-25 Two-Stage Dual Control
  const isPartner = hasAnyRole(user, ['PARTNER']);
  const canPrepareStage1 =
    hasAnyRole(user, ['BRANCH_MANAGER', 'ACCOUNTANT', 'PARTNER']);
  const isMaker = isSelfApproval(user?.id, { makerUserId: preparedByUserId });
  const canApproveStage2 = isPartner && !isMaker;

  useEffect(() => {
    if (isOpen && chitGroup) {
      const staged = chitGroup.preparedSettlement;
      setDisbursementMode(staged?.disbursementMode || 'ACCOUNT_PAYEE_CHEQUE');
      setPaymentReference(staged?.paymentReference || '');
      setDisbursedAt(new Date().toISOString().split('T')[0]);
      setNotes('');
      setErrorMsg(null);
      setIsPrepared(Boolean(chitGroup.isSettlementPrepared));
      setPreparedByUserId(staged?.preparedByUserId ?? chitGroup.preparedByUserId ?? null);
      setPreparedPreview(
        chitGroup.isSettlementPrepared && staged
          ? {
              disbursedAmount: staged.disbursedAmount ?? null,
              netPayablePrize: staged.disbursedAmount ?? undefined,
              disbursementMode: staged.disbursementMode ?? null,
              paymentReference: staged.paymentReference ?? null,
              preparedByUserId: staged.preparedByUserId ?? chitGroup.preparedByUserId ?? null,
            }
          : null,
      );
      setPreparedSummary(
        chitGroup.isSettlementPrepared
          ? 'Stage 1 voucher is prepared and awaiting independent Partner Checker review and approval.'
          : null,
      );
    }
  }, [isOpen, chitGroup]);

  // Stage 1: Maker prepares the final settlement voucher (F05)
  const prepareMutation = useMutation({
    mutationFn: async () => {
      if (!chitGroup) throw new Error('No chit group selected');
      if (!canPrepareStage1) {
        throw new Error('Only Accountant, Branch Manager, or verified Partner can prepare Month N settlement vouchers.');
      }
      if (!unprizedTicket) {
        throw new Error('No unprized subscriber ticket found for final month settlement');
      }

      return unwrapApiResponse<{ message?: string; settlement?: PreparedSettlementPreview }>(
        apiClient.POST('/api/v1/disbursements/group/{chitGroupId}/prepare-final-settlement', {
          params: { path: { chitGroupId: chitGroup.id } },
          body: {
            ticketId: unprizedTicket.id,
            disbursementMode: disbursementMode as 'ACCOUNT_PAYEE_CHEQUE' | 'BANK_TRANSFER_NEFT' | 'BANK_TRANSFER_RTGS' | 'BANK_TRANSFER_IMPS' | 'CASH',
            paymentReference: paymentReference.trim() || undefined,
            notes: notes.trim() || undefined,
            disbursedAt: disbursedAt ? new Date(disbursedAt).toISOString() : undefined,
          },
        }),
      );
    },
    onSuccess: (res) => {
      setIsPrepared(true);
      setPreparedByUserId(res.settlement?.preparedByUserId ?? user?.id ?? null);
      setPreparedPreview({
        ...(res.settlement ?? {}),
        disbursementMode: res.settlement?.disbursementMode ?? disbursementMode,
        paymentReference: res.settlement?.paymentReference ?? (paymentReference.trim() || null),
      });
      setPreparedSummary(
        res.message || 'Settlement voucher prepared successfully. Requires independent Partner Checker approval.',
      );
      setErrorMsg(null);
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, 'Failed to prepare settlement voucher'));
    },
  });

  // Stage 2: Independent Partner Checker authorizes and commits payout (F05)
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!chitGroup) throw new Error('No chit group selected');
      if (isMaker) {
        throw new Error(t('makerGuardAlertDesc'));
      }
      if (!isPartner) {
        throw new Error(t('partnerOnlyAuthAlert'));
      }

      return unwrapApiResponse<{ message?: string }>(
        apiClient.POST('/api/v1/disbursements/group/{chitGroupId}/approve-final-settlement', {
          params: { path: { chitGroupId: chitGroup.id } },
        }),
      );
    },
    onSuccess: () => {
      if (chitGroup?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(chitGroup.id) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.disbursements.all });
      onSuccess?.();
      onClose();
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, 'Settlement approval failed'));
    },
  });

  if (!chitGroup) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-amber-400">
            <Award className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('finalSettlementTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 pt-1">
            {chitGroup.groupCode} — Month {chitGroup.durationMonths} of {chitGroup.durationMonths} (Maturity Settlement)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {errorMsg && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isPrepared && preparedSummary && (
            <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs space-y-2">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Stage 1 Prepared — Verify Before Checker Approval</div>
                  <div className="text-emerald-300/80 mt-0.5">{preparedSummary}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-500/20 text-[11px] font-mono">
                <div>
                  <span className="text-emerald-400/70 block">Prepared Payout:</span>
                  <strong className="text-white">
                    {formatRupee(
                      preparedPreview?.netPayablePrize ??
                        preparedPreview?.disbursedAmount ??
                        maxPossiblePayout,
                    )}
                  </strong>
                </div>
                <div>
                  <span className="text-emerald-400/70 block">Disbursement Mode:</span>
                  <strong className="text-white">
                    {(preparedPreview?.disbursementMode || disbursementMode).replace(/_/g, ' ')}
                  </strong>
                </div>
                <div>
                  <span className="text-emerald-400/70 block">Payment Reference:</span>
                  <strong className="text-white">
                    {preparedPreview?.paymentReference || paymentReference || '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-emerald-400/70 block">Prepared By Maker:</span>
                  <strong className="text-white">{preparedByUserId || 'Staff Maker'}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Month N Rule Callout Banner */}
          <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">{t('zeroDiscountNotice')}</div>
              <div className="text-blue-300/80 mt-0.5">{t('finalSettlementDesc')}</div>
            </div>
          </div>

          {/* Unprized Subscriber Target */}
          <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/60">
            <div className="text-xs text-slate-400">{t('unprizedSubscriberLabel')}</div>
            <div className="text-sm font-semibold text-slate-200 mt-0.5">
              {unprizedTicket?.customer?.fullName || '—'} (Ticket #{unprizedTicket?.ticketNumber})
            </div>
            <div className="text-xs font-mono text-slate-400 mt-0.5">
              Code: {unprizedTicket?.customer?.customerCode} • Phone: {unprizedTicket?.customer?.phone}
            </div>
          </div>

          {/* Financial Breakdown (FIN-B: Gross - 4% Commission - Month N Installment if unpaid - Prior Arrears) */}
          <div className="grid grid-cols-3 gap-2 p-3.5 rounded-lg border border-slate-800 bg-slate-950/60 text-center">
            <div>
              <div className="text-[11px] text-slate-400">Gross Pool (V)</div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1">
                {formatRupee(preparedPreview?.grossPrize ?? grossPool)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">4% Commission (Cf)</div>
              <div className="text-xs font-mono font-bold text-blue-400 mt-1">
                {formatRupee(preparedPreview?.commissionAmount ?? commission)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-emerald-400">
                {preparedPreview ? 'Verified Net Payout' : 'Max Net (Before Due Offset)'}
              </div>
              <div className="text-xs font-mono font-bold text-emerald-400 mt-1">
                {formatRupee(preparedPreview?.netPayablePrize ?? maxPossiblePayout)}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-950/40 border border-slate-800 rounded-lg p-2.5">
            {preparedPreview ? (
              <span>
                FIN-B Verified Deductions: Month {chitGroup.durationMonths} Due:{' '}
                <strong className="text-slate-200 font-mono">
                  {formatRupee(preparedPreview.finalMonthInstallment ?? 0)}
                </strong>{' '}
                • Prior Arrears:{' '}
                <strong className="text-slate-200 font-mono">
                  {formatRupee(preparedPreview.priorArrears ?? 0)}
                </strong>
              </span>
            ) : (
              <span>
                FIN-B Rule: If Month {chitGroup.durationMonths} base installment ({formatRupee(estimatedBaseInstallment)}) or prior arrears are unpaid, the server deducts them automatically on voucher preparation (zero double collection if already paid).
              </span>
            )}
          </div>

          {isPrepared && isMaker && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{t('makerGuardAlertTitle')}</div>
                <div className="text-amber-300/80 mt-0.5">{t('makerGuardAlertDesc')}</div>
              </div>
            </div>
          )}

          {isPrepared && !isMaker && !isPartner && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{t('partnerOnlyAuthAlert')}</span>
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('authModeLabel')}
            </label>
            <select
              value={disbursementMode}
              disabled={prepareMutation.isPending || approveMutation.isPending || isPrepared}
              onChange={(e) => setDisbursementMode(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="ACCOUNT_PAYEE_CHEQUE">Account Payee Cheque (வங்கி கணக்கு காசோலை)</option>
              <option value="BANK_TRANSFER_NEFT">NEFT Bank Transfer (NEFT வங்கி பரிமாற்றம்)</option>
              <option value="BANK_TRANSFER_RTGS">RTGS Bank Transfer (RTGS வங்கி பரிமாற்றம்)</option>
              <option value="BANK_TRANSFER_IMPS">IMPS Immediate Transfer (IMPS உடனடி பரிமாற்றம்)</option>
              <option value="CASH">Hard Cash (நேரடி ரொக்கம் - அலுவலக பெட்டகம்)</option>
            </select>
          </div>

          {/* Payment Reference */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('paymentRefLabel')}
            </label>
            <Input
              value={paymentReference}
              disabled={prepareMutation.isPending || approveMutation.isPending || isPrepared}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g. IOB-CHQ-FINAL-998811 or CASH-VAULT"
              className="text-xs font-mono"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('releaseNotesLabel')}
            </label>
            <Textarea
              value={notes}
              disabled={prepareMutation.isPending || approveMutation.isPending || isPrepared}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Section 16 maturity settlement completed in branch office counter..."
              rows={2}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={prepareMutation.isPending || approveMutation.isPending}
            className="text-slate-400 hover:text-slate-200 text-xs"
          >
            Cancel
          </Button>

          {!isPrepared ? (
            <Button
              type="button"
              onClick={() => prepareMutation.mutate()}
              disabled={!canPrepareStage1 || !unprizedTicket || prepareMutation.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs gap-1.5 shadow"
            >
              {prepareMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{prepareMutation.isPending ? 'Preparing Voucher...' : 'Prepare Voucher (Maker)'}</span>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => approveMutation.mutate()}
              disabled={!canApproveStage2 || approveMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow"
            >
              {approveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{approveMutation.isPending ? 'Authorizing Payout...' : 'Approve & Disburse (Checker Partner)'}</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
