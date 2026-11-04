'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { GenerateDuesDialog } from '@/components/schemes/generate-dues-dialog';
import { UpiQrDialog } from '@/components/schemes/upi-qr-dialog';
import { MonthSelectorBar } from '@/components/schemes/month-selector-bar';
import { MonthFinancialSummary } from '@/components/schemes/month-financial-summary';
import { MonthlyDuesTable, type DueItem } from '@/components/schemes/monthly-dues-table';

export interface MonthlyInstallmentsPanelProps {
  chitGroupId: string;
  groupCode: string;
  durationMonths: number;
  baseInstallment: number;
  startDate?: string;
  status: string;
  currentInstallmentMonth?: number;
  canManage?: boolean;
}

export function MonthlyInstallmentsPanel({
  chitGroupId,
  groupCode,
  durationMonths,
  baseInstallment,
  startDate,
  status,
  currentInstallmentMonth = 1,
  canManage = false,
}: MonthlyInstallmentsPanelProps) {
  const [selectedMonth, setSelectedMonth] = React.useState<number>(() => {
    return Math.min(Math.max(currentInstallmentMonth || 1, 1), durationMonths);
  });
  const [isGenerateOpen, setIsGenerateOpen] = React.useState(false);
  const [selectedUpiDue, setSelectedUpiDue] = React.useState<{
    dueId: string;
    ticketNumber: number;
    customerName: string;
    netPayableAmount: number;
  } | null>(null);

  // Fetch dues for the selected month using real NestJS API
  const {
    data: rawDues,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.installments.groupMonth(chitGroupId, selectedMonth),
    queryFn: async () => {
      return unwrapApiResponse<DueItem[]>(
        apiClient.GET('/api/v1/installments/group/{chitGroupId}/month/{month}', {
          params: { path: { chitGroupId, month: selectedMonth } },
        })
      );
    },
    enabled: !!chitGroupId && selectedMonth >= 1,
  });

  const dues: DueItem[] = React.useMemo(() => {
    return Array.isArray(rawDues) ? rawDues : [];
  }, [rawDues]);

  // Aggregate financial metrics for current month
  const firstDue = dues[0];
  const grossAmount = firstDue?.grossAmount ?? baseInstallment;
  const dividendDeduction = selectedMonth === 1 ? 0 : firstDue?.dividendDeduction ?? null;
  const netPayable = selectedMonth === 1 ? baseInstallment : firstDue?.netPayableAmount ?? null;

  const allCount = dues.length;
  const paidCount = dues.filter((d) => d.status === 'PAID').length;
  const totalPayableRupees = dues.reduce((acc, d) => acc + (d.netPayableAmount || 0), 0);
  const totalCollectedRupees = dues.reduce((acc, d) => acc + (d.paidAmount || 0), 0);
  const collectionPercentage =
    totalPayableRupees > 0 ? Math.round((totalCollectedRupees / totalPayableRupees) * 100) : 0;

  const isSchemeActive = status === 'ACTIVE';

  return (
    <div className="space-y-6">
      {/* 1. High-Density Month Selector */}
      <MonthSelectorBar
        durationMonths={durationMonths}
        selectedMonth={selectedMonth}
        currentInstallmentMonth={currentInstallmentMonth}
        isFetching={isFetching}
        isSchemeActive={isSchemeActive}
        canManage={canManage}
        onSelectMonth={(m) => setSelectedMonth(m)}
        onRefresh={() => refetch()}
        onOpenGenerate={() => setIsGenerateOpen(true)}
      />

      {/* 2. Month Financial Summary Bar */}
      <MonthFinancialSummary
        grossAmount={grossAmount}
        dividendDeduction={dividendDeduction}
        netPayable={netPayable}
        paidCount={paidCount}
        allCount={allCount}
        durationMonths={durationMonths}
        totalCollectedRupees={totalCollectedRupees}
        totalPayableRupees={totalPayableRupees}
        collectionPercentage={collectionPercentage}
      />

      {/* 3. Dues Table with Status Filters and Actions */}
      <MonthlyDuesTable
        dues={dues}
        isLoading={isLoading}
        selectedMonth={selectedMonth}
        chitGroupId={chitGroupId}
        groupCode={groupCode}
        isSchemeActive={isSchemeActive}
        canManage={canManage}
        onOpenGenerate={() => setIsGenerateOpen(true)}
        onSelectUpi={(due) => setSelectedUpiDue(due)}
      />

      {/* 4. Generate Dues Dialog */}
      <GenerateDuesDialog
        chitGroupId={chitGroupId}
        groupCode={groupCode}
        month={selectedMonth}
        durationMonths={durationMonths}
        baseInstallment={baseInstallment}
        startDate={startDate}
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* 5. Dynamic Walk-in NPCI UPI QR Dialog */}
      {selectedUpiDue && (
        <UpiQrDialog
          dueId={selectedUpiDue.dueId}
          ticketNumber={selectedUpiDue.ticketNumber}
          customerName={selectedUpiDue.customerName}
          month={selectedMonth}
          groupCode={groupCode}
          netPayableAmount={selectedUpiDue.netPayableAmount}
          isOpen={true}
          onClose={() => setSelectedUpiDue(null)}
        />
      )}
    </div>
  );
}
