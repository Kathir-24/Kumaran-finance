'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw,
  Search,
  AlertTriangle,
  Loader2,
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
import { formatRupee } from '@/lib/currency';
import { apiClient, getErrorMessage, unwrapApiResponse, unwrapPaginatedList } from '@/lib/api-client';

interface SearchablePaymentRecord {
  id: string;
  amount: string | number;
  paymentMethod: string;
  createdAt: string;
  receipt?: { receiptNumber?: string };
  allocations?: Array<{
    ticket?: {
      ticketNumber?: number;
      customer?: { fullName?: string; customerCode?: string };
      chitGroup?: { groupCode?: string };
    };
    due?: { installmentMonth?: number };
  }>;
}

export interface PaymentPreview {
  id: string;
  receiptNumber: string;
  amount: number;
  customerName: string;
  customerCode: string;
  groupCode: string;
  ticketNumber: number;
  installmentMonth: number;
  paymentMethod: string;
  createdAt: string;
}

interface ReversalRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPayment?: PaymentPreview | null;
  onSuccess?: () => void;
}

const REASON_CODES = [
  { value: 'WRONG_TICKET_ENTERED', key: 'reasonWrongTicket' },
  { value: 'CHEQUE_BOUNCED', key: 'reasonChequeBounced' },
  { value: 'DUPLICATE_ENTRY', key: 'reasonDuplicateEntry' },
  { value: 'CUSTOMER_DISPUTE', key: 'reasonCustomerDispute' },
  { value: 'OTHER', key: 'reasonOther' },
] as const;

export function ReversalRequestModal({
  isOpen,
  onClose,
  initialPayment,
  onSuccess,
}: ReversalRequestModalProps) {
  const t = useTranslations('reversals');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentPreview | null>(initialPayment || null);

  const [reasonCode, setReasonCode] = useState<string>('WRONG_TICKET_ENTERED');
  const [justification, setJustification] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search payment by receipt number or payment ID
  const handleSearchPayment = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true);
    setErrorMessage(null);

    try {
      const result = await unwrapApiResponse<unknown>(
        apiClient.GET('/api/v1/payments', {
          params: { query: { limit: 5 } },
        }),
      );
      const list = unwrapPaginatedList<SearchablePaymentRecord>(result);

      const match = list.find(
        (p) =>
          p.id === q ||
          p.receipt?.receiptNumber?.toLowerCase() === q.toLowerCase() ||
          p.receipt?.receiptNumber?.toLowerCase().includes(q.toLowerCase()),
      );

      if (!match) {
        throw new Error(`No successful payment found matching "${q}"`);
      }

      const primaryAlloc = match.allocations?.[0];
      setSelectedPayment({
        id: match.id,
        receiptNumber: match.receipt?.receiptNumber || 'N/A',
        amount: Number(match.amount),
        customerName: primaryAlloc?.ticket?.customer?.fullName || 'Subscriber',
        customerCode: primaryAlloc?.ticket?.customer?.customerCode || 'N/A',
        groupCode: primaryAlloc?.ticket?.chitGroup?.groupCode || 'SCHEME',
        ticketNumber: primaryAlloc?.ticket?.ticketNumber || 1,
        installmentMonth: primaryAlloc?.due?.installmentMonth || 1,
        paymentMethod: match.paymentMethod,
        createdAt: match.createdAt,
      });
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, 'Payment not found'));
    } finally {
      setIsSearching(false);
    }
  };

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayment) throw new Error('Please select a payment record to reverse');
      const finalReason = reasonCode === 'OTHER' ? justification.trim() : `${reasonCode}: ${justification.trim()}`;
      if (finalReason.length < 5) {
        throw new Error('Mandatory justification must be at least 5 characters');
      }

      return unwrapApiResponse<unknown>(
        apiClient.POST('/api/v1/payments/{id}/request-reversal', {
          params: { path: { id: selectedPayment.id } },
          body: {
            reason: finalReason,
            notes: notes.trim() || undefined,
          },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reversals'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: unknown) => setErrorMessage(getErrorMessage(err, 'Error requesting payment reversal')),
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="bg-slate-950 p-5 border-b border-slate-800">
          <div className="flex items-center gap-2 text-rose-400">
            <RotateCcw className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('requestModalTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('requestModalSubtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Payment Lookup */}
          {!initialPayment && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                {t('searchPaymentLabel')}
              </label>
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="h-9 text-xs bg-slate-950 border-slate-800 text-slate-200 font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchPayment()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSearchPayment}
                  disabled={isSearching || !searchQuery.trim()}
                  className="h-9 border-slate-700 bg-slate-800 text-xs text-slate-200 hover:bg-slate-700"
                >
                  {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {/* Payment Card Preview */}
          {selectedPayment && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5" />
                  {selectedPayment.receiptNumber}
                </span>
                <span className="text-sm font-black font-mono text-slate-100">
                  {formatRupee(selectedPayment.amount)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-1">
                <div>
                  <p className="font-semibold text-slate-100">{selectedPayment.customerName}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{selectedPayment.customerCode}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-slate-200">{selectedPayment.groupCode} T#{selectedPayment.ticketNumber}</p>
                  <p className="text-[10px] text-slate-400">Month #{selectedPayment.installmentMonth}</p>
                </div>
              </div>
            </div>
          )}

          {/* Reason Code Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              {t('reasonCodeLabel')}
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              {REASON_CODES.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.key)}
                </option>
              ))}
            </select>
          </div>

          {/* Mandatory Justification */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              {t('justificationLabel')} *
            </label>
            <Input
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t('justificationPlaceholder')}
              className="h-9 text-xs bg-slate-950 border-slate-800 text-slate-200"
            />
          </div>

          {/* Supporting Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              {t('supportingNotesLabel')}
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('supportingNotesPlaceholder')}
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
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!selectedPayment || justification.trim().length < 5 || requestMutation.isPending}
            onClick={() => requestMutation.mutate()}
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs h-9 px-4 disabled:opacity-40"
          >
            {requestMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t('submittingRequest')}
              </>
            ) : (
              t('submitRequestBtn')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
