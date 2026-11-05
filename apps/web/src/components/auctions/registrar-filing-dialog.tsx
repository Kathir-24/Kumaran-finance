'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  FileCheck2,
  X,
  FileText,
  Calendar,
  Building2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface MarkFiledPayload {
  filingReference?: string;
  filedDate?: string;
  notes?: string;
}

interface RegistrarFilingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  auctionId: string;
  groupCode: string;
  installmentMonth: number;
  onMarkFiled: (payload: MarkFiledPayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function RegistrarFilingDialog({
  isOpen,
  onClose,
  auctionId,
  groupCode,
  installmentMonth,
  onMarkFiled,
  isSubmitting = false,
}: RegistrarFilingDialogProps) {
  const t = useTranslations('auctions');

  const [filingReference, setFilingReference] = React.useState('');
  const [filedDate, setFiledDate] = React.useState<string>(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      await onMarkFiled({
        filingReference: filingReference.trim() || undefined,
        filedDate: new Date(filedDate).toISOString(),
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to record Registrar filing');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-purple-500/20 p-2 text-purple-400">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('recordFilingAction')}</h2>
              <p className="text-[11px] text-slate-400">
                Scheme: {groupCode} • Month {installmentMonth} Form XVII Minutes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-md border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Government Challan / Acknowledgement Reference */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('filingReferenceLabel')}
            </label>
            <input
              type="text"
              value={filingReference}
              onChange={(e) => setFilingReference(e.target.value)}
              placeholder={t('filingReferencePlaceholder')}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-purple-500/60 focus:outline-none"
            />
            <p className="text-[10px] text-slate-500">
              Official Challan No, Registrar Seal Reference, or Acknowledgement Slip Number.
            </p>
          </div>

          {/* Filing Date at Registrar Office */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('filedDateLabel')}
            </label>
            <input
              type="date"
              value={filedDate}
              onChange={(e) => setFiledDate(e.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-purple-500/60 focus:outline-none"
            />
          </div>

          {/* Staff Remarks / Filing Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('filingNotesLabel')}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('filingNotesPlaceholder')}
              className="w-full rounded-md border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-purple-500/60 focus:outline-none resize-none"
            />
          </div>

          {/* Dialog Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-slate-700 bg-slate-800 text-slate-300 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs h-9 px-4"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span>{t('recordingFiling')}</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                  <span>{t('recordFilingAction')}</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
