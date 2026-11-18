'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  VoucherPrintTemplate,
  mapVoucherApiResponseToVoucherData,
  type PrintVoucherApiResponse,
} from '@/components/print/voucher-print-template';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function PrintVoucherPage() {
  const params = useParams();
  const auctionId = params?.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.disbursements.voucher(auctionId),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<PrintVoucherApiResponse>(
        apiClient.GET('/api/v1/disbursements/auction/{auctionId}/voucher', {
          params: { path: { auctionId } },
          signal,
        }),
      );
    },
    enabled: Boolean(auctionId),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-4" />
        <p className="text-xs">Loading prize disbursement voucher...</p>
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
            <CardTitle className="text-white text-base">Voucher Not Found</CardTitle>
            <CardDescription className="text-rose-200/70 text-xs mt-1">
              The prize disbursement voucher for this auction does not exist or has not been authorized.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const voucherData = mapVoucherApiResponseToVoucherData(data);

  return <VoucherPrintTemplate auctionId={auctionId} voucher={voucherData} />;
}
