'use client';

// ==============================================================================
// Kumaran Chits — Microsoft Authenticator 2FA Verification Form
// RFC 6238 6-digit TOTP with auto-advancing cells, clipboard paste & auto-submit.
// ==============================================================================

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, ArrowLeft, AlertCircle, KeyRound, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

export function TotpForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();

  const tempToken = useAuthStore((state) => state.tempToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setTempToken = useAuthStore((state) => state.setTempToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [digits, setDigits] = React.useState<string[]>(['', '', '', '', '', '']);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const redirectUrl = searchParams.get('redirect') || '/';
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Guard: Verify pending 2FA token exists; redirect to login if missing, or to dashboard if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectUrl);
      return;
    }

    const activeToken =
      tempToken || (typeof window !== 'undefined' ? sessionStorage?.getItem('kc_temp_token') : null);

    if (!activeToken) {
      router.push('/login?reason=missing_temp_token');
    } else {
      // Focus the first input cell on mount
      inputRefs.current[0]?.focus();
    }
  }, [isAuthenticated, tempToken, router, redirectUrl]);

  const submitCode = React.useCallback(
    async (codeToSubmit: string) => {
      const activeToken =
        tempToken || (typeof window !== 'undefined' ? sessionStorage?.getItem('kc_temp_token') : null);

      if (!activeToken) {
        router.push('/login?reason=missing_temp_token');
        return;
      }

      if (codeToSubmit.length !== 6 || !/^\d{6}$/.test(codeToSubmit)) {
        setServerError(t('totpInvalid'));
        return;
      }

      setIsLoading(true);
      setServerError(null);

      try {
        const response = await unwrapApiResponse<any>(
          apiClient.POST('/api/v1/auth/web/verify-totp', {
            body: {
              tempToken: activeToken,
              totpCode: codeToSubmit,
            },
          }),
        );

        if (response?.accessToken && response?.user) {
          setAuth(response.user, {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
          });
          setTempToken(null);
          router.push(redirectUrl);
          return;
        }

        setServerError(t('invalidTotpCode'));
      } catch (err: unknown) {
        if (err instanceof KumaranApiError) {
          if (err.statusCode === 401) {
            setServerError(t('invalidTotpCode'));
            // Clear cells and return focus to first box on failure
            setDigits(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
          } else if (err.statusCode === 429) {
            setServerError(t('rateLimited'));
          } else {
            setServerError(err.message || t('invalidTotpCode'));
          }
        } else {
          setServerError(t('invalidTotpCode'));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [tempToken, router, redirectUrl, setAuth, setTempToken, t],
  );

  const handleDigitChange = (index: number, value: string) => {
    // Strip non-digits
    const cleanDigits = value.replace(/\D/g, '');
    if (!cleanDigits) {
      const updated = [...digits];
      updated[index] = '';
      setDigits(updated);
      return;
    }

    // Single digit entry
    if (cleanDigits.length === 1) {
      const updated = [...digits];
      updated[index] = cleanDigits;
      setDigits(updated);

      // Auto-advance to next box if available
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      // Check if all 6 digits are now entered
      const fullCode = updated.join('');
      if (fullCode.length === 6) {
        void submitCode(fullCode);
      }
    } else {
      // Multi-character input (e.g. mobile autofill)
      handlePastedCode(cleanDigits);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const updated = [...digits];
        updated[index - 1] = '';
        setDigits(updated);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePastedCode = (pastedText: string) => {
    const clean = pastedText.replace(/\D/g, '').slice(0, 6);
    if (!clean) return;

    const updated = ['', '', '', '', '', ''];
    for (let i = 0; i < clean.length; i++) {
      updated[i] = clean[i];
    }
    setDigits(updated);

    // Focus last filled box or next empty box
    const nextIndex = Math.min(clean.length, 5);
    inputRefs.current[nextIndex]?.focus();

    // Auto-submit if full 6 digits were pasted
    if (clean.length === 6) {
      void submitCode(clean);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    handlePastedCode(pasted);
  };

  const handleBackToLogin = () => {
    setTempToken(null);
    router.push('/login');
  };

  return (
    <Card className="border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-950/60 text-emerald-400 shadow-inner">
          <KeyRound className="h-6 w-6" />
        </div>
        <CardTitle className="pt-2 text-2xl font-bold tracking-tight text-slate-100">
          {t('totpTitle')}
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          {t('totpSubtitle')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {serverError && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-950/40 text-red-300">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-xs font-medium">
              {serverError}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <label className="block text-center text-xs font-semibold uppercase tracking-wider text-slate-300">
            {t('totpCodeLabel')}
          </label>

          {/* 6 Discrete Auto-Advancing Digit Cells */}
          <div className="flex items-center justify-center space-x-1.5 sm:space-x-3" data-testid="totp-input-cells">
            {digits.map((digit, index) => (
              <React.Fragment key={index}>
                <input
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={isLoading}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className="h-11 w-9 sm:h-14 sm:w-12 rounded-lg border border-slate-700 bg-slate-950 text-center font-mono text-lg sm:text-2xl font-bold text-slate-100 shadow-inner transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
                  data-testid={`totp-cell-${index}`}
                />
                {/* Visual separator between 3rd and 4th digits */}
                {index === 2 && (
                  <span className="font-mono text-lg font-bold text-slate-600 select-none">
                    -
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>

          <p className="flex items-center justify-center text-center text-[11px] text-slate-400">
            <ClipboardPaste className="mr-1 h-3.5 w-3.5 text-slate-500" />
            {t('pasteHint')}
          </p>

          <Button
            type="button"
            disabled={isLoading || digits.join('').length !== 6}
            onClick={() => void submitCode(digits.join(''))}
            className="w-full bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-emerald-500 disabled:opacity-50"
            data-testid="totp-submit-button"
          >
            {isLoading ? t('verifyingTotp') : t('totpVerifyButton')}
          </Button>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col border-t border-slate-800/80 pt-4 text-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToLogin}
          className="text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          {t('backToLogin')}
        </Button>
      </CardFooter>
    </Card>
  );
}
