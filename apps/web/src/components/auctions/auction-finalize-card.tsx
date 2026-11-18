'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore, hasAnyRole, getUserDisplayName } from '@/stores/auth-store';
import { getErrorMessage } from '@/lib/api-client';
import { isSelfApproval } from '@kumaran/api-client';

export interface FinalizeAuctionPayload {
  subscribersPresent: number;
  notes?: string;
  signedByForeman: boolean;
}

interface AuctionFinalizeCardProps {
  auctionId: string;
  conductedByUserId?: string | null;
  winnerTicketNumber?: number;
  winnerCustomerName?: string;
  installmentMonth: number;
  onFinalize: (payload: FinalizeAuctionPayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function AuctionFinalizeCard({
  auctionId: _auctionId,
  conductedByUserId,
  winnerTicketNumber,
  winnerCustomerName,
  installmentMonth: _installmentMonth,
  onFinalize,
  isSubmitting = false,
}: AuctionFinalizeCardProps) {
  const t = useTranslations('auctions');
  const user = useAuthStore((state) => state.user);

  const [subscribersPresent, setSubscribersPresent] = React.useState<number | ''>('');
  const [notes, setNotes] = React.useState<string>('');
  const [signedByForeman, setSignedByForeman] = React.useState<boolean>(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Maker-Checker Dual Control Invariant Check (Guardrail 10) & Legal Partner Guard (Guardrail 11 / SEC-A)
  // Per permissions-matrix §6 & KFC-SEC-003: ONLY Super Admin (verified Partner) can finalize; Branch Manager strictly blocked.
  const hasRecordedBid = Boolean(conductedByUserId && winnerTicketNumber !== undefined && winnerTicketNumber !== null);
  const isMaker = isSelfApproval(user?.id, { conductedByUserId });
  const isAuthorizedRole = hasAnyRole(user, ['SUPER_ADMIN']);
  const isPartner = Boolean(user?.isPartner);
  const canFinalize = hasRecordedBid && !isMaker && isAuthorizedRole && isPartner;
  const checkerDisplayName = getUserDisplayName(user, 'Partner');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!hasRecordedBid) {
      setErrorMsg('Cannot finalize auction: No winning bid has been recorded yet in the live auction room.');
      return;
    }

    if (isMaker) {
      setErrorMsg(
        t('selfApprovalBlockedAlert', {
          maker: conductedByUserId || 'Staff',
        }),
      );
      return;
    }

    if (!isAuthorizedRole) {
      setErrorMsg(t('unauthorizedRoleAlert'));
      return;
    }

    if (!isPartner) {
      setErrorMsg(
        'PARTNER_IDENTITY_REQUIRED: Only verified legal business partners possess authority to finalize auctions.',
      );
      return;
    }

    if (typeof subscribersPresent !== 'number' || subscribersPresent < 1) {
      setErrorMsg('At least 1 attending subscriber must be physically present in the auction proceedings.');
      return;
    }

    if (!signedByForeman) {
      setErrorMsg('Foreman signature declaration must be confirmed prior to finalization.');
      return;
    }

    try {
      await onFinalize({
        subscribersPresent: Math.floor(subscribersPresent),
        notes: notes.trim() || undefined,
        signedByForeman,
      });
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Failed to finalize auction'));
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{t('finalizeCardTitle')}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{t('finalizeCardDesc')}</p>
          </div>
        </div>

        {/* Checker Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300">
          <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Checker: {checkerDisplayName}</span>
        </div>
      </div>

      {/* Missing Bid Guard Warning */}
      {!hasRecordedBid && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>No winning bid has been recorded yet. Enter the live bidding room to record a bid before Checker finalization.</span>
        </div>
      )}

      {/* Dual Control Blocking Warning */}
      {hasRecordedBid && isMaker && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-200 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-300">
              Maker-Checker Dual Control Guardrail (Guardrail 10 / ADR-11)
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              {t('selfApprovalBlockedAlert', {
                maker: conductedByUserId || getUserDisplayName(user, 'Current User'),
              })}
            </p>
          </div>
        </div>
      )}

      {/* Unauthorized Role Warning */}
      {!isAuthorizedRole && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{t('unauthorizedRoleAlert')}</span>
        </div>
      )}

      {/* Non-Partner Super Admin Warning (SEC-A) */}
      {isAuthorizedRole && !isPartner && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>Only verified legal business partners (isPartner: true) possess financial authority to finalize and commit auctions.</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Attendees Count & Foreman Signature */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('subscribersPresentLabel')} <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              placeholder="e.g. 14"
              value={subscribersPresent}
              onChange={(e) => {
                const val = e.target.value;
                setSubscribersPresent(val === '' ? '' : parseInt(val, 10));
              }}
              disabled={!canFinalize || isSubmitting}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-emerald-500/60 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Foreman Signature Declaration
            </label>
            <label className="flex items-center gap-2.5 p-2 rounded-md border border-slate-800 bg-slate-950 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={signedByForeman}
                onChange={(e) => setSignedByForeman(e.target.checked)}
                disabled={!canFinalize || isSubmitting}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
              />
              <span className="text-[11px] font-medium">{t('signedByForemanLabel')}</span>
            </label>
          </div>
        </div>

        {/* Statutory Proceedings Observations Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {t('statutoryNotesLabel')}
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canFinalize || isSubmitting}
            placeholder={t('statutoryNotesPlaceholder')}
            className="w-full rounded-md border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none disabled:opacity-50 resize-none"
          />
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <span className="text-[11px] text-slate-400">
            Winner: <strong className="text-emerald-400">#{winnerTicketNumber}</strong> ({winnerCustomerName})
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={!canFinalize || isSubmitting}
            className={`font-semibold text-xs h-9 px-4 ${
              canFinalize
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                <span>{t('finalizingAction')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                <span>{t('finalizeAction')}</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
