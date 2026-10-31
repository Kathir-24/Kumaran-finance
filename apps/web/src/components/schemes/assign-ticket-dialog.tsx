'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Info, Loader2, Search, UserCheck } from 'lucide-react';
import { parseWholeRupees } from '@kumaran/api-client';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export interface AssignedTicketRef {
  ticketNumber: number;
  customerId: string;
  customerName?: string;
}

export interface AssignTicketDialogProps {
  chitGroupId: string;
  chitGroupName: string;
  totalTickets: number;
  assignedTickets: AssignedTicketRef[];
  initialTicketNumber?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CustomerSearchResult {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
}

export function AssignTicketDialog({
  chitGroupId,
  chitGroupName,
  totalTickets,
  assignedTickets,
  initialTicketNumber,
  isOpen,
  onClose,
  onSuccess,
}: AssignTicketDialogProps) {
  const t = useTranslations('schemes');
  const queryClient = useQueryClient();

  const [selectedSlot, setSelectedSlot] = React.useState<number>(1);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerSearchResult | null>(null);
  const [openingBalance, setOpeningBalance] = React.useState('0');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Available vacant ticket slots
  const vacantSlots = React.useMemo(() => {
    const assignedSet = new Set(assignedTickets.map((t) => t.ticketNumber));
    const slots: number[] = [];
    for (let i = 1; i <= totalTickets; i++) {
      if (!assignedSet.has(i) || i === initialTicketNumber) {
        slots.push(i);
      }
    }
    return slots;
  }, [assignedTickets, totalTickets, initialTicketNumber]);

  // Sync initial slot when opening
  React.useEffect(() => {
    if (initialTicketNumber && initialTicketNumber >= 1) {
      setSelectedSlot(initialTicketNumber);
    } else if (vacantSlots.length > 0) {
      setSelectedSlot(vacantSlots[0]);
    }
    setSearchTerm('');
    setSelectedCustomer(null);
    setOpeningBalance('0');
    setErrorMsg(null);
  }, [initialTicketNumber, isOpen, vacantSlots]);

  // Query customers with debounced search term
  const { data: customerResults, isLoading: isSearching } = useQuery({
    queryKey: queryKeys.customers.list(searchTerm),
    queryFn: async () => {
      if (!searchTerm || searchTerm.trim().length < 2) return [];
      const res = await unwrapApiResponse<{ data: CustomerSearchResult[] }>(
        apiClient.GET('/api/v1/customers', {
          params: { query: { search: searchTerm.trim(), limit: 8 } },
        })
      );
      return res.data || [];
    },
    enabled: isOpen && searchTerm.trim().length >= 2,
    staleTime: 10_000,
  });

  // Guardrail 7 / ADR-13: Duplicate ticket check
  const duplicateTicketInfo = React.useMemo(() => {
    if (!selectedCustomer) return null;
    return assignedTickets.find((t) => t.customerId === selectedCustomer.id);
  }, [selectedCustomer, assignedTickets]);

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error('Please select a subscriber');
      if (duplicateTicketInfo) {
        throw new Error(
          t('adr13DuplicateAlert', { ticket: duplicateTicketInfo.ticketNumber })
        );
      }

      const bal = parseWholeRupees(openingBalance);

      return unwrapApiResponse(
        apiClient.POST('/api/v1/chits/{id}/tickets/assign', {
          params: { path: { id: chitGroupId } },
          body: {
            ticketNumber: selectedSlot,
            customerId: selectedCustomer.id,
            openingBalance: bal,
          },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.detail(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.roster(chitGroupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemes.list() });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      if (err instanceof KumaranApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err.message || 'Failed to assign ticket slot');
      }
    },
  });

  const isCompanyRepSlot = selectedSlot === 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100">
            {t('assignModalTitle', { num: selectedSlot })}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {chitGroupName} — {t('assignModalDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Error Banner */}
          {errorMsg && (
            <Alert variant="destructive" className="py-2.5">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-bold">Error</AlertTitle>
              <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
            </Alert>
          )}

          {/* Slot Selection */}
          <div className="grid grid-cols-3 gap-3 items-center">
            <label className="text-xs font-semibold text-slate-300">
              {t('selectSlotLabel')}
            </label>
            <div className="col-span-2">
              <select
                value={selectedSlot}
                onChange={(e) => {
                  setSelectedSlot(Number(e.target.value));
                  setErrorMsg(null);
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {vacantSlots.map((num) => (
                  <option key={num} value={num}>
                    {t('ticketSlot', { num })} {num === 1 ? `(${t('companyRepBadge')})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Guardrail 5: Slot #1 Company Rep Notice */}
          {isCompanyRepSlot && (
            <div className="flex items-start gap-2.5 rounded-lg border border-indigo-500/30 bg-indigo-950/30 p-2.5 text-xs text-indigo-300">
              <Info className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
              <p>{t('companyRepNotice')}</p>
            </div>
          )}

          {/* Customer Search Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('searchCustomerLabel')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder={t('searchCustomerPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-2.5 h-3.5 w-3.5 animate-spin text-emerald-400" />
              )}
            </div>

            {/* Search Results Dropdown List */}
            {customerResults && customerResults.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-1 shadow-lg divide-y divide-slate-800">
                {customerResults.map((cust) => {
                  const alreadyAssigned = assignedTickets.find((t) => t.customerId === cust.id);
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
                        'w-full flex items-center justify-between p-2 text-left text-xs transition-colors rounded hover:bg-slate-800/70',
                        isSelected && 'bg-emerald-950/40 border border-emerald-500/40',
                        alreadyAssigned && 'opacity-70 bg-rose-950/20'
                      )}
                    >
                      <div>
                        <p className="font-semibold text-slate-200">{cust.fullName}</p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {cust.customerCode} • +91 {cust.phone}
                        </p>
                      </div>
                      {alreadyAssigned ? (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                          Ticket #{alreadyAssigned.ticketNumber}
                        </span>
                      ) : (
                        isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Subscriber Details Card */}
          {selectedCustomer && (
            <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                {t('selectedCustomer')}
              </span>
              <p className="font-bold text-slate-100 text-sm">{selectedCustomer.fullName}</p>
              <p className="font-mono text-slate-300">
                {selectedCustomer.customerCode} • +91 {selectedCustomer.phone}
              </p>
            </div>
          )}

          {/* ADR-13 Violation Warning Banner */}
          {duplicateTicketInfo && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-bold">Guardrail 7 / ADR-13 Invariant Violation</p>
                <p className="mt-0.5">
                  {t('adr13DuplicateAlert', { ticket: duplicateTicketInfo.ticketNumber })}
                </p>
              </div>
            </div>
          )}

          {/* Opening Balance (Whole Rupee Math) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('openingBalanceLabel')}
            </label>
            <Input
              type="number"
              min="0"
              step="1"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="text-xs font-mono border-slate-700 bg-slate-950 text-slate-100"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={assignMutation.isPending}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={
              !selectedCustomer ||
              !!duplicateTicketInfo ||
              assignMutation.isPending ||
              vacantSlots.length === 0
            }
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            {assignMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('assigning')}
              </>
            ) : (
              t('confirmAssignment')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
