'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore, hasAnyRole } from '@/stores/auth-store';
import { formatRupee, sanitizeWholeRupeeInput } from '@/lib/currency';
import { getErrorMessage } from '@/lib/api-client';
import { isSelfApproval } from '@kumaran/api-client';
import {
  computeAuctionBidPreview,
  MAX_SAFE_WHOLE_RUPEE_BIGINT,
  parseWholeRupeesBigInt,
  toSafeWholeRupeeBigInt,
} from './auction-math.util';

export interface PendingAuctionCorrection {
  requestId: string;
  requestedByUserId: string;
  correctedBidDiscount: number | bigint | string;
  correctedWinningTicketId?: string | null;
  correctedTicketNumber?: number | null;
  reason: string;
  notes?: string | null;
  requestedAt: string;
}

export interface CorrectionCandidateTicket {
  id: string;
  ticketNumber: number;
  isPrized?: boolean;
  status?: string;
  customer?: {
    fullName?: string;
    customerCode?: string;
  } | null;
}

export interface RequestAuctionCorrectionPayload {
  correctedBidDiscount: number;
  correctedWinningTicketId?: string;
  reason: string;
  notes?: string;
}

export interface ApproveAuctionCorrectionPayload {
  notes?: string;
}

interface AuctionCorrectionCardProps {
  auctionId: string;
  chitValue: bigint | number | string;
  durationMonths: number;
  foremanCommissionRate?: number | string | null;
  maxDiscountCeiling?: bigint | number | string | null;
  currentBidDiscount?: bigint | number | string | null;
  currentWinnerTicketId?: string | null;
  candidateTickets?: CorrectionCandidateTicket[];
  disbursementStatus?: string | null;
  pendingCorrection?: PendingAuctionCorrection | null;
  pendingRequestedByUserId?: string | null;
  onRequestCorrection: (payload: RequestAuctionCorrectionPayload) => Promise<{
    correctionRequestId?: string;
    message?: string;
  } | unknown>;
  onApproveCorrection: (payload: ApproveAuctionCorrectionPayload) => Promise<unknown>;
  isRequesting?: boolean;
  isApproving?: boolean;
}

