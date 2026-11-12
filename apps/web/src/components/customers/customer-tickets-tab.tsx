'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Ticket,
  Crown,
  ArrowRight,
  Calendar,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';

export interface CustomerTicketHolding {
  id: string;
  ticketNumber: number;
  chitGroupId: string;
  isPrized: boolean;
  consecutiveUnpaidMonths: number;
  status: string;
  chitGroup: {
    id: string;
    groupCode: string;
    groupName: string;
    chitValue: bigint | number | string;
    durationMonths: number;
    status: string;
  };
}

export interface CustomerTicketsTabProps {
  tickets: CustomerTicketHolding[];
  onSelectTicket?: (ticketId: string) => void;
}

export function CustomerTicketsTab({ tickets, onSelectTicket }: CustomerTicketsTabProps) {
  const t = useTranslations('customers');

  if (!tickets || tickets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <Ticket className="h-6 w-6 text-slate-500" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-200">{t('noTicketsAssigned')}</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">{t('noTicketsDesc')}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
          asChild
        >
          <Link href="/schemes">
            <Layers className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
            <span>{t('assignFirstTicket')}</span>
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Informational banner: ADR-13 */}
      <div className="flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-950/20 px-3.5 py-2.5 text-xs text-indigo-300">
        <Ticket className="h-4 w-4 text-indigo-400 shrink-0" />
        <span>{t('adr13Notice')}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tickets.map((ticket) => {
          const chitValueNum = Number(ticket.chitGroup.chitValue);
          const duration = ticket.chitGroup.durationMonths || 1;
          const baseInstallment = Math.floor(chitValueNum / duration);
          const isDefaulterThreat = ticket.consecutiveUnpaidMonths >= 3;

          return (
            <div
              key={ticket.id}
              className={`rounded-xl border p-4 space-y-3.5 transition-all ${
                isDefaulterThreat
                  ? 'border-red-500/40 bg-red-950/10 shadow-red-950/20'
                  : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
              }`}
            >
              {/* Header: Ticket Number & Badges */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                      #{ticket.ticketNumber}
                    </span>
                    <h4 className="text-sm font-semibold text-white">
                      {ticket.chitGroup.groupName}
                    </h4>
                  </div>
                  <p className="text-xs font-mono text-slate-400">
                    {ticket.chitGroup.groupCode}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {ticket.isPrized ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11px] font-medium flex items-center gap-1"
                    >
                      <Crown className="h-3 w-3 text-amber-400" />
                      <span>{t('prizedBadge')}</span>
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-slate-700 bg-slate-800 text-slate-400 text-[11px]"
                    >
                      {t('nonPrizedBadge')}
                    </Badge>
                  )}

                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                      ticket.status === 'ACTIVE'
                        ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-400'
                        : 'border-red-500/30 bg-red-950/40 text-red-400'
                    }`}
                  >
                    {ticket.status === 'ACTIVE'
                      ? t('ticketStatusActive')
                      : t('ticketStatusRemoved')}
                  </span>
                </div>
              </div>

              {/* Financial Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs border-y border-slate-800/80 py-2.5">
                <div>
                  <span className="text-[11px] text-slate-400">{t('chitValue')}</span>
                  <div className="font-mono text-sm font-bold text-slate-200">
                    {formatRupee(ticket.chitGroup.chitValue)}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400">{t('baseInstallment')}</span>
                  <div className="font-mono text-sm font-bold text-slate-200">
                    {formatRupee(baseInstallment)} / mo
                  </div>
                </div>
              </div>

              {/* ADR-07 / ADR-12 Defaulter Removal Warning */}
              {isDefaulterThreat && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 p-2.5 text-xs text-red-300">
                  <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    {t('consecutiveUnpaidWarning', {
                      count: ticket.consecutiveUnpaidMonths,
                    })}
                  </span>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-500" />
                  <span>{ticket.chitGroup.durationMonths} Months</span>
                </span>

                {onSelectTicket && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelectTicket(ticket.id)}
                    className="h-7 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                  >
                    <span>{t('viewPassbook')}</span>
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
