'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  UserX,
  UserCheck,
  Receipt,
  ShieldAlert,
  CheckCircle2,
  Ban,
  Clock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { DefaulterTicketRef } from './defaulter-removal-dialog';

export interface SchemeTicketRow {
  id: string;
  ticketNumber: number;
  customerId: string;
  customer?: {
    id: string;
    customerCode: string;
    fullName: string;
    phone: string;
  } | null;
  isPrized: boolean;
  status: string;
  consecutiveUnpaidMonths: number;
  removedAt?: string | null;
  removedByUserId?: string | null;
}

interface DefaultersTableProps {
  chitGroupId: string;
  chitGroupCode: string;
  chitValue: bigint | number;
  tickets: SchemeTicketRow[];
  duesMap?: Record<string, { totalOverdue: bigint | number; unpaidCount: number }>;
  onRemoveClick: (ticket: DefaulterTicketRef) => void;
  onSubstituteClick: (ticket: DefaulterTicketRef) => void;
  onSettleClick: (ticket: DefaulterTicketRef) => void;
  isSuperAdmin: boolean;
  canSettle: boolean;
}

export function DefaultersTable({
  chitGroupId: _chitGroupId,
  chitGroupCode: _chitGroupCode,
  chitValue: _chitValue,
  tickets,
  duesMap = {},
  onRemoveClick,
  onSubstituteClick,
  onSettleClick,
  isSuperAdmin,
  canSettle,
}: DefaultersTableProps) {
  const t = useTranslations('schemes');
  const [activeTab, setActiveTab] = React.useState<'all' | 'active_arrears' | 'removal_eligible' | 'removed'>('all');

  const filteredTickets = React.useMemo(() => {
    switch (activeTab) {
      case 'active_arrears':
        return tickets.filter(
          (t) => t.status !== 'REMOVED_DEF_3M' && t.consecutiveUnpaidMonths > 0 && t.consecutiveUnpaidMonths < 3,
        );
      case 'removal_eligible':
        return tickets.filter(
          (t) => t.status !== 'REMOVED_DEF_3M' && t.consecutiveUnpaidMonths >= 3,
        );
      case 'removed':
        return tickets.filter((t) => t.status === 'REMOVED_DEF_3M');
      default:
        return tickets;
    }
  }, [tickets, activeTab]);

  const countActiveArrears = tickets.filter(
    (t) => t.status !== 'REMOVED_DEF_3M' && t.consecutiveUnpaidMonths > 0 && t.consecutiveUnpaidMonths < 3,
  ).length;

  const countEligible = tickets.filter(
    (t) => t.status !== 'REMOVED_DEF_3M' && t.consecutiveUnpaidMonths >= 3,
  ).length;

  const countRemoved = tickets.filter((t) => t.status === 'REMOVED_DEF_3M').length;

  return (
    <div className="space-y-4">
      {/* Sub-Tabs / Filters */}
      <div className="overflow-x-auto scrollbar-none pb-1 border-b border-slate-800">
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 whitespace-nowrap',
              activeTab === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900',
            )}
          >
            {t('tabAllDefaulters', { count: tickets.length })}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('active_arrears')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap',
              activeTab === 'active_arrears'
                ? 'bg-amber-950/60 text-amber-300 border border-amber-600/50'
                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900',
            )}
          >
            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>{t('tabActiveDefaulters', { count: countActiveArrears })}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('removal_eligible')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap',
              activeTab === 'removal_eligible'
                ? 'bg-rose-950/60 text-rose-300 border border-rose-600/50'
                : 'text-slate-400 hover:text-rose-300 hover:bg-slate-900',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span>{t('tabEligibleRemoval', { count: countEligible })}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('removed')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap',
              activeTab === 'removed'
                ? 'bg-purple-950/60 text-purple-300 border border-purple-600/50'
                : 'text-slate-400 hover:text-purple-300 hover:bg-slate-900',
            )}
          >
            <Ban className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span>{t('tabRemoved', { count: countRemoved })}</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      {filteredTickets.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-1.5">
          <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-200">{t('noDefaultersTitle')}</p>
          <p className="text-xs text-slate-400">{t('noDefaultersDesc')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin rounded-xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 whitespace-nowrap">Ticket</th>
                <th className="py-3 px-4 whitespace-nowrap">Subscriber</th>
                <th className="py-3 px-4 whitespace-nowrap">Arrears Status</th>
                <th className="py-3 px-4 whitespace-nowrap">Unpaid Months</th>
                <th className="py-3 px-4 whitespace-nowrap">Total Arrears</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredTickets.map((item) => {
                const duesInfo = duesMap[item.id] || { totalOverdue: 0n, unpaidCount: item.consecutiveUnpaidMonths };
                const isRemoved = item.status === 'REMOVED_DEF_3M';
                const isEligibleForRemoval = !isRemoved && item.consecutiveUnpaidMonths >= 3;
                const isWarningArrears = !isRemoved && item.consecutiveUnpaidMonths > 0 && item.consecutiveUnpaidMonths < 3;

                const ticketRef: DefaulterTicketRef = {
                  id: item.id,
                  ticketNumber: item.ticketNumber,
                  customerId: item.customerId,
                  customerName: item.customer?.fullName || 'Vacant / Unassigned',
                  customerPhone: item.customer?.phone || '',
                  consecutiveUnpaidMonths: item.consecutiveUnpaidMonths,
                  totalOverdueAmount: duesInfo.totalOverdue,
                  status: item.status,
                };

                return (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Ticket # */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-200 whitespace-nowrap">
                      #{item.ticketNumber}
                    </td>

                    {/* Subscriber */}
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-200">
                        {item.customer?.fullName || 'Vacant Slot'}
                      </p>
                      {item.customer && (
                        <p className="font-mono text-[11px] text-slate-400">
                          {item.customer.customerCode} • +91 {item.customer.phone}
                        </p>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isRemoved ? (
                        <Badge variant="outline" className="text-[10px] bg-purple-950/40 text-purple-300 border-purple-500/40 font-bold">
                          {t('statusRemovedDefaulter')}
                        </Badge>
                      ) : isEligibleForRemoval ? (
                        <Badge variant="destructive" className="text-[10px] font-bold">
                          {t('statusRemovalEligible')}
                        </Badge>
                      ) : isWarningArrears ? (
                        <Badge variant="warning" className="text-[10px] font-bold">
                          {t('statusIneligibleBid')}
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">
                          {t('statusActiveGood')}
                        </Badge>
                      )}
                    </td>

                    {/* Unpaid Months */}
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      {item.consecutiveUnpaidMonths > 0 ? (
                        <span className={isEligibleForRemoval ? 'text-rose-400 font-bold' : 'text-amber-400'}>
                          {t('consecutiveMonthsUnpaid', { months: item.consecutiveUnpaidMonths })}
                        </span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>

                    {/* Total Arrears Amount */}
                    <td className="py-3 px-4 font-mono font-semibold text-slate-200 whitespace-nowrap">
                      {duesInfo.totalOverdue > 0n ? formatRupee(duesInfo.totalOverdue) : '₹0'}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {isRemoved ? (
                          <>
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onSubstituteClick(ticketRef)}
                                className="border-emerald-600/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 text-[11px] h-7 px-2 gap-1 font-medium"
                              >
                                <UserCheck className="h-3 w-3" />
                                <span>{t('actionSubstitute')}</span>
                              </Button>
                            )}
                            {canSettle && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onSettleClick(ticketRef)}
                                className="border-indigo-600/40 bg-indigo-950/30 text-indigo-300 hover:bg-indigo-900/40 text-[11px] h-7 px-2 gap-1 font-medium"
                              >
                                <Receipt className="h-3 w-3" />
                                <span>{t('actionSettle')}</span>
                              </Button>
                            )}
                          </>
                        ) : isEligibleForRemoval ? (
                          isSuperAdmin ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => onRemoveClick(ticketRef)}
                              className="text-[11px] h-7 px-2 gap-1 font-semibold"
                            >
                              <UserX className="h-3 w-3" />
                              <span>{t('actionRemoveMember')}</span>
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">
                              Partner Only
                            </Badge>
                          )
                        ) : isWarningArrears ? (
                          <span
                            title={t('removalBlockedTooltip')}
                            className="inline-flex items-center gap-1 rounded bg-slate-800/60 px-2 py-1 text-[11px] font-medium text-slate-400 border border-slate-700/60 cursor-not-allowed"
                          >
                            <ShieldAlert className="h-3 w-3 text-slate-500" />
                            <span>&lt; 3 Mo Arrears</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
