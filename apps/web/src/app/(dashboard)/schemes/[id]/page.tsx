'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Edit3,
  FileCheck2,
  Info,
  Loader2,
  Lock,
  Play,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BusinessRuleBanner } from '@/components/ui/business-rule-banner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TicketRosterTable, type TicketItem } from '@/components/schemes/ticket-roster-table';
import { AssignTicketDialog } from '@/components/schemes/assign-ticket-dialog';
import { EditSchemeDialog } from '@/components/schemes/edit-scheme-dialog';
import { cn } from '@/lib/utils';

export default function SchemeDetailPage() {
  const t = useTranslations('schemes');
  const params = useParams();
  const id = params?.id as string;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [isAssignOpen, setIsAssignOpen] = React.useState(false);
  const [assignSlotNumber, setAssignSlotNumber] = React.useState<number | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isActivateModalOpen, setIsActivateModalOpen] = React.useState(false);
  const [activationNotes, setActivationNotes] = React.useState('');
  const [activationError, setActivationError] = React.useState<string | null>(null);

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

  // Activate Scheme Mutation
  const activateMutation = useMutation({
    mutationFn: async () => {
      return unwrapApiResponse(
        apiClient.POST('/api/v1/chits/{id}/activate', {
          params: { path: { id } },
          body: { notes: activationNotes.trim() || undefined },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.list() });
      setIsActivateModalOpen(false);
    },
    onError: (err: any) => {
      if (err instanceof KumaranApiError) {
        setActivationError(err.message);
      } else {
        setActivationError(err.message || 'Activation failed');
      }
    },
  });

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
              onClick={() => {
                setActivationNotes('');
                setActivationError(null);
                setIsActivateModalOpen(true);
              }}
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
          <span className="text-[11px] text-slate-400">Subscription Status</span>
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

      {/* Roster Container */}
      <div className="space-y-3">
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
      </div>

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
      <Dialog open={isActivateModalOpen} onOpenChange={setIsActivateModalOpen}>
        <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-100">
              {t('activateConfirmTitle')}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 leading-relaxed">
              {t('activateConfirmDesc')}
            </DialogDescription>
          </DialogHeader>

          {activationError && (
            <Alert variant="destructive" className="py-2">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="text-xs font-bold">Activation Error</AlertTitle>
              <AlertDescription className="text-xs">{activationError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 py-2">
            <label className="text-xs font-semibold text-slate-300">
              Checker Approval Notes (Optional)
            </label>
            <Input
              placeholder="e.g. Verified by Super Admin against physical register"
              value={activationNotes}
              onChange={(e) => setActivationNotes(e.target.value)}
              className="text-xs border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsActivateModalOpen(false)}
              disabled={activateMutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {activateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('activating')}
                </>
              ) : (
                t('confirmActivationButton')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
