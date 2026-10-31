'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  Clock,
  Loader2,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    for (const t of tickets) {
      map.set(t.ticketNumber, t);
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
      // 1. Filter mode
      if (filterMode === 'ASSIGNED' && !ticket) return false;
      if (filterMode === 'VACANT' && !!ticket) return false;
      if (filterMode === 'PRIZED' && (!ticket || !ticket.isPrized)) return false;

      // 2. Search query
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

        <div className="flex items-center gap-1 self-start sm:self-auto rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-xs">
          {(['ALL', 'ASSIGNED', 'VACANT', 'PRIZED'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-semibold transition-colors',
                filterMode === mode
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {mode === 'ALL' && 'All Slots'}
              {mode === 'ASSIGNED' && `Assigned (${tickets.length})`}
              {mode === 'VACANT' && `Vacant (${totalTickets - tickets.length})`}
              {mode === 'PRIZED' && 'Prized'}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-950/60">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-20 text-xs font-semibold text-slate-400">#</TableHead>
              <TableHead className="text-xs font-semibold text-slate-400">Subscriber</TableHead>
              <TableHead className="text-xs font-semibold text-slate-400">Contact</TableHead>
              <TableHead className="text-xs font-semibold text-slate-400">Prized Status</TableHead>
              <TableHead className="text-xs font-semibold text-slate-400">Arrears</TableHead>
              <TableHead className="text-right text-xs font-semibold text-slate-400">Action</TableHead>
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
              filteredSlots.map(({ slotNumber, ticket }) => {
                const isCompanyRep = slotNumber === 1;
                const isUnassigning = unassigningTicketNum === slotNumber;

                return (
                  <TableRow
                    key={slotNumber}
                    className={cn(
                      'border-slate-800/80 hover:bg-slate-800/40 transition-colors',
                      isCompanyRep && 'bg-indigo-950/20'
                    )}
                  >
                    {/* Ticket Slot Number */}
                    <TableCell className="font-mono text-xs font-bold text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                          {slotNumber}
                        </span>
                        {isCompanyRep && (
                          <Badge variant="outline" className="border-indigo-500/40 text-[10px] text-indigo-300">
                            Foreman
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Subscriber Details */}
                    <TableCell>
                      {ticket?.customer ? (
                        <div>
                          <p className="text-xs font-semibold text-slate-100">
                            {ticket.customer.fullName}
                          </p>
                          {ticket.customer.fullNameTamil && (
                            <p className="text-[11px] text-slate-400 font-tamil">
                              {ticket.customer.fullNameTamil}
                            </p>
                          )}
                          <span className="font-mono text-[10px] text-slate-400">
                            {ticket.customer.customerCode}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 italic">
                          <span>{t('vacantSlot')}</span>
                        </div>
                      )}
                    </TableCell>

                    {/* Contact Phone */}
                    <TableCell className="font-mono text-xs text-slate-300">
                      {ticket?.customer?.phone ? `+91 ${ticket.customer.phone}` : '—'}
                    </TableCell>

                    {/* Prized Status */}
                    <TableCell>
                      {ticket ? (
                        ticket.isPrized ? (
                          <Badge variant="success" className="text-[10px] font-bold py-0.5">
                            <Award className="h-3 w-3 mr-1" />
                            {t('prizedBadge', { month: '—' })}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] font-semibold py-0.5">
                            {t('unprizedBadge')}
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </TableCell>

                    {/* Arrears Aging & ADR-07 Warning */}
                    <TableCell>
                      {ticket ? (
                        ticket.consecutiveUnpaidMonths >= 3 ? (
                          <Badge variant="destructive" className="text-[10px] font-bold py-0.5">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {t('unpaidMonths', { count: ticket.consecutiveUnpaidMonths })} (ADR-07)
                          </Badge>
                        ) : ticket.consecutiveUnpaidMonths > 0 ? (
                          <Badge variant="warning" className="text-[10px] font-semibold py-0.5">
                            {t('unpaidMonths', { count: ticket.consecutiveUnpaidMonths })}
                          </Badge>
                        ) : (
                          <span className="text-xs font-medium text-emerald-400">0M</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      {ticket ? (
                        isDraft && canManageTickets ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleUnassign(slotNumber, ticket.customer?.fullName || 'subscriber')
                            }
                            disabled={isUnassigning}
                            className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                          >
                            {isUnassigning ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                {t('unassignTicket')}
                              </>
                            )}
                          </Button>
                        ) : null
                      ) : (
                        isDraft && canManageTickets ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onAssignClick(slotNumber)}
                            className="h-7 border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 hover:text-white text-xs"
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            {t('assignTicket')}
                          </Button>
                        ) : null
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
