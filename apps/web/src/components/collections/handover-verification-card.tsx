'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  Receipt,
  User,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRupee } from '@/lib/currency';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/api-client';

export interface PendingHandoverCollectionItem {
  paymentId: string;
  receiptNumber: string;
  amount: number;
  customerName: string;
  customerCode: string;
  groupCode: string;
  ticketNumber: number;
  installmentMonth: number;
  collectedAt: string;
}

export interface AgentPendingBatch {
  collectorUserId: string;
  collectorName: string;
  collectorPhone?: string;
  collections: PendingHandoverCollectionItem[];
}

export interface HandoverAckResult {
  success: boolean;
  message: string;
  collectorUserId: string;
  collectorName: string;
  acknowledgedByUserId: string;
  acknowledgedAmount: number;
  totalPaymentsAcknowledged: number;
  acknowledgedAt: string;
  notes?: string;
  voucherNumber: string;
}

interface HandoverVerificationCardProps {
  batch: AgentPendingBatch;
  currentUser: { id: string; name?: string; roles?: string[] } | null;
  onAcknowledged: (result: HandoverAckResult) => void;
}

const DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const;

export function HandoverVerificationCard({
  batch,
  currentUser,
  onAcknowledged,
}: HandoverVerificationCardProps) {
  const t = useTranslations('collections');
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState('');
  const [showReceipts, setShowReceipts] = useState(false);
  const [counts, setCounts] = useState<Record<number, number>>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const expectedTotal = useMemo(
    () => batch.collections.reduce((sum, item) => sum + item.amount, 0),
    [batch.collections],
  );

  const countedTotal = useMemo(
    () => DENOMINATIONS.reduce((sum, d) => sum + (counts[d] || 0) * d, 0),
    [counts],
  );

  const isExactMatch = countedTotal === expectedTotal && countedTotal > 0;
  const variance = countedTotal - expectedTotal;
  const isMaker = Boolean(currentUser && currentUser.id === batch.collectorUserId);

  const handleDenomChange = (denom: number, val: string) => {
    const parsed = parseInt(val, 10);
    setCounts((prev) => ({ ...prev, [denom]: isNaN(parsed) || parsed < 0 ? 0 : parsed }));
    setErrorMessage(null);
  };

  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      if (isMaker) throw new Error(t('makerCheckerHandoverAlert'));
      if (!isExactMatch) {
        throw new Error(`Discrepancy: Physically counted (₹${countedTotal}) != batch receipts (₹${expectedTotal})`);
      }
      const denomSummary = DENOMINATIONS.filter((d) => counts[d] > 0)
        .map((d) => `₹${d}x${counts[d]}=₹${d * counts[d]}`)
        .join(', ');
      const finalNotes = notes.trim()
        ? `${notes.trim()} | Denominations: ${denomSummary}`
        : `Denominations: ${denomSummary}`;

      const baseUrl = getApiBaseUrl();
      const token = getStoredAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/collections/cash-handover/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          collectorUserId: batch.collectorUserId,
          acknowledgedAmount: countedTotal,
          paymentIds: batch.collections.map((c) => c.paymentId),
          notes: finalNotes,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || 'Failed to acknowledge cash handover');
      return body.data || body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const voucherNum = `KC-VAULT-${dateStr}-${batch.collectorName.slice(0, 3).toUpperCase()}`;

      onAcknowledged({
        success: true,
        message: data.message || t('settlementSuccessful', { amount: formatRupee(countedTotal) }),
        collectorUserId: batch.collectorUserId,
        collectorName: batch.collectorName,
        acknowledgedByUserId: currentUser?.id || 'checker',
        acknowledgedAmount: countedTotal,
        totalPaymentsAcknowledged: batch.collections.length,
        acknowledgedAt: new Date().toISOString(),
        notes: data.notes || notes,
        voucherNumber: voucherNum,
      });
    },
    onError: (err: any) => setErrorMessage(err.message || 'Error acknowledging cash into vault'),
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <User className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-100">{batch.collectorName}</h3>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-400">
                {batch.collectorUserId.slice(0, 8)}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {t('receiptsCountLabel')}: <span className="text-slate-200 font-semibold">{batch.collections.length}</span>
              {batch.collectorPhone && ` • ${batch.collectorPhone}`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('systemBatchTotal')}</span>
          <p className="text-2xl font-black text-emerald-400 font-mono tracking-tight">{formatRupee(expectedTotal)}</p>
        </div>
      </div>

      {isMaker && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="leading-relaxed">{t('makerCheckerHandoverAlert')}</p>
        </div>
      )}

      {/* Denominations */}
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Banknote className="h-4 w-4 text-emerald-400" />
            <span>{t('denominationCounterTitle')}</span>
          </div>
          <span className="text-[11px] text-slate-400">
            {t('totalPhysicalCashCounted')}: <strong className="text-slate-200 font-mono text-sm">{formatRupee(countedTotal)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {DENOMINATIONS.map((d) => (
            <div key={d} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-center space-y-1">
              <span className="text-[11px] font-mono font-bold text-slate-400">₹{d}</span>
              <Input
                type="number"
                min="0"
                value={counts[d] || ''}
                placeholder="0"
                onChange={(e) => handleDenomChange(d, e.target.value)}
                className="h-8 text-center text-xs font-mono font-bold bg-slate-950 border-slate-700 text-slate-100"
              />
              <span className="block text-[10px] font-mono text-slate-400">₹{((counts[d] || 0) * d).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>

        <div className="pt-1">
          {isExactMatch ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{t('denominationMatch')}</span>
            </div>
          ) : countedTotal > 0 ? (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>
                {t('denominationMismatch', {
                  counted: countedTotal.toLocaleString('en-IN'),
                  expected: expectedTotal.toLocaleString('en-IN'),
                })}
                {variance !== 0 && ` (${variance > 0 ? `+₹${variance}` : `-₹${Math.abs(variance)}`})`}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Receipts Drawer */}
      <div className="border-t border-slate-800/80 pt-2">
        <button
          type="button"
          onClick={() => setShowReceipts((prev) => !prev)}
          className="flex w-full items-center justify-between text-xs font-semibold text-slate-300 hover:text-slate-100 transition-colors py-1"
        >
          <span className="flex items-center gap-1.5">
            <Receipt className="h-4 w-4 text-slate-400" />
            {t('handoverTally')} ({batch.collections.length} {t('receiptsCountLabel')})
          </span>
          {showReceipts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showReceipts && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-800 max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
            <table className="min-w-[520px] w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-[11px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="p-2 whitespace-nowrap">{t('tableReceiptNumber')}</th>
                  <th className="p-2 whitespace-nowrap">{t('tableCustomer')}</th>
                  <th className="p-2 whitespace-nowrap">{t('tableSchemeTicket')}</th>
                  <th className="p-2 whitespace-nowrap">{t('tableMonth')}</th>
                  <th className="p-2 text-right whitespace-nowrap">{t('tableAmount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-mono text-[11px]">
                {batch.collections.map((c) => (
                  <tr key={c.paymentId} className="hover:bg-slate-800/30">
                    <td className="p-2 text-emerald-400 font-bold whitespace-nowrap">{c.receiptNumber}</td>
                    <td className="p-2 font-sans text-slate-200 whitespace-nowrap">
                      {c.customerName} <span className="text-slate-400 text-[10px]">({c.customerCode})</span>
                    </td>
                    <td className="p-2 whitespace-nowrap">{c.groupCode} T#{c.ticketNumber}</td>
                    <td className="p-2 whitespace-nowrap">M#{c.installmentMonth}</td>
                    <td className="p-2 text-right font-bold text-slate-100 whitespace-nowrap">{formatRupee(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">{t('cashierNotesLabel')}</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('handoverNotesPlaceholder')}
          className="h-9 text-xs bg-slate-950 border-slate-800 text-slate-200"
        />
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-1">
        <Button
          type="button"
          disabled={!isExactMatch || isMaker || acknowledgeMutation.isPending}
          onClick={() => acknowledgeMutation.mutate()}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-5 h-9 shadow-lg shadow-emerald-950/40 disabled:opacity-40 shrink-0 whitespace-nowrap justify-center"
        >
          {acknowledgeMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('acknowledgingVault')}
            </>
          ) : isMaker ? (
            <>
              <Lock className="mr-2 h-4 w-4" />
              {t('makerCheckerClaimAlert')}
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {t('acknowledgeVaultDepositBtn')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
