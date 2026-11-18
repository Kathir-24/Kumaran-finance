'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Printer, Download, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { RupeeWords } from '@/lib/rupee-words';
import { downloadReceiptPdf } from '@/lib/pdf-download';
import { getErrorMessage } from '@/lib/api-client';
import {
  formatIstDisplayDate,
  formatIstDisplayTime,
  toSafeBigInt,
  type WholeRupeeValue,
} from '@/components/reports/report-bigint';

export interface ReceiptData {
  receiptNumber: string;
  issuedAt: string | Date;
  chitGroupCode: string;
  chitValue?: WholeRupeeValue;
  durationMonths: number;
  installmentMonth: number;
  ticketNumber: number;
  subscriberName: string;
  subscriberTamilName?: string | null;
  subscriberAddress?: string | null;
  subscriberMobile: string;
  baseInstallment: WholeRupeeValue;
  dividendDeduction: WholeRupeeValue;
  netPayableAmount: WholeRupeeValue;
  amountPaid: WholeRupeeValue;
  paymentMethod: string;
  transactionRef?: string | null;
  collectorName: string;
  collectorPhone?: string | null;
  branchName?: string | null;
  branchTamilName?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
  isReversed?: boolean;
}

interface ReceiptPrintTemplateProps {
  paymentId: string;
  receipt: ReceiptData;
}

