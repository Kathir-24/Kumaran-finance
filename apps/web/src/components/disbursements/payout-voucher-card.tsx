'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  FileText,
  Banknote,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Building,
  User,
  Ticket as TicketIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';

export interface PayoutVoucherDetails {
  id: string;
  auctionId: string;
  ticketId: string;
  disbursementStatus: string;
  disbursementMode?: string | null;
  disbursedAmount?: number | bigint | null;
  disbursementReference?: string | null;
  disbursedAt?: string | null;
  makerName?: string | null;
  checkerName?: string | null;
  verifiedAt?: string | null;
  authorizedAt?: string | null;
  auction?: {
    id: string;
    installmentMonth: number;
    auctionDate?: string;
    bidDiscount?: number | bigint;
    prizeMoney?: number | bigint;
    chitGroup?: {
      id: string;
      groupCode: string;
      chitValue: number | bigint;
      branch?: {
        name: string;
      };
    };
  };
  ticket?: {
    ticketNumber: number;
    customer?: {
      id: string;
      customerCode: string;
      fullName: string;
      phone: string;
    };
  };
}

interface PayoutVoucherCardProps {
  voucher: PayoutVoucherDetails;
}

export function PayoutVoucherCard({ voucher }: PayoutVoucherCardProps) {
  const t = useTranslations('disbursements');

  const chitValue = BigInt(voucher.auction?.chitGroup?.chitValue ?? 0);
  const discount = BigInt(voucher.auction?.bidDiscount ?? 0);
  const commission = (chitValue * 4n) / 100n; // 4.00% Foreman Commission (ADR-04)
  const netPrize = chitValue - discount; // P = V - D

  const status = voucher.disbursementStatus;
  const isStep1Done = true; // Auction finalized
  const isStep2Done = ['VERIFIED_BY_MAKER', 'AUTHORIZED_BY_CHECKER', 'DISBURSED'].includes(status);
  const isStep3Done = ['AUTHORIZED_BY_CHECKER', 'DISBURSED'].includes(status);
  const isStep4Done = status === 'DISBURSED';

  const steps = [
    { label: t('stepFinalized'), done: isStep1Done, active: status === 'PENDING_VERIFICATION' },
    { label: t('stepVerified'), done: isStep2Done, active: status === 'VERIFIED_BY_MAKER' },
    { label: t('stepAuthorized'), done: isStep3Done, active: status === 'AUTHORIZED_BY_CHECKER' },
    { label: t('stepDisbursed'), done: isStep4Done, active: status === 'DISBURSED' },
  ];

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
      <CardHeader className="border-b border-slate-800/80 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-100">
                {t('voucherTitle')}
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">{t('voucherSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">
              {voucher.auction?.chitGroup?.groupCode} • M{voucher.auction?.installmentMonth}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Progress Stepper */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {steps.map((st, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border text-center transition-all ${
                st.done
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : st.active
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                  : 'border-slate-800 bg-slate-950/40 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1 text-xs font-medium">
                {st.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Step {i + 1}</span>
              </div>
              <div className="text-xs font-semibold">{st.label}</div>
            </div>
          ))}
        </div>

        {/* 4-Column Financial Rupee Breakdown */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl border border-slate-800 bg-slate-950/60">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {t('chitValue')}
            </div>
            <div className="text-lg font-mono font-bold text-slate-200 mt-1">
              {formatRupee(chitValue)}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {t('bidDiscount')}
            </div>
            <div className="text-lg font-mono font-bold text-amber-400 mt-1">
              {formatRupee(discount)}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {t('foremanCommission')}
            </div>
            <div className="text-lg font-mono font-bold text-blue-400 mt-1">
              {formatRupee(commission)}
            </div>
          </div>

          <div className="border-l border-slate-800 pl-3">
            <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
              {t('netPrizeMoney')}
            </div>
            <div className="text-xl font-mono font-black text-emerald-400 mt-1">
              {formatRupee(netPrize)}
            </div>
          </div>
        </div>

        {/* Winner & Subscriber Meta Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950/40">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <div className="text-xs text-slate-400">Winning Subscriber</div>
              <div className="text-sm font-semibold text-slate-100">
                {voucher.ticket?.customer?.fullName || '—'}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">
                {voucher.ticket?.customer?.customerCode} • {voucher.ticket?.customer?.phone}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <TicketIcon className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <div className="text-xs text-slate-400">Ticket & Branch</div>
              <div className="text-sm font-semibold text-slate-100">
                Ticket #{voucher.ticket?.ticketNumber ?? '—'}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">
                {voucher.auction?.chitGroup?.branch?.name || 'Head Office - Perundurai'}
              </div>
            </div>
          </div>
        </div>

        {/* ADR-14 Unlimited Hard Cash Callout Banner */}
        <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs flex items-start gap-3">
          <Banknote className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-emerald-300">
              {t('hardCashNotice')}
            </div>
            <div className="text-emerald-300/80 mt-0.5">
              Unlimited hard cash prize payouts permitted per ADR-14. Disbursed directly from the in-office cash vault counter with physical receipt. Zero artificial cash limits.
            </div>
          </div>
        </div>

        {/* Sign-Off Verification & Authorization Stamps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* Maker Verification Stamp */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-xs">
            <div className="text-slate-400 font-medium mb-1">Maker Verification</div>
            {voucher.verifiedAt ? (
              <div className="text-blue-300">
                <div className="font-semibold">{t('verifiedByStamp', { name: voucher.makerName || 'Foreman Maker' })}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">{formatDate(voucher.verifiedAt)}</div>
              </div>
            ) : (
              <span className="text-amber-400/80 italic">Pending Safety Verification</span>
            )}
          </div>

          {/* Checker Authorization Stamp */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-xs">
            <div className="text-slate-400 font-medium mb-1">Checker Authorization</div>
            {voucher.authorizedAt ? (
              <div className="text-purple-300">
                <div className="font-semibold">{t('authorizedByStamp', { name: voucher.checkerName || 'Second Partner Checker' })}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">{formatDate(voucher.authorizedAt)}</div>
              </div>
            ) : (
              <span className="text-slate-500 italic">Pending Authorization</span>
            )}
          </div>

          {/* Disbursement Release Stamp */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-xs">
            <div className="text-slate-400 font-medium mb-1">Release Reference</div>
            {voucher.disbursedAt ? (
              <div className="text-emerald-300">
                <div className="font-semibold">{t('disbursedAtStamp', { date: formatDate(voucher.disbursedAt), ref: voucher.disbursementReference || 'CASH-VAULT' })}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">Mode: {voucher.disbursementMode}</div>
              </div>
            ) : (
              <span className="text-slate-500 italic">Pending Payout Release</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
