'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Receipt,
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
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useIdempotentAction } from '@/hooks/use-idempotent-action';

export interface ReleaseWinnerTarget {
  id: string;
  auctionId: string;
  disbursementStatus: string;
  disbursementMode?: string | null;
  disbursedAmount?: number | bigint | null;
  auction?: {
    prizeMoney?: number | bigint;
    bidDiscount?: number | bigint;
    chitGroup?: {
      groupCode?: string;
      chitValue?: number | bigint;
    };
  };
  ticket?: {
    ticketNumber?: number;
    customer?: {
      fullName?: string;
      customerCode?: string;
    };
  };
}

interface DisbursementReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  winner: ReleaseWinnerTarget | null;
  onSuccess?: () => void;
}

export function DisbursementReleaseModal({
  isOpen,
  onClose,
  winner,
  onSuccess,
}: DisbursementReleaseModalProps) {
  const t = useTranslations('disbursements');
  const queryClient = useQueryClient();

  const [paymentReference, setPaymentReference] = useState<string>('');
  const [disbursedAt, setDisbursedAt] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const netPrize =
    winner?.disbursedAmount ??
    winner?.auction?.prizeMoney ??
    (BigInt(winner?.auction?.chitGroup?.chitValue ?? 0) -
      BigInt(winner?.auction?.bidDiscount ?? 0));

  const isCashMode = winner?.disbursementMode === 'CASH';

  // Client-Side Idempotency Session Hook
  const { idempotencyKey, resetKey } = useIdempotentAction();

  useEffect(() => {
    if (isOpen && winner) {
      resetKey();
      setPaymentReference(isCashMode ? `CASH-VAULT-${Date.now().toString().slice(-6)}` : '');
      setDisbursedAt(new Date().toISOString().split('T')[0]);
      setNotes('');
      setErrorMsg(null);
    }
  }, [isOpen, winner, isCashMode, resetKey]);

  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!winner) throw new Error('No winner record selected');
      if (!paymentReference.trim()) {
        throw new Error('Payment reference is mandatory for prize payout release');
      }

      return unwrapApiResponse<any>(
        apiClient.POST('/api/v1/disbursements/auction/{auctionId}/disburse', {
          params: { path: { auctionId: winner.auctionId } },
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            paymentReference: paymentReference.trim(),
            disbursedAt: disbursedAt ? new Date(disbursedAt).toISOString() : undefined,
            notes: notes.trim() || undefined,
            idempotencyKey,
          },
        }),
      );
    },
    onSuccess: () => {
      resetKey();
      queryClient.invalidateQueries({ queryKey: queryKeys.disbursements.all });
      if (winner?.auctionId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.disbursements.detail(winner.auctionId),
        });
      }
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Release failed');
    },
  });

  if (!winner) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-emerald-400">
            <Banknote className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('releaseModalTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 pt-1">
            {t('releaseModalDesc')} — {winner.auction?.chitGroup?.groupCode} (Ticket #{winner.ticket?.ticketNumber})
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={releaseMutation.isPending} className="space-y-4 py-2 disabled:opacity-75">
          {errorMsg && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ADR-14 Cash Vault Notice */}
          {isCashMode && (
            <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-start gap-3">
              <Banknote className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{t('hardCashNotice')}</div>
                <div className="text-emerald-300/80 mt-0.5">
                  Releasing hard cash directly from the in-office vault counter with signed physical voucher receipt.
                </div>
              </div>
            </div>
          )}

          {/* Winner and Authorized Mode Summary */}
          <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Subscriber & Authorized Mode</div>
              <div className="text-sm font-semibold text-slate-200">
                {winner.ticket?.customer?.fullName}
              </div>
              <div className="text-xs font-mono text-purple-400 mt-0.5 uppercase tracking-wider">
                Mode: {winner.disbursementMode?.replace(/_/g, ' ') || 'CHEQUE'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-emerald-400">Net Prize Money</div>
              <div className="text-lg font-mono font-bold text-emerald-400">
                {formatRupee(netPrize)}
              </div>
            </div>
          </div>

          {/* Mandatory Payment Reference */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('paymentRefLabel')} *
            </label>
            <Input
              value={paymentReference}
              disabled={releaseMutation.isPending}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder={t('paymentRefPlaceholder')}
              className="text-xs font-mono"
            />
          </div>

          {/* Disbursement Date */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('disbursedAtLabel')}
            </label>
            <Input
              type="date"
              value={disbursedAt}
              disabled={releaseMutation.isPending}
              onChange={(e) => setDisbursedAt(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          {/* Cashier / Accountant Remarks */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('releaseNotesLabel')}
            </label>
            <Textarea
              value={notes}
              disabled={releaseMutation.isPending}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('releaseNotesPlaceholder')}
              rows={2}
              className="text-xs"
            />
          </div>
        </fieldset>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={releaseMutation.isPending}
            className="text-slate-400 hover:text-slate-200 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => releaseMutation.mutate()}
            disabled={!paymentReference.trim() || releaseMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow"
          >
            {releaseMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Receipt className="w-3.5 h-3.5" />
            )}
            <span>{releaseMutation.isPending ? t('releasing') : t('confirmReleaseBtn')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
