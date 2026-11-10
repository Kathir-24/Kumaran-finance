'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  UserX,
  UserCheck,
  AlertTriangle,
  Loader2,
  Clock,
  Ban,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { DefaultersTable } from '@/components/schemes/defaulters-table';
import {
  DefaulterRemovalDialog,
  type DefaulterTicketRef,
} from '@/components/schemes/defaulter-removal-dialog';
import { DefaulterSubstitutionModal } from '@/components/schemes/defaulter-substitution-modal';
import { DefaulterSettlementDialog } from '@/components/schemes/defaulter-settlement-dialog';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatRupee } from '@/lib/currency';

export default function SchemeDefaultersPage() {
  const t = useTranslations('schemes');
  const params = useParams();
  const id = String(params?.id || '');
  const user = useAuthStore((s) => s.user);

  const [removalTicket, setRemovalTicket] = React.useState<DefaulterTicketRef | null>(null);
  const [substitutionTicket, setSubstitutionTicket] = React.useState<DefaulterTicketRef | null>(null);
  const [settlementTicket, setSettlementTicket] = React.useState<DefaulterTicketRef | null>(null);

  const isSuperAdmin =
    Boolean(user?.roles?.includes('SUPER_ADMIN')) ||
    (user as any)?.role === 'SUPER_ADMIN';
  const isAccountant =
    Boolean(user?.roles?.includes('ACCOUNTANT')) ||
    (user as any)?.role === 'ACCOUNTANT';
  const canSettle = isSuperAdmin || isAccountant;

  // 1. Fetch Chit Scheme Detail (Includes all tickets & customers)
  const {
    data: scheme,
    isLoading: isLoadingScheme,
    error: schemeError,
    refetch: refetchScheme,
  } = useQuery({
    queryKey: queryKeys.schemes.detail(id),
    queryFn: async () => {
      return unwrapApiResponse<any>(
        apiClient.GET('/api/v1/chits/{id}', {
          params: { path: { id } },
        }),
      );
    },
    enabled: Boolean(id),
  });

  // 2. Fetch Defaulters with Arrears Dues Breakdown
  const { data: defaultersList } = useQuery({
    queryKey: queryKeys.tickets.defaulters(),
    queryFn: async () => {
      return unwrapApiResponse<any[]>(
        apiClient.GET('/api/v1/tickets/defaulters' as any, {
          params: { query: { minConsecutiveMonths: 1 } },
        }),
      );
    },
    staleTime: 30_000,
  });

  const tickets = scheme?.tickets || [];

  // Map arrears and total overdue per ticket
  const duesMap = React.useMemo(() => {
    const map: Record<string, { totalOverdue: bigint | number; unpaidCount: number }> = {};
    if (defaultersList && Array.isArray(defaultersList)) {
      for (const item of defaultersList) {
        if (item.chitGroup?.id === id || item.ticketId) {
          map[item.ticketId] = {
            totalOverdue: BigInt(item.totalOverdueAmount || 0),
            unpaidCount: item.consecutiveUnpaidMonths || 0,
          };
        }
      }
    }
    return map;
  }, [defaultersList, id]);

  // Aggregate Metrics
  const activeDefaulters = tickets.filter(
    (t: any) => t.status !== 'REMOVED_DEF_3M' && t.consecutiveUnpaidMonths > 0 && t.consecutiveUnpaidMonths < 3,
  ).length;

  const eligibleForRemoval = tickets.filter(
    (t: any) => t.status !== 'REMOVED_DEF_3M' && t.consecutiveUnpaidMonths >= 3,
  ).length;

  const removedTickets = tickets.filter((t: any) => t.status === 'REMOVED_DEF_3M').length;

  const totalOverdue = Object.values(duesMap).reduce(
    (sum, d) => sum + BigInt(d.totalOverdue),
    0n,
  );

  const existingAssigned = tickets.map((t: any) => ({
    ticketNumber: t.ticketNumber,
    customerId: t.customerId,
  }));

  if (isLoadingScheme) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (schemeError || !scheme) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center text-rose-300">
        <p className="font-semibold">{schemeError ? (schemeError as any).message : 'Scheme not found'}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/schemes">{t('backToDirectory')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/schemes/${id}`}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Scheme: {scheme.groupCode}</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-bold text-emerald-400 tracking-wider">
              {scheme.groupCode}
            </span>
            <Badge variant="outline" className="text-xs font-bold uppercase border-slate-700">
              {scheme.status}
            </Badge>
          </div>
          <h1 className="text-xl font-semibold text-slate-100">{t('defaultersDeskTitle')}</h1>
          <p className="text-xs text-slate-400">{t('defaultersDeskSubtitle')}</p>
        </div>
      </div>

      {/* Embedded In-Page Guardrail Banner: Rule #8 (Defaulter Rules & ADR-07 / ADR-12) */}
      <BusinessRuleBanner
        ruleNumber={8}
        title={t('rule8RemovalBannerTitle')}
        description={t('rule8RemovalBannerDesc')}
        referencePath="/instructions?rule=8"
        defaultExpanded={false}
      />

      {/* 5-Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('totalSchemeTickets')}</span>
          <p className="font-mono text-base font-bold text-slate-100">
            {tickets.length} / {scheme.totalTickets || 20}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-amber-300 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{t('activeDefaultersCount')}</span>
          </span>
          <p className="font-mono text-base font-bold text-amber-400">
            {activeDefaulters}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-rose-300 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            <span>{t('eligibleForRemovalCount')}</span>
          </span>
          <p className="font-mono text-base font-bold text-rose-400">
            {eligibleForRemoval}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-purple-300 flex items-center gap-1">
            <Ban className="h-3 w-3" />
            <span>{t('removedTicketsCount')}</span>
          </span>
          <p className="font-mono text-base font-bold text-purple-400">
            {removedTickets}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('totalOverdueArrears')}</span>
          <p className="font-mono text-base font-bold text-emerald-400">
            {formatRupee(totalOverdue)}
          </p>
        </div>
      </div>

      {/* Main Defaulters Roster & Action Desk */}
      <DefaultersTable
        chitGroupId={id}
        chitGroupCode={scheme.groupCode}
        chitValue={scheme.chitValue}
        tickets={tickets}
        duesMap={duesMap}
        onRemoveClick={(tRef) => setRemovalTicket(tRef)}
        onSubstituteClick={(tRef) => setSubstitutionTicket(tRef)}
        onSettleClick={(tRef) => setSettlementTicket(tRef)}
        isSuperAdmin={isSuperAdmin}
        canSettle={canSettle}
      />

      {/* Removal Dialog */}
      <DefaulterRemovalDialog
        isOpen={Boolean(removalTicket)}
        onClose={() => setRemovalTicket(null)}
        ticket={removalTicket}
        chitGroupId={id}
        chitGroupCode={scheme.groupCode}
        onSuccess={() => refetchScheme()}
      />

      {/* Substitution Modal */}
      <DefaulterSubstitutionModal
        isOpen={Boolean(substitutionTicket)}
        onClose={() => setSubstitutionTicket(null)}
        ticket={substitutionTicket}
        chitGroupId={id}
        chitGroupCode={scheme.groupCode}
        existingTickets={existingAssigned}
        onSuccess={() => refetchScheme()}
      />

      {/* Settlement Dialog */}
      <DefaulterSettlementDialog
        isOpen={Boolean(settlementTicket)}
        onClose={() => setSettlementTicket(null)}
        ticket={settlementTicket}
        chitGroupId={id}
        chitGroupCode={scheme.groupCode}
        chitValue={scheme.chitValue}
        onSuccess={() => refetchScheme()}
      />
    </div>
  );
}
