'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Gavel,
  Calculator,
  AlertTriangle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupee, parseWholeRupees, sanitizeWholeRupeeInput } from '@/lib/currency';
import { getErrorMessage } from '@/lib/api-client';
import type { SubscriberTicketItem, EligibleBidderItem } from './defaulter-eligibility-roster';

export interface RecordBidPayload {
  ticketId: string;
  bidDiscount: number;
  auctionDate: string;
}

interface BiddingConsoleProps {
  chitValue: number;
  durationMonths: number;
  baseInstallment: number;
  selectedTicket?: SubscriberTicketItem | null;
  eligibleTickets: (SubscriberTicketItem | EligibleBidderItem)[];
  onSelectTicket: (ticket: SubscriberTicketItem) => void;
  onRecordBid: (payload: RecordBidPayload) => Promise<void>;
  onOpenTieBreak: () => void;
  isSubmitting?: boolean;
}

export function BiddingConsole({
  chitValue,
  durationMonths,
  baseInstallment,
  selectedTicket,
  eligibleTickets,
  onSelectTicket,
  onRecordBid,
  onOpenTieBreak,
  isSubmitting = false,
}: BiddingConsoleProps) {
  const t = useTranslations('auctions');

  // Math boundaries
  const minFloor = Math.floor(chitValue * 0.04); // 4.00% Commission
  const maxCeiling = Math.floor(chitValue / 4);  // 25% Fixed 1/4 Ceiling

  const [bidDiscountStr, setBidDiscountStr] = React.useState<string>(String(minFloor));
  const [auctionDate, setAuctionDate] = React.useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedTicketId, setSelectedTicketId] = React.useState<string>(selectedTicket?.id || '');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Sync selectedTicket prop
  React.useEffect(() => {
    if (selectedTicket) {
      setSelectedTicketId(selectedTicket.id);
    }
  }, [selectedTicket]);

  // Current numeric discount
  const currentDiscount = parseWholeRupees(bidDiscountStr) || 0;

  // Real-time validations
  const isFloorViolated = currentDiscount < minFloor;
  const isCeilingViolated = currentDiscount > maxCeiling;
  const isCeilingReached = currentDiscount === maxCeiling;

  // Real-time dynamic math
  const foremanCommission = minFloor;
  const totalDividend = Math.max(0, currentDiscount - foremanCommission);
  const dividendPerTicket = Math.floor(totalDividend / durationMonths);
  const nextMonthNetInstallment = Math.max(0, baseInstallment - dividendPerTicket);
  const netPrizeMoney = Math.max(0, chitValue - currentDiscount);

  const handleDiscountChange = (val: string) => {
    setErrorMsg(null);
    const sanitized = sanitizeWholeRupeeInput(val);
    setBidDiscountStr(sanitized);
  };

  const handleFillCeiling = () => {
    setErrorMsg(null);
    setBidDiscountStr(String(maxCeiling));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedTicketId) {
      setErrorMsg('Please select a winning subscriber ticket from the eligibility roster.');
      return;
    }

    if (isFloorViolated) {
      setErrorMsg(t('floorError', { minFloor: formatRupee(BigInt(minFloor)) }));
      return;
    }

    if (isCeilingViolated) {
      setErrorMsg(t('ceilingError', { maxCeiling: formatRupee(BigInt(maxCeiling)) }));
      return;
    }

    try {
      await onRecordBid({
        ticketId: selectedTicketId,
        bidDiscount: currentDiscount,
        auctionDate: new Date(auctionDate).toISOString(),
      });
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Failed to record auction bid'));
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Gavel className="h-4 w-4 text-emerald-400" />
            <span>{t('biddingConsoleTitle')}</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {t('biddingConsoleDesc')}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Selected Bidder Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>{t('selectedBidderLabel')}</span>
            <span className="text-[10px] text-slate-400">
              Pick from roster or select below
            </span>
          </label>
          <select
            value={selectedTicketId}
            onChange={(e) => {
              const ticketId = e.target.value;
              setSelectedTicketId(ticketId);
              const found = eligibleTickets.find(
                (item) => ('id' in item ? item.id : item.ticketId) === ticketId,
              );
              if (found && 'customer' in found) {
                onSelectTicket(found as SubscriberTicketItem);
              }
            }}
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="">— Select Winning Subscriber Ticket —</option>
            {eligibleTickets.map((item) => {
              const id = 'id' in item ? item.id : item.ticketId;
              const num = item.ticketNumber;
              const name = 'customer' in item ? item.customer.fullName : item.customerName;
              const code = 'customer' in item ? item.customer.customerCode : item.customerCode;
              return (
                <option key={id} value={id}>
                  #{num} - {name} ({code})
                </option>
              );
            })}
          </select>
        </div>

        {/* Step 2: Whole-Rupee Bid Discount Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-slate-300">{t('bidDiscountInputLabel')}</label>
            <button
              type="button"
              onClick={handleFillCeiling}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
            >
              {t('fillCeilingAction', { amount: formatRupee(BigInt(maxCeiling)) })}
            </button>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2 text-xs font-mono text-slate-400 font-bold">₹</span>
            <input
              type="text"
              value={bidDiscountStr}
              onChange={(e) => handleDiscountChange(e.target.value)}
              className={`w-full rounded-md border bg-slate-950 py-1.5 pl-7 pr-3 text-sm font-mono font-bold text-white focus:outline-none ${
                isFloorViolated || isCeilingViolated
                  ? 'border-red-500/60 text-red-300'
                  : isCeilingReached
                  ? 'border-amber-500/60 text-amber-300'
                  : 'border-slate-800 focus:border-emerald-500/60'
              }`}
            />
          </div>

          {/* Validation Warnings */}
          {isFloorViolated && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              <span>{t('floorError', { minFloor: formatRupee(BigInt(minFloor)) })}</span>
            </p>
          )}
          {isCeilingViolated && (
            <p className="text-[11px] text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              <span>{t('ceilingError', { maxCeiling: formatRupee(BigInt(maxCeiling)) })}</span>
            </p>
          )}

          {/* Ceiling Reached Banner & Option A CTA */}
          {isCeilingReached && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-2.5 space-y-2 text-xs text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>{t('ceilingReachedAlert')}</span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={onOpenTieBreak}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs h-8"
              >
                <Gavel className="mr-1.5 h-3.5 w-3.5" />
                <span>{t('conductTieBreakAction')}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Step 3: Real-Time Dynamic Financial Breakdown */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-emerald-400" />
            <span>Real-Time Invariant Chit Math (Guardrail 2 & 4)</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 leading-tight block">{t('foremanCommissionCalculated')}</span>
              <div className="font-mono font-bold text-slate-300">{formatRupee(BigInt(foremanCommission))}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 leading-tight block">{t('universalDividendPool')}</span>
              <div className="font-mono font-bold text-slate-300">{formatRupee(BigInt(totalDividend))}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-emerald-400 font-medium leading-tight block">{t('universalDividendPerMember')}</span>
              <div className="font-mono font-bold text-emerald-300">{formatRupee(BigInt(dividendPerTicket))}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] text-cyan-400 font-medium leading-tight block">{t('nextMonthNetInstallment')}</span>
              <div className="font-mono font-bold text-cyan-300">{formatRupee(BigInt(nextMonthNetInstallment))}</div>
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">{t('netPrizeMoneyPayable')}</span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              {formatRupee(BigInt(netPrizeMoney))}
            </span>
          </div>
        </div>

        {/* Step 4: Auction Date */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">{t('scheduledAt')}</label>
          <input
            type="date"
            value={auctionDate}
            onChange={(e) => setAuctionDate(e.target.value)}
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
          />
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !selectedTicketId || isFloorViolated || isCeilingViolated}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9"
        >
          {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          <span>{isSubmitting ? t('recordingBid') : t('recordWinningBidAction')}</span>
        </Button>
      </form>
    </div>
  );
}
