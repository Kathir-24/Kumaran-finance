'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, AlertCircle, Loader2, CheckCircle, ShieldCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRupee } from '@/lib/currency';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { CounterUpiQr } from './counter-upi-qr';

export type PaymentMethod = 'CASH' | 'UPI' | 'CHEQUE' | 'BANK_TRANSFER';

interface CounterPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (paymentId: string) => void;
  preselectedChitGroupId?: string;
  preselectedTicketId?: string;
}

export function CounterPaymentModal({
  isOpen,
  onClose,
  onPaymentSuccess,
  preselectedChitGroupId,
  preselectedTicketId,
}: CounterPaymentModalProps) {
  const t = useTranslations('collections');
  const queryClient = useQueryClient();

  const [selectedGroupId, setSelectedGroupId] = useState<string>(preselectedChitGroupId || '');
  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const [selectedDueId, setSelectedDueId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch active schemes
  const { data: schemesData } = useQuery({
    queryKey: queryKeys.schemes.list(),
    queryFn: async () => {
      const token = getStoredAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/chit-groups?limit=100`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to load schemes');
      const json = await res.json();
      return json?.data?.data ?? json?.data ?? [];
    },
    enabled: isOpen,
  });

  const schemes = useMemo(() => (Array.isArray(schemesData) ? schemesData : []), [schemesData]);

  useEffect(() => {
    if (!selectedGroupId && schemes.length > 0) {
      setSelectedGroupId(schemes[0].id);
      setSelectedMonth(schemes[0].currentInstallmentMonth || 1);
    }
  }, [schemes, selectedGroupId]);

  const activeScheme = useMemo(
    () => schemes.find((s: any) => s.id === selectedGroupId),
    [schemes, selectedGroupId],
  );

  // Fetch dues for scheme and month
  const { data: duesData, isLoading: duesLoading } = useQuery({
    queryKey: queryKeys.installments.groupMonth(selectedGroupId, selectedMonth),
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const token = getStoredAccessToken();
      const res = await fetch(
        `${getApiBaseUrl()}/api/v1/installments/group/${selectedGroupId}/month/${selectedMonth}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error('Failed to load monthly dues');
      const json = await res.json();
      return json?.data ?? [];
    },
    enabled: isOpen && Boolean(selectedGroupId) && selectedMonth >= 1,
  });

  const dues = useMemo(() => (Array.isArray(duesData) ? duesData : []), [duesData]);
  const unpaidDues = useMemo(
    () => dues.filter((d: any) => d.status === 'UNPAID' || d.status === 'OVERDUE'),
    [dues],
  );

  useEffect(() => {
    if (unpaidDues.length > 0) {
      if (preselectedTicketId) {
        const match = unpaidDues.find((d: any) => d.ticketId === preselectedTicketId);
        setSelectedDueId(match ? match.id : unpaidDues[0].id);
      } else if (!selectedDueId || !unpaidDues.some((d: any) => d.id === selectedDueId)) {
        setSelectedDueId(unpaidDues[0].id);
      }
    } else {
      setSelectedDueId('');
    }
  }, [unpaidDues, preselectedTicketId, selectedDueId]);

  const selectedDue = useMemo(
    () => dues.find((d: any) => d.id === selectedDueId),
    [dues, selectedDueId],
  );

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDue) throw new Error('No due selected');
      setErrorMessage(null);
      const token = getStoredAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ticketId: selectedDue.ticketId,
          installmentMonth: selectedDue.installmentMonth,
          amount: Number(selectedDue.netPayableAmount),
          paymentMethod,
          transactionRef: transactionRef.trim() || undefined,
          notes: notes.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || 'Failed to record counter payment');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const paymentId = data?.data?.payment?.id || data?.payment?.id || data?.data?.id;
      onClose();
      if (paymentId) onPaymentSuccess(paymentId);
    },
    onError: (err: any) => setErrorMessage(err.message || 'Error recording payment'),
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-400">
            <Banknote className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">{t('collectPaymentBtn')}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('exactDue')} • {t('discretePaymentOnly')}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-300">{t('selectSchemeLabel')}</label>
              <select
                value={selectedGroupId}
                onChange={(e) => {
                  setSelectedGroupId(e.target.value);
                  const grp = schemes.find((s: any) => s.id === e.target.value);
                  if (grp) setSelectedMonth(grp.currentInstallmentMonth || 1);
                }}
                className="w-full mt-1 h-8 rounded-md border border-slate-700 bg-slate-800 px-2.5 text-xs text-slate-100"
              >
                {schemes.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.groupCode} ({formatRupee(s.chitValue)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-300">{t('selectDueMonthLabel')}</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full mt-1 h-8 rounded-md border border-slate-700 bg-slate-800 px-2.5 text-xs text-slate-100"
              >
                {Array.from({ length: activeScheme?.durationMonths || 20 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>Month #{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-300">{t('selectTicketLabel')}</label>
            {duesLoading ? (
              <div className="mt-1 flex items-center gap-2 text-slate-400 py-1.5">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Loading subscriber dues...</span>
              </div>
            ) : unpaidDues.length === 0 ? (
              <div className="mt-1 p-2.5 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 text-center">
                All dues for Month #{selectedMonth} are settled. No unpaid tickets found.
              </div>
            ) : (
              <select
                value={selectedDueId}
                onChange={(e) => setSelectedDueId(e.target.value)}
                className="w-full mt-1 h-8 rounded-md border border-slate-700 bg-slate-800 px-2.5 text-xs text-slate-100 font-mono"
              >
                {unpaidDues.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    T#{d.ticket?.ticketNumber || d.ticketNumber || '—'} - {d.ticket?.customer?.name || d.subscriberName || 'Member'} ({formatRupee(d.netPayableAmount)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedDue && (
            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>{t('baseInstallmentLabel')}</span>
                <span className="font-mono">{formatRupee(selectedDue.grossAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400">
                <span>{t('dividendCreditLabel')}</span>
                <span className="font-mono">- {formatRupee(selectedDue.dividendDeduction)}</span>
              </div>
              <div className="border-t border-slate-800/80 pt-1 flex items-center justify-between font-bold text-slate-100">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span>{t('netPayableLabel')} (ADR-07 Locked)</span>
                </div>
                <span className="text-base font-mono text-emerald-400">
                  {formatRupee(selectedDue.netPayableAmount)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] text-slate-300">{t('paymentMethodLabel')}</label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {(['CASH', 'UPI', 'CHEQUE', 'BANK_TRANSFER'] as PaymentMethod[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMethod(mode)}
                  className={`py-1.5 px-1 rounded-lg border text-center transition-all ${
                    paymentMethod === mode
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-semibold'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px]">{mode.replace('_', ' ')}</div>
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'UPI' && selectedDue && (
            <CounterUpiQr dueId={selectedDue.id} netPayableAmount={selectedDue.netPayableAmount} />
          )}

          {paymentMethod === 'CASH' && (
            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{t('cashDrawerNotice')}</span>
            </div>
          )}

          {(paymentMethod === 'CHEQUE' || paymentMethod === 'BANK_TRANSFER') && (
            <div>
              <label className="text-[11px] text-slate-300">
                {paymentMethod === 'CHEQUE' ? t('chequeDetailsLabel') : t('bankUtrLabel')}
              </label>
              <Input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder={paymentMethod === 'CHEQUE' ? t('chequeDetailsPlaceholder') : t('bankUtrPlaceholder')}
                className="mt-1 h-8 bg-slate-800 border-slate-700 text-xs text-slate-100"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] text-slate-300">{t('cashierNotesLabel')}</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('cashierNotesPlaceholder')}
              className="mt-1 h-8 bg-slate-800 border-slate-700 text-xs text-slate-100"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="border-slate-700 hover:bg-slate-800 text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => recordPaymentMutation.mutate()}
            disabled={!selectedDue || recordPaymentMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
          >
            {recordPaymentMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                {t('recordingPayment')}
              </>
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                {t('confirmPaymentBtn')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
