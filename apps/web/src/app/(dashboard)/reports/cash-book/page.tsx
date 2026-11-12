'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Download,
  FileCheck,
  Printer,
  ShieldAlert,
  Vault,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { downloadCsv } from '@/lib/csv-export';
import { CashBookKpiBar } from '@/components/reports/cash-book-kpi-bar';
import { ReportDateNavigator } from '@/components/reports/report-date-navigator';
import { FormXxiiTable, type FormXxiiInflowItem, type FormXxiiOutflowItem } from '@/components/reports/form-xxii-table';
import { DayBookTable, type DayBookInflowItem, type DayBookOutflowItem, type DayBookSummary } from '@/components/reports/day-book-table';

interface FormXxiiReportResponse {
  inflows?: FormXxiiInflowItem[];
  outflows?: FormXxiiOutflowItem[];
  reconciliation?: {
    openingCashInSafe: number;
    todayCashInflows: number;
    todayCashOutflows: number;
    closingCashInSafe: number;
  };
}

interface DayBookReportResponse {
  inflows?: DayBookInflowItem[];
  outflows?: DayBookOutflowItem[];
  summary?: DayBookSummary;
}

export default function FormXxiiCashBookPage() {
  const t = useTranslations('reports');
  const tCommon = useTranslations('common');

  const user = useAuthStore((s) => s.user);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const isBranchManager = Boolean(user?.roles?.includes('BRANCH_MANAGER') && !user?.roles?.includes('SUPER_ADMIN'));
  const isSuperAdminOrAccountant = Boolean(
    user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('ACCOUNTANT') || user?.roles?.includes('AUDITOR')
  );

  const allowedRoles = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'];
  const hasAccess = user?.roles?.some((r) => allowedRoles.includes(r));

  // Current Date State (defaults to today YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = React.useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Selected Branch ID (defaults to activeBranchId if set, or undefined for consolidated)
  const [selectedBranchId, setSelectedBranchId] = React.useState<string | undefined>(
    isBranchManager ? user?.branchId || undefined : activeBranchId || undefined
  );

  const [activeTab, setActiveTab] = React.useState<'form-xxii' | 'day-book'>('form-xxii');

  // Fetch branches for filter
  const { data: branches = [] } = useQuery({
    queryKey: queryKeys.branches.list({ activeOnly: true }),
    queryFn: async () => {
      const res = await unwrapApiResponse<Array<{ id: string; name: string; code: string }>>(
        apiClient.GET('/api/v1/branches', { params: { query: { activeOnly: 'true' } } })
      );
      return res || [];
    },
    enabled: isSuperAdminOrAccountant,
  });

  // 1. Fetch Form XXII Cash Book
  const { data: formXxiiData, isLoading: isLoadingFormXxii } = useQuery({
    queryKey: queryKeys.reports.formXxii({ date: selectedDate, branchId: selectedBranchId }),
    queryFn: async () => {
      const res = await unwrapApiResponse<FormXxiiReportResponse>(
        apiClient.GET('/api/v1/reports/form-xxii', {
          params: { query: { date: selectedDate, branchId: selectedBranchId } },
        })
      );
      return res;
    },
    enabled: hasAccess,
  });

  // 2. Fetch Day Book
  const { data: dayBookData, isLoading: isLoadingDayBook } = useQuery({
    queryKey: queryKeys.reports.dayBook({ date: selectedDate, branchId: selectedBranchId }),
    queryFn: async () => {
      const res = await unwrapApiResponse<DayBookReportResponse>(
        apiClient.GET('/api/v1/reports/day-book', {
          params: { query: { date: selectedDate, branchId: selectedBranchId } },
        })
      );
      return res;
    },
    enabled: hasAccess,
  });

  // Handle Export to CSV
  const handleExportCsv = () => {
    if (activeTab === 'form-xxii') {
      const inflows: FormXxiiInflowItem[] = formXxiiData?.inflows || [];
      const outflows: FormXxiiOutflowItem[] = formXxiiData?.outflows || [];

      const rows: (string | number)[][] = [];
      inflows.forEach((item) => {
        rows.push([
          selectedDate,
          'INFLOW (RECEIPT)',
          item.receiptNumber,
          item.source,
          item.customerCode,
          item.customerName,
          `${item.groupCode} / #${item.ticketNumber || '—'}`,
          item.amount,
          item.receivedBy,
        ]);
      });

      outflows.forEach((item) => {
        rows.push([
          selectedDate,
          'OUTFLOW (VOUCHER)',
          item.voucherNumber,
          'PRIZE_PAYOUT',
          item.winnerCode,
          item.winnerName,
          `${item.groupCode} (M${item.installmentMonth}) / #${item.ticketNumber}`,
          item.amount,
          'Foreman',
        ]);
      });

      downloadCsv({
        filename: `${t('export.filenameFormXxii')}_${selectedDate}`,
        headers: ['Date', 'Type', 'Doc Number', 'Source', 'Party Code', 'Party Name', 'Chit / Ticket', 'Amount (INR)', 'Staff'],
        rows,
      });
    } else {
      const inflows: DayBookInflowItem[] = dayBookData?.inflows || [];
      const outflows: DayBookOutflowItem[] = dayBookData?.outflows || [];

      const rows: (string | number)[][] = [];
      inflows.forEach((item) => {
        rows.push([
          selectedDate,
          'INFLOW',
          item.receiptNumber,
          item.paymentMethod,
          item.transactionRef || 'N/A',
          item.customerCode,
          item.customerName,
          `${item.groupCode} / #${item.ticketNumber || '—'}`,
          item.amount,
          item.collectedBy,
        ]);
      });

      outflows.forEach((item) => {
        rows.push([
          selectedDate,
          'OUTFLOW',
          item.voucherNumber,
          item.disbursementMode || 'CASH',
          'N/A',
          item.winnerCode,
          item.winnerName,
          `${item.groupCode} (M${item.installmentMonth}) / #${item.ticketNumber}`,
          item.amount,
          'Foreman',
        ]);
      });

      downloadCsv({
        filename: `${t('export.filenameDayBook')}_${selectedDate}`,
        headers: ['Date', 'Type', 'Doc Number', 'Method', 'UTR / Ref', 'Party Code', 'Party Name', 'Chit / Ticket', 'Amount (INR)', 'Actor'],
        rows,
      });
    }
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
              <h2 className="text-lg font-bold text-white">{t('accessDeniedTitle')}</h2>
              <p className="text-sm text-rose-200/90 mt-1">{t('accessDeniedDesc')}</p>
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

  const recon = formXxiiData?.reconciliation || {
    openingCashInSafe: 0,
    todayCashInflows: 0,
    todayCashOutflows: 0,
    closingCashInSafe: 0,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400 print:hidden">
        <Link href="/" className="hover:text-slate-200 transition-colors">
          {tCommon('home')}
        </Link>
        <span>/</span>
        <Link href="/reports" className="hover:text-slate-200 transition-colors">
          {t('title')}
        </Link>
        <span>/</span>
        <span className="text-slate-200 font-medium">{t('cashBookTitle')}</span>
      </nav>

      {/* Top Header & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm print:hidden">
            <Vault className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{t('cashBookTitle')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('cashBookSubtitle')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-9 gap-1.5 shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" />
            <span>{t('export.csv')}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white text-xs h-9 gap-1.5 shrink-0"
          >
            <Printer className="h-3.5 w-3.5 text-sky-400" />
            <span>{t('export.print')}</span>
          </Button>
        </div>
      </div>

      {/* Date & Branch Navigator Controls */}
      <div className="print:hidden">
        <ReportDateNavigator
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          branchId={selectedBranchId}
          onBranchChange={setSelectedBranchId}
          branches={branches}
          isSuperAdminOrAccountant={isSuperAdminOrAccountant}
        />
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'form-xxii' | 'day-book')} className="space-y-6">
        <div className="overflow-x-auto scrollbar-none">
          <TabsList className="inline-flex min-w-full sm:min-w-0 bg-slate-900/80 border border-slate-800 p-1 print:hidden">
            <TabsTrigger value="form-xxii" className="text-xs gap-1.5 shrink-0 whitespace-nowrap">
              <Vault className="h-3.5 w-3.5 text-emerald-400" />
              {t('tabs.formXxii')}
            </TabsTrigger>
            <TabsTrigger value="day-book" className="text-xs gap-1.5 shrink-0 whitespace-nowrap">
              <FileCheck className="h-3.5 w-3.5 text-indigo-400" />
              {t('tabs.dayBook')}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Form XXII Statutory Cash Book */}
        <TabsContent value="form-xxii" className="space-y-6">
          <CashBookKpiBar
            openingBalance={recon.openingCashInSafe}
            todayInflows={recon.todayCashInflows}
            todayOutflows={recon.todayCashOutflows}
            closingBalance={recon.closingCashInSafe}
          />

          <FormXxiiTable
            inflows={formXxiiData?.inflows || []}
            outflows={formXxiiData?.outflows || []}
            isLoading={isLoadingFormXxii}
          />
        </TabsContent>

        {/* Tab 2: Financial Day Book */}
        <TabsContent value="day-book" className="space-y-6">
          <DayBookTable
            summary={dayBookData?.summary}
            inflows={dayBookData?.inflows || []}
            outflows={dayBookData?.outflows || []}
            isLoading={isLoadingDayBook}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