export function AuctionCorrectionCard({
  chitValue,
  durationMonths,
  foremanCommissionRate,
  maxDiscountCeiling,
  currentBidDiscount,
  currentWinnerTicketId,
  candidateTickets = [],
  disbursementStatus,
  pendingCorrection,
  pendingRequestedByUserId,
  onRequestCorrection,
  onApproveCorrection,
  isRequesting = false,
  isApproving = false,
}: AuctionCorrectionCardProps) {
  const t = useTranslations('auctions');
  const user = useAuthStore((s) => s.user);

  const chitValueBig = toSafeWholeRupeeBigInt(chitValue, 0n);
  const initialDiscountBig = toSafeWholeRupeeBigInt(currentBidDiscount, 0n);

  const [correctedDiscountStr, setCorrectedDiscountStr] = React.useState<string>(
    initialDiscountBig > 0n ? initialDiscountBig.toString() : '',
  );
  const [correctedWinningTicketId, setCorrectedWinningTicketId] = React.useState<string>(
    currentWinnerTicketId || '',
  );
  const [reason, setReason] = React.useState<string>('');
  const [requestNotes, setRequestNotes] = React.useState<string>('');
  const [approvalNotes, setApprovalNotes] = React.useState<string>('');
  const [localRequestedByUserId, setLocalRequestedByUserId] = React.useState<string | null>(
    pendingCorrection?.requestedByUserId || pendingRequestedByUserId || null,
  );
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // XR-WM-02: Hydrate Maker identity from authoritative server pendingCorrection across page reloads
  React.useEffect(() => {
    const serverMakerId = pendingCorrection?.requestedByUserId || pendingRequestedByUserId || null;
    setLocalRequestedByUserId(serverMakerId);
  }, [pendingCorrection?.requestedByUserId, pendingRequestedByUserId]);

  React.useEffect(() => {
    if (currentWinnerTicketId) {
      setCorrectedWinningTicketId(currentWinnerTicketId);
    }
  }, [currentWinnerTicketId]);

  // Eligible replacement tickets: current winner + active non-prized tickets
  const selectableTickets = React.useMemo(() => {
    return candidateTickets.filter(
      (ticket) =>
        ticket.id === currentWinnerTicketId ||
        (!ticket.isPrized && (!ticket.status || ticket.status === 'ACTIVE')),
    );
  }, [candidateTickets, currentWinnerTicketId]);

  // Guardrail 11 (SEC-A): Strictly Super Admin + Verified Business Partner
  const isSuperAdmin = hasAnyRole(user, ['SUPER_ADMIN']);
  const isPartner = Boolean(user?.isPartner);
  const isVerifiedPartner = isSuperAdmin && isPartner;

  // KFC-FIN-005: Disbursed prize is immutable
  const isDisbursed = disbursementStatus === 'DISBURSED';

  // Guardrail 10: Maker != Checker on correction approval (hydrated across reloads!)
  const effectiveMakerId = pendingCorrection?.requestedByUserId || localRequestedByUserId;
  const hasPendingCorrection = Boolean(pendingCorrection || localRequestedByUserId);
  const isCorrectionMaker = isSelfApproval(user?.id, {
    requestedByUserId: effectiveMakerId,
  });

  // XR-WM-05: Pure string -> BigInt parsing (never overflows to Infinity on 310+ digit paste)
  const parsedDiscountBig = parseWholeRupeesBigInt(correctedDiscountStr);
  const exceedsSafeInt = parsedDiscountBig > MAX_SAFE_WHOLE_RUPEE_BIGINT;
  const preview = computeAuctionBidPreview({
    chitValue: chitValueBig,
    totalTickets: durationMonths,
    bidDiscount: parsedDiscountBig,
    frozenCommissionRate: foremanCommissionRate,
    maxDiscountCeiling,
  });

  const canSubmitRequest =
    isVerifiedPartner &&
    !isDisbursed &&
    parsedDiscountBig > 0n &&
    !exceedsSafeInt &&
    !preview.isFloorViolated &&
    !preview.isCeilingViolated &&
    preview.isDivisible &&
    reason.trim().length > 0 &&
    !isRequesting;

  const canApproveCorrection =
    isVerifiedPartner &&
    !isDisbursed &&
    hasPendingCorrection &&
    !isCorrectionMaker &&
    !isApproving;

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isVerifiedPartner) {
      setFeedback({ type: 'error', text: t('correctionPartnerOnly') });
      return;
    }
    if (isDisbursed) {
      setFeedback({ type: 'error', text: t('correctionDisbursedBlocked') });
      return;
    }
    if (exceedsSafeInt) {
      setFeedback({
        type: 'error',
        text: 'Corrected bid discount exceeds maximum safe whole-Rupee integer limit.',
      });
      return;
    }
    if (preview.isFloorViolated) {
      setFeedback({
        type: 'error',
        text: t('floorError', { minFloor: formatRupee(preview.foremanCommission) }),
      });
      return;
    }
    if (preview.isCeilingViolated) {
      setFeedback({
        type: 'error',
        text: t('ceilingError', { maxCeiling: formatRupee(preview.ceilingDiscount) }),
      });
      return;
    }
    if (!preview.isDivisible) {
      setFeedback({
        type: 'error',
        text: t('nonDivisibleError', {
          totalDividend: formatRupee(preview.totalDividend),
          tickets: durationMonths,
          remainder: formatRupee(preview.dividendRemainder),
        }),
      });
      return;
    }
    if (!reason.trim()) {
      setFeedback({ type: 'error', text: 'Mandatory correction reason is required.' });
      return;
    }

    const ticketSwapId =
      correctedWinningTicketId && correctedWinningTicketId !== currentWinnerTicketId
        ? correctedWinningTicketId
        : undefined;

    try {
      await onRequestCorrection({
        correctedBidDiscount: Number(parsedDiscountBig),
        correctedWinningTicketId: ticketSwapId,
        reason: reason.trim(),
        notes: requestNotes.trim() || undefined,
      });
      setLocalRequestedByUserId(user?.id || 'maker');
      setFeedback({ type: 'success', text: t('correctionPendingApproval') });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: getErrorMessage(err, 'Failed to request auction correction'),
      });
    }
  };

  const handleApprove = async () => {
    setFeedback(null);

    if (!isVerifiedPartner) {
      setFeedback({ type: 'error', text: t('correctionPartnerOnly') });
      return;
    }
    if (isCorrectionMaker) {
      setFeedback({
        type: 'error',
        text: 'Maker-Checker Violation: The Partner who requested this correction cannot approve it.',
      });
      return;
    }

    try {
      await onApproveCorrection({
        notes: approvalNotes.trim() || undefined,
      });
      setLocalRequestedByUserId(null);
      setApprovalNotes('');
      setFeedback({
        type: 'success',
        text: 'Finalized auction correction approved and downstream dues reconciled.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: getErrorMessage(err, 'Failed to approve auction correction'),
      });
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 shadow-xl">
      <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
        <div className="rounded-lg bg-amber-500/20 p-2 text-amber-400">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">{t('correctionCardTitle')}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{t('correctionCardDesc')}</p>
        </div>
      </div>

      {isDisbursed && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <span>{t('correctionDisbursedBlocked')}</span>
        </div>
      )}

      {!isDisbursed && !isVerifiedPartner && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{t('correctionPartnerOnly')}</span>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-md border p-2.5 text-xs flex items-start gap-2 ${
            feedback.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
              : 'border-red-500/40 bg-red-950/30 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {!isDisbursed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Maker Partner A: Request Correction */}
          <form
            onSubmit={handleRequestSubmit}
            className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-amber-300">
              Stage 1 — {t('correctionRequestBtn')}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">
                {t('correctionDiscountLabel')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-mono text-slate-400 font-bold">
                  ₹
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={correctedDiscountStr}
                  disabled={!isVerifiedPartner || isRequesting}
                  onChange={(e) => setCorrectedDiscountStr(sanitizeWholeRupeeInput(e.target.value))}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 py-1.5 pl-7 pr-3 text-xs font-mono text-white focus:border-amber-500/60 focus:outline-none disabled:opacity-50"
                />
              </div>
              {parsedDiscountBig > 0n && preview.isFloorViolated && (
                <p className="text-[11px] text-red-400">
                  {t('floorError', { minFloor: formatRupee(preview.foremanCommission) })}
                </p>
              )}
              {parsedDiscountBig > 0n && preview.isCeilingViolated && (
                <p className="text-[11px] text-red-400">
                  {t('ceilingError', { maxCeiling: formatRupee(preview.ceilingDiscount) })}
                </p>
              )}
              {parsedDiscountBig > 0n &&
                !preview.isFloorViolated &&
                !preview.isCeilingViolated &&
                !preview.isDivisible && (
                  <p className="text-[11px] text-red-400">
                    {t('nonDivisibleError', {
                      totalDividend: formatRupee(preview.totalDividend),
                      tickets: durationMonths,
                      remainder: formatRupee(preview.dividendRemainder),
                    })}
                  </p>
                )}
            </div>

            {selectableTickets.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  {t('correctionTicketLabel')}
                </label>
                <select
                  value={correctedWinningTicketId}
                  disabled={!isVerifiedPartner || isRequesting}
                  onChange={(e) => setCorrectedWinningTicketId(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none disabled:opacity-50"
                >
                  {selectableTickets.map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>
                      #{ticket.ticketNumber} — {ticket.customer?.fullName || 'Subscriber'}
                      {ticket.customer?.customerCode ? ` (${ticket.customer.customerCode})` : ''}
                      {ticket.id === currentWinnerTicketId ? ' [Current Winner]' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">
                {t('correctionReasonLabel')} <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                disabled={!isVerifiedPartner || isRequesting}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('correctionReasonPlaceholder')}
                className="w-full rounded-md border border-slate-800 bg-slate-950 p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500/60 focus:outline-none disabled:opacity-50 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">
                {t('statutoryNotesLabel')}
              </label>
              <input
                type="text"
                value={requestNotes}
                disabled={!isVerifiedPartner || isRequesting}
                onChange={(e) => setRequestNotes(e.target.value)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none disabled:opacity-50"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={!canSubmitRequest}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold h-8"
            >
              {isRequesting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <span>{t('correctionRequestBtn')}</span>
            </Button>
          </form>

          {/* Checker Partner B: Approve Correction */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-emerald-300">
                Stage 2 — {t('correctionApproveBtn')}
              </div>

              {pendingCorrection ? (
                <div className="rounded-md border border-blue-500/30 bg-blue-950/30 p-3 text-[11px] text-blue-200 space-y-1">
                  <div className="font-semibold text-blue-100">Pending Correction Request</div>
                  <div className="font-mono">
                    Discount: <strong className="text-white">{formatRupee(pendingCorrection.correctedBidDiscount)}</strong>
                    {pendingCorrection.correctedTicketNumber ? (
                      <>
                        {' '}• Ticket: <strong className="text-white">#{pendingCorrection.correctedTicketNumber}</strong>
                      </>
                    ) : null}
                  </div>
                  <div>
                    Reason: <span className="text-slate-200">{pendingCorrection.reason}</span>
                  </div>
                  <div className="text-[10px] text-blue-300/80 font-mono">
                    Requested By: {pendingCorrection.requestedByUserId}
                  </div>
                </div>
              ) : !hasPendingCorrection ? (
                <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-[11px] text-slate-400">
                  No pending correction request. Partner A (Maker) must submit a Stage 1 request first.
                </div>
              ) : null}

              {isCorrectionMaker && (
                <div className="rounded-md border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{t('correctionPendingApproval')}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  Checker Verification Remarks
                </label>
                <textarea
                  rows={3}
                  value={approvalNotes}
                  disabled={!canApproveCorrection}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Verified against physical branch auction register and token log..."
                  className="w-full rounded-md border border-slate-800 bg-slate-950 p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none disabled:opacity-50 resize-none"
                />
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleApprove}
              disabled={!canApproveCorrection}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-8"
            >
              {isApproving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <span>{t('correctionApproveBtn')}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
