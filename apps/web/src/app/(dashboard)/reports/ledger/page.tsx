'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Calendar,
  Download,
  FileSpreadsheet,
  Printer,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/query-keys';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { useAuthStore, type AuthState } from '@/stores/auth-store';
import { downloadCsv } from '@/lib/csv-export';
import { FormXxiTable, FormXxiTicketLedger } from '@/components/reports/form-xxi-table';

export default function FormXxiLedgerPage() {
  const t = useTranslations('reports.ledger');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();

  const user = useAuthStore((s: AuthState) => s.user);
  const roles = user?.roles || [];
  const hasAccess = roles.some((r: string) =>
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'].includes(r)
  );

  // Filter States
  const initialGroupId = searchParams.get('chitGroupId') || '';
  const initialTicketNumber = searchParams.get('ticketNumber') ? Number(searchParams.get('ticketNumber')) : 'ALL';

  const [selectedGroupId, setSelectedGroupId] = React.useState<string>(initialGroupId);
  const [selectedTicket, setSelectedTicket] = React.useState<number | 'ALL'>(initialTicketNumber);

  // 1. Fetch Chit Schemes for the Scheme Selector
  const { data: schemes = [] } = useQuery<
    Array<{ id: string; groupCode: string; groupName: string; status: string }>
  >({
    queryKey: queryKeys.schemes.list(),
    queryFn: async () => {
      const res = await unwrapApiResponse<any>(
        apiClient.GET('/api/v1/chits')
      );
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    },
    enabled: hasAccess,
  });

  // Auto-select first active scheme if none selected
  React.useEffect(() => {
    if (!selectedGroupId && schemes.length > 0) {
      const active = schemes.find((s) => s.status === 'ACTIVE') || schemes[0];
      setSelectedGroupId(active.id);
    }
  }, [schemes, selectedGroupId]);

  // 2. Fetch Form XXI Subscriber Ledger
  const { data: formXxiData, isLoading: isLoadingLedger } = useQuery({
    queryKey: queryKeys.reports.formXxi({
      chitGroupId: selectedGroupId,
      ticketNumber: selectedTicket === 'ALL' ? undefined : selectedTicket,
    }),
    queryFn: async () => {
      if (!selectedGroupId) return null;
      const res = await unwrapApiResponse<any>(
        apiClient.GET('/api/v1/reports/form-xxi', {
          params: {
            query: {
              chitGroupId: selectedGroupId,
              ticketNumber: selectedTicket === 'ALL' ? undefined : selectedTicket,
            },
          },
        })
      );
      return res;
    },
    enabled: hasAccess && !!selectedGroupId,
  });

  // Handle Export to CSV
  const handleExportCsv = () => {
    if (!formXxiData || !formXxiData.ledgers) return;

    const rows: (string | number)[][] = [];
    const ledgers: FormXxiTicketLedger[] = formXxiData.ledgers;

    ledgers.forEach((l) => {
      l.monthlySchedule.forEach((row) => {
        const dueDate = new Date(row.dueDate).toISOString().split('T')[0];
        const unpaid = row.status !== 'PAID' ? Math.max(0, row.netPayableAmount - row.paidAmount) : 0;
        rows.push([
          `Ticket #${l.ticketNumber}`,
          l.customer.customerCode,
          l.customer.fullName,
          l.customer.phone,
          l.isPrized ? 'PRIZED' : 'NON-PRIZED',
          `Month ${row.installmentMonth}`,
          dueDate,
          row.grossAmount,
          row.dividendDeduction,
          row.netPayableAmount,
          row.paidAmount,
          unpaid,
          row.status,
          row.receiptNumber || 'N/A',
          row.paymentMethod || 'N/A',
        ]);
      });
    });

    downloadCsv({
      filename: `${t('exportFilename')}_${formXxiData.chitGroup.groupCode}`,
      headers: [
        'Ticket #',
        'Customer Code',
        'Customer Name',
        'Phone',
        'Prized Status',
        'Month',
        'Due Date',
        'Gross Base Due (INR)',
        'Dividend Credit (INR)',
        'Net Payable (INR)',
        'Paid (INR)',
        'Balance Due (INR)',
        'Due Status',
        'Receipt No',
        'Payment Method',
      ],
      rows,
    });
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-white">Access Restricted</h2>
              <p className="text-sm text-rose-200/90 mt-1">
                Only authorized office staff and auditors can inspect statutory subscriber ledgers.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm" className="border-rose-500/30 text-rose-200">
              <Link href="/reports">{tCommon('back')}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const ledgers: FormXxiTicketLedger[] = formXxiData?.ledgers || [];
  const chit = formXxiData?.chitGroup;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400 print:hidden">
        <Link href="/" className="hover:text-slate-200 transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link href="/reports" className="hover:text-slate-200 transition-colors">
          Reports
        </Link>
        <span>/</span>
        <span className="text-white font-medium">Form XXI Subscribers' Ledger</span>
      </nav>

      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shadow-sm">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{t('title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scheme Selector */}
          <div className="relative min-w-[200px]">
            <select
              aria-label={t('schemeSelect')}
              value={selectedGroupId}
              onChange={(e) => {
                setSelectedGroupId(e.target.value);
                setSelectedTicket('ALL');
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.groupCode} — {s.groupName}
                </option>
              ))}
            </select>
          </div>

          {/* Ticket Selector Dropdown */}
          <div className="relative min-w-[130px]">
            <select
              aria-label={t('ticketFilter')}
              value={selectedTicket}
              onChange={(e) => setSelectedTicket(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono"
            >
              <option value="ALL">All Tickets</option>
              {Array.from({ length: chit?.durationMonths || 20 }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  Ticket #{num}
                </option>
              ))}
            </select>
          </div>

          {/* Export CSV Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!formXxiData || ledgers.length === 0}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white text-xs h-9 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('exportCsv')}</span>
          </Button>

          {/* Print Passbook Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={!formXxiData || ledgers.length === 0}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white text-xs h-9 gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{t('printPassbook')}</span>
          </Button>
        </div>
      </div>

      {/* Form XXI Subscriber Ledgers List */}
      {isLoadingLedger ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-sm">
          Loading Form XXI subscribers' ledger...
        </div>
      ) : ledgers.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-sm">
          {t('noTickets')}
        </div>
      ) : (
        <div className="space-y-6">
          {ledgers.map((l) => (
            <FormXxiTable key={l.ticketId} ledger={l} />
          ))}
        </div>
      )}
    </div>
  );
}
