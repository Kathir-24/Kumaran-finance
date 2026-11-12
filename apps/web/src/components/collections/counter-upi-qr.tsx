'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { QrCode, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { formatRupee } from '@/lib/currency';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface CounterUpiQrProps {
  dueId: string;
  netPayableAmount: number | bigint;
}

interface CounterUpiIntentData {
  upiUri?: string;
  payeeName?: string;
  payeeVpa?: string;
  transactionNote?: string;
  groupCode?: string;
  ticketNumber?: number;
}

export function CounterUpiQr({ dueId, netPayableAmount }: CounterUpiQrProps) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.installments.upiIntent(dueId),
    queryFn: async ({ signal }) => {
      return unwrapApiResponse<CounterUpiIntentData>(
        apiClient.GET('/api/v1/installments/{dueId}/upi-intent', {
          params: { path: { dueId } },
          signal,
        }),
      );
    },
    enabled: Boolean(dueId),
  });

  useEffect(() => {
    let isMounted = true;
    if (data?.upiUri) {
      QRCode.toString(data.upiUri, {
        type: 'svg',
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((svg) => {
          if (isMounted) setQrSvg(svg);
        })
        .catch((err) => {
          console.error('Failed to generate UPI QR SVG', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [data?.upiUri]);

  if (isLoading) {
    return (
      <div className="p-6 rounded-xl border border-slate-800 bg-slate-950/80 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
        <p className="text-xs">Generating NPCI UPI intent...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-center text-xs flex items-center justify-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Failed to load counter UPI intent</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-emerald-500/30 bg-slate-950/80 text-center space-y-3 shadow-md">
      <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
          <QrCode className="w-4 h-4" />
          <span>NPCI Dynamic UPI QR</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Locked Amount</span>
        </div>
      </div>

      {/* Render Vector SVG QR Code */}
      <div className="flex justify-center py-1">
        {qrSvg ? (
          <div
            className="w-44 h-44 p-2 bg-white rounded-xl shadow-inner flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        ) : (
          <div className="w-44 h-44 bg-slate-900 animate-pulse rounded-xl" />
        )}
      </div>

      <div className="space-y-1">
        <div className="text-base font-mono font-bold text-emerald-400">
          {formatRupee(netPayableAmount)}
        </div>
        <div className="text-[11px] font-mono text-slate-300">
          Payee: <span className="text-white font-medium">{data.payeeName || 'Kumaran Finance'}</span> ({data.payeeVpa || 'kvb@kumaran'})
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Ref: {data.transactionNote || `${data.groupCode} T#${data.ticketNumber}`}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
        Scan with Google Pay, PhonePe, Paytm, or BHIM app on counter display
      </p>
    </div>
  );
}
