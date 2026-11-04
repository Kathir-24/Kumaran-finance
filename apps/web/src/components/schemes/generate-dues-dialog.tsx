'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Layers,
  Coins,
  Receipt,
} from 'lucide-react';
import { formatRupee } from '@kumaran/api-client';
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

export interface GenerateDuesDialogProps {
  chitGroupId: string;
  groupCode: string;
  month: number;
  durationMonths: number;
  baseInstallment: number;
  startDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GenerateDuesDialog({
  chitGroupId,
  groupCode,
  month,
  durationMonths,
  baseInstallment,
  startDate,
  isOpen,
  onClose,
  onSuccess,
}: GenerateDuesDialogProps) {
  const t = useTranslations('installments');
  const queryClient = useQueryClient();

  const [cycleStartDate, setCycleStartDate] = React.useState('');
  const [cycleEndDate, setCycleEndDate] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Initialize default cycle dates based on scheme startDate and month
  React.useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);

    const baseDate = startDate ? new Date(startDate) : new Date();
    // Month m start = baseDate + (m - 1) months
    const start = new Date(baseDate);
    start.setMonth(start.getMonth() + (month - 1));
    const startIso = start.toISOString().split('T')[0];
    setCycleStartDate(startIso);

    // Month m end = start + 1 month
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const endIso = end.toISOString().split('T')[0];
    setCycleEndDate(endIso);
    setDueDate(endIso);
  }, [isOpen, startDate, month]);

  // For months 2..N, check if auction is recorded and finalized
  const { data: auctions, isLoading: isAuctionsLoading } = useQuery({
    queryKey: queryKeys.auctions.list(chitGroupId),
    queryFn: async () => {
      return unwrapApiResponse<any[]>(
        apiClient.GET('/api/v1/auctions/group/{chitGroupId}', {
          params: { path: { chitGroupId } },
        })
      );
    },
    enabled: isOpen && month > 1,
    staleTime: 30 * 1000,
  });

  const matchingAuction = React.useMemo(() => {
    if (month === 1 || !auctions || !Array.isArray(auctions)) return null;
    return (
      auctions.find(
        (a) =>
          (a.installmentMonth === month || a.installmentMonth === month - 1) &&
          a.dividendPerTicket != null
      ) || null
    );
  }, [auctions, month]);

  const dividendPerTicket = React.useMemo(() => {
    if (month === 1) return 0;
    if (!matchingAuction || matchingAuction.dividendPerTicket == null) return null;
    return Number(matchingAuction.dividendPerTicket);
  }, [month, matchingAuction]);

  const netPayable = React.useMemo(() => {
    if (dividendPerTicket === null) return null;
    return Math.max(0, baseInstallment - dividendPerTicket);
  }, [baseInstallment, dividendPerTicket]);

  const isMonth1 = month === 1;
  const isAuctionFinalized = isMonth1 || (matchingAuction != null && dividendPerTicket !== null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      return unwrapApiResponse<any>(
        apiClient.POST('/api/v1/installments/group/{chitGroupId}/month/{month}/generate', {
          params: { path: { chitGroupId, month } },
          body: {
            cycleStartDate: cycleStartDate ? new Date(cycleStartDate).toISOString() : undefined,
            cycleEndDate: cycleEndDate ? new Date(cycleEndDate).toISOString() : undefined,
            dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          },
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.installments.groupMonth(chitGroupId, month),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.schemes.detail(chitGroupId),
      });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err instanceof KumaranApiError
          ? err.message
          : err?.response?.data?.message || err?.message || 'Failed to generate monthly dues';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !generateMutation.isPending && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-950 text-slate-100 sm:rounded-2xl p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Coins className="h-4 w-4" />
            <span>{groupCode} • Month {month} of {durationMonths}</span>
          </div>
          <DialogTitle className="text-xl font-bold text-white">
            {t('generateDuesTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {t('generateDuesSubtitle', { total: durationMonths })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Error Alert */}
          {errorMessage && (
            <Alert variant="destructive" className="border-rose-800 bg-rose-950/40 text-rose-200">
              <AlertCircle className="h-4 w-4 text-rose-400" />
              <AlertTitle className="text-xs font-semibold">Generation Error</AlertTitle>
              <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Month 1 Rule Notice vs Auction Notice */}
          {isMonth1 ? (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
                <Info className="h-4 w-4" />
                <span>Guardrail 5: Company Representative Pool</span>
              </div>
              <p className="text-xs text-indigo-200/90 leading-relaxed">
                {t('generateDuesMonth1Notice', { amount: formatRupee(baseInstallment) })}
              </p>
            </div>
          ) : isAuctionsLoading ? (
            <div className="flex items-center justify-center p-6 text-xs text-slate-400 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span>Verifying auction finalization...</span>
            </div>
          ) : isAuctionFinalized ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Finalized Auction Recorded</span>
              </div>
              <p className="text-xs text-emerald-200/90 leading-relaxed">
                {t('generateDuesAuctionFinalized', {
                  discount: formatRupee(matchingAuction.bidDiscount || 0),
                  commission: formatRupee(matchingAuction.foremanCommissionAmount || 0),
                  dividend: formatRupee(dividendPerTicket || 0),
                })}
              </p>
            </div>
          ) : (
            <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <AlertTitle className="text-xs font-semibold">Auction Required</AlertTitle>
              <AlertDescription className="text-xs">
                {t('generateDuesNoAuctionWarning', { m: month })}
              </AlertDescription>
            </Alert>
          )}

          {/* Financial Breakdown Card */}
          <div className="grid grid-cols-3 gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-center">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                {t('summaryGrossBase')}
              </span>
              <span className="text-sm font-bold text-white font-mono">
                {formatRupee(baseInstallment)}
              </span>
            </div>
            <div className="space-y-1 border-x border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                {t('summaryDividend')}
              </span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {dividendPerTicket !== null ? formatRupee(dividendPerTicket) : '—'}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                {t('summaryNetDue')}
              </span>
              <span className="text-sm font-bold text-cyan-400 font-mono">
                {netPayable !== null ? formatRupee(netPayable) : '—'}
              </span>
            </div>
          </div>

          {/* Cycle Dates Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label htmlFor="cycleStartDate" className="text-xs text-slate-300 font-medium">
                {t('cycleStartDateLabel')}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <Input
                  id="cycleStartDate"
                  type="date"
                  value={cycleStartDate}
                  onChange={(e) => setCycleStartDate(e.target.value)}
                  className="pl-9 h-9 text-xs bg-slate-900 border-slate-800 text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dueDate" className="text-xs text-slate-300 font-medium">
                {t('dueDateLabel')}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setCycleEndDate(e.target.value);
                  }}
                  className="pl-9 h-9 text-xs bg-slate-900 border-slate-800 text-white"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={generateMutation.isPending}
            className="text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="default"
            disabled={!isAuctionFinalized || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
            className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                <span>{t('generatingDues')}</span>
              </>
            ) : (
              <span>{t('generateDuesConfirm')}</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
