'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import {
  DefaulterEligibilityRoster,
  resolveEligibleBidderTicketId,
  type SubscriberTicketItem,
  type EligibleBidderItem,
} from '@/components/auctions/defaulter-eligibility-roster';
import {
  BiddingConsole,
  type RecordBidPayload,
} from '@/components/auctions/bidding-console';
import {
  TieBreakModal,
  type RecordTieBreakPayload,
} from '@/components/auctions/tie-break-modal';
import {
  AuctionSummaryCard,
  type AuctionSummaryData,
} from '@/components/auctions/auction-summary-card';
import {
  computeCeilingDiscountBigInt,
  toSafeWholeRupeeBigInt,
} from '@/components/auctions/auction-math.util';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore, hasAnyRole } from '@/stores/auth-store';
import { RouteSuspenseFallback } from '@/components/ui/route-suspense-fallback';

interface SchemeDetailFallback {
  id: string;
  groupCode: string;
  groupName?: string;
  chitValue: number | bigint | string;
  durationMonths: number;
  baseInstallment?: number | bigint | string;
  foremanCommissionRate?: number | string | null;
  maxDiscountCeiling?: number | bigint | string | null;
}

interface LiveAuctionRecord extends AuctionSummaryData {
  chitGroup?: {
    id?: string;
    groupCode?: string;
    groupName?: string;
    chitValue?: number | bigint | string;
    durationMonths?: number;
    baseInstallment?: number | bigint | string;
    foremanCommissionRate?: number | string | null;
    maxDiscountCeiling?: number | bigint | string | null;
  };
}

