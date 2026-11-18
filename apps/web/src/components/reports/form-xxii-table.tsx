'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowUpRight, FileText, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';
import { sumWholeRupees, type WholeRupeeValue } from './report-bigint';

export interface FormXxiiInflowItem {
  paymentId: string;
  receiptNumber: string;
  time: string | Date;
  amount: WholeRupeeValue;
  customerCode: string;
  customerName: string;
  groupCode: string;
  ticketNumber: number | null;
  receivedBy: string;
  source: 'FIELD_HANDOVER' | 'COUNTER_CASH';
}

export interface FormXxiiOutflowItem {
  winnerId: string;
  voucherNumber: string;
  time: string | Date;
  amount: WholeRupeeValue;
  groupCode: string;
  installmentMonth: number;
  ticketNumber: number;
  winnerCode: string;
  winnerName: string;
}

interface FormXxiiTableProps {
  inflows: FormXxiiInflowItem[];
  outflows: FormXxiiOutflowItem[];
  isLoading: boolean;
}

export function FormXxiiTable({ inflows, outflows, isLoading }: FormXxiiTableProps) {
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

  const totalInflows = sumWholeRupees(inflows.map((item) => item.amount));
  const totalOutflows = sumWholeRupees(outflows.map((item) => item.amount));

  return (
    <div className="space-y-6">
      {/* Statutory Educational Banner */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 text-xs text-indigo-300 flex items-start gap-3">
        <Info className="h-5 w-5 shrink-0 text-indigo-400 mt-0.5" />
        <div>
          <strong className="font-semibold block text-slate-100">
            {t('statutoryBannerTitle')}
          </strong>
          <p className="text-slate-300/90 mt-0.5">{t('statutoryBannerDesc')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side: Cash Receipts (Inflows / Credit) */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <ArrowDownLeft className="h-5 w-5 text-emerald-400" />
                    {t('receiptsSide')}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Physical cash counter collections & acknowledged evening handovers
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono text-xs px-2.5 py-1"
                >
                  +{formatRupee(totalInflows)}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-slate-950/40 rounded-lg" />
                  ))}
                </div>
              ) : inflows.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  {t('table.noInflows')}
                </div>
              ) : (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.receiptNo')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.time')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.customer')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.groupTicket')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.source')}</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('table.amount')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {inflows.map((item) => {
                        const isCounter = item.source === 'COUNTER_CASH';
                        return (
                          <tr key={item.paymentId} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2 px-3 font-mono font-medium text-emerald-400 whitespace-nowrap">
                              {item.receiptNumber}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                              {formatTime(item.time)}
                            </td>
                            <td className="py-2 px-3 max-w-[130px] truncate">
                              <span className="font-medium text-slate-200 block truncate">
                                {item.customerName}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {item.customerCode}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">
                              {item.groupCode} / #{item.ticketNumber || '—'}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-mono border px-1.5 py-0.5',
                                  isCounter
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                )}
                              >
                                {isCounter ? t('table.counterCash') : t('table.fieldHandover')}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                              +{formatRupee(item.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </div>

          <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex justify-between items-center text-xs font-semibold text-slate-200">
            <span>{t('table.totalReceipts')} ({inflows.length})</span>
            <span className="font-mono text-emerald-400">+{formatRupee(totalInflows)}</span>
          </div>
        </Card>

        {/* Right Side: Cash Disbursements (Outflows / Debit) */}
        <Card className="border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <ArrowUpRight className="h-5 w-5 text-rose-400" />
                    {t('paymentsSide')}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400 mt-0.5">
                    Physical cash prize payouts released under statutory vouchers
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="bg-rose-500/10 text-rose-400 border-rose-500/20 font-mono text-xs px-2.5 py-1"
                >
                  -{formatRupee(totalOutflows)}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-slate-950/40 rounded-lg" />
                  ))}
                </div>
              ) : outflows.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  {t('table.noOutflows')}
                </div>
              ) : (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.voucherNo')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.time')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.winner')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.groupTicket')}</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">{t('table.particulars')}</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('table.amount')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {outflows.map((item) => (
                        <tr key={item.winnerId} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2 px-3 font-mono font-medium text-rose-400 whitespace-nowrap">
                            {item.voucherNumber}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                            {formatTime(item.time)}
                          </td>
                          <td className="py-2 px-3 max-w-[130px] truncate">
                            <span className="font-medium text-slate-200 block truncate">
                              {item.winnerName}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {item.winnerCode}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">
                            {item.groupCode} / #{item.ticketNumber}
                          </td>
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                            {t('table.monthPayout', { month: item.installmentMonth })}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-rose-400 whitespace-nowrap">
                            -{formatRupee(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </div>

          <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex justify-between items-center text-xs font-semibold text-slate-200">
            <span>{t('table.totalDisbursements')} ({outflows.length})</span>
            <span className="font-mono text-rose-400">-{formatRupee(totalOutflows)}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
