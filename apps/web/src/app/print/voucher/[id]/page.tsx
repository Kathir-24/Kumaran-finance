'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { VoucherPrintTemplate, type VoucherData } from '@/components/print/voucher-print-template';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function PrintVoucherPage() {
  const params = useParams();
  const auctionId = params?.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.disbursements.voucher(auctionId),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<any>(
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

  const voucherData: VoucherData = {
    voucherNumber: data.voucherNumber || `KC-VOU-${auctionId.slice(0, 6)}`,
    disbursedAt: data.disbursedAt || new Date().toISOString(),
    chitGroupCode: data.chitGroup?.groupCode || data.chitGroupCode || 'KCA',
    chitValue: data.chitGroup?.chitValue || data.chitValue || 0,
    installmentMonth: data.auction?.auctionMonth || data.installmentMonth || 1,
    ticketNumber: data.winner?.ticketNumber || data.ticketNumber || 1,
    winnerCode: data.winner?.ticketCode || data.winnerCode || 'WIN-01',
    winnerName: data.winner?.customer?.fullName || data.winnerName || 'Winner',
    winnerNameTamil: data.winner?.customer?.fullNameTamil || data.winnerNameTamil,
    winnerPhone: data.winner?.customer?.phone || data.winnerPhone || '',
    bidDiscount: data.auction?.bidDiscount || data.bidDiscount || 0,
    netPrizeMoney: data.auction?.prizeMoney || data.netPrizeMoney || 0,
    disbursementMode: data.disbursement?.disbursementMode || data.disbursementMode || 'CASH',
    paymentReference: data.disbursement?.referenceNumber || data.paymentReference,
    agreementSigned: data.safetyProof?.agreementSigned ?? true,
    nomineeSigned: data.safetyProof?.nomineeSigned ?? true,
    isSecurityRequired: data.safetyProof?.isSecurityRequired ?? false,
    blankChequeDetails: data.safetyProof?.blankChequeDetails,
    verifiedByUserName: data.verifiedByUser?.name || data.verifiedByUserName || 'Staff Maker',
    authorizedByUserName: data.authorizedByUser?.name || data.authorizedByUserName || 'Partner Checker',
    branchName: data.branch?.name || data.branchName,
    branchAddress: data.branch?.address || data.branchAddress,
    branchPhone: data.branch?.phone || data.branchPhone,
  };

  return <VoucherPrintTemplate auctionId={auctionId} voucher={voucherData} />;
}
