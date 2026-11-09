'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import {
  FileCheck,
  ShieldCheck,
  Banknote,
  FileText,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';

export interface WinnerDisbursementRow {
  id: string;
  auctionId: string;
  ticketId: string;
  disbursementStatus: 'PENDING_VERIFICATION' | 'VERIFIED_BY_MAKER' | 'AUTHORIZED_BY_CHECKER' | 'DISBURSED' | string;
  disbursementMode?: string | null;
  disbursedAmount?: number | bigint | null;
  disbursementReference?: string | null;
  disbursedAt?: string | null;
  auction?: {
    id: string;
    installmentMonth: number;
    auctionDate?: string;
    bidDiscount?: number | bigint;
    prizeMoney?: number | bigint;
    chitGroup?: {
      id: string;
      groupCode: string;
      chitValue: number | bigint;
    };
  };
  ticket?: {
    ticketNumber: number;
    customer?: {
      id: string;
      customerCode: string;
      fullName: string;
      phone: string;
    };
  };
}

interface DisbursementsTableProps {
  items: WinnerDisbursementRow[];
  isLoading?: boolean;
}

export function DisbursementsTable({ items, isLoading = false }: DisbursementsTableProps) {
  const t = useTranslations('disbursements');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_VERIFICATION':
        return (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400 gap-1 font-mono text-xs">
            <Clock className="w-3 h-3" />
            {t('statusPendingVerification')}
          </Badge>
        );
      case 'VERIFIED_BY_MAKER':
        return (
          <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-400 gap-1 font-mono text-xs">
            <FileCheck className="w-3 h-3" />
            {t('statusVerifiedMaker')}
          </Badge>
        );
      case 'AUTHORIZED_BY_CHECKER':
        return (
          <Badge variant="outline" className="border-purple-500/40 bg-purple-500/10 text-purple-400 gap-1 font-mono text-xs">
            <ShieldCheck className="w-3 h-3" />
            {t('statusAuthorizedChecker')}
          </Badge>
        );
      case 'DISBURSED':
        return (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 gap-1 font-mono text-xs">
            <Banknote className="w-3 h-3" />
            {t('statusDisbursed')}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getActionLabelAndIcon = (status: string) => {
    switch (status) {
      case 'PENDING_VERIFICATION':
        return { label: t('actionVerifyMaker'), icon: FileCheck, variant: 'default' as const };
      case 'VERIFIED_BY_MAKER':
        return { label: t('actionAuthorizeChecker'), icon: ShieldCheck, variant: 'outline' as const };
      case 'AUTHORIZED_BY_CHECKER':
        return { label: t('actionReleasePayout'), icon: Banknote, variant: 'default' as const };
      default:
        return { label: t('actionViewVoucher'), icon: FileText, variant: 'outline' as const };
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400 animate-pulse">
        <Clock className="w-8 h-8 mx-auto mb-2 text-slate-500 animate-spin" />
        <p className="text-sm">Loading prize disbursements queue...</p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-slate-500" />
        <h3 className="text-base font-semibold text-slate-200">{t('emptyTitle')}</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">{t('emptyDesc')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-lg backdrop-blur-sm">
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
        <Table className="min-w-[880px]">
          <TableHeader className="bg-slate-950/70">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-300 font-semibold whitespace-nowrap">{t('tableSchemeMonth')}</TableHead>
              <TableHead className="text-slate-300 font-semibold whitespace-nowrap">{t('tableWinner')}</TableHead>
              <TableHead className="text-slate-300 font-semibold text-center whitespace-nowrap">{t('tableTicket')}</TableHead>
              <TableHead className="text-slate-300 font-semibold text-right whitespace-nowrap">{t('tablePrizeMoney')}</TableHead>
              <TableHead className="text-slate-300 font-semibold text-center whitespace-nowrap">{t('tableStatus')}</TableHead>
              <TableHead className="text-slate-300 font-semibold text-right whitespace-nowrap">{t('tableAction')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const action = getActionLabelAndIcon(row.disbursementStatus);
              const ActionIcon = action.icon;
              const chitGroup = row.auction?.chitGroup;
              const customer = row.ticket?.customer;
              const netPrize = row.disbursedAmount ?? row.auction?.prizeMoney ?? 0;
              const chitValue = chitGroup?.chitValue ?? 0;
              const discount = row.auction?.bidDiscount ?? 0;

              return (
                <TableRow
                  key={row.id || row.auctionId}
                  className="border-slate-800/60 hover:bg-slate-800/40 transition-colors"
                >
                  {/* Scheme & Month */}
                  <TableCell className="whitespace-nowrap">
                    <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                      <span>{chitGroup?.groupCode || '—'}</span>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        M{row.auction?.installmentMonth}
                      </span>
                    </div>
                    {row.auction?.auctionDate && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {formatDate(row.auction.auctionDate)}
                      </div>
                    )}
                  </TableCell>

                  {/* Winning Subscriber */}
                  <TableCell className="min-w-[170px]">
                    <div className="font-medium text-slate-200 truncate max-w-[180px]" title={customer?.fullName || '—'}>
                      {customer?.fullName || '—'}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono whitespace-nowrap">
                      <span>{customer?.customerCode}</span>
                      {customer?.phone && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span>{customer.phone}</span>
                        </>
                      )}
                    </div>
                  </TableCell>

                  {/* Ticket Number */}
                  <TableCell className="text-center whitespace-nowrap">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-slate-200 font-mono font-semibold text-sm border border-slate-700">
                      #{row.ticket?.ticketNumber ?? '—'}
                    </span>
                  </TableCell>

                  {/* Net Prize Money Payable */}
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="font-mono font-bold text-base text-emerald-400">
                      {formatRupee(netPrize)}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      V: {formatRupee(chitValue)} | D: {formatRupee(discount)}
                    </div>
                  </TableCell>

                  {/* Disbursement Workflow Status */}
                  <TableCell className="text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-1">
                      {getStatusBadge(row.disbursementStatus)}
                      {row.disbursementMode && (
                        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                          {row.disbursementMode.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Action Link */}
                  <TableCell className="text-right whitespace-nowrap">
                    <Link href={`/disbursements/${row.auctionId || row.id}/voucher`}>
                      <Button
                        size="sm"
                        variant={action.variant}
                        className={
                          action.variant === 'default'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs shadow shrink-0 whitespace-nowrap'
                            : 'border-slate-700 hover:bg-slate-800 text-slate-200 gap-1.5 text-xs shrink-0 whitespace-nowrap'
                        }
                      >
                        <ActionIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{action.label}</span>
                        <ArrowRight className="w-3 h-3 ml-0.5 opacity-70 shrink-0" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
