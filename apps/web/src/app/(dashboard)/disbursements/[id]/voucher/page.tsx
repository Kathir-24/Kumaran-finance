'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  Clock,
  FileCheck,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  FileText,
  Download,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { PayoutVoucherCard } from '@/components/disbursements/payout-voucher-card';
import { SafetyProofChecklist } from '@/components/disbursements/safety-proof-checklist';
import { DisbursementAuthModal } from '@/components/disbursements/disbursement-auth-modal';
import { DisbursementReleaseModal } from '@/components/disbursements/disbursement-release-modal';
import { BilingualVoucherDialog } from '@/components/disbursements/bilingual-voucher-dialog';
import { useAuthStore } from '@/stores/auth-store';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export default function PayoutVoucherPage() {
  const t = useTranslations('disbursements');
  const params = useParams();
  const auctionId = params?.id as string;
  const user = useAuthStore((s) => s.user);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.disbursements.detail(auctionId),
    queryFn: async () => {
      const token = getStoredAccessToken();
      const res = await fetch(
        `${getApiBaseUrl()}/api/v1/disbursements/auction/${auctionId}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) {
        throw new Error('Failed to load disbursement voucher details');
      }
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: Boolean(auctionId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-slate-400">
          <Clock className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading prize disbursement voucher...</span>
        </div>
      </div>
    );
  }

  if (error || !data || !data.winner) {
    return (
      <div className="space-y-6">
        <Link href="/disbursements">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backToQueue')}</span>
          </Button>
        </Link>
        <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/60 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-rose-500 mb-2" />
          <h3 className="text-base font-semibold text-slate-100">Voucher Not Found</h3>
          <p className="text-xs text-slate-400 mt-1">
            Could not find auction winner record or disbursement voucher for ID: {auctionId}
          </p>
        </div>
      </div>
    );
  }

  const { auction, winner, makerName, checkerName } = data;

  const voucherDetails = {
    ...winner,
    auction: auction || winner.auction,
    ticket: winner.ticket,
    makerName,
    checkerName,
  };

  const status = winner.disbursementStatus;

  // Maker != Checker Guardrail 10 Evaluation
  const isMaker = Boolean(
    user?.id &&
      winner?.verifiedByUserId &&
      user.id.toLowerCase() === winner.verifiedByUserId.toLowerCase(),
  );

  const isSuperAdmin = Boolean(
    user?.roles?.includes('SUPER_ADMIN') || (user as any)?.role === 'SUPER_ADMIN',
  );

  return (
    <div className="space-y-6">
      {/* Back Link & Header */}
      <div className="flex flex-col gap-3">
        <Link href="/disbursements">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-400 hover:text-slate-200 -ml-2 w-fit">
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backToQueue')}</span>
          </Button>
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                {t('voucherTitle')}
              </h1>
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-mono text-xs">
                {auction?.chitGroup?.groupCode || 'SCHEME'} • Month {auction?.installmentMonth}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Winning Subscriber: <span className="font-semibold text-slate-200">{winner.ticket?.customer?.fullName}</span> (Ticket #{winner.ticket?.ticketNumber})
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {status === 'PENDING_VERIFICATION' && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 gap-1 font-mono text-xs whitespace-nowrap shrink-0">
                <Clock className="w-3.5 h-3.5" />
                {t('statusPendingVerification')}
              </Badge>
            )}
            {status === 'VERIFIED_BY_MAKER' && (
              <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-300 gap-1 font-mono text-xs whitespace-nowrap shrink-0">
                <FileCheck className="w-3.5 h-3.5" />
                {t('statusVerifiedMaker')}
              </Badge>
            )}
            {status === 'AUTHORIZED_BY_CHECKER' && (
              <Badge variant="outline" className="border-purple-500/40 bg-purple-500/10 text-purple-300 gap-1 font-mono text-xs whitespace-nowrap shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t('statusAuthorizedChecker')}
              </Badge>
            )}
            {status === 'DISBURSED' && (
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 gap-1 font-mono text-xs whitespace-nowrap shrink-0">
                <Banknote className="w-3.5 h-3.5" />
                {t('statusDisbursed')}
              </Badge>
            )}

            {/* Quick Actions in Header */}
            {status === 'VERIFIED_BY_MAKER' && (
              <Button
                size="sm"
                onClick={() => setAuthModalOpen(true)}
                disabled={isMaker || !isSuperAdmin}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1.5 shadow shrink-0 whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{t('actionAuthorizeChecker')}</span>
              </Button>
            )}

            {status === 'AUTHORIZED_BY_CHECKER' && (
              <Button
                size="sm"
                onClick={() => setReleaseModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 shadow shrink-0 whitespace-nowrap"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>{t('actionReleasePayout')}</span>
              </Button>
            )}

            {status === 'DISBURSED' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setVoucherModalOpen(true)}
                className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs gap-1.5 shrink-0 whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('actionViewVoucher')}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Maker != Checker Guard Alert if Maker views voucher in VERIFIED_BY_MAKER status */}
      {status === 'VERIFIED_BY_MAKER' && isMaker && (
        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">{t('makerGuardAlertTitle')}</div>
            <div className="text-amber-300/80 mt-1">{t('makerGuardAlertDesc')}</div>
          </div>
        </div>
      )}

      {/* ADR-15 & ADR-14 Invariant Banner */}
      <BusinessRuleBanner
        ruleNumber={15}
        title={t('bannerTitle')}
        description={t('bannerDesc')}
      />

      {/* Main Grid: Left Voucher Breakdown, Right ADR-15 Safety Proof Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <PayoutVoucherCard voucher={voucherDetails} />
        </div>

        <div className="lg:col-span-5 space-y-6">
          <SafetyProofChecklist
            auctionId={auctionId}
            winner={winner}
            makerName={makerName}
            onSuccess={() => refetch()}
          />
        </div>
      </div>

      {/* Modals */}
      <DisbursementAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        winner={{ ...winner, auctionId, auction, ticket: winner.ticket }}
        onSuccess={() => refetch()}
      />

      <DisbursementReleaseModal
        isOpen={releaseModalOpen}
        onClose={() => setReleaseModalOpen(false)}
        winner={{ ...winner, auctionId, auction, ticket: winner.ticket }}
        onSuccess={() => {
          refetch();
          setVoucherModalOpen(true);
        }}
      />

      <BilingualVoucherDialog
        isOpen={voucherModalOpen}
        onClose={() => setVoucherModalOpen(false)}
        auctionId={auctionId}
      />
    </div>
  );
}
