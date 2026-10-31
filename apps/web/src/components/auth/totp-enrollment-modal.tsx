'use client';

// ==============================================================================
// Kumaran Chits — In-App TOTP 2FA Enrollment Modal (Task 2.3)
// 3-Step Enrollment: Fetch Secret & QR -> Scan in Authenticator -> Confirm Code
// Connects live to:
//   POST /api/v1/auth/totp/setup
//   POST /api/v1/auth/totp/enable
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import {
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  Loader2,
  KeyRound,
  QrCode as QrCodeIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { apiClient, unwrapApiResponse } from '../../lib/api-client.ts';
import { useAuthStore } from '../../stores/auth-store.ts';

export interface TotpEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SetupData {
  secret: string;
  otpauthUri: string;
  issuer: string;
  account: string;
}

export function TotpEnrollmentModal({
  isOpen,
  onClose,
  onSuccess,
}: TotpEnrollmentModalProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');

  // Setup state
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [isLoadingSetup, setIsLoadingSetup] = useState(false);
  const [copied, setCopied] = useState(false);

  // 6-digit confirmation code state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isEnabling, setIsEnabling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset and fetch setup data whenever the modal opens
  useEffect(() => {
    if (!isOpen) {
      setSetupData(null);
      setQrSvg(null);
      setDigits(['', '', '', '', '', '']);
      setErrorMessage(null);
      setIsSuccess(false);
      setCopied(false);
      return;
    }

    let isMounted = true;
    setIsLoadingSetup(true);
    setErrorMessage(null);

    async function fetchSetup() {
      try {
        const data = await unwrapApiResponse<SetupData>(
          apiClient.POST('/api/v1/auth/totp/setup')
        );

        if (!isMounted) return;
        setSetupData(data);

        // Generate clean vector SVG from otpauthUri
        const svg = await QRCode.toString(data.otpauthUri, {
          type: 'svg',
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });

        if (isMounted) {
          setQrSvg(svg);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(err?.message || t('invalidCredentials'));
      } finally {
        if (isMounted) {
          setIsLoadingSetup(false);
        }
      }
    }

    fetchSetup();

    return () => {
      isMounted = false;
    };
  }, [isOpen, t]);

  // Handle 1-click clipboard copy
  const handleCopySecret = async () => {
    if (!setupData?.secret) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(false);
    }
  };

  // Format Base32 secret in readable 4-character blocks
  const formattedSecret = setupData?.secret
    ? setupData.secret.match(/.{1,4}/g)?.join(' ') || setupData.secret
    : '';

  // Digit input handling
  const handleDigitChange = (index: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setErrorMessage(null);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setDigits(newDigits);
    setErrorMessage(null);

    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  // Submit and activate TOTP
  const handleEnableTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setErrorMessage(t('totpInvalid'));
      return;
    }

    if (!setupData?.secret) {
      setErrorMessage(t('invalidTotpCode'));
      return;
    }

    setIsEnabling(true);
    setErrorMessage(null);

    try {
      await unwrapApiResponse(
        apiClient.POST('/api/v1/auth/totp/enable', {
          body: {
            secret: setupData.secret,
            code,
          },
        })
      );

      // Successfully activated TOTP in database: update client auth state
      useAuthStore.getState().updateUser({ isTotpEnabled: true });
      setIsSuccess(true);
      onSuccess?.();

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err?.message || t('invalidTotpCode'));
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-left space-y-1">
          <div className="flex items-center space-x-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <DialogTitle className="text-xl font-bold text-slate-100">
              {t('totpSetupTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-slate-400">
            {t('totpSetupSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {isLoadingSetup ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            <p className="text-sm text-slate-400">{tCommon('loading')}</p>
          </div>
        ) : isSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Check className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-100">
              {t('totpEnabledSuccess')}
            </h3>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {errorMessage && (
              <Alert variant="destructive" className="bg-rose-950/50 border-rose-800/80 text-rose-200">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
              </Alert>
            )}

            {/* Step 1: QR Code Scan */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <QrCodeIcon className="h-4 w-4 text-emerald-400" />
                <span>{t('totpStep1Title')}</span>
              </div>
              <p className="text-xs text-slate-400">{t('totpStep1Desc')}</p>
              <div className="flex justify-center p-3 bg-white rounded-lg shadow-inner max-w-[210px] mx-auto">
                {qrSvg ? (
                  <div
                    className="w-44 h-44 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-slate-400 text-xs">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Manual Base32 Secret */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <span>{t('totpStep2Title')}</span>
              </div>
              <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                <code className="text-xs font-mono font-semibold tracking-wider text-emerald-300 flex-1 break-all select-all">
                  {formattedSecret || '—'}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopySecret}
                  className="h-8 px-2.5 border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 shrink-0 text-xs"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400 mr-1" />
                      <span>{t('copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      <span>{t('copySecret')}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Step 3: Enter 6-digit confirmation code */}
            <form onSubmit={handleEnableTotp} className="space-y-4 pt-1">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                  {t('totpStep3Title')}
                </label>
                <p className="text-xs text-slate-400">{t('totpStep3Desc')}</p>

                <div className="flex justify-center items-center gap-2 pt-1" onPaste={handlePaste}>
                  {digits.map((digit, idx) => (
                    <React.Fragment key={idx}>
                      <input
                        ref={(el) => {
                          inputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(idx, e)}
                        disabled={isEnabling}
                        className="w-10 h-12 text-center text-lg font-bold font-mono rounded-lg border border-slate-700 bg-slate-950/80 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-inner disabled:opacity-50"
                        autoFocus={idx === 0}
                      />
                      {idx === 2 && <span className="text-slate-600 font-bold select-none">-</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isEnabling}
                  className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-9"
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isEnabling || digits.some((d) => !d)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-9 px-4 shadow-lg shadow-emerald-950/40"
                >
                  {isEnabling ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      <span>{t('enablingTotp')}</span>
                    </>
                  ) : (
                    <span>{t('totpEnableButton')}</span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