function LiveAuctionRoomContent() {
  const t = useTranslations('auctions');
  const params = useParams();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  // Guardrail 11 (SEC-A): Non-partner IT Super Admins are barred from financial auction recording
  const canConductAuction =
    hasAnyRole(user, ['BRANCH_MANAGER']) ||
    (hasAnyRole(user, ['SUPER_ADMIN']) && Boolean(user?.isPartner));

  const auctionId = String(params.id);
  const monthParam = searchParams.get('month');
  const parsedMonth = monthParam ? Number.parseInt(monthParam, 10) : Number.NaN;
  const monthNum = Number.isFinite(parsedMonth) && parsedMonth >= 1 ? parsedMonth : undefined;

  const [selectedTicket, setSelectedTicket] = React.useState<SubscriberTicketItem | null>(null);
  const [isTieBreakOpen, setIsTieBreakOpen] = React.useState(false);
  const [isModifying, setIsModifying] = React.useState(false);
  const [clockTime, setClockTime] = React.useState<string>('');

  // Live IST digital clock
  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClockTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' IST',
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 1. Fetch auction details (may 404 when opening an uncreated month via ChitGroup UUID + ?month=M)
  const {
    data: auction,
    isLoading: isAuctionLoading,
    isError: isAuctionError,
    refetch: refetchAuction,
  } = useQuery<LiveAuctionRecord>({
    queryKey: queryKeys.auctions.detail(auctionId),
    queryFn: async () => {
      return unwrapApiResponse<LiveAuctionRecord>(
        apiClient.GET('/api/v1/auctions/{id}', {
          params: { path: { id: auctionId } },
        }),
      );
    },
    retry: false,
    enabled: Boolean(auctionId),
  });

  // 1b. Fallback: If auctionId is a ChitGroup UUID for a brand-new Month M auction, fetch scheme directly
  const {
    data: fallbackScheme,
    isLoading: isFallbackSchemeLoading,
  } = useQuery<SchemeDetailFallback>({
    queryKey: queryKeys.schemes.detail(auctionId),
    queryFn: async () => {
      return unwrapApiResponse<SchemeDetailFallback>(
        apiClient.GET('/api/v1/chits/{id}', {
          params: { path: { id: auctionId } },
        }),
      );
    },
    retry: false,
    enabled: Boolean(auctionId) && isAuctionError && Boolean(monthNum),
  });

  const resolvedScheme = auction?.chitGroup || fallbackScheme;
  const chitGroupId = auction?.chitGroupId || resolvedScheme?.id;
  const currentMonth = auction?.installmentMonth ?? monthNum ?? 2;
  const durationMonths = Math.max(2, Number(resolvedScheme?.durationMonths || 20));
  const isMonth1OrMonthN = currentMonth <= 1 || currentMonth >= durationMonths;

  // 2. Fetch eligible bidders (ADR-07 pre-auction defaulter guard)
  const {
    data: eligibleBidders = [],
    isLoading: isEligibleLoading,
    isSuccess: isEligibleLoaded,
  } = useQuery<EligibleBidderItem[]>({
    queryKey: queryKeys.auctions.eligibleBidders(auctionId, currentMonth),
    queryFn: async () => {
      return unwrapApiResponse<EligibleBidderItem[]>(
        apiClient.GET('/api/v1/auctions/{id}/eligible-bidders', {
          params: {
            path: { id: auctionId },
            query: { month: currentMonth },
          },
        }),
      );
    },
    enabled: Boolean(auctionId) && !isMonth1OrMonthN,
  });

  // 3. Fetch all assigned subscriber tickets for chit scheme roster (using schemes.roster key — zero cache collision!)
  const {
    data: allTickets = [],
    isLoading: isTicketsLoading,
  } = useQuery<SubscriberTicketItem[]>({
    queryKey: queryKeys.schemes.roster(chitGroupId || ''),
    queryFn: async () => {
      if (!chitGroupId) return [];
      return unwrapApiResponse<SubscriberTicketItem[]>(
        apiClient.GET('/api/v1/chits/{id}/tickets', {
          params: { path: { id: chitGroupId } },
        }),
      );
    },
    enabled: Boolean(chitGroupId) && !isMonth1OrMonthN,
  });

  // Authoritative eligible tickets derived from backend pre-auction defaulter guard (Guardrail 8)
  const authoritativeEligibleTickets = React.useMemo(() => {
    const serverEligibleIds = new Set(
      eligibleBidders.map((e) => resolveEligibleBidderTicketId(e)).filter(Boolean),
    );
    if (isEligibleLoaded) {
      const matchedFromAll = allTickets.filter(
        (ticket) =>
          serverEligibleIds.has(ticket.id) &&
          ticket.status === 'ACTIVE' &&
          !ticket.isPrized &&
          ticket.consecutiveUnpaidMonths === 0,
      );
      return matchedFromAll.length > 0 ? matchedFromAll : eligibleBidders;
    }
    return allTickets.filter(
      (ticket) => ticket.status === 'ACTIVE' && !ticket.isPrized && ticket.consecutiveUnpaidMonths === 0,
    );
  }, [allTickets, eligibleBidders, isEligibleLoaded]);

  // Scheme parameters with exact BigInt whole-rupee math (Guardrail 2, 3, 6)
  const chitValueBig = toSafeWholeRupeeBigInt(resolvedScheme?.chitValue, 0n);
  const baseInstallmentBig =
    resolvedScheme?.baseInstallment !== undefined && resolvedScheme?.baseInstallment !== null
      ? toSafeWholeRupeeBigInt(resolvedScheme.baseInstallment, chitValueBig / BigInt(durationMonths))
      : chitValueBig / BigInt(durationMonths);
  const maxCeilingBig = computeCeilingDiscountBigInt(
    chitValueBig,
    resolvedScheme?.maxDiscountCeiling,
  );

  // Record Bid Mutation (passes ?month=currentMonth for both Auction UUID and ChitGroup UUID)
  const recordBidMutation = useMutation({
    mutationFn: async (payload: RecordBidPayload) => {
      return unwrapApiResponse(
        apiClient.POST('/api/v1/auctions/{id}/record-bid', {
          params: {
            path: { id: auctionId },
            query: { month: currentMonth },
          },
          body: payload,
        }),
      );
    },
    onSuccess: () => {
      setIsModifying(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.detail(auctionId) });
      refetchAuction();
    },
  });

  // Record Tie-Break Mutation (passes ?month=currentMonth for both Auction UUID and ChitGroup UUID)
  const recordTieBreakMutation = useMutation({
    mutationFn: async (payload: RecordTieBreakPayload) => {
      return unwrapApiResponse(
        apiClient.POST('/api/v1/auctions/{id}/tie-break', {
          params: {
            path: { id: auctionId },
            query: { month: currentMonth },
          },
          body: payload,
        }),
      );
    },
    onSuccess: () => {
      setIsModifying(false);
      setIsTieBreakOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.detail(auctionId) });
      refetchAuction();
    },
  });

  const isAuctionFinalized =
    auction?.status === 'COMPLETED' || auction?.status === 'MINUTES_FILED';

  const hasRecordedResult = Boolean(
    auction &&
      auction.bidDiscount &&
      auction.winner &&
      (!isModifying || isAuctionFinalized),
  );

  if (isAuctionLoading || (isAuctionError && Boolean(monthNum) && isFallbackSchemeLoading)) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!auction && !fallbackScheme) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-8 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
        <h3 className="text-base font-semibold text-white">Auction Room Not Found</h3>
        <p className="text-xs text-red-300 max-w-sm mx-auto">
          The requested auction room could not be loaded. Please return to the auctions directory.
        </p>
        <Button size="sm" variant="outline" asChild className="border-slate-700 bg-slate-800 text-xs text-slate-200">
          <Link href="/auctions">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            <span>Return to Auctions</span>
          </Link>
        </Button>
      </div>
    );
  }

  // Guardrail 5: Month 1 (Company Pool) & Month N (Maturity Settlement) have NO bidding auctions
  if (isMonth1OrMonthN) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-8 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-amber-400" />
        <h3 className="text-base font-semibold text-white">
          {currentMonth <= 1 ? t('month1NoAuction') : t('monthNNoAuction')}
        </h3>
        <p className="text-xs text-amber-200 max-w-md mx-auto leading-relaxed">
          {currentMonth <= 1
            ? t('month1NoAuctionLiveDesc', { lastAuctionMonth: Math.max(2, durationMonths - 1) })
            : t('monthNNoAuctionLiveDesc', { duration: durationMonths })}
        </p>
        <Button size="sm" variant="outline" asChild className="border-slate-700 bg-slate-800 text-xs text-slate-200">
          <Link href={chitGroupId ? `/auctions?group=${chitGroupId}` : '/auctions'}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            <span>Return to Auctions Schedule</span>
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" asChild className="h-8 w-8 p-0 border-slate-800 bg-slate-900 text-slate-300">
            <Link href={chitGroupId ? `/auctions?group=${chitGroupId}` : '/auctions'}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                {resolvedScheme?.groupCode || 'SCHEME'}
              </span>
              <h1 className="text-lg font-bold text-white">
                Month {currentMonth} — {t('liveRoomTitle')}
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {resolvedScheme?.groupName || t('liveRoomSubtitle')}
            </p>
          </div>
        </div>

        {/* Real-time IST Clock */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-400">
          <Clock className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
          <span>{clockTime || 'IST Live'}</span>
        </div>
      </div>

      {/* Embedded Statutory Rules Banners: Guardrail 6 & Guardrail 4 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
        <BusinessRuleBanner
          ruleNumber={6}
          title={t('guardrail6BannerTitle')}
          description={t('guardrail6BannerDesc')}
          referencePath="/instructions?rule=6"
          className="h-full"
          defaultExpanded={false}
        />
        <BusinessRuleBanner
          ruleNumber={4}
          title="Universal Equal Dividend Deduction (Guardrail 4)"
          description="Winning discount minus 4% commission is distributed equally to ALL members, including winner and past prized winners."
          referencePath="/instructions?rule=4"
          className="h-full"
          defaultExpanded={false}
        />
      </div>

      {/* Main Two-Column Live Room Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (5 cols): Pre-Auction Defaulter Guard & Eligibility Roster */}
        <div className="lg:col-span-5">
          <DefaulterEligibilityRoster
            allTickets={allTickets}
            eligibleTickets={eligibleBidders}
            hasAuthoritativeEligibility={isEligibleLoaded}
            selectedTicketId={selectedTicket?.id || auction?.winner?.ticketId}
            onSelectBidder={(ticket) => setSelectedTicket(ticket)}
            isLoading={isTicketsLoading || isEligibleLoading}
          />
        </div>

        {/* Right Column (7 cols): Bidding Console OR Auction Summary Card */}
        <div className="lg:col-span-7 space-y-4">
          {hasRecordedResult && auction ? (
            <AuctionSummaryCard
              auction={auction}
              chitValue={chitValueBig}
              baseInstallment={baseInstallmentBig}
              totalTickets={durationMonths}
              isFinalized={isAuctionFinalized}
              canModifyBid={canConductAuction}
              onModifyBid={() => setIsModifying(true)}
            />
          ) : (
            <BiddingConsole
              chitValue={chitValueBig}
              durationMonths={durationMonths}
              baseInstallment={baseInstallmentBig}
              foremanCommissionRate={resolvedScheme?.foremanCommissionRate}
              maxDiscountCeiling={resolvedScheme?.maxDiscountCeiling}
              selectedTicket={selectedTicket}
              eligibleTickets={authoritativeEligibleTickets}
              onSelectTicket={(ticket) => setSelectedTicket(ticket)}
              onRecordBid={async (payload) => {
                await recordBidMutation.mutateAsync(payload);
              }}
              onOpenTieBreak={() => setIsTieBreakOpen(true)}
              isSubmitting={recordBidMutation.isPending}
            />
          )}
        </div>
      </div>

      {/* Option A Physical Paper Token Tie-Break Modal */}
      <TieBreakModal
        isOpen={isTieBreakOpen}
        onClose={() => setIsTieBreakOpen(false)}
        ceilingDiscount={maxCeilingBig}
        eligibleTickets={authoritativeEligibleTickets}
        onRecordTieBreak={async (payload) => {
          await recordTieBreakMutation.mutateAsync(payload);
        }}
        isSubmitting={recordTieBreakMutation.isPending}
      />
    </div>
  );
}

export default function LiveAuctionRoomPage() {
  return (
    <React.Suspense fallback={<RouteSuspenseFallback />}>
      <LiveAuctionRoomContent />
    </React.Suspense>
  );
}
