'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  FileDown,
  Receipt,
  Ticket,
  Calendar,
  Layers,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Clock,
  AlertTriangle,
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
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { CustomerTicketHolding } from './customer-tickets-tab';

export interface PassbookSummary {
  totalScheduledMonths: number;
  totalGrossDue: bigint | number | string;
  totalDividend: bigint | number | string;
  totalNetDue: bigint | number | string;
  totalPaid: bigint | number | string;
  outstandingBalance: bigint | number | string;
}

export interface PassbookLedgerEntry {
  month: number;
  installmentMonth: number;
  dueDate: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  grossAmount: bigint | number | string;
  dividendDeduction: bigint | number | string;
  netPayableAmount: bigint | number | string;
  paidAmount: bigint | number | string;
  status: 'PAID' | 'UNPAID' | 'OVERDUE' | string;
  receiptNumber?: string | null;
  paymentMethod?: string | null;
  paidDate?: string | null;
}

export interface PassbookStatementResponse {
  ticket: {
    id: string;
    ticketNumber: number;
    status: string;
    isPrized: boolean;
    consecutiveUnpaidMonths: number;
  };
  summary: PassbookSummary;
  ledgerEntries: PassbookLedgerEntry[];
}

export interface CustomerPassbookTabProps {
  tickets: CustomerTicketHolding[];
  selectedTicketId?: string;
  onSelectTicket?: (ticketId: string) => void;
}

