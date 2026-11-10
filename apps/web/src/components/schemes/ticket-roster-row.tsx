'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Award, Loader2, Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TicketItem } from './ticket-roster-table';

export interface TicketRosterRowProps {
  slotNumber: number;
  ticket?: TicketItem;
  isDraft: boolean;
  canManageTickets: boolean;
  isUnassigning: boolean;
  onAssignClick: (slotNumber: number) => void;
  onUnassignClick: (slotNumber: number, customerName: string) => void;
}

export function TicketRosterRow({
  slotNumber,
  ticket,
  isDraft,
  canManageTickets,
  isUnassigning,
  onAssignClick,
  onUnassignClick,
}: TicketRosterRowProps) {
  const t = useTranslations('schemes');
  const isCompanyRep = slotNumber === 1;

  return (
    <TableRow
      className={cn(
        'border-slate-800/80 hover:bg-slate-800/40 transition-colors',
        isCompanyRep && 'bg-indigo-950/20'
      )}
    >
      {/* Ticket Slot Number */}
      <TableCell className="font-mono text-xs font-bold text-slate-200 whitespace-nowrap">
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
      <TableCell className="font-mono text-xs text-slate-300 whitespace-nowrap">
        {ticket?.customer?.phone ? `+91 ${ticket.customer.phone}` : '—'}
      </TableCell>

      {/* Prized Status */}
      <TableCell className="whitespace-nowrap">
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
      <TableCell className="whitespace-nowrap">
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
      <TableCell className="text-right whitespace-nowrap">
        {ticket ? (
          isDraft && canManageTickets ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onUnassignClick(slotNumber, ticket.customer?.fullName || 'subscriber')
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
}
