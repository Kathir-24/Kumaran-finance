'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserCheck,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  BadgeCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuthStore, hasAnyRole } from '@/stores/auth-store';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import type { DefaulterTicketRef } from './defaulter-removal-dialog';

export interface CustomerCandidate {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  isKycVerified?: boolean;
}

interface DefaulterSubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: DefaulterTicketRef | null;
  chitGroupId: string;
  chitGroupCode: string;
  existingTickets: Array<{ ticketNumber: number; customerId: string }>;
  onSuccess?: () => void;
}

export function DefaulterSubstitutionModal({
  isOpen,
  onClose,
  ticket,
  chitGroupId,
  chitGroupCode,
  existingTickets,
  onSuccess,
}: DefaulterSubstitutionModalProps) {
  const t = useTranslations('schemes');
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerCandidate | null>(null);
  const [reason, setReason] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isPartner = hasAnyRole(user, ['PARTNER']);

  React.useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedCustomer(null);
      setReason('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Search candidate replacement customers (minimum 2 chars)
  const { data: customerResults, isLoading: isSearching } = useQuery({
    queryKey: queryKeys.customers.list(searchTerm),
    queryFn: async () => {
      if (!searchTerm || searchTerm.trim().length < 2) return [];
      const res = await unwrapApiResponse<{ data: CustomerCandidate[] }>(
        apiClient.GET('/api/v1/customers', {
          params: { query: { search: searchTerm.trim(), limit: 10 } },
        }),
      );
      return res.data || [];
    },
    enabled: isOpen && searchTerm.trim().length >= 2,
    staleTime: 10_000,
  });

  // Guardrail 7 / ADR-13: Pre-check duplicate ticket in same scheme
  const conflictTicket = React.useMemo(() => {
    if (!selectedCustomer) return null;
    return existingTickets.find((t) => t.customerId === selectedCustomer.id);
  }, [selectedCustomer, existingTickets]);

  const isKycVerified = Boolean(selectedCustomer?.isKycVerified);

  const substituteMutation = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error('No ticket selected');
      if (!selectedCustomer || !isKycVerified) throw new Error(t('kycNotVerifiedError'));
      if (conflictTicket) {
        throw new Error(t('adr13SchemeConflictError', { ticket: conflictTicket.ticketNumber }));
      }
      return unwrapApiResponse(
        apiClient.POST('/api/v1/tickets/{id}/substitute', {
          params: { path: { id: ticket.id } },
          body: {
            newCustomerId: selectedCustomer.id,
            reason: reason.trim() || undefined,
          },
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.installments.all });
      onSuccess?.();
      onClose();
    },
    onError: (err: unknown) => setErrorMsg(getErrorMessage(err, 'Failed to substitute replacement subscriber')),
  });

  if (!ticket) return null;

  const canSubmit = isPartner && selectedCustomer && isKycVerified && !conflictTicket && !substituteMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-400">
            <UserCheck className="h-5 w-5" />
            <DialogTitle className="text-base font-bold text-slate-100">
              {t('substituteModalTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 pt-1">
            {t('substituteModalDesc', {
              ticketNumber: ticket.ticketNumber,
              groupCode: chitGroupCode,
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Partner Guard Banner */}
        {!isPartner && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Only verified legal partners possess statutory authority to substitute subscribers.</span>
          </div>
        )}

        {/* Vacated Ticket Overview */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Vacated Ticket</span>
            <span className="font-mono font-bold text-amber-400">
              Ticket #{ticket.ticketNumber} ({chitGroupCode})
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Previous Removed Member</span>
            <span className="font-mono text-slate-300">
              {ticket.customerName} (+91 {ticket.customerPhone})
            </span>
          </div>
        </div>

        {/* Search Customer Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {t('searchReplacementLabel')}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder={t('searchReplacementPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-emerald-400" />
            )}
          </div>

          {/* Results Dropdown */}
          {customerResults && customerResults.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-1 divide-y divide-slate-800">
              {customerResults.map((cust) => {
                const isConflict = existingTickets.some((t) => t.customerId === cust.id);
                const isSelected = selectedCustomer?.id === cust.id;
                return (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setErrorMsg(null);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2 text-left text-xs rounded transition-colors',
                      isSelected ? 'bg-emerald-950/40 border border-emerald-500/40' : 'hover:bg-slate-800/60',
                      isConflict && 'opacity-70 bg-rose-950/20',
                    )}
                  >
                    <div>
                      <p className="font-semibold text-slate-200">{cust.fullName}</p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {cust.customerCode} • +91 {cust.phone}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {cust.isKycVerified ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-950/40 text-emerald-300 border-emerald-600/40">
                          <BadgeCheck className="h-3 w-3 mr-1 text-emerald-400" />
                          KYC
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-950/40 text-amber-300 border-amber-600/40">
                          Non-KYC
                        </Badge>
                      )}
                      {isConflict && (
                        <Badge variant="destructive" className="text-[10px]">
                          ADR-13 Limit
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Customer Verification Card */}
        {selectedCustomer && (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              {t('replacementCustomer')}
            </span>
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold text-slate-100">{selectedCustomer.fullName}</p>
                <p className="font-mono text-[11px] text-slate-400">
                  {selectedCustomer.customerCode} • +91 {selectedCustomer.phone}
                </p>
              </div>
              {isKycVerified ? (
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t('kycVerifiedTag')}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Not KYC Verified</span>
                </div>
              )}
            </div>

            {/* Validation Alerts */}
            {!isKycVerified && (
              <p className="text-[11px] text-amber-300 font-medium">
                {t('kycNotVerifiedError')}
              </p>
            )}
            {conflictTicket && (
              <p className="text-[11px] text-rose-400 font-medium">
                {t('adr13SchemeConflictError', { ticket: conflictTicket.ticketNumber })}
              </p>
            )}
          </div>
        )}

        {/* Reason / Remarks Textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">
            {t('substituteReasonLabel')}
          </label>
          <Textarea
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
            placeholder={t('substituteReasonPlaceholder')}
            rows={2}
            className="text-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
          />
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={substituteMutation.isPending}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => substituteMutation.mutate()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs gap-1.5"
          >
            {substituteMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('substituting')}</span>
              </>
            ) : (
              <>
                <UserCheck className="h-3.5 w-3.5" />
                <span>{t('confirmSubstitution')}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
