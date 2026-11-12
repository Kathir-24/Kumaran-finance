'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { ReceiptPrintTemplate, type ReceiptData } from '@/components/print/receipt-print-template';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function PrintReceiptPage() {
  const params = useParams();
  const paymentId = params?.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.payments.receipt(paymentId),
    queryFn: async () => {
      const res = await unwrapApiResponse<{ data?: ReceiptData } | ReceiptData>(
        apiClient.GET('/api/v1/payments/{id}/receipt', {
          params: { path: { id: paymentId } },
        })
      );
      if (res && typeof res === 'object' && 'data' in res && res.data) {
        return res.data;
      }
      return res as ReceiptData;
    },
    enabled: Boolean(paymentId),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-4" />
        <p className="text-xs">Loading official subscription receipt...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-md mx-auto mt-12">
        <Card className="border-rose-900/50 bg-rose-950/20 text-center p-6">
          <CardHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-900/30 flex items-center justify-center text-rose-400 mb-2">
              <AlertCircle className="w-6 h-6" />
            </div>
            <CardTitle className="text-white text-base">Receipt Not Found</CardTitle>
            <CardDescription className="text-rose-200/70 text-xs mt-1">
              The requested payment receipt does not exist or has not been finalized yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const receiptData: ReceiptData = {
    receiptNumber: data.receiptNumber || 'KC-REC-00000',
    issuedAt: data.issuedAt || new Date().toISOString(),
    chitGroupCode: data.chitGroupCode || 'KCA',
    chitValue: data.chitValue,
    durationMonths: data.durationMonths || 20,
    installmentMonth: data.installmentMonth || 1,
    ticketNumber: data.ticketNumber || 1,
    subscriberName: data.subscriberName || 'Subscriber',
    subscriberTamilName: data.subscriberTamilName,
    subscriberAddress: data.subscriberAddress,
    subscriberMobile: data.subscriberMobile || '',
    baseInstallment: data.baseInstallment || 0,
    dividendDeduction: data.dividendDeduction || 0,
    netPayableAmount: data.netPayableAmount || 0,
    amountPaid: data.amountPaid || 0,
    paymentMethod: data.paymentMethod || 'CASH',
    transactionRef: data.transactionRef,
    collectorName: data.collectorName || 'Cashier',
    collectorPhone: data.collectorPhone,
    branchName: data.branchName,
    branchTamilName: data.branchTamilName,
    branchAddress: data.branchAddress,
    branchPhone: data.branchPhone,
    isReversed: Boolean(data.isReversed),
  };

  return <ReceiptPrintTemplate paymentId={paymentId} receipt={receiptData} />;
}
