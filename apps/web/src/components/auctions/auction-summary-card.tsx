'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  Crown,
  ShieldAlert,
  ArrowRight,
  Edit3,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { toSafeWholeRupeeBigInt } from './auction-math.util';

export interface AuctionSummaryData {
  id: string;
  chitGroupId: string;
  installmentMonth: number;
  auctionDate: string;
  status?: string;
  bidDiscount?: bigint | number | string | null;
  foremanCommissionAmount?: bigint | number | string | null;
  totalDividend?: bigint | number | string | null;
  dividendPerTicket?: bigint | number | string | null;
  prizeMoney?: bigint | number | string | null;
  conductedByUserId?: string | null;
  finalizedByUserId?: string | null;
  winner?: {
    id: string;
    ticketId: string;
    wasTieBreakWinner: boolean;
    disbursementStatus?: string | null;
    ticket?: {
      ticketNumber: number;
      customer?: {
        fullName: string;
        fullNameTamil?: string | null;
        customerCode: string;
        phone: string;
      };
    };
  } | null;
  tieBidders?: Array<{
    ticketId: string;
    tokenNumber?: number | null;
    isLotWinner?: boolean;
    isWinner?: boolean;
  }>;
}

interface AuctionSummaryCardProps {
  auction: AuctionSummaryData;
  chitValue: bigint | number | string;
  baseInstallment: bigint | number | string;
  totalTickets: number;
  isFinalized?: boolean;
  canModifyBid?: boolean;
  onModifyBid: () => void;
}

export function AuctionSummaryCard({
  auction,
  chitValue: _chitValue,
  baseInstallment,
  totalTickets: _totalTickets,
  isFinalized = false,
  canModifyBid = true,
  onModifyBid,
}: AuctionSummaryCardProps) {
  const t = useTranslations('auctions');

  const winnerTicket = auction.winner?.ticket;
  const winnerCustomer = winnerTicket?.customer;
  const wasTieBreak = auction.winner?.wasTieBreakWinner;

  // Find drawn token number if tie-break winner
  const winningTieBidder = auction.tieBidders?.find(
    (tb) => tb.isLotWinner || tb.isWinner || tb.ticketId === auction.winner?.ticketId,
  );
  const drawnToken = winningTieBidder?.tokenNumber;

  const baseInstallmentBig = toSafeWholeRupeeBigInt(baseInstallment, 0n);
  const bidDiscountBig = toSafeWholeRupeeBigInt(auction.bidDiscount, 0n);
  const prizeMoneyBig = toSafeWholeRupeeBigInt(auction.prizeMoney, 0n);
  const commissionBig = toSafeWholeRupeeBigInt(auction.foremanCommissionAmount, 0n);
  const totalDividendBig = toSafeWholeRupeeBigInt(auction.totalDividend, 0n);
  const dividendPerTicketBig = toSafeWholeRupeeBigInt(auction.dividendPerTicket, 0n);
  const nextMonthNet =
    baseInstallmentBig >= dividendPerTicketBig ? baseInstallmentBig - dividendPerTicketBig : 0n;

  const auctionAlreadyFinalized =
    isFinalized || auction.status === 'COMPLETED' || auction.status === 'MINUTES_FILED';

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-slate-900/80 p-5 space-y-4 shadow-xl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>{t('summaryTitle')}</span>
              <Sparkles className="h-4 w-4 text-emerald-400" />
            </h3>
            <p className="text-[11px] text-slate-400">
              {t('makerStampNotice', {
                maker: auction.conductedByUserId || 'Staff (Maker)',
                date: new Date(auction.auctionDate).toLocaleDateString(),
              })}
            </p>
          </div>
        </div>

        {!auctionAlreadyFinalized && canModifyBid && (
          <Button
            variant="outline"
            size="sm"
            onClick={onModifyBid}
            className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs h-8"
          >
            <Edit3 className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
            <span>{t('modifyBidAction')}</span>
          </Button>
        )}
      </div>

      {/* Winner Spotlight Card */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
            {t('recordedWinnerTitle')}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded">
              #{winnerTicket?.ticketNumber || '—'}
            </span>
            <span className="text-sm font-bold text-white">
              {winnerCustomer?.fullName || 'Winner'}
            </span>
            {winnerCustomer?.fullNameTamil && (
              <span className="text-xs text-slate-400">
                ({winnerCustomer.fullNameTamil})
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {winnerCustomer?.customerCode} • {winnerCustomer?.phone}
          </div>
        </div>

        {wasTieBreak && (
          <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-500/40 text-amber-300 px-2.5 py-1.5 rounded-lg text-xs">
            <Crown className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <div className="font-medium">
              Option A Tie-Break Winner (Drawn Paper Token #{drawnToken || 1})
            </div>
          </div>
        )}
      </div>

      {/* Financial Snapshots Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-0.5">
          <span className="text-[10px] text-slate-400">{t('discountCol')}</span>
          <div className="text-sm font-bold text-white font-mono">
            {formatRupee(bidDiscountBig)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-0.5">
          <span className="text-[10px] text-slate-400">{t('prizeCol')}</span>
          <div className="text-sm font-bold text-emerald-300 font-mono">
            {formatRupee(prizeMoneyBig)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-0.5">
          <span className="text-[10px] text-slate-400">{t('commissionCol')}</span>
          <div className="text-sm font-bold text-slate-300 font-mono">
            {formatRupee(commissionBig)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-0.5">
          <span className="text-[10px] text-slate-400">{t('dividendCol')}</span>
          <div className="text-sm font-bold text-slate-300 font-mono">
            {formatRupee(totalDividendBig)}
          </div>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-2.5 space-y-0.5">
          <span className="text-[10px] text-emerald-400 font-medium">{t('dividendPerTicketCol')}</span>
          <div className="text-sm font-bold text-emerald-300 font-mono">
            {formatRupee(dividendPerTicketBig)}
          </div>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-2.5 space-y-0.5">
          <span className="text-[10px] text-cyan-400 font-medium">{t('netInstallmentCol')}</span>
          <div className="text-sm font-bold text-cyan-300 font-mono">
            {formatRupee(nextMonthNet)}
          </div>
        </div>
      </div>

      {/* Maker-Checker Finalization Notice */}
      {!auctionAlreadyFinalized && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-3 text-xs text-blue-200 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-white">{t('makerCheckerNotice')}</div>
            <p className="text-[11px] text-blue-300">
              A second authorized Partner (Checker) must review and finalize this auction to lock winner prize status and generate statutory Form XVII minutes.
            </p>
          </div>
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex items-center justify-end pt-1">
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
          asChild
        >
          <Link href={`/auctions/${auction.id}`}>
            <span>
              {auctionAlreadyFinalized ? t('viewResults') : t('proceedToFinalizeAction')}
            </span>
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
