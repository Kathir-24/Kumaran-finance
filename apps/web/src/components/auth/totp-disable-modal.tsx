'use client';

// ==============================================================================
// Kumaran Chits — In-App TOTP 2FA Deactivation Modal (Task 2.3)
// Requires current password verification to disable 2FA.
// Connects live to:
//   POST /api/v1/auth/totp/disable
// ==============================================================================

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ShieldAlert,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { apiClient, unwrapApiResponse, getErrorMessage, KumaranApiError } from '../../lib/api-client.ts';
import { useAuthStore } from '../../stores/auth-store.ts';

export interface TotpDisableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function TotpDisableModal({
  isOpen,
  onClose,
  onSuccess,
}: TotpDisableModalProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleClose = () => {
    setPassword('');
    setShowPassword(false);
    setErrorMessage(null);
    setIsSuccess(false);
    onClose();
  };

  const handleDisableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage(t('passwordRequired'));
      return;
    }

    setIsDisabling(true);
    setErrorMessage(null);

    try {
      await unwrapApiResponse(
        apiClient.POST('/api/v1/auth/totp/disable', {
          body: {
            password,
          },
        })
      );

      // Successfully disabled TOTP in database: update client auth state
      useAuthStore.getState().updateUser({ isTotpEnabled: false });
      setIsSuccess(true);
      onSuccess?.();

      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err: unknown) {
      if (err instanceof KumaranApiError && (err.statusCode === 401 || err.statusCode === 400)) {
        setErrorMessage(t('wrongPassword'));
      } else {
        setErrorMessage(getErrorMessage(err, t('wrongPassword')));
      }
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 p-6 sm:p-7">
        <DialogHeader className="text-left space-y-1">
          <div className="flex items-center space-x-2 text-rose-400">
            <ShieldAlert className="h-5 w-5" />
            <DialogTitle className="text-xl font-bold text-slate-100">
              {t('disable2faTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-slate-400">
            {t('disable2faSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-100">
              {t('totpDisabledSuccess')}
            </h3>
          </div>
        ) : (
          <form onSubmit={handleDisableTotp} className="space-y-5 pt-2">
            {/* Security Warning Notice */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-300 text-xs leading-relaxed flex items-start space-x-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span>{t('disable2faWarning')}</span>
            </div>

            {errorMessage && (
              <Alert variant="destructive" className="bg-rose-950/50 border-rose-800/80 text-rose-200">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
              </Alert>
            )}

            {/* Password input */}
            <div className="space-y-1.5">
              <label
                htmlFor="totp-disable-password"
                className="text-xs font-semibold uppercase tracking-wider text-slate-400 block"
              >
                {t('disable2faPasswordLabel')}
              </label>
              <div className="relative">
                <Input
                  id="totp-disable-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('disable2faPasswordPlaceholder')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMessage(null);
                  }}
                  disabled={isDisabling}
                  className="bg-slate-950/80 border-slate-700 text-slate-100 text-sm h-10 pr-10 focus:border-rose-500 focus:ring-rose-500/20"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isDisabling}
                className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-9"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isDisabling || !password.trim()}
                className="bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs h-9 px-4 shadow-lg shadow-rose-950/40"
              >
                {isDisabling ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    <span>{t('disablingTotp')}</span>
                  </>
                ) : (
                  <span>{t('disable2faConfirm')}</span>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
