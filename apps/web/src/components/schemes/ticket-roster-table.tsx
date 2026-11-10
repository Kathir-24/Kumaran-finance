'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TicketRosterRow } from './ticket-roster-row';
import { cn } from '@/lib/utils';

export interface TicketItem {
  id: string;
  ticketNumber: number;
  customerId: string;
  isPrized: boolean;
  prizedAuctionId?: string | null;
  consecutiveUnpaidMonths: number;
  status: string;
  customer?: {
    id: string;
    customerCode: string;
    fullName: string;
    fullNameTamil?: string | null;
    phone: string;
  } | null;
}

export interface TicketRosterTableProps {
  chitGroupId: string;
  totalTickets: number;
  isDraft: boolean;
  canManageTickets: boolean;
  tickets: TicketItem[];
  onAssignClick: (ticketNumber: number) => void;
  onUnassignSuccess: () => void;
  className?: string;
}

export function TicketRosterTable({
  chitGroupId,
  totalTickets,
  isDraft,
  canManageTickets,
  tickets,
  onAssignClick,
  onUnassignSuccess,
  className,
}: TicketRosterTableProps) {
  const t = useTranslations('schemes');
  const queryClient = useQueryClient();

  const [searchFilter, setSearchFilter] = React.useState('');
  const [filterMode, setFilterMode] = React.useState<'ALL' | 'ASSIGNED' | 'VACANT' | 'PRIZED'>('ALL');
  const [unassigningTicketNum, setUnassigningTicketNum] = React.useState<number | null>(null);

  // Map tickets by ticketNumber
  const ticketMap = React.useMemo(() => {
    const map = new Map<number, TicketItem>();
    for (const item of tickets) {
      map.set(item.ticketNumber, item);
    }
    return map;
  }, [tickets]);

  // Generate 1..totalTickets slots
  const allSlots = React.useMemo(() => {
    const slots: Array<{ slotNumber: number; ticket?: TicketItem }> = [];
    for (let i = 1; i <= totalTickets; i++) {
      slots.push({
        slotNumber: i,
        ticket: ticketMap.get(i),
      });
    }
    return slots;
  }, [totalTickets, ticketMap]);

  // Filter slots
  const filteredSlots = React.useMemo(() => {
    return allSlots.filter(({ slotNumber, ticket }) => {
      if (filterMode === 'ASSIGNED' && !ticket) return false;
      if (filterMode === 'VACANT' && !!ticket) return false;
      if (filterMode === 'PRIZED' && (!ticket || !ticket.isPrized)) return false;

      if (searchFilter.trim().length > 0) {
        const query = searchFilter.toLowerCase().trim();
        const matchesSlot = String(slotNumber) === query || `ticket #${slotNumber}`.includes(query);
        const matchesName = ticket?.customer?.fullName.toLowerCase().includes(query) ?? false;
        const matchesPhone = ticket?.customer?.phone.includes(query) ?? false;
        const matchesCode = ticket?.customer?.customerCode.toLowerCase().includes(query) ?? false;
        return matchesSlot || matchesName || matchesPhone || matchesCode;
      }

      return true;
    });
  }, [allSlots, filterMode, searchFilter]);

  // Unassign mutation
  const unassignMutation = useMutation({
    mutationFn: async (ticketNumber: number) => {
      return unwrapApiResponse(
        apiClient.DELETE('/api/v1/chits/{id}/tickets/{ticketNumber}', {
          params: { path: { id: chitGroupId, ticketNumber } },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.roster(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.list() });
      onUnassignSuccess();
      setUnassigningTicketNum(null);
    },
    onError: (err) => {
      console.error('[TicketRosterTable] Failed to unassign ticket', err);
      setUnassigningTicketNum(null);
    },
  });

  const handleUnassign = (ticketNumber: number, customerName: string) => {
    if (confirm(t('unassignConfirmDesc', { num: ticketNumber, name: customerName }))) {
      setUnassigningTicketNum(ticketNumber);
      unassignMutation.mutate(ticketNumber);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-9 text-xs border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <div className="overflow-x-auto scrollbar-none w-full sm:w-auto">
          <div className="inline-flex items-center gap-1 self-start sm:self-auto rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-xs">
            {(['ALL', 'ASSIGNED', 'VACANT', 'PRIZED'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-semibold transition-colors shrink-0 whitespace-nowrap',
                  filterMode === mode
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {mode === 'ALL' && t('filterAllSlots')}
                {mode === 'ASSIGNED' && t('filterAssignedSlots', { count: tickets.length })}
                {mode === 'VACANT' && t('filterVacantSlots', { count: totalTickets - tickets.length })}
                {mode === 'PRIZED' && t('filterPrizedSlots')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <Table className="min-w-[680px]">
            <TableHeader className="bg-slate-950/60">
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="w-20 text-xs font-semibold text-slate-400 whitespace-nowrap">{t('colTicketNumber')}</TableHead>
                <TableHead className="text-xs font-semibold text-slate-400 whitespace-nowrap">{t('colSubscriber')}</TableHead>
                <TableHead className="text-xs font-semibold text-slate-400 whitespace-nowrap">{t('colContact')}</TableHead>
                <TableHead className="text-xs font-semibold text-slate-400 whitespace-nowrap">{t('colPrizedStatus')}</TableHead>
                <TableHead className="text-xs font-semibold text-slate-400 whitespace-nowrap">{t('colArrears')}</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-400 whitespace-nowrap">{t('colAction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-800/80">
              {filteredSlots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                    {t('emptyDesc')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSlots.map(({ slotNumber, ticket }) => (
                  <TicketRosterRow
                    key={slotNumber}
                    slotNumber={slotNumber}
                    ticket={ticket}
                    isDraft={isDraft}
                    canManageTickets={canManageTickets}
                    isUnassigning={unassigningTicketNum === slotNumber}
                    onAssignClick={onAssignClick}
                    onUnassignClick={handleUnassign}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
