'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Phone,
  UserMinus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';
import { DefaulterItem } from './defaulter-kpi-bar';

interface DefaulterAnalysisTableProps {
  defaulters: DefaulterItem[];
}

export function DefaulterAnalysisTable({ defaulters }: DefaulterAnalysisTableProps) {
  const t = useTranslations('reports.defaulters');
  const [expandedIds, setExpandedIds] = React.useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  if (defaulters.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-sm">
        {t('noDefaulters')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-thin rounded-xl border border-slate-800 print:border-slate-300">
      <table className="w-full min-w-[800px] text-left text-xs border-collapse">
        <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800 print:bg-slate-100 print:text-black print:border-slate-300">
          <tr>
            <th className="py-3 px-3.5 whitespace-nowrap">{t('colCustomer')}</th>
            <th className="py-3 px-3.5 whitespace-nowrap">{t('colScheme')}</th>
            <th className="py-3 px-3.5 text-center whitespace-nowrap">{t('colUnpaidMonths')}</th>
            <th className="py-3 px-3.5 text-center whitespace-nowrap">{t('colRisk')}</th>
            <th className="py-3 px-3.5 text-right whitespace-nowrap">{t('colArrears')}</th>
            <th className="py-3 px-3.5 whitespace-nowrap">{t('colUnpaidDues')}</th>
            <th className="py-3 px-3.5 text-right print:hidden whitespace-nowrap">{t('colActions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
          {defaulters.map((item) => {
            const isExpanded = !!expandedIds[item.ticketId];
            const isHighRisk = item.consecutiveUnpaidMonths >= 3;
            const isMediumRisk = item.consecutiveUnpaidMonths === 2;

            return (
              <React.Fragment key={item.ticketId}>
                <tr
                  className={cn(
                    "hover:bg-slate-800/30 transition-colors",
                    isHighRisk && "bg-rose-950/10"
                  )}
                >
                  {/* Subscriber Info */}
                  <td className="py-3 px-3.5">
                    <div>
                      <div className="font-semibold text-white print:text-black">
                        {item.customerName}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 print:text-slate-600 mt-0.5">
                        <span className="font-mono">{item.customerCode}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3 text-slate-500" />
                          {item.phone}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Scheme & Ticket */}
                  <td className="py-3 px-3.5">
                    <div className="font-mono font-semibold text-white print:text-black">
                      {item.groupCode}
                    </div>
                    <div className="text-[11px] text-slate-400 print:text-slate-600 font-mono">
                      Ticket #{item.ticketNumber}
                    </div>
                  </td>

                  {/* Unpaid Months Count */}
                  <td className="py-3 px-3.5 text-center font-mono font-bold text-sm">
                    <span
                      className={cn(
                        isHighRisk ? "text-rose-400" : isMediumRisk ? "text-amber-400" : "text-sky-400"
                      )}
                    >
                      {item.consecutiveUnpaidMonths}
                    </span>
                  </td>

                  {/* Risk Badge */}
                  <td className="py-3 px-3.5 text-center">
                    {isHighRisk ? (
                      <Badge variant="destructive" className="bg-rose-600 text-white gap-1 text-[10px] py-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{t('risk3M')}</span>
                      </Badge>
                    ) : isMediumRisk ? (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] py-0.5">
                        {t('risk2M')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-sky-500/30 text-sky-400 bg-sky-500/10 text-[10px] py-0.5">
                        {t('risk1M')}
                      </Badge>
                    )}
                  </td>

                  {/* Total Arrears Amount */}
                  <td className="py-3 px-3.5 text-right font-mono font-bold text-sm text-rose-400 print:text-rose-700">
                    {formatRupee(item.totalArrearsAmount)}
                  </td>

                  {/* Unpaid Dues Expander */}
                  <td className="py-3 px-3.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.ticketId)}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 font-medium transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded
                        ? t('hideDues')
                        : t('viewDues', { count: item.unpaidDues.length })}
                    </button>
                  </td>

                  {/* Quick Actions */}
                  <td className="py-3 px-3.5 text-right print:hidden">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* View Passbook */}
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 gap-1">
                        <Link href={`/reports/ledger?ticketNumber=${item.ticketNumber}`}>
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>{t('actionPassbook')}</span>
                        </Link>
                      </Button>

                      {/* ADR-07 Substitute Defaulter */}
                      {isHighRisk && (
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1">
                          <Link href={`/schemes`}>
                            <UserMinus className="h-3.5 w-3.5" />
                            <span>{t('actionSubstitute')}</span>
                          </Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded Itemized Dues Row */}
                {isExpanded && (
                  <tr className="bg-slate-950/60 print:bg-slate-50">
                    <td colSpan={7} className="p-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                        <div className="text-[11px] font-semibold text-slate-300">
                          Itemized Overdue Installments for Ticket #{item.ticketNumber} ({item.customerName})
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          {item.unpaidDues.map((due) => (
                            <div
                              key={due.installmentMonth}
                              className="rounded border border-slate-800 bg-slate-950/80 p-2 space-y-1"
                            >
                              <div className="flex items-center justify-between font-mono font-bold text-white">
                                <span>Month {due.installmentMonth}</span>
                                <Badge variant="outline" className="text-[9px] py-0 px-1 border-rose-500/30 text-rose-400">
                                  {due.status}
                                </Badge>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Due: {new Date(due.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                              <div className="text-right font-mono font-semibold text-rose-400">
                                {formatRupee(due.outstandingDue)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
