'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ShieldAlert,
  ArrowRight,
  HandCoins,
  Award,
  RotateCcw,
  FileCheck2,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApprovalsSummary } from '@/stores/approvals-store';

interface PendingApprovalsBannerProps {
  approvals: ApprovalsSummary;
  isLoading?: boolean;
}

export function PendingApprovalsBanner({
  approvals,
  isLoading = false,
}: PendingApprovalsBannerProps) {
  const t = useTranslations('dashboard');

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="h-5 w-48 bg-slate-800 rounded mb-2" />
        <div className="h-4 w-72 bg-slate-800/60 rounded" />
      </div>
    );
  }

  const {
    totalPendingCount,
    cashHandoversCount,
    disbursementAuthorizationsCount,
    paymentReversalsCount,
    safetyProofVerificationsCount = 0,
  } = approvals;

  if (totalPendingCount === 0) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-2.5 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{t('allClear')}</span>
        </div>
        <Badge variant="paid" className="text-[10px] py-0 px-1.5 self-start sm:self-center shrink-0">
          Maker ≠ Checker OK
        </Badge>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/20 via-slate-900/80 to-slate-900/60 p-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping shrink-0" />
            <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{t('pendingApprovals')} ({totalPendingCount})</span>
            </h3>
          </div>

          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            {t('makerCheckerReminder')}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {cashHandoversCount > 0 && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300 gap-1.5 text-xs">
                <HandCoins className="h-3 w-3" />
                <span>{cashHandoversCount} Cash Handovers</span>
              </Badge>
            )}

            {disbursementAuthorizationsCount > 0 && (
              <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-300 gap-1.5 text-xs">
                <Award className="h-3 w-3" />
                <span>{disbursementAuthorizationsCount} Prize Authorizations</span>
              </Badge>
            )}

            {paymentReversalsCount > 0 && (
              <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-300 gap-1.5 text-xs">
                <RotateCcw className="h-3 w-3" />
                <span>{paymentReversalsCount} Payment Reversals</span>
              </Badge>
            )}

            {safetyProofVerificationsCount > 0 && (
              <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-300 gap-1.5 text-xs">
                <FileCheck2 className="h-3 w-3" />
                <span>{safetyProofVerificationsCount} Safety Proofs</span>
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center self-start md:self-center shrink-0">
          <Button asChild size="sm" className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-medium text-xs">
            <Link href="/reports">
              <span>{t('reviewQueue')}</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
