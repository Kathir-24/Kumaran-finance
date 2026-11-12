'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  AlertTriangle,
  Loader2,
  FileCheck,
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
import { useAuthStore, hasAnyRole } from '@/stores/auth-store';
import { apiClient, getErrorMessage, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useIdempotentAction } from '@/hooks/use-idempotent-action';

type DisbursementModeOption =
  | 'ACCOUNT_PAYEE_CHEQUE'
  | 'BANK_TRANSFER_NEFT'
  | 'BANK_TRANSFER_RTGS'
  | 'BANK_TRANSFER_IMPS'
  | 'CASH';

const DISBURSEMENT_MODES: readonly DisbursementModeOption[] = [
  'ACCOUNT_PAYEE_CHEQUE',
  'BANK_TRANSFER_NEFT',
  'BANK_TRANSFER_RTGS',
  'BANK_TRANSFER_IMPS',
  'CASH',
];

function isDisbursementModeOption(value: string): value is DisbursementModeOption {
  return DISBURSEMENT_MODES.includes(value as DisbursementModeOption);
}

export interface AuthWinnerTarget {
  id: string;
  auctionId: string;
  disbursementStatus: string;
  verifiedByUserId?: string | null;
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

interface DisbursementAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  winner: AuthWinnerTarget | null;
  onSuccess?: () => void;
}

export function DisbursementAuthModal({
  isOpen,
  onClose,
  winner,
  onSuccess,
}: DisbursementAuthModalProps) {
  const t = useTranslations('disbursements');
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [disbursementMode, setDisbursementMode] = useState<DisbursementModeOption>('ACCOUNT_PAYEE_CHEQUE');
  const [disbursedAmount, setDisbursedAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const defaultNetPrize =
    winner?.disbursedAmount ??
    winner?.auction?.prizeMoney ??
    (BigInt(winner?.auction?.chitGroup?.chitValue ?? 0) -
      BigInt(winner?.auction?.bidDiscount ?? 0));

  // Client-Side Idempotency Session Hook
  const { idempotencyKey, resetKey } = useIdempotentAction();

  useEffect(() => {
    if (isOpen && winner) {
      resetKey();
      setDisbursementMode('ACCOUNT_PAYEE_CHEQUE');
      setDisbursedAmount(defaultNetPrize ? defaultNetPrize.toString() : '');
      setNotes('');
      setErrorMsg(null);
    }
  }, [isOpen, winner, defaultNetPrize, resetKey]);

  // Maker != Checker Guard (Guardrail 10)
  const isMaker = Boolean(
    user?.id &&
      winner?.verifiedByUserId &&
      user.id.toLowerCase() === winner.verifiedByUserId.toLowerCase(),
  );

  const isSuperAdmin = hasAnyRole(user, ['SUPER_ADMIN']);

  const authorizeMutation = useMutation({
    mutationFn: async () => {
      if (!winner) throw new Error('No winner record selected');
      if (isMaker) {
        throw new Error(t('makerGuardAlertDesc'));
      }
      if (!isSuperAdmin) {
        throw new Error('Only Super Admin (Partners) possess financial authority to authorize prize money disbursements');
      }

      return unwrapApiResponse<unknown>(
        apiClient.POST('/api/v1/disbursements/auction/{auctionId}/authorize-payout', {
          params: { path: { auctionId: winner.auctionId } },
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            disbursementMode,
            disbursedAmount: disbursedAmount ? Number(disbursedAmount) : undefined,
            notes: notes.trim() || undefined,
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
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, 'Authorization failed'));
    },
  });

  if (!winner) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-purple-400">
            <ShieldCheck className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('authModalTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 pt-1">
            {t('authModalDesc')} — {winner.auction?.chitGroup?.groupCode} (Ticket #{winner.ticket?.ticketNumber})
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={authorizeMutation.isPending} className="space-y-4 py-2 disabled:opacity-75">
          {/* Maker != Checker Guardrail 10 Alert */}
          {isMaker && (
            <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{t('makerGuardAlertTitle')}</div>
                <div className="text-amber-300/80 mt-0.5">{t('makerGuardAlertDesc')}</div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Winner and Net Prize Summary */}
          <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Winning Subscriber</div>
              <div className="text-sm font-semibold text-slate-200">
                {winner.ticket?.customer?.fullName} ({winner.ticket?.customer?.customerCode})
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-emerald-400">Calculated Net Prize (P = V - D)</div>
              <div className="text-lg font-mono font-bold text-emerald-400">
                {formatRupee(defaultNetPrize)}
              </div>
            </div>
          </div>

          {/* Authorized Disbursement Mode */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('authModeLabel')}
            </label>
            <select
              value={disbursementMode}
              disabled={isMaker || authorizeMutation.isPending}
              onChange={(e) => {
                const val = e.target.value;
                if (isDisbursementModeOption(val)) setDisbursementMode(val);
              }}
              className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
            >
              <option value="ACCOUNT_PAYEE_CHEQUE">Account Payee Cheque (வங்கி கணக்கு காசோலை)</option>
              <option value="BANK_TRANSFER_NEFT">NEFT Bank Transfer (NEFT வங்கி பரிமாற்றம்)</option>
              <option value="BANK_TRANSFER_RTGS">RTGS Bank Transfer (RTGS வங்கி பரிமாற்றம்)</option>
              <option value="BANK_TRANSFER_IMPS">IMPS Immediate Transfer (IMPS உடனடி பரிமாற்றம்)</option>
              <option value="CASH">Hard Cash (நேரடி ரொக்கம் - அலுவலக பெட்டகம்)</option>
            </select>
          </div>

          {/* Authorized Amount (Whole Rupees) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('authAmountLabel')}
            </label>
            <Input
              type="number"
              value={disbursedAmount}
              disabled={isMaker || authorizeMutation.isPending}
              onChange={(e) => setDisbursedAmount(e.target.value)}
              placeholder="e.g. 75000"
              className="text-xs font-mono"
            />
          </div>

          {/* Checker Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t('authNotesLabel')}
            </label>
            <Textarea
              value={notes}
              disabled={isMaker || authorizeMutation.isPending}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('authNotesPlaceholder')}
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
            disabled={authorizeMutation.isPending}
            className="text-slate-400 hover:text-slate-200 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => authorizeMutation.mutate()}
            disabled={isMaker || !isSuperAdmin || authorizeMutation.isPending}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1.5 shadow"
          >
            {authorizeMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCheck className="w-3.5 h-3.5" />
            )}
            <span>{authorizeMutation.isPending ? t('authorizing') : t('confirmAuthBtn')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
