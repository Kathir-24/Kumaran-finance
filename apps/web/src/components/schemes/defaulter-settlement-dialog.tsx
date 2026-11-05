'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileCheck2,
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
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatRupee } from '@/lib/currency';
import type { DefaulterTicketRef } from './defaulter-removal-dialog';

interface SettleResult {
  voucherNumber: string;
  totalPaid: number;
  damagesDeducted: number;
  refundAmount: number;
  settledAt: string;
  customerName: string;
}

interface DefaulterSettlementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: DefaulterTicketRef | null;
  chitGroupId: string;
  chitGroupCode: string;
  chitValue: bigint | number;
  totalPaidEstimate?: bigint | number;
  onSuccess?: () => void;
}

export function DefaulterSettlementDialog({
  isOpen,
  onClose,
  ticket,
  chitGroupId,
  chitGroupCode,
  chitValue,
  totalPaidEstimate = 0n,
  onSuccess,
}: DefaulterSettlementDialogProps) {
  const t = useTranslations('schemes');
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [paymentMethod, setPaymentMethod] = React.useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [notes, setNotes] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [voucherData, setVoucherData] = React.useState<SettleResult | null>(null);

  const isSuperAdmin = Boolean(user?.roles?.includes('SUPER_ADMIN')) || (user as any)?.role === 'SUPER_ADMIN';
  const isAccountant = Boolean(user?.roles?.includes('ACCOUNTANT')) || (user as any)?.role === 'ACCOUNTANT';
  const canSettle = isSuperAdmin || isAccountant;

  const valueBigInt = BigInt(chitValue || 0);
  const damagesAmount = (valueBigInt * 4n) / 100n;
  const paidBigInt = BigInt(totalPaidEstimate || 0);
  const estimatedRefund = paidBigInt > damagesAmount ? paidBigInt - damagesAmount : 0n;

  React.useEffect(() => {
    if (isOpen) {
      setPaymentMethod('CASH');
      setNotes('');
      setErrorMsg(null);
      setVoucherData(null);
    }
  }, [isOpen]);

  const settleMutation = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error('No ticket selected');
      return unwrapApiResponse<SettleResult>(
        apiClient.POST('/api/v1/tickets/{id}/settle-removal' as any, {
          params: { path: { id: ticket.id } },
          body: {
            paymentMethod,
            notes: notes.trim() || undefined,
          },
        }),
      );
    },
    onSuccess: (data) => {
      setVoucherData(data);
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.installments.all });
      onSuccess?.();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to settle defaulter account');
    },
  });

  if (!ticket) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2 text-indigo-400">
            <Receipt className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {voucherData ? t('exitVoucherTitle') : t('settleModalTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 pt-1">
            {t('settleModalDesc', {
              name: ticket.customerName,
              ticketNumber: ticket.ticketNumber,
            })}
          </DialogDescription>
        </DialogHeader>

        {voucherData ? (
          /* Exit Refund Voucher Presentation */
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
                <span className="text-xs text-indigo-300 font-medium">{t('voucherNumberLabel')}</span>
                <span className="font-mono text-sm font-bold text-emerald-400 tracking-wider">
                  {voucherData.voucherNumber}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Subscriber</span>
                <span className="font-medium text-slate-200">{voucherData.customerName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">{t('totalPaidAmountLabel')}</span>
                <span className="font-mono font-semibold text-slate-200">
                  {formatRupee(voucherData.totalPaid)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">{t('foremanCommissionDamagesLabel')}</span>
                <span className="font-mono font-semibold text-rose-400">
                  -{formatRupee(voucherData.damagesDeducted)}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-indigo-500/20 pt-2 text-xs">
                <span className="text-slate-200 font-bold">{t('disbursedAmountLabel')}</span>
                <span className="font-mono text-base font-bold text-emerald-400">
                  {formatRupee(voucherData.refundAmount)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{t('printVoucher')}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onClose}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                {t('close')}
              </Button>
            </div>
          </div>
        ) : (
          /* Settlement Preparation & Form */
          <div className="space-y-3.5">
            {/* Financial Math Breakdown */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Chit Scheme Value (V)</span>
                <span className="font-mono font-semibold text-slate-200">{formatRupee(valueBigInt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">{t('foremanCommissionDamagesLabel')} (4%)</span>
                <span className="font-mono font-bold text-rose-400">-{formatRupee(damagesAmount)}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                <span className="text-slate-300 font-semibold">{t('netRefundPayableLabel')}</span>
                <span className="font-mono font-bold text-emerald-400">{formatRupee(estimatedRefund)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t('paymentMethodLabel')}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="CASH">Cash (In-Office Handover)</option>
                <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="CHEQUE">Bank Cheque</option>
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t('settlementNotesLabel')}
              </label>
              <Textarea
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder={t('settlementNotesPlaceholder')}
                rows={2}
                className="text-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
              />
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
                disabled={settleMutation.isPending}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canSettle || settleMutation.isPending}
                onClick={() => settleMutation.mutate()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs gap-1.5"
              >
                {settleMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{t('settling')}</span>
                  </>
                ) : (
                  <>
                    <Receipt className="h-3.5 w-3.5" />
                    <span>{t('confirmSettlement')}</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
