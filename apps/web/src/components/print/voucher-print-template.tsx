'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Printer, Download, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { RupeeWords } from '@/lib/rupee-words';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';

export interface VoucherData {
  voucherNumber: string;
  disbursedAt: string | Date;
  chitGroupCode: string;
  chitValue: bigint | number;
  installmentMonth: number;
  ticketNumber: number;
  winnerCode: string;
  winnerName: string;
  winnerNameTamil?: string | null;
  winnerPhone: string;
  bidDiscount: bigint | number;
  netPrizeMoney: bigint | number;
  disbursementMode: string;
  paymentReference?: string | null;
  agreementSigned?: boolean;
  nomineeSigned?: boolean;
  isSecurityRequired?: boolean;
  blankChequeDetails?: string | null;
  verifiedByUserName: string;
  authorizedByUserName: string;
  branchName?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
}

interface VoucherPrintTemplateProps {
  auctionId: string;
  voucher: VoucherData;
}

export function VoucherPrintTemplate({ auctionId, voucher }: VoucherPrintTemplateProps) {
  const t = useTranslations('print');
  const [downloading, setDownloading] = useState(false);

  const formattedDate = new Date(voucher.disbursedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const englishWords = RupeeWords.toEnglishWords(voucher.netPrizeMoney);
  const tamilWords = RupeeWords.toTamilWords(voucher.netPrizeMoney);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const token = getStoredAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/pdf/voucher/${auctionId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error('Failed to download official payout voucher PDF');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payout-voucher-${voucher.voucherNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      // Fallback
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Top Floating Action Bar (Hidden during Print) */}
      <div className="w-full max-w-[210mm] mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-md print:hidden">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800 px-2.5 shrink-0 self-start sm:self-auto"
        >
          <Link href="/disbursements">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            {t('controls.backToDisbursements')}
          </Link>
        </Button>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => window.print()}
            size="sm"
            className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 shadow-sm shrink-0"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            {t('controls.printVoucher')}
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

      {/* A5 Landscape / A4 Voucher Canvas */}
      <div className="w-full max-w-[210mm] bg-white text-slate-900 p-6 sm:p-8 rounded-sm shadow-2xl relative border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full print:m-0">
        {/* 1. Header */}
        <div className="text-center pb-3 border-b-2 border-slate-800 space-y-0.5">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-black uppercase font-serif">
            {t('receipt.companyTitle')}
          </h1>
          <p className="text-xs text-slate-700">
            {voucher.branchAddress || t('receipt.companyAddress')} • {voucher.branchPhone || t('receipt.companyPhone')}
          </p>
        </div>

        {/* 2. Document Title */}
        <div className="text-center py-2 border-b border-slate-400 my-2 bg-slate-50">
          <h2 className="text-xs sm:text-sm font-bold tracking-wider text-black uppercase">
            {t('voucher.voucherTitle')}
          </h2>
        </div>

        {/* 3. Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 py-2 text-[11px] border-b border-slate-300">
          <div className="space-y-1">
            <p>
              <span className="font-semibold text-slate-700">{t('voucher.voucherNo')}: </span>
              <span className="font-mono font-bold text-black">{voucher.voucherNumber}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('voucher.date')}: </span>
              <span className="font-medium text-black">{formattedDate}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('voucher.payoutMode')}: </span>
              <span className="font-bold text-black uppercase">{voucher.disbursementMode}</span>
              {voucher.paymentReference && (
                <span className="text-slate-600 block text-[10px] font-mono">
                  {t('voucher.referenceNo')}: {voucher.paymentReference}
                </span>
              )}
            </p>
          </div>

          <div className="space-y-1 text-right sm:text-left sm:pl-4">
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.chitGroup')}: </span>
              <span className="font-mono font-bold text-black">{voucher.chitGroupCode}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('receipt.month')}: </span>
              <span className="font-bold text-black">{voucher.installmentMonth}</span>
              <span className="text-slate-700 font-semibold ml-3">{t('receipt.ticketNo')}: </span>
              <span className="font-mono font-bold text-black">#{voucher.ticketNumber}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-700">{t('voucher.winnerName')}: </span>
              <span className="font-bold text-black">
                {voucher.winnerName}
                {voucher.winnerNameTamil && ` (${voucher.winnerNameTamil})`}
              </span>
              <span className="text-slate-600 text-[10px] block font-mono">
                Code: {voucher.winnerCode} • Phone: {voucher.winnerPhone}
              </span>
            </p>
          </div>
        </div>

        {/* 4. Financial Details Box */}
        <div className="my-3 p-3 rounded bg-slate-50 border border-slate-300 space-y-2">
          <div className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">
            {t('voucher.financialBoxTitle')}:
          </div>

          <div className="grid grid-cols-3 gap-2 text-center py-2 bg-white rounded border border-slate-200">
            <div>
              <p className="text-[10px] text-slate-600">{t('voucher.chitValue')}</p>
              <p className="text-xs sm:text-sm font-bold font-mono text-black">
                {formatRupee(BigInt(voucher.chitValue))}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">{t('voucher.bidDiscount')}</p>
              <p className="text-xs sm:text-sm font-bold font-mono text-amber-700">
                - {formatRupee(BigInt(voucher.bidDiscount))}
              </p>
            </div>
            <div className="border-l border-slate-200 bg-emerald-50/50 rounded-r">
              <p className="text-[10px] font-bold text-emerald-800 uppercase">{t('voucher.netPrizeMoney')}</p>
              <p className="text-sm sm:text-base font-extrabold font-mono text-emerald-900">
                {formatRupee(BigInt(voucher.netPrizeMoney))}
              </p>
            </div>
          </div>

          {/* Rupee Words */}
          <div className="text-[10.5px] space-y-0.5 pt-1">
            <p className="text-slate-800">
              <span className="font-semibold">{t('receipt.wordsTamil')}: </span>
              <span className="font-serif text-black">{tamilWords}</span>
            </p>
            <p className="text-slate-800">
              <span className="font-semibold">{t('receipt.wordsEnglish')}: </span>
              <span className="italic text-black">{englishWords}</span>
            </p>
          </div>
        </div>

        {/* 5. Safety Proof Stamps & Dual Control Signatures */}
        <div className="my-3 p-2.5 rounded bg-slate-50 border border-slate-300">
          <div className="flex items-center justify-between text-[10.5px] mb-2 border-b border-slate-200 pb-1.5 flex-wrap gap-2">
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              {t('voucher.safetyProofStamp')}
            </span>
            <span className="text-[10px] font-mono text-slate-600">
              {t('voucher.dualControlTitle')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-3 text-[11px]">
            {/* Maker (Recorded By) */}
            <div className="space-y-1">
              <p className="text-[10px] text-slate-600">{t('voucher.verifiedByMaker')}:</p>
              <p className="font-semibold text-black">{voucher.verifiedByUserName}</p>
              <div className="w-36 border-b border-dashed border-slate-400 pt-6 mb-1" />
              <p className="text-[9.5px] text-slate-500">Maker Signature & Date</p>
            </div>

            {/* Checker (Authorized By) */}
            <div className="space-y-1 text-right">
              <p className="text-[10px] text-slate-600">{t('voucher.authorizedByChecker')}:</p>
              <p className="font-semibold text-black">{voucher.authorizedByUserName}</p>
              <div className="w-36 border-b border-dashed border-slate-400 pt-6 mb-1 ml-auto" />
              <p className="text-[9.5px] text-slate-500">Partner / Manager Signature</p>
            </div>
          </div>
        </div>

        {/* 6. Subscriber Prize Acknowledgement Box */}
        <div className="mt-4 p-3 rounded border border-slate-300 text-[10.5px] space-y-2">
          <p className="font-semibold text-slate-800 uppercase tracking-wider text-[10px]">
            {t('voucher.acknowledgementTitle')}:
          </p>
          <p className="text-slate-700 italic">
            &ldquo;{t('voucher.acknowledgementText')}&rdquo;
          </p>
          <div className="pt-6 flex justify-between items-end">
            <p className="text-[10px] text-slate-500">Date: {formattedDate}</p>
            <div className="text-right">
              <div className="w-44 border-b border-dashed border-slate-400 mb-1" />
              <p className="text-[10px] font-semibold text-black">{t('voucher.winnerSignature')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
