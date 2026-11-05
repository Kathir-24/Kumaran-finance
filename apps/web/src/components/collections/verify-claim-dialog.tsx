'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileCheck2,
  AlertCircle,
  Loader2,
  CheckCircle,
  Building,
  User,
  ShieldCheck,
  CreditCard,
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
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { PendingUpiClaimItem } from './upi-claims-table';

interface VerifyClaimDialogProps {
  isOpen: boolean;
  onClose: () => void;
  claim: PendingUpiClaimItem | null;
  onVerified: (paymentId: string) => void;
}

export function VerifyClaimDialog({
  isOpen,
  onClose,
  claim,
  onVerified,
}: VerifyClaimDialogProps) {
  const t = useTranslations('collections');
  const queryClient = useQueryClient();

  const [isConfirmed, setIsConfirmed] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const verifyClaimMutation = useMutation({
    mutationFn: async () => {
      if (!claim) throw new Error('No claim selected');
      setErrorMessage(null);
      const token = getStoredAccessToken();

      const res = await fetch(
        `${getApiBaseUrl()}/api/v1/payments/${claim.claimId}/verify-upi-claim`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            verificationNotes: verificationNotes.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || 'Failed to verify UPI payment claim');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.pendingUpiClaims() });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const verifiedPaymentId = claim?.claimId;
      setIsConfirmed(false);
      setVerificationNotes('');
      onClose();
      if (verifiedPaymentId) {
        onVerified(verifiedPaymentId);
      }
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Error verifying UPI claim');
    },
  });

  if (!claim) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-400">
            <FileCheck2 className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('verifyClaimDialogTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('verifyClaimDialogSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-3.5 text-xs">
          {/* Claim Breakdown Card */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-400 block">{t('tableCustomer')}</span>
                <span className="font-semibold text-slate-100">
                  {claim.customer?.fullName || 'Subscriber'}
                </span>
                <span className="text-[11px] font-mono text-slate-400 block">
                  {claim.customer?.customerCode} • {claim.customer?.phone}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">{t('tableSchemeTicket')}</span>
                <span className="font-semibold text-slate-100 font-mono">
                  {claim.ticket?.groupCode} T#{claim.ticket?.ticketNumber}
                </span>
                <span className="text-[11px] font-mono text-slate-300 block">
                  Month #{claim.due?.installmentMonth || 1}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block">{t('netPayableLabel')}</span>
                <span className="text-base font-mono font-bold text-emerald-400">
                  {formatRupee(claim.amount)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">{t('tableUtrNumber')}</span>
                <span className="font-mono text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded inline-block">
                  {claim.utrNumber}
                </span>
              </div>
            </div>

            {claim.notes && (
              <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                Subscriber Remark: <span className="text-slate-300 italic">"{claim.notes}"</span>
              </div>
            )}
          </div>

          {/* Bank Credit Confirmation Checkbox */}
          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/10">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
              />
              <span className="text-xs text-slate-200 font-medium">
                {t('confirmBankCreditLabel', {
                  amount: formatRupee(claim.amount),
                  utr: claim.utrNumber,
                })}
              </span>
            </label>
          </div>

          {/* Verification Remarks Input */}
          <div>
            <label className="text-[11px] text-slate-300 block mb-1">
              {t('verificationNotesLabel')}
            </label>
            <Input
              value={verificationNotes}
              onChange={(e) => setVerificationNotes(e.target.value)}
              placeholder={t('verificationNotesPlaceholder')}
              className="h-8 bg-slate-800 border-slate-700 text-xs text-slate-100"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-slate-700 hover:bg-slate-800 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => verifyClaimMutation.mutate()}
            disabled={!isConfirmed || verifyClaimMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
          >
            {verifyClaimMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                {t('verifyingClaim')}
              </>
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                {t('confirmVerificationBtn')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
