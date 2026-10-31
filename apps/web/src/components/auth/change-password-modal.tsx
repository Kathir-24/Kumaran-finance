'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertTriangle, X, ShieldCheck } from 'lucide-react';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangePasswordModal({ isOpen, onClose, onSuccess }: ChangePasswordModalProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const logout = useAuthStore((s) => s.logout);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrorMessage(null);
    setIsSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Validation
    if (!currentPassword) {
      setErrorMessage(t('passwordRequired'));
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage(t('newPasswordMinLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage(t('passwordMismatch'));
      return;
    }

    setIsLoading(true);

    try {
      // 2. Call backend: POST /api/v1/auth/change-password
      await unwrapApiResponse(
        apiClient.POST('/api/v1/auth/change-password', {
          body: {
            currentPassword,
            newPassword,
          },
        })
      );

      setIsSuccess(true);
      onSuccess?.();

      // Backend revokes active refresh token sessions.
      // Safely redirect to login after short delay so staff re-authenticates with new password.
      setTimeout(() => {
        handleClose();
        logout('manual');
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof KumaranApiError) {
        if (err.statusCode === 401) {
          setErrorMessage(err.message || t('invalidCredentials'));
        } else if (err.statusCode === 400) {
          setErrorMessage(err.message || t('newPasswordMinLength'));
        } else {
          setErrorMessage(err.message || t('invalidCredentials'));
        }
      } else {
        setErrorMessage(t('invalidCredentials'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[440px] bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white tracking-tight">
                {t('changePasswordTitle')}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {t('changePasswordSubtitle')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-slate-100 text-base">
              {t('passwordChangedSuccess')}
            </h3>
            <p className="text-xs text-slate-400 max-w-xs">
              பாதுகாப்பிற்காக அமர்வு நிறைவு செய்யப்படுகிறது...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {errorMessage && (
              <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Current Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                {t('currentPasswordLabel')}
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t('currentPasswordPlaceholder')}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="pr-10 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:ring-emerald-500/20 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                {t('newPasswordLabel')}
              </label>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('newPasswordPlaceholder')}
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="pr-10 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:ring-emerald-500/20 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                {t('confirmPasswordLabel')}
              </label>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('confirmPasswordPlaceholder')}
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="pr-10 bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:ring-emerald-500/20 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isLoading}
                className="border-slate-800 hover:bg-slate-800 text-slate-300"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm gap-1.5"
              >
                {isLoading ? t('changingPassword') : t('changePasswordButton')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
