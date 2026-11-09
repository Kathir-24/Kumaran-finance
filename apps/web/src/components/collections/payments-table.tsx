'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';

interface PaymentItem {
  id: string;
  chitGroupId?: string;
  chitGroupCode?: string;
  ticketNumber?: number;
  subscriberName?: string;
  subscriberMobile?: string;
  installmentMonth: number;
  amount: number | bigint;
  paymentMethod: 'CASH' | 'UPI' | 'CHEQUE' | 'BANK_TRANSFER';
  paymentStatus: 'SUCCESS' | 'INITIATED' | 'FAILED' | 'REVERSED';
  transactionRef?: string | null;
  receiptNumber?: string | null;
  createdAt: string;
  ticket?: {
    ticketNumber: number;
    chitGroup?: { groupCode: string };
    customer?: { name: string; phone: string };
  };
  receipt?: {
    receiptNumber: string;
  };
}

interface PaymentsTableProps {
  payments: PaymentItem[];
  isLoading: boolean;
  onViewReceipt: (paymentId: string) => void;
}

export function PaymentsTable({
  payments,
  isLoading,
  onViewReceipt,
}: PaymentsTableProps) {
  const t = useTranslations('collections');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPdf = async (paymentId: string, receiptNumber?: string | null) => {
    setDownloadingId(paymentId);
    try {
      const token = getStoredAccessToken();
      const res = await fetch(`${getApiBaseUrl()}/api/v1/pdf/receipt/${paymentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to download receipt PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${receiptNumber || paymentId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Error downloading PDF receipt');
    } finally {
      setDownloadingId(null);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] gap-1">
            <CheckCircle2 className="h-3 w-3" />
            SUCCESS
          </Badge>
        );
      case 'INITIATED':
        return (
          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] gap-1">
            <Clock className="h-3 w-3" />
            INITIATED
          </Badge>
        );
      case 'REVERSED':
        return (
          <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] gap-1">
            <RotateCcw className="h-3 w-3" />
            REVERSED
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-700/50 text-slate-300 border border-slate-600 text-[11px] gap-1">
            <AlertTriangle className="h-3 w-3" />
            {status}
          </Badge>
        );
    }
  };

  const renderMethodBadge = (method: string) => {
    const methodColors: Record<string, string> = {
      CASH: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      UPI: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
      CHEQUE: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      BANK_TRANSFER: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    };
    return (
      <Badge variant="outline" className={`text-[10px] ${methodColors[method] || 'border-slate-700 text-slate-300'}`}>
        {method.replace('_', ' ')}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-emerald-400" />
        <p className="text-xs">Loading payment transactions...</p>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30">
        <FileText className="h-8 w-8 mx-auto mb-2 text-slate-600" />
        <p className="text-sm font-medium text-slate-300">{t('noPaymentsFound')}</p>
        <p className="text-xs text-slate-500 mt-1">{t('noPaymentsDesc')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm">
      <Table className="min-w-[880px]">
        <TableHeader className="bg-slate-950/80">
          <TableRow className="border-b border-slate-800 hover:bg-transparent">
            <TableHead className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Receipt #</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Scheme & Ticket</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Subscriber</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Month</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 text-right whitespace-nowrap">Amount Paid</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Mode</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Status</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">Collected At</TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 text-right whitespace-nowrap">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => {
            const receiptNo = p.receipt?.receiptNumber || p.receiptNumber || '—';
            const groupCode = p.ticket?.chitGroup?.groupCode || p.chitGroupCode || '—';
            const ticketNum = p.ticket?.ticketNumber ?? p.ticketNumber ?? '—';
            const subName = p.ticket?.customer?.name || p.subscriberName || 'Subscriber';
            const subPhone = p.ticket?.customer?.phone || p.subscriberMobile;

            return (
              <TableRow key={p.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                <TableCell className="font-mono text-xs font-semibold text-emerald-400 whitespace-nowrap">
                  {receiptNo}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-200 whitespace-nowrap">
                  {groupCode} <span className="text-slate-400">T#{ticketNum}</span>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="font-medium text-slate-200 whitespace-nowrap">{subName}</div>
                  {subPhone && <div className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{subPhone}</div>}
                </TableCell>
                <TableCell className="text-xs font-mono text-slate-300 whitespace-nowrap">
                  Month #{p.installmentMonth}
                </TableCell>
                <TableCell className="text-xs font-mono font-bold text-slate-100 text-right whitespace-nowrap">
                  {formatRupee(p.amount)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{renderMethodBadge(p.paymentMethod)}</TableCell>
                <TableCell className="whitespace-nowrap">{renderStatusBadge(p.paymentStatus)}</TableCell>
                <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                  {formatDate(p.createdAt)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onViewReceipt(p.id)}
                      className="h-7 px-2 border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
                    >
                      <FileText className="h-3 w-3 mr-1 text-emerald-400" />
                      Receipt
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadPdf(p.id, receiptNo)}
                      disabled={downloadingId === p.id}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                      title="Download PDF"
                    >
                      {downloadingId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
