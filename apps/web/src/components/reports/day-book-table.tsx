'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building,
  CreditCard,
  FileCheck,
  FileText,
  QrCode,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';

export interface DayBookInflowItem {
  paymentId: string;
  receiptNumber: string;
  time: string | Date;
  paymentMethod: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';
  transactionRef?: string;
  amount: number;
  groupCode: string;
  ticketNumber: number | null;
  customerCode: string;
  customerName: string;
  collectedBy: string;
}

export interface DayBookOutflowItem {
  winnerId: string;
  voucherNumber: string;
  time: string | Date;
  disbursementMode: string;
  amount: number;
  groupCode: string;
  installmentMonth: number;
  ticketNumber: number;
  winnerCode: string;
  winnerName: string;
}

export interface DayBookSummary {
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  inflowByMethod: {
    cash: number;
    upi: number;
    bankTransfer: number;
    cheque: number;
  };
}

interface DayBookTableProps {
  summary?: DayBookSummary;
  inflows: DayBookInflowItem[];
  outflows: DayBookOutflowItem[];
  isLoading: boolean;
}

export function DayBookTable({ summary, inflows, outflows, isLoading }: DayBookTableProps) {
  const t = useTranslations('reports');

  const formatTime = (timeInput: string | Date) => {
    try {
      const d = typeof timeInput === 'string' ? new Date(timeInput) : timeInput;
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '—';
    }
  };

  const getMethodBadge = (method: string) => {
    switch (method.toUpperCase()) {
      case 'CASH':
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-mono">
            CASH
          </Badge>
        );
      case 'UPI':
        return (
          <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20 text-[10px] font-mono">
            UPI
          </Badge>
        );
      case 'BANK_TRANSFER':
        return (
          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px] font-mono">
            BANK
          </Badge>
        );
      case 'CHEQUE':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/20 text-[10px] font-mono">
            CHEQUE
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] font-mono">
            {method}
          </Badge>
        );
    }
  };

  // Combine inflows and outflows chronologically
  const journalEntries = React.useMemo(() => {
    const combined: Array<{
      id: string;
      time: Date;
      type: 'INFLOW' | 'OUTFLOW';
      docNo: string;
      method: string;
      ref?: string;
      partyName: string;
      partyCode: string;
      groupInfo: string;
      actor: string;
      amount: number;
    }> = [];

    inflows.forEach((item) => {
      combined.push({
        id: item.paymentId,
        time: new Date(item.time),
        type: 'INFLOW',
        docNo: item.receiptNumber,
        method: item.paymentMethod,
        ref: item.transactionRef,
        partyName: item.customerName,
        partyCode: item.customerCode,
        groupInfo: `${item.groupCode} / #${item.ticketNumber || '—'}`,
        actor: item.collectedBy,
        amount: item.amount,
      });
    });

    outflows.forEach((item) => {
      combined.push({
        id: item.winnerId,
        time: new Date(item.time),
        type: 'OUTFLOW',
        docNo: item.voucherNumber,
        method: item.disbursementMode || 'CASH',
        partyName: item.winnerName,
        partyCode: item.winnerCode,
        groupInfo: `${item.groupCode} (M${item.installmentMonth}) / #${item.ticketNumber}`,
        actor: 'Foreman',
        amount: item.amount,
      });
    });

    return combined.sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [inflows, outflows]);

  return (
    <div className="space-y-6">
      {/* Multi-Mode Inflow Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              {t('dayBook.cashInflow')}
            </span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-1 block">
              {formatRupee(summary.inflowByMethod.cash || 0)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              {t('dayBook.upiInflow')}
            </span>
            <span className="text-base font-bold font-mono text-sky-400 mt-1 block">
              {formatRupee(summary.inflowByMethod.upi || 0)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              {t('dayBook.bankInflow')}
            </span>
            <span className="text-base font-bold font-mono text-indigo-400 mt-1 block">
              {formatRupee(summary.inflowByMethod.bankTransfer || 0)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              {t('dayBook.chequeInflow')}
            </span>
            <span className="text-base font-bold font-mono text-amber-300 mt-1 block">
              {formatRupee(summary.inflowByMethod.cheque || 0)}
            </span>
          </div>
        </div>
      )}

      {/* Main Journal Table */}
      <Card className="border-slate-800 bg-slate-900/80 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-indigo-400" />
                {t('dayBookTitle')}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                {t('dayBookSubtitle')}
              </CardDescription>
            </div>

            {summary && (
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">{t('kpi.netCashFlow')}:</span>
                <span className={cn('font-bold', summary.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {summary.netCashFlow >= 0 ? '+' : ''}{formatRupee(summary.netCashFlow)}
                </span>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-slate-950/40 rounded-lg" />
              ))}
            </div>
          ) : journalEntries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              {t('table.noTransactions')}
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('table.time')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('table.docNo')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('table.paymentMethod')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('table.transactionRef')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('table.customer')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('table.groupTicket')}</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">{t('dayBook.collectedBy')}</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('table.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {journalEntries.map((item) => {
                    const isInflow = item.type === 'INFLOW';
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {formatTime(item.time)}
                        </td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-200 whitespace-nowrap">
                          {item.docNo}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {getMethodBadge(item.method)}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap max-w-[120px] truncate">
                          {item.ref || '—'}
                        </td>
                        <td className="py-2 px-3 max-w-[140px] truncate">
                          <span className="font-medium text-slate-200 block truncate">
                            {item.partyName}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {item.partyCode}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">
                          {item.groupInfo}
                        </td>
                        <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                          {item.actor}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">
                          <span className={isInflow ? 'text-emerald-400' : 'text-rose-400'}>
                            {isInflow ? '+' : '-'}{formatRupee(item.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
