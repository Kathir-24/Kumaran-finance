'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, UserCheck, ArrowRight, Layers, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface IntakeSuccessDialogProps {
  isOpen: boolean;
  customerId: string;
  customerCode: string;
  customerName: string;
  phone: string;
  onClose: () => void;
  onRegisterAnother: () => void;
}

export function IntakeSuccessDialog({
  isOpen,
  customerId,
  customerCode,
  customerName,
  phone,
  onClose,
  onRegisterAnother,
}: IntakeSuccessDialogProps) {
  const t = useTranslations('customers');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border-slate-800 bg-slate-900 text-slate-100 p-6">
        <DialogHeader className="text-center sm:text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-100">
            {t('successTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 max-w-sm mx-auto">
            {t('successDesc', { code: customerCode })}
          </DialogDescription>
        </DialogHeader>

        {/* Customer Badge Details Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {t('code')}
            </span>
            <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
              {customerCode}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('colName')}</span>
            <span className="text-xs font-semibold text-slate-200">{customerName}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{t('phone')}</span>
            <span className="font-mono text-xs text-slate-300">+91 {phone}</span>
          </div>

          <div className="pt-2 border-t border-slate-850 flex items-center gap-1.5 text-[11px] text-amber-400/90">
            <UserCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{t('adr16Notice')}</span>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
            asChild
          >
            <Link href={`/customers/${customerId}`}>
              <span>{t('btnViewProfile')}</span>
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>

          <Button
            variant="outline"
            className="w-full border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs"
            asChild
          >
            <Link href="/schemes">
              <Layers className="mr-1.5 h-3.5 w-3.5 text-indigo-400" />
              <span>{t('btnAssignTicket')}</span>
            </Link>
          </Button>

          <Button
            variant="ghost"
            onClick={onRegisterAnother}
            className="w-full text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            <span>{t('btnRegisterAnother')}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