export function CustomerPassbookTab({
  tickets,
  selectedTicketId,
  onSelectTicket,
}: CustomerPassbookTabProps) {
  const t = useTranslations('customers');
  const activeTicketId = selectedTicketId || tickets[0]?.id;
  const [isDownloading, setIsDownloading] = React.useState(false);

  const { data: passbook, isLoading, isError, error } = useQuery<PassbookStatementResponse>({
    queryKey: queryKeys.tickets.passbook(activeTicketId || ''),
    queryFn: async () => {
      if (!activeTicketId) throw new Error('No ticket selected');
      return unwrapApiResponse<PassbookStatementResponse>(
        apiClient.GET('/api/v1/tickets/{ticketId}/passbook' as any, {
          params: { path: { ticketId: activeTicketId } },
        }),
      );
    },
    enabled: Boolean(activeTicketId),
  });

  const handleDownloadPdf = async () => {
    if (!activeTicketId) return;
    setIsDownloading(true);
    try {
      const res: any = await unwrapApiResponse(
        apiClient.GET('/api/v1/pdf/passbook/{ticketId}' as any, {
          params: {
            path: { ticketId: activeTicketId },
            query: { download: true } as any,
          },
        }),
      );
      if (res?.presignedUrl) {
        window.open(res.presignedUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to generate Passbook PDF', err);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!tickets || tickets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-4">
        <Receipt className="mx-auto h-10 w-10 text-slate-500" />
        <h3 className="text-base font-semibold text-slate-200">{t('noTicketsAssigned')}</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">{t('noTicketsDesc')}</p>
        <Button size="sm" variant="outline" asChild className="border-slate-700 bg-slate-800 text-xs">
          <Link href="/schemes">
            <Layers className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
            <span>{t('assignFirstTicket')}</span>
          </Link>
        </Button>
      </div>
    );
  }

  const activeTicket = tickets.find((tk) => tk.id === activeTicketId) || tickets[0];

  return (
    <div className="space-y-4">
      {/* Ticket Selector Bar & PDF Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-slate-400 shrink-0 flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5 text-emerald-400" />
            <span>{t('selectTicket')}:</span>
          </span>
          <div className="flex items-center gap-1.5">
            {tickets.map((tk) => {
              const isSelected = tk.id === activeTicket.id;
              return (
                <button
                  key={tk.id}
                  onClick={() => onSelectTicket?.(tk.id)}
                  className={`text-xs font-mono font-medium px-2.5 py-1 rounded border transition-all ${
                    isSelected
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 shadow-sm'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  #{tk.ticketNumber} ({tk.chitGroup.groupCode})
                </button>
              );
            })}
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={isDownloading || !passbook}
          onClick={handleDownloadPdf}
          className="border-indigo-500/30 bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 text-xs font-medium h-8 shrink-0"
        >
          {isDownloading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin text-indigo-400" />
          ) : (
            <FileDown className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
          )}
          <span>{isDownloading ? t('downloadingPdf') : t('downloadPdf')}</span>
        </Button>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{error instanceof Error ? error.message : 'Failed to load passbook'}</span>
        </div>
      )}

      {passbook && (
        <>
          {/* 5 Financial Summary KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('totalScheduled')}
              </span>
              <div className="font-mono text-base font-bold text-slate-200">
                {passbook.summary.totalScheduledMonths} M
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {t('totalGrossDue')}
              </span>
              <div className="font-mono text-base font-bold text-slate-200">
                {formatRupee(passbook.summary.totalGrossDue)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-1">
              <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                {t('totalDividends')}
              </span>
              <div className="font-mono text-base font-bold text-indigo-300">
                {formatRupee(passbook.summary.totalDividend)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-1">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                {t('totalPaidAmount')}
              </span>
              <div className="font-mono text-base font-bold text-emerald-300">
                {formatRupee(passbook.summary.totalPaid)}
              </div>
            </div>

            <div className="col-span-2 md:col-span-1 rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-1">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                {t('outstandingDue')}
              </span>
              <div className="font-mono text-base font-bold text-amber-300">
                {formatRupee(passbook.summary.outstandingBalance)}
              </div>
            </div>
          </div>

          {/* Form XXI Passbook Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-sm">
            <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">{t('passbookTitle')}</h3>
                <p className="text-xs text-slate-400">{t('passbookSubtitle')}</p>
              </div>
              <Badge variant="outline" className="border-slate-700 bg-slate-800 font-mono text-[11px] text-slate-300">
                Form XXI
              </Badge>
            </div>

            <Table>
              <TableHeader className="bg-slate-950/60 text-slate-400 text-xs">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="w-16">{t('colMonth')}</TableHead>
                  <TableHead>{t('colDueDate')}</TableHead>
                  <TableHead className="text-right">{t('colGross')}</TableHead>
                  <TableHead className="text-right">{t('colDividend')}</TableHead>
                  <TableHead className="text-right">{t('colNetPayable')}</TableHead>
                  <TableHead className="text-right">{t('colPaidAmount')}</TableHead>
                  <TableHead className="text-center">{t('colStatus')}</TableHead>
                  <TableHead>{t('colReceipt')}</TableHead>
                  <TableHead>{t('colPaidDate')}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {passbook.ledgerEntries.map((row) => {
                  const isPaid = row.status === 'PAID';
                  const isOverdue = row.status === 'OVERDUE';
                  const formattedPaidDate = row.paidDate
                    ? new Date(row.paidDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const formattedDueDate = row.dueDate
                    ? new Date(row.dueDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';

                  return (
                    <TableRow key={row.month} className="border-slate-800/80 hover:bg-slate-850/50 text-xs">
                      <TableCell className="font-mono font-bold text-slate-300">
                        M{row.month}
                      </TableCell>
                      <TableCell className="text-slate-400">{formattedDueDate}</TableCell>
                      <TableCell className="text-right font-mono text-slate-300">
                        {formatRupee(row.grossAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-indigo-400">
                        {Number(row.dividendDeduction) > 0 ? formatRupee(row.dividendDeduction) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-slate-100">
                        {formatRupee(row.netPayableAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-emerald-400">
                        {Number(row.paidAmount) > 0 ? formatRupee(row.paidAmount) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {isPaid ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] py-0 px-1.5">
                            <ShieldCheck className="h-3 w-3 mr-1 inline" /> PAID
                          </Badge>
                        ) : isOverdue ? (
                          <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-300 text-[10px] py-0 px-1.5">
                            <AlertTriangle className="h-3 w-3 mr-1 inline" /> OVERDUE
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] py-0 px-1.5">
                            <Clock className="h-3 w-3 mr-1 inline" /> UNPAID
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-slate-400">
                        {row.receiptNumber || '—'}
                      </TableCell>
                      <TableCell className="text-slate-400">{formattedPaidDate}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
