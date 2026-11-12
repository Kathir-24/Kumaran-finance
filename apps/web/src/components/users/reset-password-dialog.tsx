'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { apiClient, unwrapApiResponse, getErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { UserSummary } from './edit-roles-dialog';

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('users');
  const [tempPass, setTempPass] = React.useState('');
  const [issuedPass, setIssuedPass] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTempPass('');
      setIssuedPass(null);
      setCopied(false);
      setErrorMsg(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      return unwrapApiResponse<{ success: boolean; message: string; temporaryPassword: string }>(
        apiClient.POST('/api/v1/users/{id}/reset-password', {
          params: { path: { id: user.id } },
          body: { temporaryPassword: tempPass.trim() || undefined },
        })
      );
    },
    onSuccess: (data) => {
      setIssuedPass(data?.temporaryPassword || null);
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, 'Failed to reset password'));
    },
  });

  const handleCopy = () => {
    if (!issuedPass) return;
    navigator.clipboard.writeText(issuedPass);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-5 w-5 text-amber-400" />
            <span>{t('resetPasswordTitle')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {t('resetPasswordDesc')}
          </DialogDescription>
        </DialogHeader>

        {issuedPass ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-center space-y-3">
              <h4 className="text-xs font-bold text-emerald-400">{t('resetSuccessTitle')}</h4>
              <p className="text-[11px] text-slate-400">{t('resetSuccessDesc')}</p>
              <div className="flex items-center justify-center gap-2 font-mono text-sm font-bold bg-slate-950 border border-slate-700 py-2 px-3 rounded-lg text-amber-300">
                <span>{issuedPass}</span>
                <button type="button" onClick={handleCopy} className="p-1 hover:text-emerald-400 text-slate-400">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" onClick={() => onOpenChange(false)} className="w-full text-xs bg-slate-800 hover:bg-slate-700">
                {t('close')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {errorMsg && (
              <Alert variant="destructive" className="border-rose-500/40 bg-rose-950/20 text-rose-300">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">{t('tempPasswordLabel')}</label>
              <Input
                type="text"
                value={tempPass}
                onChange={(e) => setTempPass(e.target.value)}
                placeholder={t('tempPasswordPlaceholder')}
                className="font-mono text-xs bg-slate-950 border-slate-700 text-slate-100 focus:border-amber-500"
              />
              <p className="text-[11px] text-slate-500">{t('tempPasswordHelp')}</p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs border-slate-700 bg-slate-900">
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              >
                {mutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {mutation.isPending ? t('resetting') : t('resetPasswordBtn')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
