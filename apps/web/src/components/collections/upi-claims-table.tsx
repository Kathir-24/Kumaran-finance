'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ShieldAlert,
  Loader2,
  FileCheck2,
  ExternalLink,
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
import { useAuthStore } from '@/stores/auth-store';

export interface PendingUpiClaimItem {
  claimId: string;
  amount: number;
  utrNumber: string;
  notes?: string;
  createdAt: string;
  submittedByUser?: {
    id: string;
    name: string;
    phone: string;
    roles: string[];
  };
  customer?: {
    id: string;
    customerCode: string;
    fullName: string;
    phone: string;
  };
  ticket?: {
    id: string;
    ticketNumber: number;
    groupCode: string;
  };
  due?: {
    id: string;
    installmentMonth: number;
    netPayableAmount: number;
    status: 'UNPAID' | 'OVERDUE';
  };
}

interface UpiClaimsTableProps {
  claims: PendingUpiClaimItem[];
  isLoading: boolean;
  onVerifyClaim: (claim: PendingUpiClaimItem) => void;
}

export function UpiClaimsTable({
  claims,
  isLoading,
  onVerifyClaim,
}: UpiClaimsTableProps) {
  const t = useTranslations('collections');
  const currentUser = useAuthStore((state) => state.user);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  const handleCopyUtr = (utr: string) => {
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-emerald-400" />
        <p className="text-xs">Loading pending UPI claims...</p>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30">
        <CheckCircle2 className="h-9 w-9 mx-auto mb-2 text-emerald-500" />
        <p className="text-sm font-medium text-slate-300">{t('noClaimsFound')}</p>
        <p className="text-xs text-slate-500 mt-1">{t('noClaimsDesc')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm">
      <Table>
        <TableHeader className="bg-slate-950/80">
          <TableRow className="border-b border-slate-800 hover:bg-transparent">
            <TableHead className="text-[11px] font-semibold text-slate-400">
              {t('tableClaimId')} & Date
            </TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400">
              {t('tableCustomer')}
            </TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400">
              {t('tableSchemeTicket')}
            </TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400">
              {t('tableMonth')}
            </TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 text-right">
              {t('tableAmount')}
            </TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400">
              {t('tableUtrNumber')}
            </TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400">
              {t('tableSubmittedBy')}
            </TableHead>
            <TableHead className="text-[11px] font-semibold text-slate-400 text-right">
              {t('tableActions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => {
            const isSelfSubmission =
              Boolean(currentUser?.id) && claim.submittedByUser?.id === currentUser?.id;
            const isCopied = copiedUtr === claim.utrNumber;

            return (
              <TableRow
                key={claim.claimId}
                className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors"
              >
                <TableCell className="font-mono text-xs">
                  <span className="font-bold text-sky-400 block">
                    #{claim.claimId.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDate(claim.createdAt)}
                  </span>
                </TableCell>

                <TableCell className="text-xs">
                  <div className="font-medium text-slate-200">
                    {claim.customer?.fullName || 'Subscriber'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {claim.customer?.customerCode} • {claim.customer?.phone}
                  </div>
                </TableCell>

                <TableCell className="font-mono text-xs text-slate-200">
                  {claim.ticket?.groupCode}{' '}
                  <span className="text-slate-400">T#{claim.ticket?.ticketNumber}</span>
                </TableCell>

                <TableCell className="font-mono text-xs text-slate-300">
                  Month #{claim.due?.installmentMonth || 1}
                </TableCell>

                <TableCell className="font-mono text-xs font-bold text-emerald-400 text-right">
                  {formatRupee(claim.amount)}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
                      {claim.utrNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyUtr(claim.utrNumber)}
                      title={t('copyUtrBtn')}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      {isCopied ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  {claim.notes && (
                    <div className="text-[10px] text-slate-400 mt-0.5 italic">
                      "{claim.notes}"
                    </div>
                  )}
                </TableCell>

                <TableCell className="text-xs">
                  <div className="font-medium text-slate-300">
                    {claim.submittedByUser?.name || 'Customer App'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {claim.submittedByUser?.roles?.[0] || 'CUSTOMER'}
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  {isSelfSubmission ? (
                    <div
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-950/40 border border-rose-500/30 text-[10px] text-rose-300"
                      title={t('makerCheckerClaimAlert')}
                    >
                      <ShieldAlert className="h-3 w-3 shrink-0" />
                      <span>Maker Guard</span>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onVerifyClaim(claim)}
                      className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] gap-1 shadow-sm"
                    >
                      <FileCheck2 className="h-3.5 w-3.5" />
                      <span>{t('verifyClaimBtn')}</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
