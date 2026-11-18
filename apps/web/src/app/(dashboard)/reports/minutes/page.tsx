'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Download,
  FileCheck2,
  Printer,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/query-keys';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';
import { useAuthStore, type AuthState } from '@/stores/auth-store';
import { downloadCsv, type CsvCellValue } from '@/lib/csv-export';
import { downloadMinutesPdf } from '@/lib/pdf-download';
import { FormXviiKpiBar } from '@/components/reports/form-xvii-kpi-bar';
import {
  FormXviiAuctionRecord,
  FormXviiReportData,
  FormXviiViewer,
} from '@/components/reports/form-xvii-viewer';
import {
  RegistrarFilingModal,
  canUserRecordRegistrarFiling,
} from '@/components/reports/registrar-filing-modal';
import { formatIstDateString } from '@/components/reports/report-bigint';
import { resolveFormXviiKpiCounts } from '@/components/reports/report-access';
import { RouteSuspenseFallback } from '@/components/ui/route-suspense-fallback';

interface MinutesSchemeOption {
  id: string;
  groupCode: string;
  groupName: string;
  status: string;
}

type MinutesSchemesResponse = MinutesSchemeOption[] | { data?: MinutesSchemeOption[] };

function FormXviiMinutesContent() {
  const t = useTranslations('reports.minutes');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const user = useAuthStore((s: AuthState) => s.user);
  const roles = user?.roles || [];
  const hasAccess = roles.some((r: string) =>
    ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'AUDITOR'].includes(r)
  );
  // Guardrail 11 / XR-AUC-05: Verified Partner, Branch Manager, or Accountant only
  const canRecordFiling = canUserRecordRegistrarFiling(user);

  // Scheme Selection State
  const initialGroupId = searchParams.get('chitGroupId') || '';
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>(initialGroupId);
  const [fromDate] = React.useState<string>('');
  const [toDate] = React.useState<string>('');

  // Filing Modal & PDF Download Error State
  const [filingAuction, setFilingAuction] = React.useState<FormXviiAuctionRecord | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);

  // 1. Fetch Chit Schemes for the Scheme Selector
  const { data: schemes = [] } = useQuery<MinutesSchemeOption[]>({
    queryKey: queryKeys.schemes.list(),
    queryFn: async () => {
      const res = await unwrapApiResponse<MinutesSchemesResponse>(
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

  // 2. Fetch Form XVII Consolidated Register
  const { data: formXviiData, isLoading: isLoadingMinutes } = useQuery({
    queryKey: queryKeys.reports.formXvii({
      chitGroupId: selectedGroupId,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    queryFn: async () => {
      if (!selectedGroupId) return null;
      const res = await unwrapApiResponse<FormXviiReportData>(
        apiClient.GET('/api/v1/reports/form-xvii', {
          params: {
            query: {
              chitGroupId: selectedGroupId,
              fromDate: fromDate.trim() || undefined,
              toDate: toDate.trim() || undefined,
            },
          },
        })
      );
      return res;
    },
    enabled: hasAccess && !!selectedGroupId,
  });

  // Handle CSV Export
  const handleExportCsv = () => {
    if (!formXviiData || !formXviiData.auctions) return;

    const rows: CsvCellValue[][] = formXviiData.auctions.map((a) => {
      const auctionDate = formatIstDateString(new Date(a.auctionDate));
      const filedDate = a.filedDate ? formatIstDateString(new Date(a.filedDate)) : 'N/A';
      return [
        `Month ${a.installmentMonth}`,
        auctionDate,
        a.chitValue,
        a.bidDiscount,
        a.prizeMoney,
        a.foremanCommissionAmount,
        a.dividendPerTicket,
        a.nextMonthNetInstallment,
        a.winner ? `#${a.winner.ticketNumber}` : 'N/A',
        a.winner ? a.winner.fullName : 'N/A',
        a.subscribersPresent,
        a.signedByForeman ? 'YES' : 'NO',
        a.filedAtRegistrar ? 'FILED' : 'PENDING',
        filedDate,
        a.filingReference || 'N/A',
      ];
    });

    downloadCsv({
      filename: `${t('exportFilename')}_${formXviiData.chitGroup.groupCode}`,
      headers: [
        'Month',
        'Auction Date',
        'Chit Value (INR)',
        'Bid Discount (INR)',
        'Prize Money (INR)',
        'Foreman Commission (INR)',
        'Dividend / Ticket (INR)',
        'Next Net Installment (INR)',
        'Winner Ticket',
        'Winner Name',
        'Present Attendees',
        'Foreman Signed',
        'Registrar Status',
        'Filing Date',
        'Filing Reference',
      ],
      rows,
    });
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleDownloadPdf = async (auctionId: string) => {
    try {
      setPdfError(null);
      await downloadMinutesPdf(auctionId, `form-xvii-minutes-${auctionId.slice(0, 8)}.pdf`);
    } catch (err: unknown) {
      setPdfError(getErrorMessage(err, 'Failed to download Form XVII PDF'));
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-rose-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-white">{t('statutoryBannerTitle')}</h2>
              <p className="text-sm text-rose-200/90 mt-1">
                Access to statutory registers is restricted to authorized office staff and auditors.
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

  // Calculate KPI Counts (XR-M7-WEB-02: prefer authoritative backend IST filingSummary / countdown)
  const auctions = formXviiData?.auctions || [];
  const { totalFinalized, filedCount, pendingCount, overdueCount } =
    resolveFormXviiKpiCounts(auctions, formXviiData?.filingSummary);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400 print:hidden">
        <Link href="/" className="hover:text-slate-200 transition-colors">
          {tCommon('home')}
        </Link>
        <span>/</span>
        <Link href="/reports" className="hover:text-slate-200 transition-colors">
          {tCommon('reports')}
        </Link>
        <span>/</span>
        <span className="text-white font-medium">{t('title')}</span>
      </nav>

      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-sm">
            <Scale className="h-6 w-6" />
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
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.groupCode} — {s.groupName}
                </option>
              ))}
            </select>
          </div>

          {/* Export CSV Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!formXviiData || auctions.length === 0}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white text-xs h-9 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t('exportCsv')}</span>
          </Button>

          {/* Print Sheet Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={!formXviiData || auctions.length === 0}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white text-xs h-9 gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{t('printSheet')}</span>
          </Button>
        </div>
      </div>

      {/* Statutory Section 24 Banner */}
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-indigo-200/90 flex items-start gap-3 print:hidden">
        <FileCheck2 className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white block">{t('statutoryBannerTitle')}</span>
          <span className="text-slate-300 mt-0.5 block">{t('statutoryBannerDesc')}</span>
        </div>
      </div>

      {/* PDF Download Error Banner */}
      {pdfError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-center gap-2 print:hidden">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{pdfError}</span>
        </div>
      )}

      {/* Statutory KPI Bar */}
      <FormXviiKpiBar
        totalFinalized={totalFinalized}
        filedCount={filedCount}
        pendingCount={pendingCount}
        overdueCount={overdueCount}
      />

      {/* Form XVII Consolidated Viewer */}
      {isLoadingMinutes ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-sm">
          Loading Form XVII proceedings...
        </div>
      ) : formXviiData ? (
        <FormXviiViewer
          data={formXviiData}
          canRecordFiling={canRecordFiling}
          onRecordFilingClick={(a) => setFilingAuction(a)}
          onDownloadPdfClick={handleDownloadPdf}
        />
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400 text-sm">
          {t('noSchemeSelected')}
        </div>
      )}

      {/* Record Registrar Filing Dialog */}
      {filingAuction && formXviiData && (
        <RegistrarFilingModal
          isOpen={!!filingAuction}
          onClose={() => setFilingAuction(null)}
          auctionId={filingAuction.auctionId}
          groupCode={formXviiData.chitGroup.groupCode}
          installmentMonth={filingAuction.installmentMonth}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ['reports', 'form-xvii'],
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.dashboard.all,
            });
          }}
        />
      )}
    </div>
  );
}

export default function FormXviiMinutesPage() {
  return (
    <React.Suspense fallback={<RouteSuspenseFallback />}>
      <FormXviiMinutesContent />
    </React.Suspense>
  );
}
