'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Download,
  Printer,
  Clock,
  AlertCircle,
  Loader2,
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
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { downloadVoucherPdf } from '@/lib/pdf-download';
import { queryKeys } from '@/lib/query-keys';

interface BilingualVoucherDialogProps {
  isOpen: boolean;
  onClose: () => void;
  auctionId: string;
}

export function BilingualVoucherDialog({
  isOpen,
  onClose,
  auctionId,
}: BilingualVoucherDialogProps) {
  const t = useTranslations('disbursements');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.disbursements.voucher(auctionId),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<any>(
        apiClient.GET('/api/v1/disbursements/auction/{auctionId}/voucher', {
          params: { path: { auctionId } },
          signal,
        }),
      );
    },
    enabled: isOpen && Boolean(auctionId),
  });

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadVoucherPdf(auctionId, `prize-voucher-${auctionId.slice(0, 8)}.pdf`);
    } catch (err: any) {
      alert(err.message || 'Error downloading PDF voucher');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2.5 text-emerald-400">
            <FileText className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('viewVoucherDialogTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 pt-1">
            {t('viewVoucherDialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-500" />
              <p className="text-xs">Loading voucher details...</p>
            </div>
          ) : error || !data ? (
            <div className="p-6 text-center text-rose-300">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
              <p className="text-xs">Failed to load voucher information</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Voucher Header Meta */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-slate-400">VOUCHER NUMBER</div>
                  <div className="text-sm font-mono font-bold text-slate-100">
                    {data.voucherNumber || `KC-VCHR-${auctionId.slice(0, 8).toUpperCase()}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-mono text-slate-400">DATE ISSUED</div>
                  <div className="text-xs font-mono text-slate-200">
                    {data.issuedAt ? formatDate(data.issuedAt) : '—'}
                  </div>
                </div>
              </div>

              {/* Monospace Formatted Layout Preview */}
              {data.formattedText ? (
                <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950 font-mono text-[11px] text-slate-300 whitespace-pre-wrap overflow-x-auto max-h-64 leading-relaxed">
                  {data.formattedText}
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/40 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Gross Chit Pool (V):</span>
                    <span className="font-mono text-slate-200">{formatRupee(data.data?.grossPrize ?? 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Auction Bid Discount (D):</span>
                    <span className="font-mono text-amber-400">{formatRupee(data.data?.bidDiscount ?? 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">4% Foreman Commission:</span>
                    <span className="font-mono text-blue-400">{formatRupee(data.data?.foremanCommission ?? 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-emerald-400">
                    <span>Net Prize Money Payable (P):</span>
                    <span className="font-mono text-sm">{formatRupee(data.data?.netPrizeMoney ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xs"
          >
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('printVoucher')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || isLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow"
            >
              {downloadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{downloadingPdf ? t('downloadingPdf') : t('downloadPdfVoucher')}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
