'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Gavel,
  X,
  Crown,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { getErrorMessage } from '@/lib/api-client';
import type { SubscriberTicketItem, EligibleBidderItem } from './defaulter-eligibility-roster';

export interface TiedTicketEntry {
  ticketId: string;
  tokenNumber?: number;
}

export interface RecordTieBreakPayload {
  tiedTickets: TiedTicketEntry[];
  winningTicketId: string;
  bidDiscount: number;
  auctionDate: string;
  witnessNames?: string[];
}

interface TieBreakModalProps {
  isOpen: boolean;
  onClose: () => void;
  ceilingDiscount: number;
  eligibleTickets: (SubscriberTicketItem | EligibleBidderItem)[];
  onRecordTieBreak: (payload: RecordTieBreakPayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function TieBreakModal({
  isOpen,
  onClose,
  ceilingDiscount,
  eligibleTickets,
  onRecordTieBreak,
  isSubmitting = false,
}: TieBreakModalProps) {
  const t = useTranslations('auctions');

  const [selectedTiedTicketIds, setSelectedTiedTicketIds] = React.useState<string[]>([]);
  const [tokenAssignments, setTokenAssignments] = React.useState<Record<string, number>>({});
  const [winningTicketId, setWinningTicketId] = React.useState<string>('');
  const [witnessNamesText, setWitnessNamesText] = React.useState<string>('');
  const [auctionDate, setAuctionDate] = React.useState<string>(() => new Date().toISOString().split('T')[0]);
  const [error, setError] = React.useState<string | null>(null);

  // Normalize ticket display
  const ticketMap = React.useMemo(() => {
    const map = new Map<string, { id: string; ticketNumber: number; name: string; phone: string }>();
    eligibleTickets.forEach((item) => {
      const id = 'id' in item ? item.id : item.ticketId;
      const num = item.ticketNumber;
      const name = 'customer' in item ? item.customer.fullName : item.customerName;
      const phone = 'customer' in item ? item.customer.phone : item.phone;
      map.set(id, { id, ticketNumber: num, name, phone });
    });
    return map;
  }, [eligibleTickets]);

  const handleToggleTicket = (ticketId: string) => {
    setError(null);
    setSelectedTiedTicketIds((prev) => {
      if (prev.includes(ticketId)) {
        const next = prev.filter((id) => id !== ticketId);
        const nextTokens = { ...tokenAssignments };
        delete nextTokens[ticketId];
        setTokenAssignments(nextTokens);
        if (winningTicketId === ticketId) setWinningTicketId('');
        return next;
      } else {
        const next = [...prev, ticketId];
        const nextTokenNum = next.length;
        setTokenAssignments((prevT) => ({ ...prevT, [ticketId]: nextTokenNum }));
        return next;
      }
    });
  };

  const handleTokenChange = (ticketId: string, val: number) => {
    setTokenAssignments((prev) => ({ ...prev, [ticketId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedTiedTicketIds.length < 2) {
      setError('Option A requires at least 2 tied tickets to conduct a physical lot draw.');
      return;
    }

    if (!winningTicketId) {
      setError('Please select the winning ticket drawn by Foreman from the physical paper token bowl.');
      return;
    }

    const tiedTickets: TiedTicketEntry[] = selectedTiedTicketIds.map((ticketId) => ({
      ticketId,
      tokenNumber: tokenAssignments[ticketId] || undefined,
    }));

    const witnessNames = witnessNamesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await onRecordTieBreak({
        tiedTickets,
        winningTicketId,
        bidDiscount: ceilingDiscount,
        auctionDate: new Date(auctionDate).toISOString(),
        witnessNames: witnessNames.length > 0 ? witnessNames : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to record tie-break result'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-500/20 p-2 text-amber-400">
              <Gavel className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('tieBreakModalTitle')}</h2>
              <p className="text-[11px] text-slate-400">
                {t('tiedSubscribersLabel', { amount: formatRupee(BigInt(ceilingDiscount)) })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Physical Lot Notice per Option A */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>{t('tieBreakNotice')}</span>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Select Tied Subscribers */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>1. Select Tied Subscribers (At least 2):</span>
              <span className="text-[11px] text-emerald-400 font-mono">
                {selectedTiedTicketIds.length} Selected
              </span>
            </label>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2 space-y-1.5">
              {Array.from(ticketMap.values()).map((ticket) => {
                const isChecked = selectedTiedTicketIds.includes(ticket.id);
                return (
                  <label
                    key={ticket.id}
                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer text-xs transition-all ${
                      isChecked
                        ? 'bg-emerald-950/40 border border-emerald-500/30 text-white'
                        : 'hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleTicket(ticket.id)}
                        className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                      />
                      <span className="font-mono text-emerald-400 font-bold">#{ticket.ticketNumber}</span>
                      <span>{ticket.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{ticket.phone}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Step 2: Assign Physical Paper Token Numbers & Pick Drawn Winner */}
          {selectedTiedTicketIds.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                2. Assign Paper Token # and Pick Drawn Winner:
              </label>
              <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                {selectedTiedTicketIds.map((ticketId) => {
                  const ticket = ticketMap.get(ticketId);
                  if (!ticket) return null;
                  const isWinner = winningTicketId === ticketId;
                  const tokenNum = tokenAssignments[ticketId] || 1;

                  return (
                    <div
                      key={ticketId}
                      className={`flex items-center justify-between p-2 rounded border text-xs ${
                        isWinner
                          ? 'border-amber-500/60 bg-amber-950/30'
                          : 'border-slate-800 bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="winningTicket"
                          checked={isWinner}
                          onChange={() => setWinningTicketId(ticketId)}
                          className="text-amber-500 border-slate-700"
                        />
                        <span className="font-mono text-emerald-400 font-bold">#{ticket.ticketNumber}</span>
                        <span className="text-white font-medium">{ticket.name}</span>
                        {isWinner && (
                          <span className="text-[10px] text-amber-300 bg-amber-950/80 border border-amber-500/40 px-1 rounded flex items-center gap-1">
                            <Crown className="h-2.5 w-2.5" /> Drawn Winner
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">Token #:</span>
                        <input
                          type="number"
                          min={1}
                          value={tokenNum}
                          onChange={(e) => handleTokenChange(ticketId, parseInt(e.target.value, 10) || 1)}
                          className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-center text-xs text-white font-mono"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Witnesses & Auction Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('witnessNamesLabel')}</label>
              <input
                type="text"
                value={witnessNamesText}
                onChange={(e) => setWitnessNamesText(e.target.value)}
                placeholder={t('witnessNamesPlaceholder')}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('scheduledAt')}</label>
              <input
                type="date"
                value={auctionDate}
                onChange={(e) => setAuctionDate(e.target.value)}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-slate-700 bg-slate-800 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || selectedTiedTicketIds.length < 2 || !winningTicketId}
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
            >
              {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <span>{isSubmitting ? t('recordingTieBreak') : t('recordTieBreakAction')}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
