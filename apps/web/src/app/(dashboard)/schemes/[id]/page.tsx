'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit3,
  Loader2,
  Play,
  UserX,
} from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { apiClient, unwrapApiResponse } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import { TicketRosterTable, type TicketItem } from '@/components/schemes/ticket-roster-table';
import { AssignTicketDialog } from '@/components/schemes/assign-ticket-dialog';
import { EditSchemeDialog } from '@/components/schemes/edit-scheme-dialog';
import { ActivateSchemeDialog } from '@/components/schemes/activate-scheme-dialog';
import { MonthlyInstallmentsPanel } from '@/components/schemes/monthly-installments-panel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export default function SchemeDetailPage() {
  const t = useTranslations('schemes');
  const tInstallments = useTranslations('installments');
  const params = useParams();
  const id = params?.id as string;
  const user = useAuthStore((s) => s.user);

  const [isAssignOpen, setIsAssignOpen] = React.useState(false);
  const [assignSlotNumber, setAssignSlotNumber] = React.useState<number | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isActivateModalOpen, setIsActivateModalOpen] = React.useState(false);

  // Fetch Scheme Details with real API
  const { data: scheme, isLoading, error } = useQuery({
    queryKey: queryKeys.schemes.detail(id),
    queryFn: async () => {
      return unwrapApiResponse<any>(
        apiClient.GET('/api/v1/chits/{id}', {
          params: { path: { id } },
        })
      );
    },
    enabled: !!id,
  });

  const isSuperAdmin = Boolean(user?.roles?.includes('SUPER_ADMIN'));
  const isBranchManager = Boolean(user?.roles?.includes('BRANCH_MANAGER'));
  const canManage = isSuperAdmin || isBranchManager;

  const tickets: TicketItem[] = scheme?.tickets || [];
  const totalTickets = scheme?.totalTickets || 20;
  const isDraft = scheme?.status === 'DRAFT' || scheme?.status === 'REGISTERED';
  const isFull = tickets.length >= totalTickets;
  const remainingSlots = Math.max(0, totalTickets - tickets.length);

  if (isLoading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || !scheme) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center text-rose-300">
        <p className="font-semibold">{error ? (error as any).message : 'Scheme not found'}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/schemes">{t('backToDirectory')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/schemes"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-medium mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('backToDirectory')}</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-bold text-emerald-400 tracking-wider">
              {scheme.groupCode}
            </span>
            <Badge
              variant={scheme.status === 'ACTIVE' ? 'success' : isDraft ? 'warning' : 'outline'}
              className="text-xs font-bold uppercase"
            >
              {scheme.status}
            </Badge>
          </div>
          <h1 className="text-xl font-semibold text-slate-100">{scheme.groupName}</h1>
          {scheme.groupNameTamil && (
            <p className="text-xs text-slate-400 font-tamil">{scheme.groupNameTamil}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          {scheme.status === 'ACTIVE' && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-amber-600/40 bg-amber-950/20 text-amber-300 hover:bg-amber-900/30 text-xs font-semibold"
            >
              <Link href={`/schemes/${id}/defaulters`}>
                <UserX className="mr-1.5 h-3.5 w-3.5" />
                <span>{t('defaultersDeskNavBtn')}</span>
              </Link>
            </Button>
          )}

          {isDraft && isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
              className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs"
            >
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              <span>{t('editScheme')}</span>
            </Button>
          )}

          {isDraft && isSuperAdmin && (
            <Button
              size="sm"
              disabled={!isFull}
              onClick={() => setIsActivateModalOpen(true)}
              className={cn(
                'font-semibold text-xs',
                isFull
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
              )}
            >
              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
              <span>
                {isFull ? t('activateScheme') : t('activateRemaining', { count: remainingSlots })}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Embedded In-Page Guardrail Banner: Rule #7 (Ticket Limit Constraint ADR-13) */}
      <BusinessRuleBanner
        ruleNumber={7}
        title="Ticket Limit Constraint (ADR-13 & Guardrail 7)"
        description="A customer can subscribe to multiple chit groups, but cannot hold 2 or more tickets in the same chit group. Database enforces @@unique([chitGroupId, customerId])."
        referencePath="/instructions?rule=7"
        defaultExpanded={false}
      />

      {/* 6-Column Key Financial & Operational Metric Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('chitValue')}</span>
          <p className="font-mono text-base font-bold text-slate-100">
            {formatRupee(scheme.chitValue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('baseInstallment')}</span>
          <p className="font-mono text-base font-bold text-slate-100">
            {formatRupee(scheme.baseInstallment)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('duration')}</span>
          <p className="font-mono text-base font-semibold text-slate-200">
            {scheme.durationMonths} Months
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('commissionLocked')}</span>
          <p className="font-mono text-base font-bold text-indigo-400">4.00%</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('ceilingDiscount')}</span>
          <p className="font-mono text-base font-semibold text-indigo-300">
            {formatRupee(scheme.maxDiscountCeiling)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400">{t('subscriptionStatus')}</span>
          <p
            className={cn(
              'font-mono text-base font-bold',
              isFull ? 'text-emerald-400' : 'text-amber-400'
            )}
          >
            {tickets.length} / {totalTickets}
          </p>
        </div>
      </div>

      {/* Tabbed Management View: Tab 1 = Subscriber Roster | Tab 2 = Monthly Installments */}
      <Tabs defaultValue="roster" className="space-y-4">
        <div className="overflow-x-auto scrollbar-none pb-1">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 inline-flex w-max min-w-full sm:min-w-0 sm:w-auto">
            <TabsTrigger
              value="roster"
              className="text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white cursor-pointer shrink-0 whitespace-nowrap"
            >
              {tInstallments('tabRoster', { total: totalTickets })}
            </TabsTrigger>
            <TabsTrigger
              value="installments"
              className="text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white cursor-pointer shrink-0 whitespace-nowrap"
            >
              {tInstallments('tabInstallments')}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Subscriber Roster */}
        <TabsContent value="roster" className="space-y-3 outline-none mt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-100">{t('rosterTitle')}</h2>
              <p className="text-xs text-slate-400">{t('rosterSubtitle', { total: totalTickets })}</p>
            </div>
            {isDraft && canManage && !isFull && (
              <Button
                size="sm"
                onClick={() => {
                  setAssignSlotNumber(null);
                  setIsAssignOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                {t('assignTicket')}
              </Button>
            )}
          </div>

          <TicketRosterTable
            chitGroupId={id}
            totalTickets={totalTickets}
            isDraft={isDraft}
            canManageTickets={canManage}
            tickets={tickets}
            onAssignClick={(slotNum) => {
              setAssignSlotNumber(slotNum);
              setIsAssignOpen(true);
            }}
            onUnassignSuccess={() => {}}
          />
        </TabsContent>

        {/* Tab 2: Monthly Installments & Dues Tracker */}
        <TabsContent value="installments" className="space-y-4 outline-none mt-2">
          <MonthlyInstallmentsPanel
            chitGroupId={id}
            groupCode={scheme.groupCode}
            durationMonths={scheme.durationMonths}
            baseInstallment={scheme.baseInstallment}
            startDate={scheme.startDate}
            status={scheme.status}
            currentInstallmentMonth={scheme.currentInstallmentMonth}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <AssignTicketDialog
        chitGroupId={id}
        chitGroupName={scheme.groupName}
        totalTickets={totalTickets}
        assignedTickets={tickets.map((t) => ({
          ticketNumber: t.ticketNumber,
          customerId: t.customerId,
          customerName: t.customer?.fullName,
        }))}
        initialTicketNumber={assignSlotNumber}
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        onSuccess={() => {}}
      />

      <EditSchemeDialog
        scheme={scheme}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSuccess={() => {}}
      />

      {/* Scheme Activation Confirmation Modal */}
      <ActivateSchemeDialog
        chitGroupId={id}
        isOpen={isActivateModalOpen}
        onClose={() => setIsActivateModalOpen(false)}
        onSuccess={() => {}}
      />
    </div>
  );
}
