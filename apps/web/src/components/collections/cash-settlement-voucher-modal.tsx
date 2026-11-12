'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Printer,
  CheckCircle2,
  Building,
  User,
  ShieldCheck,
  Calendar,
  Banknote,
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
import { formatRupee } from '@/lib/currency';
import { formatDate } from '@/lib/date-utils';
import type { HandoverAckResult } from './handover-verification-card';

interface CashSettlementVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  voucher: HandoverAckResult | null;
}

export function CashSettlementVoucherModal({
  isOpen,
  onClose,
  voucher,
}: CashSettlementVoucherModalProps) {
  const t = useTranslations('collections');

  if (!voucher) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-slate-800 bg-slate-900 text-slate-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="bg-slate-950 p-5 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <DialogTitle className="text-base font-bold text-slate-100">
                {t('settlementVoucherTitle')}
              </DialogTitle>
            </div>
            <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-400">
              {voucher.voucherNumber}
            </span>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {t('settlementVoucherSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Printable Voucher Paper */}
        <div id="settlement-voucher-paper" className="p-6 space-y-5 bg-slate-900">
          {/* Header Banner */}
          <div className="text-center border-b border-slate-800 pb-4 space-y-1">
            <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold tracking-wider text-sm">
              <Building className="h-4 w-4" />
              <span>KUMARAN FINANCE • CHIT OPERATIONS</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Head Office: Perundurai, Erode District, Tamil Nadu — 638052
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold pt-1">
              {t('settlementVoucherTitle')} (Dual-Control Vault Custody Transfer)
            </p>
          </div>

          {/* Key Info Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-emerald-400" />
                {t('depositTimestamp')}
              </span>
              <p className="font-mono text-slate-200 font-semibold">{formatDate(voucher.acknowledgedAt)}</p>
              <p className="text-[10px] text-slate-400">
                {t('receiptsCountLabel')}: <strong className="text-slate-200">{voucher.totalPaymentsAcknowledged}</strong>
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-right space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-end gap-1">
                <Banknote className="h-3 w-3 text-emerald-400" />
                {t('kpiCashInVault')}
              </span>
              <p className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                {formatRupee(voucher.acknowledgedAmount)}
              </p>
              <p className="text-[10px] text-emerald-300 font-medium">Status: ACKNOWLEDGED</p>
            </div>
          </div>

          {/* Custody Transfer Parties */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <User className="h-3 w-3 text-emerald-400" />
                {t('collectorSignLabel')}
              </span>
              <p className="font-bold text-slate-200">{voucher.collectorName}</p>
              <p className="text-[10px] font-mono text-slate-400">{voucher.collectorUserId}</p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                {t('acknowledgerSignLabel')}
              </span>
              <p className="font-bold text-slate-200">Perundurai Desk Cashier</p>
              <p className="text-[10px] font-mono text-slate-400">{voucher.acknowledgedByUserId}</p>
            </div>
          </div>

          {/* Notes & Denominations Breakdown */}
          {voucher.notes && (
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-3 text-xs space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">
                {t('cashierNotesLabel')}
              </span>
              <p className="font-mono text-[11px] text-slate-300 leading-relaxed">{voucher.notes}</p>
            </div>
          )}

          {/* Dual Signature Blocks */}
          <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-800/80 text-center">
            <div className="space-y-4">
              <div className="h-10 border-b border-dashed border-slate-700 flex items-end justify-center pb-1">
                <span className="text-[10px] font-mono text-slate-400">Signature / Seal</span>
              </div>
              <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {t('collectorSignLabel')}
              </p>
              <p className="text-[10px] text-slate-400">Physical Cash Surrendered</p>
            </div>

            <div className="space-y-4">
              <div className="h-10 border-b border-dashed border-slate-700 flex items-end justify-center pb-1">
                <span className="text-[10px] font-mono text-slate-400">Signature / Stamp</span>
              </div>
              <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {t('acknowledgerSignLabel')}
              </p>
              <p className="text-[10px] text-slate-400">Vault Custody Acknowledged</p>
            </div>
          </div>
        </div>

        <DialogFooter className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-800 text-slate-300 hover:bg-slate-800 text-xs"
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            {t('printVoucherBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
