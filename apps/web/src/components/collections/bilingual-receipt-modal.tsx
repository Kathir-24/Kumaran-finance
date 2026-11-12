'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Download,
  Printer,
  AlertCircle,
  Loader2,
  Building,
  User,
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
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';
import { downloadReceiptPdf } from '@/lib/pdf-download';
import type { ReceiptData } from '@/components/print/receipt-print-template';
import { queryKeys } from '@/lib/query-keys';

interface BilingualReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentId: string | null;
}

export function BilingualReceiptModal({
  isOpen,
  onClose,
  paymentId,
}: BilingualReceiptModalProps) {
  const t = useTranslations('collections');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.payments.receipt(paymentId || ''),
    queryFn: async ({ signal }) => {
      if (!paymentId) return null;
      return unwrapApiResponse<{ data?: ReceiptData; receiptNumber?: string; issuedAt?: string | Date }>(
        apiClient.GET('/api/v1/payments/{id}/receipt', {
          params: { path: { id: paymentId } },
          signal,
        }),
      );
    },
    enabled: isOpen && Boolean(paymentId),
  });

  const handleDownloadPdf = async () => {
    if (!paymentId) return;
    setDownloadingPdf(true);
    try {
      await downloadReceiptPdf(
        paymentId,
        `receipt-${data?.receiptNumber || paymentId.slice(0, 8)}.pdf`,
      );
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Error downloading PDF receipt'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const receiptData = data?.data;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-emerald-400">
            <FileText className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('receiptTitle')} / சந்தா ரசீது
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('receiptSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin mx-auto mb-2 text-emerald-400" />
            <p className="text-xs">Loading receipt details...</p>
          </div>
        ) : error || !data ? (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to load receipt record</span>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Header / Receipt Metadata */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block">{t('receiptNumber')}</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {data.receiptNumber}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block">{t('receiptDate')}</span>
                <span className="text-xs font-mono text-slate-200">
                  {formatDate(data.issuedAt)}
                </span>
              </div>
            </div>

            {/* Subscriber & Scheme Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium text-[11px]">
                  <User className="h-3.5 w-3.5 text-sky-400" />
                  <span>{t('subscriberDetails')}</span>
                </div>
                <div className="text-sm font-semibold text-slate-100">
                  {receiptData?.subscriberName || 'Subscriber'}
                </div>
                {receiptData?.subscriberTamilName && (
                  <div className="text-xs text-slate-300">
                    {receiptData.subscriberTamilName}
                  </div>
                )}
                <div className="text-[11px] font-mono text-slate-400">
                  Ph: {receiptData?.subscriberMobile || '—'}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium text-[11px]">
                  <Building className="h-3.5 w-3.5 text-amber-400" />
                  <span>Chit Details</span>
                </div>
                <div className="text-sm font-semibold text-slate-100">
                  {receiptData?.chitGroupCode || '—'}
                </div>
                <div className="text-[11px] font-mono text-slate-300">
                  Ticket #{receiptData?.ticketNumber} • Month #{receiptData?.installmentMonth}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Value: {receiptData?.chitValue ? formatRupee(receiptData.chitValue) : '—'}
                </div>
              </div>
            </div>

            {/* Financial Due Matching Breakdown */}
            <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/10 space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span>{t('baseInstallmentLabel')}</span>
                <span className="font-mono">{formatRupee(receiptData?.baseInstallment ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center text-emerald-400">
                <span>{t('dividendCreditLabel')}</span>
                <span className="font-mono">- {formatRupee(receiptData?.dividendDeduction ?? 0)}</span>
              </div>
              <div className="border-t border-slate-800/80 pt-2 flex justify-between items-center font-bold text-slate-100">
                <span className="text-sm">{t('netPayableLabel')}</span>
                <span className="text-base font-mono text-emerald-400">
                  {formatRupee(receiptData?.amountPaid ?? receiptData?.netPayableAmount ?? 0)}
                </span>
              </div>
            </div>

            {/* Payment Mode & Branch */}
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-between text-slate-300">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <span>Mode:</span>
                <Badge variant="outline" className="text-xs bg-slate-900 border-slate-700 text-slate-200">
                  {receiptData?.paymentMethod || 'CASH'}
                </Badge>
                {receiptData?.transactionRef && (
                  <span className="font-mono text-[11px] text-slate-400">
                    Ref: {receiptData.transactionRef}
                  </span>
                )}
              </div>
              <div className="text-right text-[11px] text-slate-400">
                Branch: {receiptData?.branchName || 'Head Office - Perundurai'}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            {t('printReceipt')}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-slate-700 hover:bg-slate-800 text-xs"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || !data}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
            >
              {downloadingPdf ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {t('downloadingPdf')}
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t('downloadPdfReceipt')}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
