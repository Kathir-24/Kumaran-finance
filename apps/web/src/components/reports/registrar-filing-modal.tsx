'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Calendar,
  FileCheck2,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';

interface RegistrarFilingModalProps {
  isOpen: boolean;
  onClose: () => void;
  auctionId: string;
  groupCode: string;
  installmentMonth: number;
  onSuccess: () => void;
}

export function RegistrarFilingModal({
  isOpen,
  onClose,
  auctionId,
  groupCode,
  installmentMonth,
  onSuccess,
}: RegistrarFilingModalProps) {
  const t = useTranslations('reports.minutes');

  const [filingReference, setFilingReference] = React.useState('');
  const [filedDate, setFiledDate] = React.useState<string>(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setFilingReference('');
      setFiledDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!filingReference.trim()) {
      setErrorMsg('Government challan or acknowledgement reference number is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await unwrapApiResponse(
        apiClient.PATCH('/api/v1/auctions/{auctionId}/mark-filed-with-registrar', {
          params: { path: { auctionId } },
          body: {
            filingReference: filingReference.trim(),
            filedDate: new Date(filedDate).toISOString(),
            notes: notes.trim() || undefined,
          },
        })
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Failed to record Registrar filing'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-500/20 p-2.5 text-purple-400">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {t('recordModalTitle')}
              </h2>
              <p className="text-xs text-slate-400">
                {groupCode} • {t('recordModalDesc', { month: installmentMonth })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Government Challan / Acknowledgement Reference */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('filingRefLabel')} <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={filingReference}
              onChange={(e) => setFilingReference(e.target.value)}
              placeholder={t('filingRefPlaceholder')}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Filing Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('filedDateLabel')} <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={filedDate}
                onChange={(e) => setFiledDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <Calendar className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
            </div>
          </div>

          {/* Staff Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {t('notesLabel')}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-purple-600 hover:bg-purple-500 text-white gap-2 font-medium"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? t('recording') : t('recordSubmit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
