'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Gavel } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@kumaran/api-client';
import { FormXviiAuctionCard } from './form-xvii-auction-card';

export interface FormXviiAuctionRecord {
  auctionId: string;
  installmentMonth: number;
  auctionDate: string;
  chitValue: number;
  bidDiscount: number;
  foremanCommissionAmount: number;
  foremanCommissionRate?: string;
  totalDividend: number;
  dividendPerTicket: number;
  nextMonthNetInstallment: number;
  prizeMoney: number;
  winner: {
    ticketNumber?: number;
    customerCode: string;
    fullName: string;
    fullNameTamil?: string;
    phone: string;
    wasTieBreakWinner?: boolean;
  } | null;
  tiedBiddersCount: number;
  tiedBidders?: Array<{
    ticketNumber: number;
    customerCode: string;
    customerName: string;
    tokenNumberDrawn: number;
    isWinner: boolean;
  }>;
  subscribersPresent: number;
  minutesProceedingsText: string;
  signedByForeman: boolean;
  filedAtRegistrar: boolean;
  filedDate?: string | null;
  filingReference?: string | null;
  filingNotes?: string | null;
}

export interface FormXviiReportData {
  statutoryStatus?: string;
  registerName?: string;
  chitGroup: {
    id: string;
    groupCode: string;
    groupName: string;
    chitValue: number;
    durationMonths: number;
    baseInstallment: number;
    branchName: string;
    branchNameTamil?: string;
  };
  totalAuctionsFinalized: number;
  auctions: FormXviiAuctionRecord[];
}

interface FormXviiViewerProps {
  data: FormXviiReportData;
  canRecordFiling: boolean;
  onRecordFilingClick: (auction: FormXviiAuctionRecord) => void;
  onDownloadPdfClick: (auctionId: string) => void;
}

export function FormXviiViewer({
  data,
  canRecordFiling,
  onRecordFilingClick,
  onDownloadPdfClick,
}: FormXviiViewerProps) {
  const t = useTranslations('reports.minutes');

  const chit = data.chitGroup;
  const auctions = data.auctions || [];

  return (
    <div className="space-y-6">
      {/* Scheme Parameters Overview Card */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-sm print:border-slate-300 print:bg-white">
        <CardHeader className="pb-3 border-b border-slate-800 print:border-slate-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-white print:text-black">
                {chit.groupName} ({chit.groupCode})
              </CardTitle>
              <p className="text-xs text-slate-400 print:text-slate-600 mt-0.5">
                {chit.branchName} • {chit.durationMonths} Months Duration
              </p>
            </div>
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 w-fit">
              Section 24 Form XVII Register
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 print:text-slate-600 block">{t('chitValue')}</span>
              <span className="text-sm font-semibold text-white print:text-black font-mono">
                {formatRupee(chit.chitValue)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 print:text-slate-600 block">{t('baseInstallment')}</span>
              <span className="text-sm font-semibold text-white print:text-black font-mono">
                {formatRupee(chit.baseInstallment)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 print:text-slate-600 block">{t('commission')}</span>
              <span className="text-sm font-semibold text-purple-400 print:text-purple-700 font-mono">
                {formatRupee(Number(BigInt(chit.chitValue) * 4n / 100n))} (4.00%)
              </span>
            </div>
            <div>
              <span className="text-slate-400 print:text-slate-600 block">{t('totalFinalized')}</span>
              <span className="text-sm font-semibold text-emerald-400 print:text-emerald-700 font-mono">
                {data.totalAuctionsFinalized} / {chit.durationMonths - 2}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Month-by-Month Auction Proceedings Cards */}
      {auctions.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/40 p-8 text-center">
          <Gavel className="mx-auto h-8 w-8 text-slate-600" />
          <h3 className="text-sm font-medium text-slate-300 mt-2">{t('noAuctions')}</h3>
          <p className="text-xs text-slate-500 mt-1">
            Auctions will appear here once finalized by the Checker Partner (Months 2 to {chit.durationMonths - 1}).
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {auctions.map((auction) => (
            <FormXviiAuctionCard
              key={auction.auctionId}
              auction={auction}
              durationMonths={chit.durationMonths}
              canRecordFiling={canRecordFiling}
              onRecordFilingClick={onRecordFilingClick}
              onDownloadPdfClick={onDownloadPdfClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
