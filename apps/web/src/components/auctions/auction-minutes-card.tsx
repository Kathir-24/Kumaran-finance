'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  FileText,
  FileCheck2,
  Download,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Calendar,
  Users,
  ShieldCheck,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';

export interface AuctionMinutesData {
  id: string;
  subscribersPresent: number;
  minutesText: string;
  signedByForeman: boolean;
  filedAtRegistrar: boolean;
  filingReference?: string | null;
  filedDate?: string | Date | null;
  filingNotes?: string | null;
}

interface AuctionMinutesCardProps {
  auctionId: string;
  groupCode: string;
  groupName: string;
  installmentMonth: number;
  auctionDate: string;
  chitValue: number;
  bidDiscount: number;
  foremanCommissionAmount: number;
  totalDividend: number;
  dividendPerTicket: number;
  prizeMoney: number;
  winnerTicketNumber: number;
  winnerCustomerName: string;
  minutes: AuctionMinutesData;
  onOpenFilingDialog: () => void;
}

export function AuctionMinutesCard({
  auctionId,
  groupCode,
  groupName,
  installmentMonth,
  auctionDate,
  chitValue,
  bidDiscount,
  foremanCommissionAmount,
  totalDividend,
  dividendPerTicket,
  prizeMoney,
  winnerTicketNumber,
  winnerCustomerName,
  minutes,
  onOpenFilingDialog,
}: AuctionMinutesCardProps) {
  const t = useTranslations('auctions');
  const [isDownloading, setIsDownloading] = React.useState(false);

  // 21-Day Statutory Filing Deadline calculation per Tamil Nadu Chit Funds Act Section 17
  const aucDate = new Date(auctionDate);
  const deadlineDate = new Date(aucDate.getTime() + 21 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const isOverdue = daysRemaining < 0;

  const isFiled = minutes.filedAtRegistrar;

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      const response = await unwrapApiResponse<{ presignedUrl?: string }>(
        apiClient.GET('/api/v1/pdf/minutes/{auctionId}' as any, {
          params: {
            path: { auctionId },
            query: { download: true },
          },
        }),
      );

      if (response?.presignedUrl) {
        window.open(response.presignedUrl, '_blank', 'noopener,noreferrer');
      } else {
        // Fallback: direct streaming URL
        const streamUrl = `/api/v1/pdf/minutes/${auctionId}`;
        window.open(streamUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      // Direct stream fallback
      window.open(`/api/v1/pdf/minutes/${auctionId}`, '_blank', 'noopener,noreferrer');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-purple-500/20 p-2 text-purple-400">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{t('minutesCardTitle')}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{t('minutesCardDesc')}</p>
          </div>
        </div>

        {/* Action Button: PDF Download */}
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadPdf}
          disabled={isDownloading}
          className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-8"
        >
          {isDownloading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5 text-purple-400" />
          )}
          <span>{isDownloading ? t('downloadingPdf') : t('downloadPdfMinutes')}</span>
        </Button>
      </div>

      {/* 21-Day Statutory Filing Tracker Banner */}
      <div
        className={`rounded-lg border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isFiled
            ? 'border-emerald-500/30 bg-emerald-950/20'
            : isOverdue
            ? 'border-red-500/40 bg-red-950/30'
            : 'border-amber-500/30 bg-amber-950/20'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">{t('filingDeadlineTitle')}</span>
            {isFiled ? (
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 bg-emerald-950/60 text-emerald-300">
                <CheckCircle2 className="h-3 w-3 mr-1 inline" />
                <span>{t('statusFiledAtRegistrar')}</span>
              </Badge>
            ) : isOverdue ? (
              <Badge variant="outline" className="text-[10px] border-red-500/40 bg-red-950/60 text-red-300">
                <AlertTriangle className="h-3 w-3 mr-1 inline" />
                <span>{t('filingOverdue', { days: Math.abs(daysRemaining) })}</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-950/60 text-amber-300">
                <Clock className="h-3 w-3 mr-1 inline" />
                <span>{t('filingDaysRemaining', { days: daysRemaining })}</span>
              </Badge>
            )}
          </div>

          {isFiled ? (
            <div className="text-[11px] text-emerald-200/90 flex flex-wrap items-center gap-2 font-mono">
              <span>Challan: <strong className="text-white">{minutes.filingReference || 'Recorded'}</strong></span>
              <span>•</span>
              <span>Date: {minutes.filedDate ? new Date(minutes.filedDate).toLocaleDateString() : '—'}</span>
              {minutes.filingNotes && <span>• {minutes.filingNotes}</span>}
            </div>
          ) : (
            <p className="text-[11px] text-slate-300">
              Tamil Nadu Chit Funds Rules mandate submission of Form XVII proceedings within 21 days (Deadline: {deadlineDate.toLocaleDateString()}).
            </p>
          )}
        </div>

        {!isFiled && (
          <Button
            size="sm"
            onClick={onOpenFilingDialog}
            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs h-8 whitespace-nowrap self-start sm:self-auto"
          >
            <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
            <span>{t('recordFilingAction')}</span>
          </Button>
        )}
      </div>

      {/* Form XVII Full Proceedings Monospace Preview */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Statutory Form XVII Text</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Signed by Foreman</span>
          </span>
        </div>
        <pre className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
          {minutes.minutesText}
        </pre>
      </div>

      {/* Statutory Foreman Declaration */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 text-[11px] text-slate-400 italic">
        {t('statutoryDeclaration')}
      </div>
    </div>
  );
}
