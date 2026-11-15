'use client';

// ==============================================================================
// Kumaran Chits — First-Time Staff Password Onboarding Form
// Exchanging restricted onboarding token for a permanent password and active session.
// BFF + HttpOnly Cookie Architecture: kc_onboarding_token strictly read via HttpOnly cookies.
// ==============================================================================

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useAuthStore } from '@/stores/auth-store';

export function OnboardingForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();

  const setAuth = useAuthStore((state) => state.setAuth);
  const setPendingTotp = useAuthStore((state) => state.setPendingTotp);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const redirectUrl = searchParams.get('redirect') || '/';

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectUrl);
    }
  }, [isAuthenticated, router, redirectUrl]);

  const onboardingSchema = React.useMemo(
    () =>
      z
        .object({
          newPassword: z
            .string()
            .min(8, { message: t('passwordMinLength8') })
            .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/, {
              message: t('passwordComplexity'),
            }),
          confirmPassword: z.string().min(1, { message: t('passwordRequired') }),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: t('passwordsMustMatch'),
          path: ['confirmPassword'],
        }),
    [t],
  );

  type OnboardingFormValues = z.infer<typeof onboardingSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: OnboardingFormValues) => {
    setIsLoading(true);
    setServerError(null);
    setSessionExpired(false);

    try {
      const res = await fetch('/api/auth/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: values.newPassword,
        }),
      });

      const response = await res.json();

      if (!res.ok) {
        if (res.status === 401 && response?.sessionExpired) {
          setSessionExpired(true);
          setServerError(t('onboardingSessionExpired'));
        } else {
          setServerError(response?.message || t('onboardingSessionExpired'));
        }
        return;
      }

      // Case 1: 2FA enrollment/verification required after setting password
      if (response?.requireTotp || response?.requiresTotp) {
        setPendingTotp(true);
        const twoFactorTarget =
          redirectUrl && redirectUrl !== '/'
            ? `/2fa?redirect=${encodeURIComponent(redirectUrl)}`
            : '/2fa';
        router.push(twoFactorTarget);
        return;
      }

      // Case 2: Full authentication established
      if (response?.user) {
        setAuth(response.user);
        router.push(redirectUrl);
        return;
      }

      setServerError(t('onboardingSessionExpired'));
    } catch (err: unknown) {
      console.error('[OnboardingForm] Submission error:', err);
      setServerError(t('onboardingSessionExpired'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950/60 border border-emerald-500/30">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight text-slate-100">
          {t('onboardingTitle')}
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          {t('onboardingSubtitle')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {serverError && (
          <Alert variant="destructive" className="border-rose-500/50 bg-rose-950/40 text-rose-300">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            <AlertTitle className="text-xs font-semibold">Security Notice</AlertTitle>
            <AlertDescription className="text-xs text-rose-200/90">
              {serverError}
            </AlertDescription>
          </Alert>
        )}

        {sessionExpired ? (
          <div className="pt-2 text-center">
            <Button
              variant="outline"
              className="w-full border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
              onClick={() => router.push('/login')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToLogin')}
            </Button>
          </div>
        ) : (
          <form id="onboarding-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* New Permanent Password Field */}
            <div className="space-y-1">
              <label
                htmlFor="newPassword"
                className="block text-xs font-medium text-slate-300"
              >
                {t('newPasswordLabel')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder={t('newPasswordPlaceholder')}
                  autoComplete="new-password"
                  disabled={isLoading}
                  className="pl-9 pr-10 border-slate-800 bg-slate-950/60 text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-500"
                  {...register('newPassword')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-xs text-rose-400">{errors.newPassword.message}</p>
              )}
            </div>

            {/* Confirm Permanent Password Field */}
            <div className="space-y-1">
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-medium text-slate-300"
              >
                {t('confirmPasswordLabel')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('confirmPasswordPlaceholder')}
                  autoComplete="new-password"
                  disabled={isLoading}
                  className="pl-9 pr-10 border-slate-800 bg-slate-950/60 text-slate-100 placeholder:text-slate-600 focus-visible:ring-emerald-500"
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-rose-400">{errors.confirmPassword.message}</p>
              )}
            </div>
          </form>
        )}
      </CardContent>

      {!sessionExpired && (
        <CardFooter className="flex flex-col space-y-2">
          <Button
            type="submit"
            form="onboarding-form"
            disabled={isLoading}
            className="w-full bg-emerald-600 font-semibold text-white hover:bg-emerald-500 focus-visible:ring-emerald-500 disabled:opacity-50"
          >
            {isLoading ? t('completingOnboarding') : t('completeOnboardingButton')}
          </Button>

          <Button
            variant="ghost"
            type="button"
            className="w-full text-xs text-slate-400 hover:text-slate-200"
            onClick={() => router.push('/login')}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            {t('backToLogin')}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
