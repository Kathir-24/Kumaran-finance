'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import {
  QrCode as QrCodeIcon,
  Copy,
  Check,
  Building2,
  ExternalLink,
  Loader2,
  X,
  ShieldCheck,
} from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface UpiQrDialogProps {
  dueId: string | null;
  ticketNumber: number;
  customerName: string;
  month: number;
  groupCode: string;
  netPayableAmount: number;
  isOpen: boolean;
  onClose: () => void;
}

export function UpiQrDialog({
  dueId,
  ticketNumber,
  customerName,
  month,
  groupCode,
  netPayableAmount,
  isOpen,
  onClose,
}: UpiQrDialogProps) {
  const t = useTranslations('installments');
  const [copied, setCopied] = React.useState(false);
  const [svgQr, setSvgQr] = React.useState<string | null>(null);

  // Fetch real NPCI UPI Intent from backend
  const { data: upiData, isLoading, error } = useQuery({
    queryKey: dueId ? queryKeys.installments.upiIntent(dueId) : ['installments', 'none'],
    queryFn: async () => {
      if (!dueId) return null;
      return unwrapApiResponse<any>(
        apiClient.GET('/api/v1/installments/{dueId}/upi-intent', {
          params: { path: { dueId } },
        })
      );
    },
    enabled: isOpen && !!dueId,
    staleTime: 60 * 1000,
  });

  // Generate SVG QR code when upiUri is available
  React.useEffect(() => {
    if (!upiData?.upiUri) {
      setSvgQr(null);
      return;
    }

    QRCode.toString(upiData.upiUri, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#020617', // slate-950
        light: '#ffffff',
      },
    })
      .then((svg) => setSvgQr(svg))
      .catch((err) => console.error('QR code generation failed:', err));
  }, [upiData?.upiUri]);

  const copyToClipboard = () => {
    if (!upiData?.upiUri) return;
    navigator.clipboard.writeText(upiData.upiUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-950 text-slate-100 sm:rounded-2xl p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <QrCodeIcon className="h-4 w-4" />
              <span>{t('upiQrTitle')}</span>
            </div>
            <Badge variant="paid" className="gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3" />
              <span>NPCI Compliant</span>
            </Badge>
          </div>
          <DialogTitle className="text-lg font-bold text-white">
            Ticket #{ticketNumber} • Month {month}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {customerName} • {groupCode}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Loading or QR Display Box */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-52 gap-2 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                <span className="text-xs">Generating NPCI UPI Intent...</span>
              </div>
            ) : svgQr ? (
              <div className="space-y-2 flex flex-col items-center">
                <div
                  className="h-48 w-48 rounded-lg bg-white p-2 shadow-inner"
                  dangerouslySetInnerHTML={{ __html: svgQr }}
                />
                <span className="text-[11px] text-slate-400 text-center">
                  {t('upiQrSubtitle')}
                </span>
              </div>
            ) : (
              <div className="h-52 flex items-center justify-center text-xs text-rose-400">
                Failed to load UPI intent. Try again.
              </div>
            )}
          </div>

          {/* Locked Amount and VPA Details */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">{t('upiAmountLocked')}:</span>
              <span className="text-base font-bold text-emerald-400">
                {formatRupee(upiData?.amount || netPayableAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 font-sans">{t('upiPayee')}:</span>
              <span className="text-slate-200">{upiData?.payeeVpa || 'kumaranfinance@kvb'}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 font-sans">{t('upiTransactionNote')}:</span>
              <span className="text-indigo-300 truncate max-w-[220px]">
                {upiData?.transactionNote || `KC/${groupCode}/TKT${ticketNumber}/M${month}`}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!upiData?.upiUri}
              onClick={copyToClipboard}
              className="w-full text-xs gap-1.5 border-slate-700 hover:bg-slate-800"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? t('copied') : t('copyUpiLink')}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
