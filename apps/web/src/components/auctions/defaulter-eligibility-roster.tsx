'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Trophy,
  Search,
  Gavel,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface SubscriberTicketItem {
  id: string;
  ticketNumber: number;
  chitGroupId: string;
  customerId: string;
  isPrized: boolean;
  status: string;
  consecutiveUnpaidMonths: number;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    fullNameTamil?: string | null;
    phone: string;
  };
}

export interface EligibleBidderItem {
  id?: string;
  ticketId?: string;
  ticketNumber: number;
  customerId: string;
  customerName?: string;
  customerCode?: string;
  phone?: string;
  customer?: {
    id: string;
    customerCode: string;
    fullName: string;
    fullNameTamil?: string | null;
    phone: string;
  };
}

export function resolveEligibleBidderTicketId(item: EligibleBidderItem): string {
  return item.ticketId ?? item.id ?? '';
}

interface DefaulterEligibilityRosterProps {
  allTickets: SubscriberTicketItem[];
  eligibleTickets: EligibleBidderItem[];
  hasAuthoritativeEligibility?: boolean;
  selectedTicketId?: string;
  onSelectBidder: (ticket: SubscriberTicketItem) => void;
  isLoading?: boolean;
}

export function DefaulterEligibilityRoster({
  allTickets,
  eligibleTickets,
  hasAuthoritativeEligibility = true,
  selectedTicketId,
  onSelectBidder,
  isLoading = false,
}: DefaulterEligibilityRosterProps) {
  const t = useTranslations('auctions');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<'ALL' | 'ELIGIBLE' | 'DEFAULTERS' | 'PRIZED'>('ALL');

  // Guardrail 8 (ADR-07): Trust the authoritative server pre-auction eligible-bidders roster
  // rather than overriding server exclusions with client-side consecutiveUnpaidMonths === 0.
  const eligibleTicketIdSet = React.useMemo(() => {
    return new Set(
      eligibleTickets.map((e) => resolveEligibleBidderTicketId(e)).filter(Boolean),
    );
  }, [eligibleTickets]);

  const isTicketEligible = React.useCallback(
    (ticket: SubscriberTicketItem): boolean => {
      if (ticket.status !== 'ACTIVE' || ticket.isPrized || ticket.consecutiveUnpaidMonths > 0) {
        return false;
      }
      if (hasAuthoritativeEligibility) {
        return eligibleTicketIdSet.has(ticket.id);
      }
      return true;
    },
    [eligibleTicketIdSet, hasAuthoritativeEligibility],
  );

  // Metric counts
  const totalCount = allTickets.length;
  const eligibleCount = allTickets.filter((ticket) => isTicketEligible(ticket)).length;
  const defaultersCount = allTickets.filter(
    (ticket) => !ticket.isPrized && !isTicketEligible(ticket),
  ).length;
  const prizedCount = allTickets.filter((ticket) => ticket.isPrized).length;

  // Search & Filter
  const filteredTickets = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allTickets.filter((ticket) => {
      const isEligible = isTicketEligible(ticket);
      const isPrized = ticket.isPrized;
      const isDefaulter = !isPrized && !isEligible;

      if (activeFilter === 'ELIGIBLE' && !isEligible) return false;
      if (activeFilter === 'DEFAULTERS' && !isDefaulter) return false;
      if (activeFilter === 'PRIZED' && !isPrized) return false;

      if (!q) return true;

      const ticketMatch = String(ticket.ticketNumber).includes(q) || `#${ticket.ticketNumber}`.includes(q);
      const nameMatch = ticket.customer.fullName.toLowerCase().includes(q) || (ticket.customer.fullNameTamil && ticket.customer.fullNameTamil.includes(q));
      const codeMatch = ticket.customer.customerCode.toLowerCase().includes(q);
      const phoneMatch = ticket.customer.phone.includes(q);

      return ticketMatch || nameMatch || codeMatch || phoneMatch;
    });
  }, [allTickets, isTicketEligible, activeFilter, searchQuery]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-emerald-400" />
            <span>{t('eligibilityTitle')}</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {t('eligibilityDesc')}
          </p>
        </div>
      </div>

      {/* KPI Counters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-center">
          <div className="text-[10px] text-slate-400 font-medium">{t('totalAssigned', { count: '' })}</div>
          <div className="text-base font-bold text-white font-mono">{totalCount}</div>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2 text-center">
          <div className="text-[10px] text-emerald-400 font-medium">{t('eligibleCount', { count: '' })}</div>
          <div className="text-base font-bold text-emerald-300 font-mono">{eligibleCount}</div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-2 text-center">
          <div className="text-[10px] text-red-400 font-medium">{t('defaultersCount', { count: '' })}</div>
          <div className="text-base font-bold text-red-300 font-mono">{defaultersCount}</div>
        </div>
        <div className="rounded-lg border border-purple-500/20 bg-purple-950/20 p-2 text-center">
          <div className="text-[10px] text-purple-400 font-medium">{t('prizedCount', { count: '' })}</div>
          <div className="text-base font-bold text-purple-300 font-mono">{prizedCount}</div>
        </div>
      </div>

      {/* Search Input & Filter Pills */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchSubscribersPlaceholder')}
            className="w-full rounded-md border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 scrollbar-thin scrollbar-thumb-slate-800 text-[11px]">
          {(['ALL', 'ELIGIBLE', 'DEFAULTERS', 'PRIZED'] as const).map((filter) => {
            const isSelected = activeFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-2.5 py-1 rounded font-medium transition-all shrink-0 whitespace-nowrap ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-800/60 text-slate-400 border border-slate-700/60 hover:text-slate-200'
                }`}
              >
                {filter === 'ALL' && t('rosterFilterAll', { count: totalCount })}
                {filter === 'ELIGIBLE' && t('rosterFilterEligible', { count: eligibleCount })}
                {filter === 'DEFAULTERS' && t('rosterFilterDefaulters', { count: defaultersCount })}
                {filter === 'PRIZED' && t('rosterFilterPrized', { count: prizedCount })}
              </button>
            );
          })}
        </div>
      </div>

      {/* Roster Ticket Items List */}
      <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">
            <div className="h-5 w-5 animate-spin mx-auto mb-2 border-2 border-emerald-500 border-t-transparent rounded-full" />
            <span>Loading subscribers roster...</span>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            <Users className="h-6 w-6 mx-auto mb-1 text-slate-600" />
            <span>No subscribers match the current filter or search query.</span>
          </div>
        ) : (
          filteredTickets.map((ticket) => {
            const isEligible = isTicketEligible(ticket);
            const isPrized = ticket.isPrized;
            const isDefaulter = !isPrized && !isEligible;
            const isSelected = selectedTicketId === ticket.id;

            return (
              <div
                key={ticket.id}
                className={`rounded-lg border p-2.5 flex items-center justify-between gap-2 transition-all ${
                  isSelected
                    ? 'border-emerald-500/60 bg-emerald-950/30 ring-1 ring-emerald-500/40'
                    : isDefaulter
                    ? 'border-red-500/20 bg-red-950/10'
                    : isPrized
                    ? 'border-purple-500/20 bg-purple-950/10'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                }`}
              >
                {/* Left: Ticket # & Customer Information */}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded">
                      #{ticket.ticketNumber}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {ticket.customer.fullName}
                    </span>
                    {ticket.customer.fullNameTamil && (
                      <span className="text-[10px] text-slate-400 truncate hidden sm:inline">
                        ({ticket.customer.fullNameTamil})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="font-mono">{ticket.customer.customerCode}</span>
                    <span>•</span>
                    <span>{ticket.customer.phone}</span>
                  </div>
                </div>

                {/* Right: Status Badge & Select Action */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isDefaulter ? (
                    <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-950/40 text-red-300">
                      <XCircle className="h-3 w-3 mr-1 inline" />
                      <span>{t('statusDefaulterBadge', { months: ticket.consecutiveUnpaidMonths })}</span>
                    </Badge>
                  ) : isPrized ? (
                    <Badge variant="outline" className="text-[10px] border-purple-500/30 bg-purple-950/40 text-purple-300">
                      <Trophy className="h-3 w-3 mr-1 inline" />
                      <span>{t('statusPrizedBadge', { month: '—' })}</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-950/40 text-emerald-300">
                      <CheckCircle2 className="h-3 w-3 mr-1 inline" />
                      <span>{t('statusEligibleBadge')}</span>
                    </Badge>
                  )}

                  {isEligible && (
                    <Button
                      size="sm"
                      variant={isSelected ? 'default' : 'outline'}
                      onClick={() => onSelectBidder(ticket)}
                      className={`h-7 px-2 text-[11px] ${
                        isSelected
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <Gavel className="h-3 w-3 mr-1" />
                      <span>{isSelected ? t('selectedBidder') : t('selectBidder')}</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
