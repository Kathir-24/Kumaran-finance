'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Gavel,
  ArrowLeft,
  Crown,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  AlertCircle,
  Building2,
  FileText,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import {
  AuctionFinalizeCard,
  type FinalizeAuctionPayload,
} from '@/components/auctions/auction-finalize-card';
import {
  AuctionMinutesCard,
  type AuctionMinutesData,
} from '@/components/auctions/auction-minutes-card';
import {
  RegistrarFilingDialog,
  type MarkFiledPayload,
} from '@/components/auctions/registrar-filing-dialog';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatRupee } from '@/lib/currency';

export default function AuctionDetailPage() {
  const t = useTranslations('auctions');
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const auctionId = String(params.id);
  const [isFilingOpen, setIsFilingOpen] = React.useState(false);

  // 1. Fetch Auction Detail
  const {
    data: auction,
    isLoading,
    isError,
    refetch,
  } = useQuery<any>({
    queryKey: queryKeys.auctions.detail(auctionId),
    queryFn: async () => {
      return unwrapApiResponse<any>(
        apiClient.GET('/api/v1/auctions/{id}' as any, {
          params: { path: { id: auctionId } },
        }),
      );
    },
    enabled: Boolean(auctionId),
  });

  // Finalize Auction Mutation (Checker)
  const finalizeMutation = useMutation({
    mutationFn: async (payload: FinalizeAuctionPayload) => {
      return unwrapApiResponse(
        apiClient.POST('/api/v1/auctions/{id}/finalize' as any, {
          params: { path: { id: auctionId } },
          body: payload,
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.detail(auctionId) });
      refetch();
    },
  });

  // Mark Minutes Filed Mutation
  const markFiledMutation = useMutation({
    mutationFn: async (payload: MarkFiledPayload) => {
      return unwrapApiResponse(
        apiClient.PATCH('/api/v1/auctions/{auctionId}/mark-filed-with-registrar' as any, {
          params: { path: { auctionId } },
          body: payload,
        }),
      );
    },
    onSuccess: () => {
      setIsFilingOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auctions.detail(auctionId) });
      refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (isError || !auction) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-8 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
        <h3 className="text-base font-semibold text-white">Auction Not Found</h3>
        <p className="text-xs text-red-300 max-w-sm mx-auto">
          The requested auction record could not be loaded. Please return to the auctions directory.
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

  const chit = auction.chitGroup;
  const winner = auction.winner;
  const winnerTicket = winner?.ticket;
  const winnerCustomer = winnerTicket?.customer;
  const isScheduled = auction.status === 'SCHEDULED';
  const isCompleted = auction.status === 'COMPLETED';
  const isMinutesFiled = auction.status === 'MINUTES_FILED' || auction.minutes?.filedAtRegistrar === true;

  const chitValue = Number(chit?.chitValue || 100000);
  const durationMonths = Number(chit?.durationMonths || 20);
  const baseInstallment = Math.floor(chitValue / durationMonths);
  const dividendPerTicket = Number(auction.dividendPerTicket || 0);
  const nextMonthNet = Math.max(0, baseInstallment - dividendPerTicket);

  // Tie-break token info
  const winningTieBidder = auction.tieBidders?.find(
    (tb: any) => tb.isLotWinner || tb.isWinner || tb.ticketId === winner?.ticketId,
  );
  const drawnToken = winningTieBidder?.tokenNumber;

  return (
    <div className="space-y-5">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" asChild className="h-8 w-8 p-0 border-slate-800 bg-slate-900 text-slate-300">
            <Link href={chit?.id ? `/auctions?group=${chit.id}` : '/auctions'}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                {chit?.groupCode || 'SCHEME'}
              </span>
              <h1 className="text-lg font-bold text-white">
                Month {auction.installmentMonth} — {t('auctionDetailTitle')}
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {chit?.groupName} • Conducted: {new Date(auction.auctionDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Status Badge & Live Room Link */}
        <div className="flex items-center gap-2">
          {isMinutesFiled ? (
            <Badge variant="outline" className="border-purple-500/40 bg-purple-950/50 text-purple-300 text-xs py-1 px-2.5">
              <FileCheck2 className="h-3.5 w-3.5 mr-1.5 inline" /> {t('statusMinutesFiled')}
            </Badge>
          ) : isCompleted ? (
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-950/50 text-emerald-300 text-xs py-1 px-2.5">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 inline" /> {t('statusCompleted')}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-950/50 text-amber-300 text-xs py-1 px-2.5">
              <Clock className="h-3.5 w-3.5 mr-1.5 inline" /> {t('statusScheduled')}
            </Badge>
          )}

          {isScheduled && (
            <Button size="sm" variant="default" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8">
              <Link href={`/auctions/${auction.id}/live`}>
                <Gavel className="mr-1.5 h-3.5 w-3.5" />
                <span>{t('reenterLiveRoom')}</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Embedded Statutory Rule Banner: Guardrail 10 */}
      <BusinessRuleBanner
        ruleNumber={10}
        title="Maker-Checker Separation of Duties (Guardrail 10)"
        description="Critical auction finalization and prize locking strictly enforce maker_user_id != checker_user_id. The staff who entered bids cannot finalize the auction."
        referencePath="/instructions?rule=10"
        defaultExpanded={false}
      />

      {/* Winner Spotlight Card */}
      {winner && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
              {t('winnerCol')}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded">
                #{winnerTicket?.ticketNumber || '—'}
              </span>
              <span className="text-sm font-bold text-white">
                {winnerCustomer?.fullName || 'Winner Subscriber'}
              </span>
              {winnerCustomer?.fullNameTamil && (
                <span className="text-xs text-slate-400">({winnerCustomer.fullNameTamil})</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {winnerCustomer?.customerCode} • {winnerCustomer?.phone}
            </div>
          </div>

          {winner.wasTieBreakWinner && (
            <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded-lg text-xs">
              <Crown className="h-4 w-4 text-amber-400 flex-shrink-0" />
              <span>Option A Tie-Break Winner (Drawn Paper Token #{drawnToken || 1})</span>
            </div>
          )}
        </div>
      )}

      {/* Financial Snapshot Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-0.5">
          <span className="text-[10px] text-slate-400 font-medium">{t('chitValueLabel')}</span>
          <div className="text-sm font-bold text-white font-mono">{formatRupee(BigInt(chitValue))}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-0.5">
          <span className="text-[10px] text-slate-400 font-medium">{t('discountCol')}</span>
          <div className="text-sm font-bold text-emerald-400 font-mono">
            {formatRupee(BigInt(auction.bidDiscount || 0))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-0.5">
          <span className="text-[10px] text-slate-400 font-medium">{t('prizeCol')}</span>
          <div className="text-sm font-bold text-emerald-300 font-mono">
            {formatRupee(BigInt(auction.prizeMoney || 0))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-0.5">
          <span className="text-[10px] text-slate-400 font-medium">{t('dividendPerTicketCol')}</span>
          <div className="text-sm font-bold text-cyan-300 font-mono">
            {formatRupee(BigInt(dividendPerTicket))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-0.5">
          <span className="text-[10px] text-slate-400 font-medium">{t('netInstallmentCol')}</span>
          <div className="text-sm font-bold text-cyan-300 font-mono">{formatRupee(BigInt(nextMonthNet))}</div>
        </div>
      </div>

      {/* Primary Action Section: Finalize Card OR Minutes Card */}
      {isScheduled ? (
        <AuctionFinalizeCard
          auctionId={auction.id}
          conductedByUserId={auction.conductedByUserId}
          winnerTicketNumber={winnerTicket?.ticketNumber}
          winnerCustomerName={winnerCustomer?.fullName}
          installmentMonth={auction.installmentMonth}
          onFinalize={async (payload) => {
            await finalizeMutation.mutateAsync(payload);
          }}
          isSubmitting={finalizeMutation.isPending}
        />
      ) : auction.minutes ? (
        <AuctionMinutesCard
          auctionId={auction.id}
          groupCode={chit?.groupCode || 'SCHEME'}
          groupName={chit?.groupName || ''}
          installmentMonth={auction.installmentMonth}
          auctionDate={auction.auctionDate}
          chitValue={chitValue}
          bidDiscount={Number(auction.bidDiscount || 0)}
          foremanCommissionAmount={Number(auction.foremanCommissionAmount || 0)}
          totalDividend={Number(auction.totalDividend || 0)}
          dividendPerTicket={dividendPerTicket}
          prizeMoney={Number(auction.prizeMoney || 0)}
          winnerTicketNumber={winnerTicket?.ticketNumber || 1}
          winnerCustomerName={winnerCustomer?.fullName || 'Winner'}
          minutes={auction.minutes}
          onOpenFilingDialog={() => setIsFilingOpen(true)}
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-400">
          Auction finalized. Statutory minutes are being synchronized.
        </div>
      )}

      {/* Registrar Filing Dialog */}
      <RegistrarFilingDialog
        isOpen={isFilingOpen}
        onClose={() => setIsFilingOpen(false)}
        auctionId={auction.id}
        groupCode={chit?.groupCode || 'SCHEME'}
        installmentMonth={auction.installmentMonth}
        onMarkFiled={async (payload) => {
          await markFiledMutation.mutateAsync(payload);
        }}
        isSubmitting={markFiledMutation.isPending}
      />
    </div>
  );
}
