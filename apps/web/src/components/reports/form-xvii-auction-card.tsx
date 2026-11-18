'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck2,
  PenTool,
  Tag,
  User,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';
import { FormXviiAuctionRecord } from './form-xvii-viewer';

interface FormXviiAuctionCardProps {
  auction: FormXviiAuctionRecord;
  durationMonths: number;
  canRecordFiling: boolean;
  onRecordFilingClick: (auction: FormXviiAuctionRecord) => void;
  onDownloadPdfClick: (auctionId: string) => void;
}

export function FormXviiAuctionCard({
  auction,
  durationMonths,
  canRecordFiling,
  onRecordFilingClick,
  onDownloadPdfClick,
}: FormXviiAuctionCardProps) {
  const t = useTranslations('reports.minutes');
  const [isExpanded, setIsExpanded] = React.useState(false);

  const auctionDate = new Date(auction.auctionDate);
  const deadlineDate = new Date(auctionDate.getTime() + 21 * 24 * 60 * 60 * 1000);
  const daysRemaining = Math.ceil((deadlineDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const isOverdue = !auction.filedAtRegistrar && daysRemaining < 0;
  const isUrgent = !auction.filedAtRegistrar && daysRemaining >= 0 && daysRemaining <= 5;

  return (
    <Card
      className={cn(
        "border-slate-800 bg-slate-900/60 shadow-sm transition-all print:border-slate-300 print:bg-white",
        isOverdue && "border-rose-500/40 bg-rose-950/10",
        auction.filedAtRegistrar && "border-emerald-500/20"
      )}
    >
      <CardHeader className="pb-3 border-b border-slate-800/80 print:border-slate-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Month Tag & Date */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold text-sm shrink-0 font-mono">
              M{auction.installmentMonth}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white print:text-black">
                  {t('auctionMonth', { month: auction.installmentMonth, total: durationMonths })}
                </h3>
                {auction.winner?.wasTieBreakWinner && (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                    {t('tieBreakDetails')}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 print:text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Calendar className="h-3.5 w-3.5" />
                {auctionDate.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* 21-Day Filing Traffic Light Badge & Action */}
          <div className="flex items-center gap-2 flex-wrap">
            {auction.filedAtRegistrar ? (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1.5 py-1 px-2.5">
                <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>{t('filed')}</span>
                {auction.filingReference && (
                  <span className="font-mono text-[10px] text-emerald-200">
                    ({auction.filingReference})
                  </span>
                )}
              </Badge>
            ) : isOverdue ? (
              <Badge variant="destructive" className="bg-rose-600 text-white gap-1.5 py-1 px-2.5 animate-pulse">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{t('daysOverdue', { days: Math.abs(daysRemaining) })}</span>
              </Badge>
            ) : isUrgent ? (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1.5 py-1 px-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span>{t('urgent', { days: daysRemaining })}</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-700 text-slate-300 bg-slate-800/60 gap-1.5 py-1 px-2.5">
                <span>{t('daysLeft', { days: daysRemaining })}</span>
              </Badge>
            )}

            {/* Record Filing Action */}
            {!auction.filedAtRegistrar && canRecordFiling && (
              <Button
                size="sm"
                onClick={() => onRecordFilingClick(auction)}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-7 px-2.5 print:hidden"
              >
                {t('recordFiling')}
              </Button>
            )}

            {/* Download PDF Action */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDownloadPdfClick(auction.auctionId)}
              className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs h-7 px-2 print:hidden"
              title={t('downloadPdf')}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Financial Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs bg-slate-950/40 print:bg-slate-100 p-3 rounded-xl border border-slate-800/60 print:border-slate-300">
          <div>
            <span className="text-slate-400 print:text-slate-600 block">{t('bidDiscount')}</span>
            <span className="text-sm font-semibold text-white print:text-black font-mono">
              {formatRupee(auction.bidDiscount)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 print:text-slate-600 block">{t('prizeMoney')}</span>
            <span className="text-sm font-semibold text-emerald-400 print:text-emerald-700 font-mono">
              {formatRupee(auction.prizeMoney)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 print:text-slate-600 block">{t('commission')}</span>
            <span className="text-sm font-semibold text-purple-400 print:text-purple-700 font-mono">
              {formatRupee(auction.foremanCommissionAmount)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 print:text-slate-600 block">{t('dividendPerTicket')}</span>
            <span className="text-sm font-semibold text-sky-400 print:text-sky-700 font-mono">
              {formatRupee(auction.dividendPerTicket)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 print:text-slate-600 block">{t('netInstallment')}</span>
            <span className="text-sm font-semibold text-amber-300 print:text-amber-700 font-mono">
              {formatRupee(auction.nextMonthNetInstallment)}
            </span>
          </div>
        </div>

        {/* Winner Details & Signatures Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-t border-slate-800/60 print:border-slate-300 pt-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-slate-800 text-slate-400">
              <User className="h-3.5 w-3.5" />
            </div>
            <div>
              <span className="text-slate-400">{t('winner')}: </span>
              {auction.winner ? (
                <span className="font-semibold text-white print:text-black">
                  Ticket #{auction.winner.ticketNumber} • {auction.winner.fullName} ({auction.winner.customerCode})
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-xs">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              {t('subscribersPresent')}: <strong className="text-white print:text-black">{auction.subscribersPresent}</strong>
            </span>
            <span className="flex items-center gap-1">
              <PenTool className="h-3.5 w-3.5 text-emerald-400" />
              {t('foremanSigned')}: <strong className={auction.signedByForeman ? "text-emerald-400" : "text-slate-500"}>
                {auction.signedByForeman ? 'Yes' : 'No'}
              </strong>
            </span>
          </div>
        </div>

        {/* Tie-Break Details (Option A) */}
        {auction.winner?.wasTieBreakWinner && auction.tiedBidders && auction.tiedBidders.length > 0 && (
          <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-amber-400" />
              {t('tieBreakDetails')} — {t('tiedBiddersCount', { count: auction.tiedBidders.length })}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {auction.tiedBidders.map((tb) => (
                <Badge
                  key={tb.ticketNumber}
                  variant="outline"
                  className={cn(
                    "border-amber-500/30 text-[10px]",
                    tb.isWinner && "bg-amber-500/20 border-amber-400 text-white font-bold"
                  )}
                >
                  Token #{tb.tokenNumberDrawn} • #{tb.ticketNumber} {tb.customerName} {tb.isWinner ? '★ WINNER' : ''}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Expandable Statutory Proceedings Monospace Preview */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1 transition-colors print:hidden"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {isExpanded ? t('collapseProceedings') : t('expandProceedings')}
          </button>

          <div
            className={cn(
              'mt-2.5 rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed print:block print:bg-white print:text-black print:border-slate-300',
              !isExpanded && 'hidden',
            )}
          >
            {auction.minutesProceedingsText}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