export function ReceiptPrintTemplate({ paymentId, receipt }: ReceiptPrintTemplateProps) {
  const t = useTranslations('print');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const formattedDate = formatIstDisplayDate(receipt.issuedAt);
  const formattedTime = formatIstDisplayTime(receipt.issuedAt);

  const baseInstallmentBig = toSafeBigInt(receipt.baseInstallment);
  const dividendDeductionBig = toSafeBigInt(receipt.dividendDeduction);
  const netPayableAmountBig = toSafeBigInt(receipt.netPayableAmount);
  const amountPaidBig = toSafeBigInt(receipt.amountPaid);

  const englishWords = RupeeWords.toEnglishWords(amountPaidBig);
  const tamilWords = RupeeWords.toTamilWords(amountPaidBig);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      setDownloadError(null);
      await downloadReceiptPdf(paymentId, `receipt-${receipt.receiptNumber}.pdf`);
    } catch (err: unknown) {
      setDownloadError(getErrorMessage(err, 'Failed to download receipt PDF'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Top Floating Action Bar (Hidden during Print) */}
      <div className="w-full max-w-[148mm] mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-md print:hidden">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800 px-2.5 shrink-0 self-start sm:self-auto"
        >
          <Link href="/collections">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            {t('controls.backToCollections')}
          </Link>
        </Button>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => window.print()}
            size="sm"
            className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 shadow-sm shrink-0"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            {t('controls.printA5')}
          </Button>

          <Button
            onClick={handleDownloadPdf}
            disabled={downloading}
            variant="outline"
            size="sm"
            className="h-8 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white text-xs px-3 shrink-0"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-blue-400 shrink-0" />
            {downloading ? t('controls.downloading') : t('controls.downloadPdf')}
          </Button>
        </div>
      </div>

      {downloadError && (
        <div className="w-full max-w-[148mm] mb-3 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2.5 text-xs text-rose-200 flex items-center gap-2 print:hidden">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {/* ADR-11 Standard Notice (Hidden during Print) */}
      <div className="w-full max-w-[148mm] mb-3 text-center text-[11px] text-slate-400 font-sans print:hidden">
        {t('controls.scaleNotice')}
      </div>

      {/* A5 Counter Receipt Document Canvas (Exact 148mm Width) */}
      <div className="w-full max-w-[148mm] min-h-[210mm] bg-white text-slate-900 p-6 sm:p-7 rounded-sm shadow-2xl relative border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full print:m-0">
        {/* Reversal Diagonal Watermark */}
        {receipt.isReversed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden">
            <div className="text-[#DC2626]/30 font-bold text-[28pt] uppercase tracking-widest transform -rotate-[35deg] border-4 border-dashed border-[#DC2626]/40 px-6 py-2.5 rounded-lg text-center leading-tight">
              {t('receipt.reversedWatermark')}
            </div>
          </div>
        )}

        {/* 1. Header / Letterhead */}
        <div className="text-center pb-3 border-b-2 border-slate-800 space-y-0.5">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-black uppercase font-serif">
            {t('receipt.companyTitle')}
          </h1>
          <p className="text-xs font-semibold text-slate-800">
            {t('receipt.companySub')}
          </p>
          <p className="text-[11px] text-slate-700">
            {receipt.branchAddress || t('receipt.companyAddress')}
          </p>
          <p className="text-[11px] text-slate-700">
            {receipt.branchPhone || t('receipt.companyPhone')}
          </p>
        </div>

        {/* 2. Receipt Title Banner */}
        <div className="text-center py-2 border-b border-slate-400 my-2 bg-slate-50">
          <h2 className="text-xs sm:text-sm font-bold tracking-wider text-black uppercase">
            {t('receipt.receiptTitle')}
          </h2>
        </div>

        {/* 3. Metadata 2-Column Grid */}
        <div className="grid grid-cols-2 gap-4 py-2 text-[11px] border-b border-slate-300">
          <div className="space-y-1">
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.receiptNo')}: </span>
              <span className="font-mono font-bold text-black">{receipt.receiptNumber}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.date')}: </span>
              <span className="font-medium text-black">{formattedDate} ({formattedTime})</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.paymentMode')}: </span>
              <span className="font-bold text-black uppercase">{receipt.paymentMethod}</span>
              {receipt.transactionRef && (
                <span className="text-slate-600 block text-[10px] font-mono">
                  Ref: {receipt.transactionRef}
                </span>
              )}
            </p>
          </div>

          <div className="space-y-1 text-right sm:text-left sm:pl-4">
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.chitGroup')}: </span>
              <span className="font-mono font-bold text-black">{receipt.chitGroupCode}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.month')}: </span>
              <span className="font-bold text-black">{receipt.installmentMonth} / {receipt.durationMonths}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.ticketNo')}: </span>
              <span className="font-mono font-bold text-black">#{receipt.ticketNumber}</span>
            </p>
          </div>
        </div>

        {/* 4. Subscriber Details Box */}
        <div className="py-2.5 px-3 my-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] space-y-0.5">
          <div className="font-semibold text-slate-800 uppercase tracking-wider text-[10px] mb-1">
            {t('receipt.subscriberDetails')}:
          </div>
          <p className="font-bold text-black text-xs">
            {receipt.subscriberName}
            {receipt.subscriberTamilName && ` (${receipt.subscriberTamilName})`}
          </p>
          {receipt.subscriberAddress && (
            <p className="text-slate-700 text-[11px]">{receipt.subscriberAddress}</p>
          )}
          <p className="text-slate-700 text-[11px]">
            {t('receipt.phone')}: <span className="font-mono font-medium">{receipt.subscriberMobile}</span>
          </p>
        </div>

        {/* 5. Financial Breakdown Table */}
        <div className="my-3 border border-slate-300 rounded overflow-hidden">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                <th className="py-1.5 px-3">{t('receipt.colDescription')}</th>
                <th className="py-1.5 px-3 text-right">{t('receipt.colAmount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-1.5 px-3 text-slate-700">{t('receipt.baseInstallment')}</td>
                <td className="py-1.5 px-3 text-right font-mono text-black">
                  {formatRupee(baseInstallmentBig)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-emerald-800 font-medium">{t('receipt.dividendCredit')}</td>
                <td className="py-1.5 px-3 text-right font-mono text-emerald-800 font-medium">
                  - {formatRupee(dividendDeductionBig)}
                </td>
              </tr>
              <tr className="bg-slate-50 font-semibold text-black">
                <td className="py-1.5 px-3">{t('receipt.netPayable')}</td>
                <td className="py-1.5 px-3 text-right font-mono">
                  {formatRupee(netPayableAmountBig)}
                </td>
              </tr>
              <tr className="bg-slate-200/80 font-bold text-black border-t-2 border-slate-400 text-xs">
                <td className="py-2 px-3 uppercase">{t('receipt.totalAmountPaid')}</td>
                <td className="py-2 px-3 text-right font-mono text-sm font-extrabold text-black">
                  {formatRupee(amountPaidBig)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 6. Rupee Words (Bilingual) */}
        <div className="my-2 p-2 rounded bg-slate-50 border border-slate-200 text-[10.5px] space-y-1">
          <p className="text-slate-800 leading-snug">
            <span className="font-semibold">{t('receipt.wordsTamil')}: </span>
            <span className="font-serif text-black">{tamilWords}</span>
          </p>
          <p className="text-slate-800 leading-snug">
            <span className="font-semibold">{t('receipt.wordsEnglish')}: </span>
            <span className="italic text-black">{englishWords}</span>
          </p>
        </div>

        {/* 7. Signatures & Disclaimers */}
        <div className="pt-6 pb-2 border-t border-slate-300 mt-4 flex items-end justify-between text-[11px]">
          <div>
            <p className="text-slate-600 text-[10px]">{t('receipt.recordedBy')}:</p>
            <p className="font-semibold text-black mt-0.5">{receipt.collectorName}</p>
          </div>

          <div className="text-right">
            <div className="w-36 border-b border-dashed border-slate-400 mb-1" />
            <p className="text-[10px] text-slate-600">{t('receipt.authorizedSign')}</p>
          </div>
        </div>

        {/* 8. Statutory ADR-11 Ground Truth Disclaimers */}
        <div className="pt-3 mt-2 border-t border-slate-200 text-[9px] text-slate-600 text-center space-y-0.5 leading-tight">
          <p>{t('receipt.disclaimer1')}</p>
          <p className="font-medium text-slate-700">{t('receipt.disclaimer2')}</p>
          <p>{t('receipt.disclaimer3')}</p>
        </div>
      </div>
    </div>
  );
}
