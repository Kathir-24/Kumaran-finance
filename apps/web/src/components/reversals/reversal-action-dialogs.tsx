'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Receipt,
  User,
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
import { formatRupee } from '@/lib/currency';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';

export interface PendingReversalItem {
  id: string;
  paymentId: string;
  receiptNumber: string;
  amount: string | number;
  customerCode?: string;
  customerName?: string;
  reason: string;
  notes?: string;
  initiatedByUserId: string;
  createdAt: string;
}

interface ApproveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reversal: PendingReversalItem | null;
  onSuccess: () => void;
}

export function ApproveReversalDialog({
  isOpen,
  onClose,
  reversal,
  onSuccess,
}: ApproveDialogProps) {
  const t = useTranslations('reversals');
  const queryClient = useQueryClient();
  const [checkerNotes, setCheckerNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!reversal) return;
      const baseUrl = getApiBaseUrl();
      const token = getStoredAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/payments/${reversal.paymentId}/approve-reversal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ notes: checkerNotes.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || 'Failed to approve reversal');
      return body.data || body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reversals'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setCheckerNotes('');
      onClose();
      onSuccess();
    },
    onError: (err: any) => setErrorMessage(err.message || 'Error approving reversal'),
  });

  if (!reversal) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="bg-slate-950 p-5 border-b border-slate-800">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('approveReversalDialogTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('approveReversalDialogSubtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 text-xs">
          {/* Reversal Summary Box */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="font-mono font-bold text-emerald-400">{reversal.receiptNumber}</span>
              <span className="font-mono font-black text-slate-100 text-sm">{formatRupee(Number(reversal.amount))}</span>
            </div>
            <p className="text-slate-300 font-medium">
              {reversal.customerName} <span className="font-mono text-slate-400 text-[10px]">({reversal.customerCode})</span>
            </p>
            <div className="rounded bg-slate-900 p-2 text-[11px] text-slate-300 font-mono">
              <strong>Reason:</strong> {reversal.reason}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              {t('checkerNotesLabel')}
            </label>
            <Input
              value={checkerNotes}
              onChange={(e) => setCheckerNotes(e.target.value)}
              placeholder={t('checkerNotesPlaceholder')}
              className="h-9 text-xs bg-slate-950 border-slate-800 text-slate-200"
            />
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose} className="text-xs text-slate-400">
            Cancel
          </Button>
          <Button
            type="button"
            disabled={approveMutation.isPending}
            onClick={() => approveMutation.mutate()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 px-4"
          >
            {approveMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('approvingReversal')}
              </>
            ) : (
              t('confirmApproveBtn')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RejectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reversal: PendingReversalItem | null;
  onSuccess: () => void;
}

export function RejectReversalDialog({
  isOpen,
  onClose,
  reversal,
  onSuccess,
}: RejectDialogProps) {
  const t = useTranslations('reversals');
  const queryClient = useQueryClient();
  const [rejectionReason, setRejectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!reversal) return;
      if (rejectionReason.trim().length < 5) {
        throw new Error('Mandatory rejection reason must be at least 5 characters');
      }
      const baseUrl = getApiBaseUrl();
      const token = getStoredAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/payments/${reversal.paymentId}/reject-reversal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || 'Failed to reject reversal');
      return body.data || body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reversals'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setRejectionReason('');
      onClose();
      onSuccess();
    },
    onError: (err: any) => setErrorMessage(err.message || 'Error rejecting reversal'),
  });

  if (!reversal) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="bg-slate-950 p-5 border-b border-slate-800">
          <div className="flex items-center gap-2 text-rose-400">
            <XCircle className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('rejectReversalDialogTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('rejectReversalDialogSubtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-emerald-400">{reversal.receiptNumber}</span>
              <span className="font-mono font-black text-slate-100">{formatRupee(Number(reversal.amount))}</span>
            </div>
            <p className="text-slate-300">{reversal.customerName} ({reversal.customerCode})</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              {t('rejectionReasonLabel')} *
            </label>
            <Input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t('rejectionReasonPlaceholder')}
              className="h-9 text-xs bg-slate-950 border-slate-800 text-slate-200"
            />
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between sm:justify-between">
          <Button type="button" variant="ghost" onClick={onClose} className="text-xs text-slate-400">
            Cancel
          </Button>
          <Button
            type="button"
            disabled={rejectionReason.trim().length < 5 || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs h-9 px-4 disabled:opacity-40"
          >
            {rejectMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('rejectingReversal')}
              </>
            ) : (
              t('confirmRejectBtn')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
