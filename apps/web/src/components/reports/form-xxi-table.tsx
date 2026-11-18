'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Award,
  Download,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@kumaran/api-client';
import { cn } from '@/lib/utils';
import { downloadPassbookPdf } from '@/lib/pdf-download';
import { getErrorMessage } from '@/lib/api-client';
import { FormXxiKpiBar } from './form-xxi-kpi-bar';
import { toSafeBigInt, type WholeRupeeValue } from './report-bigint';

export interface FormXxiMonthlyScheduleItem {
  installmentMonth: number;
  dueDate: string;
  grossAmount: WholeRupeeValue;
  dividendDeduction: WholeRupeeValue;
  netPayableAmount: WholeRupeeValue;
  paidAmount: WholeRupeeValue;
  status: 'PAID' | 'UNPAID' | 'OVERDUE' | string;
  paymentDate: string | null;
  receiptNumber: string | null;
  paymentMethod: string | null;
}

export interface FormXxiTicketLedger {
  ticketId: string;
  ticketNumber: number;
  isPrized: boolean;
  consecutiveUnpaidMonths: number;
  ticketStatus: string;
  customer: {
    id: string;
    customerCode: string;
    fullName: string;
    fullNameTamil?: string;
    phone: string;
  };
  summary: {
    totalGrossDue: WholeRupeeValue;
    totalDividendCredit: WholeRupeeValue;
    totalNetPayable: WholeRupeeValue;
    totalPaid: WholeRupeeValue;
    totalOutstandingArrears: WholeRupeeValue;
  };
  monthlySchedule: FormXxiMonthlyScheduleItem[];
}

interface FormXxiTableProps {
  ledger: FormXxiTicketLedger;
}

export function FormXxiTable({ ledger }: FormXxiTableProps) {
  const t = useTranslations('reports.ledger');
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const { customer, summary, monthlySchedule } = ledger;

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadPassbookPdf(
        ledger.ticketId,
        `form-xxi-passbook-t${ledger.ticketNumber}-${customer.customerCode}.pdf`,
      );
    } catch (err: unknown) {
      setDownloadError(getErrorMessage(err, 'Failed to download Form XXI PDF'));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Ticket Header & Subscriber Profile */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-sm print:border-slate-300 print:bg-white">
        <CardHeader className="py-3 px-4 sm:px-6 border-b border-slate-800 print:border-slate-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold text-sm shrink-0 font-mono">
                #{ledger.ticketNumber}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white print:text-black">
                    {customer.fullName}
                  </h3>
                  <Badge variant="outline" className="border-slate-700 text-slate-300 font-mono text-[10px]">
                    {customer.customerCode}
                  </Badge>
                  {ledger.isPrized ? (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] gap-1">
                      <Award className="h-3 w-3 text-amber-400" />
                      {t('prized')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px]">
                      {t('nonPrized')}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-0.5">
                  Phone: {customer.phone} • {ledger.consecutiveUnpaidMonths > 0 ? (
                    <span className="text-rose-400 font-medium">
                      {t('consecutiveUnpaid', { months: ledger.consecutiveUnpaidMonths })}
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-medium">{t('paidInFull')}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 w-fit text-xs">
                Form XXI Passbook
              </Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={isDownloading}
                onClick={handleDownloadPdf}
                className="h-7 text-xs gap-1 border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 print:hidden"
              >
                {isDownloading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                <span>PDF</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4">
          {downloadError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-center gap-2 print:hidden">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{downloadError}</span>
            </div>
          )}

          {/* Cumulative KPI Bar (Exact BigInt passthrough — zero Number() truncation) */}
          <FormXxiKpiBar
            totalGrossDue={summary.totalGrossDue}
            totalDividendCredit={summary.totalDividendCredit}
            totalNetPayable={summary.totalNetPayable}
            totalPaid={summary.totalPaid}
            totalOutstandingArrears={summary.totalOutstandingArrears}
          />

          {/* 20-Month Schedule Table */}
          <div className="overflow-x-auto scrollbar-thin rounded-xl border border-slate-800 print:border-slate-300">
            <table className="w-full min-w-[860px] text-left text-xs border-collapse">
              <thead className="bg-slate-950/80 text-slate-400 font-medium border-b border-slate-800 print:bg-slate-100 print:text-black print:border-slate-300">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">{t('tableMonth')}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">{t('tableDueDate')}</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('tableGross')}</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('tableDividend')}</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('tableNet')}</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('tablePaid')}</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">{t('tableBalance')}</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">{t('tableStatus')}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">{t('tableReceipt')}</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">{t('tableMethod')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-slate-200">
                {monthlySchedule.map((row) => {
                  const netDiff = toSafeBigInt(row.netPayableAmount) - toSafeBigInt(row.paidAmount);
                  const unpaid = row.status !== 'PAID' && netDiff > 0n ? netDiff : 0n;
                  const isPaid = row.status === 'PAID';
                  const isOverdue = row.status === 'OVERDUE';

                  return (
                    <tr
                      key={row.installmentMonth}
                      className={cn(
                        "hover:bg-slate-800/30 transition-colors",
                        isOverdue && "bg-rose-950/10"
                      )}
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-white print:text-black">
                        M{row.installmentMonth}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 print:text-slate-600">
                        {Number.isNaN(new Date(row.dueDate).getTime())
                          ? '—'
                          : new Date(row.dueDate).toLocaleDateString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300 print:text-black">
                        {formatRupee(row.grossAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sky-400 print:text-sky-700">
                        {formatRupee(row.dividendDeduction)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-purple-400 print:text-purple-700">
                        {formatRupee(row.netPayableAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400 print:text-emerald-700">
                        {formatRupee(row.paidAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        <span className={unpaid > 0n ? "text-rose-400 print:text-rose-700" : "text-slate-500"}>
                          {formatRupee(unpaid)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] py-0 px-2",
                            isPaid && "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
                            isOverdue && "border-rose-500/40 text-rose-400 bg-rose-500/10",
                            !isPaid && !isOverdue && "border-slate-700 text-slate-400"
                          )}
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300 print:text-black">
                        {row.receiptNumber || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-400 print:text-slate-600">
                        {row.paymentMethod ? (
                          <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                            {row.paymentMethod}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-950 font-bold border-t border-slate-700 text-xs print:bg-slate-100 print:text-black">
                <tr>
                  <td colSpan={2} className="py-2.5 px-3 text-white print:text-black">
                    Total (Cumulative)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-200 print:text-black">
                    {formatRupee(summary.totalGrossDue)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-sky-400 print:text-sky-700">
                    {formatRupee(summary.totalDividendCredit)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-purple-400 print:text-purple-700">
                    {formatRupee(summary.totalNetPayable)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-400 print:text-emerald-700">
                    {formatRupee(summary.totalPaid)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-rose-400 print:text-rose-700">
                    {formatRupee(summary.totalOutstandingArrears)}
                  </td>
                  <td colSpan={3} className="py-2.5 px-3 text-slate-500 text-right text-[11px] font-normal">
                    {t('rowSumBalanced')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
