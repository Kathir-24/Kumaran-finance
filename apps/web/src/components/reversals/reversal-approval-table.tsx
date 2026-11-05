'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Receipt,
  User,
  Clock,
  Lock,
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
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import type { PendingReversalItem } from './reversal-action-dialogs';

interface ReversalApprovalTableProps {
  reversals: PendingReversalItem[];
  currentUser: { id: string; name?: string; roles?: string[] } | null;
  onApprove: (item: PendingReversalItem) => void;
  onReject: (item: PendingReversalItem) => void;
}

export function ReversalApprovalTable({
  reversals,
  currentUser,
  onApprove,
  onReject,
}: ReversalApprovalTableProps) {
  const t = useTranslations('reversals');

  if (reversals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center space-y-2">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
        <h3 className="text-sm font-bold text-slate-200">{t('noPendingReversals')}</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">{t('noPendingReversalsDesc')}</p>
      </div>
    );
  }

  const isSuperAdmin = Boolean(currentUser?.roles?.includes('SUPER_ADMIN'));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-lg">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-950/80">
            <TableRow className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <TableHead className="w-28">{t('tableReversalId')}</TableHead>
              <TableHead>{t('originalReceipt')}</TableHead>
              <TableHead>Subscriber</TableHead>
              <TableHead className="text-right">{t('amountReversed')}</TableHead>
              <TableHead>Reason & Justification</TableHead>
              <TableHead>{t('tableMaker')}</TableHead>
              <TableHead className="text-center w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-800/60 bg-slate-900/40 text-xs">
            {reversals.map((r) => {
              const isMaker = Boolean(currentUser && currentUser.id === r.initiatedByUserId);
              const canAuthorize = isSuperAdmin && !isMaker;

              return (
                <TableRow key={r.id} className="hover:bg-slate-800/30 transition-colors">
                  <TableCell className="font-mono text-[11px] text-slate-400">
                    <div>{r.id.slice(0, 8)}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {formatDate(r.createdAt)}
                    </div>
                  </TableCell>

                  <TableCell className="font-mono text-xs font-bold text-emerald-400">
                    {r.receiptNumber}
                  </TableCell>

                  <TableCell>
                    <p className="font-semibold text-slate-200">{r.customerName || 'Subscriber'}</p>
                    <span className="font-mono text-[10px] text-slate-400">{r.customerCode || 'N/A'}</span>
                  </TableCell>

                  <TableCell className="text-right font-mono font-bold text-slate-100 text-sm">
                    {formatRupee(Number(r.amount))}
                  </TableCell>

                  <TableCell className="max-w-xs">
                    <p className="font-semibold text-rose-300 text-[11px]">{r.reason}</p>
                    {r.notes && (
                      <p className="text-[10px] text-slate-400 truncate mt-0.5" title={r.notes}>
                        {r.notes}
                      </p>
                    )}
                  </TableCell>

                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-300 border border-slate-700">
                      <User className="h-3 w-3 text-slate-400" />
                      {r.initiatedByUserId.slice(0, 8)}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    {isMaker ? (
                      <div className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[10px] font-semibold text-amber-300" title={t('selfApprovalBlocked')}>
                        <ShieldAlert className="h-3 w-3 text-amber-400" />
                        {t('makerGuardBadge')}
                      </div>
                    ) : !isSuperAdmin ? (
                      <span className="text-[10px] text-slate-400 font-mono flex items-center justify-center gap-1">
                        <Lock className="h-3 w-3" />
                        {t('partnerAuthorityRequired')}
                      </span>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onApprove(r)}
                          className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shadow-sm"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => onReject(r)}
                          className="h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-[11px]"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
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
