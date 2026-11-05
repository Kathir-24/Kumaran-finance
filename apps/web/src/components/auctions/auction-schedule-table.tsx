'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Gavel,
  ShieldCheck,
  Crown,
  FileCheck2,
  Calendar,
  ArrowRight,
  ExternalLink,
  Ticket,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { formatRupee } from '@/lib/currency';
import type { ChitGroupSummary } from './auction-scheme-selector';
import type { AuctionScheduleItem } from './auction-metrics-cards';

export interface AuctionScheduleTableProps {
  scheme: ChitGroupSummary;
  auctions: AuctionScheduleItem[];
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  isLoading?: boolean;
}

export function AuctionScheduleTable({
  scheme,
  auctions,
  statusFilter,
  onStatusFilterChange,
  isLoading,
}: AuctionScheduleTableProps) {
  const t = useTranslations('auctions');

  const chitValueNum = Number(scheme.chitValue);
  const duration = scheme.durationMonths || 20;
  const baseInstallment = Math.floor(chitValueNum / duration);
  const ceilingDiscount = Math.floor(chitValueNum / 4);
  const commissionFloor = Math.floor(chitValueNum * 0.04);

  // Map existing auctions by installment month
  const auctionMap = React.useMemo(() => {
    const map = new Map<number, AuctionScheduleItem>();
    for (const a of auctions) {
      map.set(a.installmentMonth, a);
    }
    return map;
  }, [auctions]);

  // Generate 1..N full lifecycle schedule
  const scheduleRows = React.useMemo(() => {
    const rows = [];

    for (let m = 1; m <= duration; m++) {
      if (m === 1) {
        rows.push({
          month: 1,
          type: 'MONTH_1_COMPANY_POOL' as const,
          status: 'COMPANY_POOL',
        });
      } else if (m === duration) {
        rows.push({
          month: duration,
          type: 'MONTH_N_FINAL_SETTLEMENT' as const,
          status: 'FINAL_SETTLEMENT',
        });
      } else {
        const existing = auctionMap.get(m);
        rows.push({
          month: m,
          type: 'AUCTION' as const,
          auction: existing || null,
          status: existing?.status || 'SCHEDULED',
        });
      }
    }

    return rows;
  }, [duration, auctionMap]);

  // Filter rows based on statusFilter
  const filteredRows = React.useMemo(() => {
    if (statusFilter === 'ALL') return scheduleRows;
    return scheduleRows.filter((r) => {
      if (statusFilter === 'SCHEDULED') return r.status === 'SCHEDULED';
      if (statusFilter === 'COMPLETED') return r.status === 'COMPLETED';
      if (statusFilter === 'MINUTES_FILED') return r.status === 'MINUTES_FILED';
      return true;
    });
  }, [scheduleRows, statusFilter]);

  if (isLoading) {
    return (
      <div className="h-64 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table Toolbar & Status Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-emerald-400" />
            <span>Auction Lifecycle Schedule (Months 1 to {duration})</span>
          </span>
          <Badge variant="outline" className="text-[10px] border-slate-700 bg-slate-800 text-slate-300">
            {filteredRows.length} Months
          </Badge>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['ALL', 'SCHEDULED', 'COMPLETED', 'MINUTES_FILED'].map((filterKey) => {
            const isSelected = statusFilter === filterKey;
            const labelKey = `filter${filterKey.charAt(0) + filterKey.slice(1).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

            return (
              <button
                key={filterKey}
                onClick={() => onStatusFilterChange(filterKey)}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-all ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {t(labelKey as any)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-950/70 text-slate-400 text-xs">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-14">{t('monthCol')}</TableHead>
              <TableHead>{t('dateCol')}</TableHead>
              <TableHead className="text-right">{t('discountCol')}</TableHead>
              <TableHead className="text-right">{t('dividendCol')}</TableHead>
              <TableHead className="text-right">{t('dividendPerTicketCol')}</TableHead>
              <TableHead className="text-right">{t('prizeCol')}</TableHead>
              <TableHead>{t('winnerCol')}</TableHead>
              <TableHead className="text-center">{t('statusCol')}</TableHead>
              <TableHead className="text-right">{t('actionCol')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredRows.map((row) => {
              // 1. Month 1 Company Pool Row
              if (row.type === 'MONTH_1_COMPANY_POOL') {
                return (
                  <TableRow key={row.month} className="border-slate-800/80 bg-indigo-950/20 hover:bg-indigo-950/30 text-xs">
                    <TableCell className="font-mono font-bold text-indigo-400">M1</TableCell>
                    <TableCell colSpan={6} className="text-slate-300">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-indigo-500/40 bg-indigo-950/60 text-indigo-300 text-[10px] font-semibold py-0.5">
                          {t('month1NoAuction')}
                        </Badge>
                        <span className="text-slate-400 text-[11px]">
                          {t('month1Desc', { value: formatRupee(scheme.chitValue) })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-slate-400">₹0 Div</TableCell>
                    <TableCell className="text-right text-slate-500 text-[11px]">—</TableCell>
                  </TableRow>
                );
              }

              // 2. Month N Final Settlement Row
              if (row.type === 'MONTH_N_FINAL_SETTLEMENT') {
                return (
                  <TableRow key={row.month} className="border-slate-800/80 bg-slate-950/40 hover:bg-slate-950/60 text-xs">
                    <TableCell className="font-mono font-bold text-amber-400">M{row.month}</TableCell>
                    <TableCell colSpan={6} className="text-slate-300">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-950/60 text-amber-300 text-[10px] font-semibold py-0.5">
                          {t('monthNNoAuction')}
                        </Badge>
                        <span className="text-slate-400 text-[11px]">
                          {t('monthNDesc', { month: row.month })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-slate-400">Final</TableCell>
                    <TableCell className="text-right text-slate-500 text-[11px]">—</TableCell>
                  </TableRow>
                );
              }

              // 3. Regular Auction Month (M = 2 .. N-1)
              const auc = row.auction;
              const isCompleted = auc?.status === 'COMPLETED';
              const isMinutesFiled = auc?.status === 'MINUTES_FILED';
              const isScheduled = !auc || auc.status === 'SCHEDULED';

              const formattedDate = auc?.auctionDate
                ? new Date(auc.auctionDate).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : `Month ${row.month} Schedule`;

              const wasTieBreak = auc?.winner?.wasTieBreakWinner;
              const tieBidder = auc?.tieBidders?.find((tb) => tb.isWinner);
              const drawnToken = tieBidder?.tokenNumber;

              return (
                <TableRow key={row.month} className="border-slate-800/80 hover:bg-slate-850/50 text-xs">
                  <TableCell className="font-mono font-bold text-slate-200">
                    M{row.month}
                  </TableCell>
                  <TableCell className="text-slate-300 whitespace-nowrap">
                    {formattedDate}
                  </TableCell>

                  {/* Bid Discount (D) */}
                  <TableCell className="text-right font-mono font-semibold text-slate-100">
                    {auc?.bidDiscount ? (
                      formatRupee(auc.bidDiscount)
                    ) : (
                      <span className="text-slate-500" title={`Ceiling discount up to ${formatRupee(ceilingDiscount)}`}>
                        ≤ {formatRupee(ceilingDiscount)}
                      </span>
                    )}
                  </TableCell>

                  {/* Total Dividend Pool */}
                  <TableCell className="text-right font-mono text-emerald-400">
                    {auc?.totalDividend ? formatRupee(auc.totalDividend) : '—'}
                  </TableCell>

                  {/* Dividend per ticket */}
                  <TableCell className="text-right font-mono text-indigo-300">
                    {auc?.dividendPerTicket ? formatRupee(auc.dividendPerTicket) : '—'}
                  </TableCell>

                  {/* Prize Money (V - D) */}
                  <TableCell className="text-right font-mono font-bold text-amber-300">
                    {auc?.prizeMoney ? formatRupee(auc.prizeMoney) : '—'}
                  </TableCell>

                  {/* Winner Subscriber */}
                  <TableCell>
                    {auc?.winner?.ticket ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-100">
                            {auc.winner.ticket.customer?.fullName || 'Winner'}
                          </span>
                          <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1 rounded">
                            #{auc.winner.ticket.ticketNumber}
                          </span>
                        </div>
                        {wasTieBreak && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-400" title={t('tieBreakWinnerTooltip')}>
                            <Crown className="h-2.5 w-2.5" />
                            <span>{t('tieBreakWinnerBadge', { token: drawnToken || 'A' })}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell className="text-center">
                    {isMinutesFiled ? (
                      <Badge variant="outline" className="border-purple-500/30 bg-purple-950/40 text-purple-300 text-[10px] py-0 px-1.5">
                        <FileCheck2 className="h-3 w-3 mr-1 inline" /> {t('statusMinutesFiled')}
                      </Badge>
                    ) : isCompleted ? (
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-950/40 text-emerald-300 text-[10px] py-0 px-1.5">
                        <CheckCircle2 className="h-3 w-3 mr-1 inline" /> {t('statusCompleted')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-950/40 text-amber-300 text-[10px] py-0 px-1.5">
                        <Clock className="h-3 w-3 mr-1 inline" /> {t('statusScheduled')}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Actions CTA */}
                  <TableCell className="text-right">
                    {isScheduled ? (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                        asChild
                      >
                        <Link href={auc?.id ? `/auctions/${auc.id}/live` : `/auctions/live?group=${scheme.id}&month=${row.month}`}>
                          <Gavel className="mr-1 h-3 w-3" />
                          <span>{t('enterBiddingRoom')}</span>
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-[11px] border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300"
                        asChild
                      >
                        <Link href={`/auctions/${auc?.id}`}>
                          <span>{isMinutesFiled ? t('viewMinutes') : t('viewResults')}</span>
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
