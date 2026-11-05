'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  UserX,
  Loader2,
  ShieldAlert,
  CheckCircle2,
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
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface DefaulterTicketRef {
  id: string;
  ticketNumber: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  consecutiveUnpaidMonths: number;
  totalOverdueAmount: bigint | number;
  status: string;
}

interface DefaulterRemovalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: DefaulterTicketRef | null;
  chitGroupId: string;
  chitGroupCode: string;
  onSuccess?: () => void;
}

export function DefaulterRemovalDialog({
  isOpen,
  onClose,
  ticket,
  chitGroupId,
  chitGroupCode,
  onSuccess,
}: DefaulterRemovalDialogProps) {
  const t = useTranslations('schemes');
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [reason, setReason] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isSuperAdmin =
    Boolean(user?.roles?.includes('SUPER_ADMIN')) ||
    (user as any)?.role === 'SUPER_ADMIN';

  React.useEffect(() => {
    if (isOpen) {
      setReason('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error('No ticket selected');
      if (reason.trim().length < 10) {
        throw new Error(t('removeReasonMinLength'));
      }
      return unwrapApiResponse(
        apiClient.POST('/api/v1/tickets/{id}/remove-defaulter' as any, {
          params: { path: { id: ticket.id } },
          body: { reason: reason.trim() },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.installments.all });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to remove defaulted subscriber');
    },
  });

  if (!ticket) return null;

  const isEligible = ticket.consecutiveUnpaidMonths >= 3;
  const isReasonValid = reason.trim().length >= 10;
  const canSubmit = isSuperAdmin && isEligible && isReasonValid && !removeMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-rose-400">
            <UserX className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('removeModalTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 pt-1">
            {t('removeModalDesc', {
              ticketNumber: ticket.ticketNumber,
              name: ticket.customerName,
              groupCode: chitGroupCode,
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Super Admin Guard Banner */}
        {!isSuperAdmin && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{t('accessDeniedDesc')}</span>
          </div>
        )}

        {/* Ineligibility Warning if < 3 Months */}
        {!isEligible && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{t('removalBlockedTooltip')}</span>
          </div>
        )}

        {/* Ticket Summary Card */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 space-y-2 text-xs">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-slate-400">Chit Scheme</span>
            <span className="font-mono font-bold text-slate-200">{chitGroupCode}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-slate-400">Subscriber Ticket</span>
            <span className="font-mono font-bold text-emerald-400">
              Ticket #{ticket.ticketNumber} • {ticket.customerName}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Consecutive Default</span>
            <span className="font-mono font-bold text-rose-400">
              {ticket.consecutiveUnpaidMonths} Months Unpaid
            </span>
          </div>
        </div>

        {/* Reason / Notice Justification Form */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex justify-between">
            <span>{t('removeReasonLabel')}</span>
            <span className="text-[11px] text-slate-500 font-normal">
              {reason.trim().length} / 10 min chars
            </span>
          </label>
          <Textarea
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
            placeholder={t('removeReasonPlaceholder')}
            rows={3}
            disabled={!isSuperAdmin || !isEligible || removeMutation.isPending}
            className="text-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:border-rose-500"
          />
          {reason.trim().length > 0 && reason.trim().length < 10 && (
            <p className="text-[11px] text-rose-400">{t('removeReasonMinLength')}</p>
          )}
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={removeMutation.isPending}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => removeMutation.mutate()}
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs gap-1.5"
          >
            {removeMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('removing')}</span>
              </>
            ) : (
              <>
                <UserX className="h-3.5 w-3.5" />
                <span>{t('confirmRemoval')}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
