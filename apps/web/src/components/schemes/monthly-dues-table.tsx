'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QrCode, CreditCard, PlusCircle, Loader2, Receipt } from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DueItem {
  id: string;
  chitGroupId: string;
  ticketId: string;
  installmentMonth: number;
  dueDate: string;
  grossAmount: number;
  dividendDeduction: number;
  netPayableAmount: number;
  paidAmount: number;
  status: 'PAID' | 'UNPAID' | 'OVERDUE';
  ticket?: {
    id: string;
    ticketNumber: number;
    isPrized: boolean;
    consecutiveUnpaidMonths: number;
    status: string;
    customer?: {
      id: string;
      customerCode: string;
      fullName: string;
      fullNameTamil?: string;
      phone: string;
    };
  };
}

export interface MonthlyDuesTableProps {
  dues: DueItem[];
  isLoading: boolean;
  selectedMonth: number;
  chitGroupId: string;
  groupCode: string;
  isSchemeActive: boolean;
  canManage: boolean;
  onOpenGenerate: () => void;
  onSelectUpi: (due: {
    dueId: string;
    ticketNumber: number;
    customerName: string;
    netPayableAmount: number;
  }) => void;
}

export function MonthlyDuesTable({
  dues,
  isLoading,
  selectedMonth,
  chitGroupId,
  groupCode: _groupCode,
  isSchemeActive,
  canManage,
  onOpenGenerate,
  onSelectUpi,
}: MonthlyDuesTableProps) {
  const t = useTranslations('installments');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'PAID' | 'UNPAID' | 'OVERDUE'>('ALL');

  // Client-side filtering and counts
  const allCount = dues.length;
  const paidCount = dues.filter((d) => d.status === 'PAID').length;
  const unpaidCount = dues.filter((d) => d.status === 'UNPAID').length;
  const overdueCount = dues.filter((d) => d.status === 'OVERDUE').length;

  const filteredDues = React.useMemo(() => {
    if (statusFilter === 'ALL') return dues;
    return dues.filter((d) => d.status === statusFilter);
  }, [dues, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex h-56 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (dues.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <Receipt className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">{t('emptyDuesTitle')}</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {t('emptyDuesDesc', { m: selectedMonth })}
          </p>
        </div>
        {isSchemeActive && canManage && (
          <Button
            size="sm"
            onClick={onOpenGenerate}
            className="mt-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
            <span>{t('generateDuesButton')}</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar & Status Filter Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter('ALL')}
            className={cn(
              'h-7 px-2.5 text-xs rounded-full cursor-pointer',
              statusFilter === 'ALL'
                ? 'bg-slate-700 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            )}
          >
            {t('filterAll', { count: allCount })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter('PAID')}
            className={cn(
              'h-7 px-2.5 text-xs rounded-full cursor-pointer',
              statusFilter === 'PAID'
                ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-800/40'
                : 'text-slate-400 hover:text-emerald-300'
            )}
          >
            {t('filterPaid', { count: paidCount })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter('UNPAID')}
            className={cn(
              'h-7 px-2.5 text-xs rounded-full cursor-pointer',
              statusFilter === 'UNPAID'
                ? 'bg-amber-950 text-amber-300 font-bold border border-amber-800/40'
                : 'text-slate-400 hover:text-amber-300'
            )}
          >
            {t('filterUnpaid', { count: unpaidCount })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter('OVERDUE')}
            className={cn(
              'h-7 px-2.5 text-xs rounded-full cursor-pointer',
              statusFilter === 'OVERDUE'
                ? 'bg-rose-950 text-rose-300 font-bold border border-rose-800/40'
                : 'text-slate-400 hover:text-rose-300'
            )}
          >
            {t('filterOverdue', { count: overdueCount })}
          </Button>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          Month {selectedMonth} • {filteredDues.length} tickets shown
        </span>
      </div>

      {/* Dues Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-[110px]">{t('colTicket')}</TableHead>
              <TableHead>{t('colSubscriber')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('colPhone')}</TableHead>
              <TableHead className="text-right">{t('colGross')}</TableHead>
              <TableHead className="text-right">{t('colDividend')}</TableHead>
              <TableHead className="text-right">{t('colNetDue')}</TableHead>
              <TableHead className="text-right hidden sm:table-cell">{t('colPaid')}</TableHead>
              <TableHead className="text-center">{t('colStatus')}</TableHead>
              <TableHead className="text-right w-[150px]">{t('colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDues.map((due) => {
              const ticket = due.ticket;
              const ticketNum = ticket?.ticketNumber || 0;
              const customer = ticket?.customer;
              const customerName = customer?.fullName || 'Unassigned';
              const isPaid = due.status === 'PAID';
              const isOverdue = due.status === 'OVERDUE';
              const consecutiveUnpaid = ticket?.consecutiveUnpaidMonths || 0;

              return (
                <TableRow
                  key={due.id}
                  className="border-slate-850 hover:bg-slate-800/40 transition-colors"
                >
                  {/* Ticket # & Badge */}
                  <TableCell className="font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs">#{ticketNum}</span>
                      {selectedMonth === 1 && ticketNum === 1 ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {t('foremanBadge')}
                        </Badge>
                      ) : ticket?.isPrized ? (
                        <Badge variant="paid" className="text-[10px] px-1.5 py-0">
                          {t('prizedBadge')}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" className="text-[10px] px-1.5 py-0">
                          {t('nonPrizedBadge')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Subscriber Name & Code */}
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-100">{customerName}</p>
                      {customer?.customerCode && (
                        <span className="font-mono text-[11px] text-slate-400">
                          {customer.customerCode}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Phone */}
                  <TableCell className="hidden md:table-cell font-mono text-xs text-slate-300">
                    {customer?.phone || '—'}
                  </TableCell>

                  {/* Gross */}
                  <TableCell className="text-right font-mono text-xs text-slate-400">
                    {formatRupee(due.grossAmount)}
                  </TableCell>

                  {/* Dividend */}
                  <TableCell className="text-right font-mono text-xs text-emerald-400">
                    {due.dividendDeduction > 0 ? formatRupee(due.dividendDeduction) : '₹0'}
                  </TableCell>

                  {/* Net Payable */}
                  <TableCell className="text-right font-mono text-xs font-bold text-cyan-300">
                    {formatRupee(due.netPayableAmount)}
                  </TableCell>

                  {/* Paid Amount */}
                  <TableCell className="text-right font-mono text-xs text-slate-300 hidden sm:table-cell">
                    {formatRupee(due.paidAmount)}
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge
                        variant={isPaid ? 'paid' : isOverdue ? 'overdue' : 'unpaid'}
                        className="text-[10px] uppercase font-bold"
                      >
                        {isPaid ? t('statusPaid') : isOverdue ? t('statusOverdue') : t('statusUnpaid')}
                      </Badge>
                      {isOverdue && consecutiveUnpaid > 1 && (
                        <span className="text-[10px] text-rose-400 font-mono">
                          {consecutiveUnpaid}M Unpaid
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions: UPI QR & Pay at Counter */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onSelectUpi({
                            dueId: due.id,
                            ticketNumber: ticketNum,
                            customerName,
                            netPayableAmount: due.netPayableAmount,
                          })
                        }
                        title={t('upiQrTitle')}
                        className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                      >
                        <QrCode className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="sr-only sm:not-sr-only sm:inline text-[11px]">
                          {t('upiQrButton')}
                        </span>
                      </Button>

                      {!isPaid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 px-2 text-xs text-slate-400 hover:text-white"
                        >
                          <Link
                            href={`/collections?chitGroupId=${chitGroupId}&ticketId=${due.ticketId}`}
                            title={t('payAtCounter')}
                          >
                            <CreditCard className="h-3.5 w-3.5 text-cyan-400" />
                          </Link>
                        </Button>
                      )}
                    </div>
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
